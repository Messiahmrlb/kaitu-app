// 回归测试：同孔多表合并 / 续页孔号继承 / 来源校验
//
// 覆盖：
//   mergeImportedByHole：同孔合并、精确匹配（ZK1 ≠ ZK1-1）、空孔号独立、
//                        samples 拼接重排、sheetName/warnings 去重、mergedFrom、
//                        重复起始报错（holeExplicit 块 ≥2 份都从 1 号土开始 → errors）
//   soilSeqOf：ZK1-1-01→1、ZK1-R1→1、ZK1-1-21→21、ZK1-1→null、''→null、01→1
//   parseDeliveryFile：同工作表续页继承孔号；续页土号从 1 重开 → errors；
//                      正常接续（21）→ 无 error；跨工作表不继承但能识别来源重排
//
// 运行：
//   npx esbuild src/importDelivery.ts --bundle --format=cjs --platform=node \
//     --packages=external --outfile=qa_harness/_emit/importDelivery.cjs
//   node qa_harness/test_import_merge.cjs
const path = require('path');
const ExcelJS = require('exceljs');
const {
  mergeImportedByHole,
  soilSeqOf,
  parseDeliveryFile,
} = require(path.join(__dirname, '_emit', 'importDelivery.cjs'));

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}${detail ? '  => ' + detail : ''}`);
  } else {
    fail++;
    console.error(`FAIL  ${name}${detail ? '  => ' + detail : ''}`);
  }
}
const sample = (soilNumber) => ({
  id: 's-' + soilNumber,
  soilNumber,
  fieldRecord: '粉质黏土',
  sampleDepth: '',
  sampleElevation: '',
  color: '',
  smell: '',
  soilType: [],
  inclusions: [],
  soilState: [],
  soilStateNote: '',
  testItems: [],
  il: '',
  ip: '',
  disturbance: '原状',
  siltySand: 'none',
  otherTestItems: [],
});

/** 构造一个 ImportedRecord（只填合并逻辑需要的字段） */
function mkItem(hole, sheetName, soilNumbers, extra = {}) {
  return {
    record: {
      id: 'r-' + sheetName + '-' + soilNumbers[0],
      name: `记录 ${hole || '空'}`,
      mode: 'A',
      engineering: {
        projectCode: '',
        holeCode: hole,
        holeElevation: '',
        openDate: '2026-10-30',
      },
      samples: soilNumbers.map(sample),
      customTestItems: extra.customTestItems ?? [],
      createdAt: 1,
      updatedAt: 1,
    },
    sheetName,
    sampleCount: soilNumbers.length,
    holeCode: hole,
    warnings: extra.warnings ?? [],
    errors: extra.errors ?? [],
    // 孔号是否为单元格显式写（续页沿用块为 false/缺省）
    holeExplicit: extra.holeExplicit,
  };
}

// ---------- mergeImportedByHole ----------
const twoBlocks = mergeImportedByHole([
  mkItem('ZK1-1', 'Sheet1', ['ZK1-1-01', 'ZK1-1-02'], { warnings: ['w1'] }),
  mkItem('ZK1-1', 'Sheet2', ['ZK1-1-03', 'ZK1-1-04'], { warnings: ['w1', 'w2'] }),
]);
const merged = twoBlocks.records[0];
check('同孔 2 块 → 1 条记录', twoBlocks.records.length === 1);
check('同孔 2 块 → 土样数相加 = 4', merged.sampleCount === 4, merged.sampleCount);
check(
  '土号顺序保持块顺序且连续',
  merged.record.samples.map((s) => s.soilNumber).join(',') ===
    'ZK1-1-01,ZK1-1-02,ZK1-1-03,ZK1-1-04',
  merged.record.samples.map((s) => s.soilNumber).join(','),
);
check(
  'seq 连续 1..4',
  merged.record.samples.map((s) => soilSeqOf(s.soilNumber)).join(',') === '1,2,3,4',
);
check('sheetName 用「、」连接', merged.sheetName === 'Sheet1、Sheet2', merged.sheetName);
check('warnings 合并去重', merged.warnings.join(',') === 'w1,w2', merged.warnings.join(','));
check('mergedFrom = 2', merged.mergedFrom === 2, merged.mergedFrom);
check(
  'mergedNotes 文案正确',
  twoBlocks.mergedNotes.length === 1 &&
    twoBlocks.mergedNotes[0] === '孔号 ZK1-1 的 2 份送样单已合并为 1 条记录',
  twoBlocks.mergedNotes[0],
);

// 重复起始序号：两块都从 01 开始 → 2026-11-03 用户口径改为「靠后的重复编号土舍去」：
// 第二块的 01/02 与第一块归一后撞号，被舍去并报错（不再原样保留 4 条）
const duplicateStart = mergeImportedByHole([
  mkItem('ZK3-1', 'Sheet1', ['ZK3-1-01', 'ZK3-1-02']),
  mkItem('ZK3-1', 'Sheet2', ['ZK3-1-01', 'ZK3-1-02']),
]).records[0];
check(
  '重复编号靠后舍去：只保留第一块的 01,02',
  duplicateStart.record.samples.map((s) => s.soilNumber).join(',') ===
    'ZK3-1-01,ZK3-1-02',
  duplicateStart.record.samples.map((s) => s.soilNumber).join(','),
);
check('重复编号舍去后土样总数 = 2', duplicateStart.record.samples.length === 2);
check(
  '重复舍去有醒目 error（含「重复编号土样已舍去」）',
  (duplicateStart.errors ?? []).some((e) => e.includes('重复编号土样已舍去')),
  (duplicateStart.errors ?? []).join(' | '),
);

// ---------- 重复提交拒绝导入（holeExplicit 块都从 1 号土开始） ----------
// 用户口径（2026-11-03 收紧）：同孔多份送样单若 ≥2 份都从 1 号土开始（如都有 D25-1），
// 判定为重复提交，**该孔整组拒绝导入**（不合并、不进预览/存档）；
// rejectedHoles 带出孔号供上层提示。注意 soilSeqOf('D25-1') 因「孔号形态」返回 null，
// merge 层结合块孔号还原序号（D25 的土号 D25-1 / D25-01 都是 1 号土）。
const dupStartError = mergeImportedByHole([
  mkItem('D25', 'Sheet1', ['D25-1'], { holeExplicit: true }),
  mkItem('D25', 'Sheet2', ['D25-01'], { holeExplicit: true }),
]);
check(
  '重复提交 → 该孔整组拒绝（0 条记录）',
  dupStartError.records.length === 0,
  JSON.stringify(dupStartError.records.map((r) => [r.holeCode, r.sampleCount])),
);
check(
  '重复提交 → rejectedHoles = [D25]',
  dupStartError.rejectedHoles.length === 1 && dupStartError.rejectedHoles[0] === 'D25',
  JSON.stringify(dupStartError.rejectedHoles),
);
check(
  '重复提交 → errors 含「判定为重复提交」与「拒绝导入」',
  dupStartError.errors.some((e) => e.includes('判定为重复提交') && e.includes('拒绝导入')),
  JSON.stringify(dupStartError.errors),
);
check(
  '重复提交 error 文案含「第 1、2 份」',
  dupStartError.errors.some((e) => e.includes('第 1、2 份')),
  JSON.stringify(dupStartError.errors),
);

// 续页继承块（holeExplicit 缺省=false）从 -05 续：即使显式块从 1 起，也不报重复起始错
// （该场景的土号重开报错由 parseOneBlock 的块级沿用校验负责，不在本用例断言范围）
const explicitPlusInherited = mergeImportedByHole([
  mkItem('D25', 'Sheet1', ['D25-1'], { holeExplicit: true }),
  mkItem('D25', 'Sheet2', ['D25-05']),
]);
check(
  '显式块从 1 起 + 继承块续 -05 → 不报重复起始错',
  explicitPlusInherited.errors.length === 0,
  JSON.stringify(explicitPlusInherited.errors),
);

// 两块 holeExplicit 都从 -3 起 → 不触发「重复提交拒绝」；但 D25-03 与 D25-3 撞号，靠后者舍去
const startAt3 = mergeImportedByHole([
  mkItem('D25', 'Sheet1', ['D25-3'], { holeExplicit: true }),
  mkItem('D25', 'Sheet2', ['D25-03'], { holeExplicit: true }),
]);
check(
  '两块 holeExplicit 都从 -3 起 → 不触发重复提交拒绝（rejectedHoles 空）',
  startAt3.rejectedHoles.length === 0,
  JSON.stringify(startAt3.rejectedHoles),
);
check(
  '两块从 -3 起 → D25-03 撞号被舍去（归一后与 D25-3 重复）',
  startAt3.records[0].record.samples.map((s) => s.soilNumber).join(',') === 'D25-3' &&
    startAt3.errors.some((e) => e.includes('重复编号土样已舍去')),
  JSON.stringify(startAt3.errors),
);

// 三块同孔，第 1、3 块从 1 号起（第 2 块从 5 号续）→ 文案含「第 1、3 份」，整孔拒绝
const threeWithDup = mergeImportedByHole([
  mkItem('D25', 'Sheet1', ['D25-1'], { holeExplicit: true }),
  mkItem('D25', 'Sheet2', ['D25-5'], { holeExplicit: true }),
  mkItem('D25', 'Sheet3', ['D25-01'], { holeExplicit: true }),
]);
check(
  '三块同孔第 1、3 块从 1 号起 → 报错文案含「第 1、3 份」',
  threeWithDup.errors.some((e) => e.includes('第 1、3 份') && e.includes('都从 1 号土开始')),
  JSON.stringify(threeWithDup.errors),
);
check(
  '三块同孔第 1、3 块从 1 号起 → 整孔拒绝（0 条记录，rejectedHoles=[D25]）',
  threeWithDup.records.length === 0 &&
    threeWithDup.rejectedHoles.length === 1 &&
    threeWithDup.rejectedHoles[0] === 'D25',
  JSON.stringify({
    records: threeWithDup.records.map((r) => [r.holeCode, r.sampleCount]),
    rejectedHoles: threeWithDup.rejectedHoles,
  }),
);

// 重复提交孔被拒绝时，其余孔照常导入（混合孔场景）
const mixedHoles = mergeImportedByHole([
  mkItem('D25', 'Sheet1', ['D25-1'], { holeExplicit: true }),
  mkItem('D25', 'Sheet2', ['D25-01'], { holeExplicit: true }),
  mkItem('ZK9', 'Sheet3', ['ZK9-1'], { holeExplicit: true }),
]);
check(
  '混合孔：D25 被拒绝、ZK9 照常导入',
  mixedHoles.records.length === 1 &&
    mixedHoles.records[0].holeCode === 'ZK9' &&
    mixedHoles.rejectedHoles.length === 1 &&
    mixedHoles.rejectedHoles[0] === 'D25',
  JSON.stringify({
    records: mixedHoles.records.map((r) => r.holeCode),
    rejectedHoles: mixedHoles.rejectedHoles,
  }),
);

// ---------- 土号重复舍去（2026-11-03 用户口径：靠后的重复编号土舍去 + 醒目提示） ----------
// 东白泵站实测场景：块尾附注 原11/原12/原13 与正式样 11/12/13 撞号 → 附注行舍去
const annexCase = mergeImportedByHole([
  mkItem('B7', 'Sheet1', ['1', '2', '11', '12', '13', '原11', '原12', '原13']),
]);
check(
  '块尾附注撞号 → 舍去 原11/原12/原13，保留 5 条正式样',
  annexCase.records[0].record.samples.map((s) => s.soilNumber).join(',') ===
    '1,2,11,12,13',
  annexCase.records[0].record.samples.map((s) => s.soilNumber).join(','),
);
check(
  '附注舍去 error 列出冲突明细（原11 与已有「11」重复）',
  (annexCase.records[0].errors ?? []).some(
    (e) => e.includes('重复编号土样已舍去') && e.includes('原11（与已有「11」重复）'),
  ),
  (annexCase.records[0].errors ?? []).join(' | '),
);
check('附注舍去 → sampleCount 同步为 5', annexCase.records[0].sampleCount === 5);
check('附注舍去 → 顶层 errors 同样带出', annexCase.errors.some((e) => e.includes('重复编号土样已舍去')));

// R 样与数字样归一后不同号，不互相舍去
const rCase = mergeImportedByHole([
  mkItem('ZK1', 'Sheet1', ['ZK1-1', 'ZK1-R1']),
]);
check(
  '数字样与 R 样不撞号（都保留）',
  rCase.records[0].record.samples.length === 2 &&
    (rCase.records[0].errors ?? []).every((e) => !e.includes('重复编号土样已舍去')),
  JSON.stringify(rCase.records[0].record.samples.map((s) => s.soilNumber)),
);

// 空土号不参与舍去（渲染层有 -seq 兜底，两条空号合法）
const emptySnCase = mergeImportedByHole([
  mkItem('ZK1', 'Sheet1', ['', 'ZK1-1', '']),
]);
check(
  '空土号不参与重复舍去（3 条全保留）',
  emptySnCase.records[0].record.samples.length === 3,
  emptySnCase.records[0].record.samples.length,
);

// 跨块拼接（多文件/多表）同样生效：第二块的撞号样舍去
const crossBlockDup = mergeImportedByHole([
  mkItem('ZK1', 'Sheet1', ['ZK1-1', 'ZK1-2'], { holeExplicit: true }),
  mkItem('ZK1', 'Sheet2', ['ZK1-3', 'ZK1-2'], { holeExplicit: true }),
]);
check(
  '跨块撞号 → 第二块的 ZK1-2 舍去，保留 1,2,3',
  crossBlockDup.records[0].record.samples.map((s) => s.soilNumber).join(',') ===
    'ZK1-1,ZK1-2,ZK1-3' && crossBlockDup.records[0].sampleCount === 3,
  JSON.stringify(crossBlockDup.records[0].record.samples.map((s) => s.soilNumber)),
);

const prefixCase = mergeImportedByHole([
  mkItem('ZK1', 'Sheet1', ['ZK1-01']),
  mkItem('ZK1-1', 'Sheet2', ['ZK1-1-01']),
]);
check('ZK1 与 ZK1-1 不合并（精确匹配）', prefixCase.records.length === 2);

const emptyCase = mergeImportedByHole([
  mkItem('', 'Sheet1', ['-1']),
  mkItem('', 'Sheet2', ['-1']),
]);
check(
  '空孔号两块不合并',
  emptyCase.records.length === 2 && emptyCase.records.every((r) => r.mergedFrom === 1),
  emptyCase.records.length,
);

const three = mergeImportedByHole([
  mkItem('ZK2-1', 'Sheet1', ['ZK2-1-01']),
  mkItem('ZK2-1', 'Sheet2', ['ZK2-1-02']),
  mkItem('ZK2-1', 'Sheet3', ['ZK2-1-03']),
]);
check('3 块同孔 → mergedFrom === 3', three.records[0].mergedFrom === 3, three.records[0].mergedFrom);
check('3 块同孔 → 1 条记录 3 条土样', three.records.length === 1 && three.records[0].sampleCount === 3);

// ---------- soilSeqOf ----------
const seqCases = [
  ['ZK1-1-01', 1],
  ['ZK1-R1', 1],
  ['ZK1-1-21', 21],
  ['ZK1-1', null],
  ['', null],
  ['01', 1],
];
for (const [input, expected] of seqCases) {
  check(`soilSeqOf(${JSON.stringify(input)}) = ${expected}`, soilSeqOf(input) === expected, soilSeqOf(input));
}

// ---------- parseDeliveryFile：真实 xlsx ----------
const SUB_HEADERS = [
  '自',
  '至',
  '原状',
  '扰动',
  '常规物性',
  '液塑限',
  '颗分',
  '压缩系数压缩模量',
  '垂直渗透',
  '水平渗透',
  '饱和固结快剪',
  '自然快剪',
];

/**
 * 在工作表指定起始行写入一份送样单块。
 * @returns 下一块可用的起始行
 */
function addBlock(ws, startRow, { hole, holeLabel = false, soilNumbers, projectName = '合并测试工程' }) {
  ws.getCell(`A${startRow}`).value = '土工试验送样单';
  ws.getCell(`A${startRow + 1}`).value = `工程名称：${projectName}`;
  // holeLabel=true：写「孔号」标签但值留空（复现 A 列标签 + 右邻空的越界场景）
  if (hole || holeLabel) {
    ws.getCell(`A${startRow + 2}`).value = '孔号';
    if (hole) ws.getCell(`B${startRow + 2}`).value = hole;
  }
  const hr = startRow + 3;
  ws.getCell(`A${hr}`).value = '土样编号';
  ws.getCell(`B${hr}`).value = '野外定名';
  SUB_HEADERS.forEach((h, i) => {
    const col = String.fromCharCode('C'.charCodeAt(0) + i);
    ws.getCell(`${col}${hr + 1}`).value = h;
  });
  soilNumbers.forEach((no, i) => {
    const r = hr + 2 + i;
    ws.getCell(`A${r}`).value = no;
    ws.getCell(`B${r}`).value = '粉质黏土';
    ws.getCell(`C${r}`).value = '1.0';
    ws.getCell(`D${r}`).value = '1.5';
    ws.getCell(`E${r}`).value = '√';
  });
  const footer = hr + 2 + soilNumbers.length;
  ws.getCell(`A${footer}`).value = '送样人：';
  return footer + 2;
}

async function parseSheets(sheetDefs) {
  const wb = new ExcelJS.Workbook();
  sheetDefs.forEach((def) => {
    const ws = wb.addWorksheet(def.name);
    let row = 1;
    def.blocks.forEach((block) => {
      row = addBlock(ws, row, block);
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return parseDeliveryFile(ab);
}

async function runParseCases() {
// 同一工作表内：第一块有孔号，第二块不写孔号且土号接续 21
const inheritOk = await parseSheets([
  {
    name: 'Sheet1',
    blocks: [
      { hole: 'ZK1-1', soilNumbers: ['ZK1-1-19', 'ZK1-1-20'] },
      { hole: '', soilNumbers: ['ZK1-1-21'] },
    ],
  },
]);
check(
  '同工作表续页继承孔号（21 正常接续）',
  inheritOk.records.length === 1 &&
    inheritOk.records[0].holeCode === 'ZK1-1' &&
    inheritOk.records[0].sampleCount === 3,
  JSON.stringify(inheritOk.records.map((r) => [r.holeCode, r.sampleCount])),
);
check(
  '续页土号原样保留：19/20/21 不被改写为 01/02/03',
  inheritOk.records[0].record.samples.map((s) => s.soilNumber).join(',') ===
    'ZK1-1-19,ZK1-1-20,ZK1-1-21',
  inheritOk.records[0].record.samples.map((s) => s.soilNumber).join(','),
);
check(
  '正常接续时无 error',
  (inheritOk.errors ?? []).length === 0,
  JSON.stringify(inheritOk.errors),
);
check(
  '继承时有 warning 说明沿用上一张孔号',
  inheritOk.records[0].warnings.some((w) =>
    /未写孔号，已沿用上一张的 ZK1-1/.test(w),
  ),
  inheritOk.records[0].warnings.join(' | '),
);

// 同一工作表内：第二块不写孔号且土号从 01 重新开始 → error
const inheritRestart = await parseSheets([
  {
    name: 'Sheet2',
    blocks: [
      { hole: 'ZK1-1', soilNumbers: ['ZK1-1-19', 'ZK1-1-20'] },
      { hole: '', soilNumbers: ['ZK1-1-01'] },
    ],
  },
]);check(
  '续页土号从 1 重开 → 1 条 error',
  (inheritRestart.errors ?? []).length === 1,
  JSON.stringify(inheritRestart.errors),
);
check(
  'error 文案含「疑似送样单来源有误」',
  (inheritRestart.errors ?? []).some((e) => e.includes('疑似送样单来源有误')),
  (inheritRestart.errors ?? [])[0],
);
check(
  '同表续页 error 文案含「已按沿用「ZK1-1」合并」',
  ((inheritRestart.errors ?? [])[0] ?? '').includes('已按沿用「ZK1-1」合并'),
  (inheritRestart.errors ?? [])[0],
);

// 孔号栏写在 A 列但 B 列留空 → 不应抛 getCell(0) 越界异常，应正常解析并沿用孔号
const holeLabelEmpty = await parseSheets([
  {
    name: 'Sheet1',
    blocks: [
      { hole: 'ZK8-1', soilNumbers: ['ZK8-1-01', 'ZK8-1-02'] },
      { hole: '', holeLabel: true, soilNumbers: ['ZK8-1-03'] },
    ],
  },
]);
check(
  '孔号栏在 A 列且留空：不抛越界异常，正常沿用合并',
  holeLabelEmpty.records.length === 1 &&
    holeLabelEmpty.records[0].holeCode === 'ZK8-1' &&
    holeLabelEmpty.records[0].sampleCount === 3,
  JSON.stringify(holeLabelEmpty.records.map((r) => [r.holeCode, r.sampleCount])),
);

// 两个工作表同孔：第一张 01..02、第二张 03..04 → 1 条记录 4 条土样
const sameHole2Sheets = await parseSheets([
  { name: 'Sheet1', blocks: [{ hole: 'ZK1-1', soilNumbers: ['ZK1-1-01', 'ZK1-1-02'] }] },
  { name: 'Sheet2', blocks: [{ hole: 'ZK1-1', soilNumbers: ['ZK1-1-03', 'ZK1-1-04'] }] },
]);
check(
  '两工作表同孔 → 1 条记录、4 条土样',
  sameHole2Sheets.records.length === 1 && sameHole2Sheets.records[0].sampleCount === 4,
  JSON.stringify(sameHole2Sheets.records.map((r) => [r.holeCode, r.sampleCount])),
);
check(
  '两工作表同孔 → mergedFrom = 2、sheetName 含两表',
  sameHole2Sheets.records[0].mergedFrom === 2 &&
    sameHole2Sheets.records[0].sheetName === 'Sheet1、Sheet2',
  JSON.stringify(sameHole2Sheets.records[0].sheetName),
);

// 跨工作表：Sheet2 不写孔号、土号接续 21 → 沿用 ZK1-1 并合并，无 error
const crossSheetContinue = await parseSheets([
  { name: 'Sheet1', blocks: [{ hole: 'ZK1-1', soilNumbers: ['ZK1-1-19', 'ZK1-1-20'] }] },
  { name: 'Sheet2', blocks: [{ hole: '', soilNumbers: ['ZK1-1-21'] }] },
]);
check(
  '跨工作表无孔号 + 土号接续 → 沿用上一孔并合并',
  crossSheetContinue.records.length === 1 &&
    crossSheetContinue.records[0].holeCode === 'ZK1-1' &&
    crossSheetContinue.records[0].sampleCount === 3 &&
    crossSheetContinue.records[0].mergedFrom === 2,
  JSON.stringify(crossSheetContinue.records.map((r) => [r.holeCode, r.sampleCount, r.mergedFrom])),
);
check(
  '跨工作表正常接续时无 error',
  (crossSheetContinue.errors ?? []).length === 0,
  JSON.stringify(crossSheetContinue.errors),
);

// 跨工作表：Sheet2 不写孔号、土号从 01 重开 → 仍沿用并合并；重复的 01/02 按新口径舍去
const crossSheetRestart = await parseSheets([
  { name: 'Sheet1', blocks: [{ hole: 'ZK2-1', soilNumbers: ['ZK2-1-01', 'ZK2-1-02'] }] },
  { name: 'Sheet2', blocks: [{ hole: '', soilNumbers: ['ZK2-1-01', 'ZK2-1-02'] }] },
]);
check(
  '跨工作表无孔号 + 土号从 1 重开 → 仍合并为 1 条；重复编号靠后舍去后剩 2 条',
  crossSheetRestart.records.length === 1 &&
    crossSheetRestart.records[0].holeCode === 'ZK2-1' &&
    crossSheetRestart.records[0].sampleCount === 2 &&
    crossSheetRestart.records[0].mergedFrom === 2,
  JSON.stringify(crossSheetRestart.records.map((r) => [r.holeCode, r.sampleCount, r.mergedFrom])),
);
check(
  '跨工作表土号重开 → 有块级来源 error + 重复舍去 error 共 2 条',
  (crossSheetRestart.errors ?? []).length === 2,
  JSON.stringify(crossSheetRestart.errors),
);
const crossRestartError = (crossSheetRestart.errors ?? [])[0] ?? '';
check(
  '跨表错误文案含「已按沿用「ZK2-1」合并」',
  crossRestartError.includes('已按沿用「ZK2-1」合并') &&
    crossRestartError.includes('疑似送样单来源有误'),
  crossRestartError,
);
check(
  '跨表重复舍去 error 含「重复编号土样已舍去」',
  (crossSheetRestart.errors ?? []).some((e) => e.includes('重复编号土样已舍去')),
  JSON.stringify(crossSheetRestart.errors),
);

console.log(`\nimport merge 测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
}

runParseCases().catch((e) => {
  console.error(e);
  process.exit(1);
});
