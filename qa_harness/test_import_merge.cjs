// 回归测试：同孔多表合并 / 续页孔号继承 / 来源校验
//
// 覆盖：
//   mergeImportedByHole：同孔合并、精确匹配（ZK1 ≠ ZK1-1）、空孔号独立、
//                        samples 拼接重排、sheetName/warnings 去重、mergedFrom
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

// 重复起始序号：两块都从 01 开始 → 土号原样保留（绝不重排/改写现场编号），重复由来源错误提示
const duplicateStart = mergeImportedByHole([
  mkItem('ZK3-1', 'Sheet1', ['ZK3-1-01', 'ZK3-1-02']),
  mkItem('ZK3-1', 'Sheet2', ['ZK3-1-01', 'ZK3-1-02']),
]).records[0];
check(
  '重复起始土号原样保留（01,02,01,02，不重排）',
  duplicateStart.record.samples.map((s) => s.soilNumber).join(',') ===
    'ZK3-1-01,ZK3-1-02,ZK3-1-01,ZK3-1-02',
  duplicateStart.record.samples.map((s) => s.soilNumber).join(','),
);
check('重复起始土号时土样总数不变', duplicateStart.record.samples.length === 4);

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

// 跨工作表：Sheet2 不写孔号、土号从 01 重开 → 仍沿用并合并，但报来源错误
const crossSheetRestart = await parseSheets([
  { name: 'Sheet1', blocks: [{ hole: 'ZK2-1', soilNumbers: ['ZK2-1-01', 'ZK2-1-02'] }] },
  { name: 'Sheet2', blocks: [{ hole: '', soilNumbers: ['ZK2-1-01', 'ZK2-1-02'] }] },
]);
check(
  '跨工作表无孔号 + 土号从 1 重开 → 仍合并为 1 条 4 条土样',
  crossSheetRestart.records.length === 1 &&
    crossSheetRestart.records[0].holeCode === 'ZK2-1' &&
    crossSheetRestart.records[0].sampleCount === 4 &&
    crossSheetRestart.records[0].mergedFrom === 2,
  JSON.stringify(crossSheetRestart.records.map((r) => [r.holeCode, r.sampleCount, r.mergedFrom])),
);
check(
  '跨工作表土号重开 → 有 1 条来源 error',
  (crossSheetRestart.errors ?? []).length === 1,
  JSON.stringify(crossSheetRestart.errors),
);
const crossRestartError = (crossSheetRestart.errors ?? [])[0] ?? '';
check(
  '跨表错误文案含「已按沿用「ZK2-1」合并」',
  crossRestartError.includes('已按沿用「ZK2-1」合并') &&
    crossRestartError.includes('疑似送样单来源有误'),
  crossRestartError,
);

console.log(`\nimport merge 测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
}

runParseCases().catch((e) => {
  console.error(e);
  process.exit(1);
});
