// 回归测试：送样单 R1/R2 扰动样编号全链路（2026-10-30 用户确认规则）
//
// 规则：送样单里 R1、R2 扰动样编号原样保留；PDF 在相应位置显示 R1/R2；
//       数字编号顺位（追加/插入重排）跳过 R 样继续排，R 样不被改写成数字。
//
// 覆盖：
//   parseDeliveryFile：土号列 1/2/R1/3/R2 混合 → R 样保真、扰动标记联动、无误判暂编
//   buildPdfPages：土号列原样显示 R1/R2
//   buildWorkbook（单孔）：R1 → ZK1-R1（孔号前缀归一，与合并导出规则一致）
//   nextSeq / newSamplesBatch：R 样存在时数字续号跳过 R（锁定既有行为）
//
// 运行：
//   npx esbuild src/importDelivery.ts --bundle --format=cjs --platform=node \
//     --packages=external --outfile=qa_harness/_emit/importDelivery.cjs
//   npx esbuild src/pdfExport.ts --bundle --format=cjs --platform=node \
//     --packages=external --outfile=qa_harness/_emit/pdfExport.cjs
//   npx esbuild src/utils.ts --bundle --format=cjs --platform=node \
//     --packages=external --outfile=qa_harness/_emit/utils.cjs
//   npx esbuild src/xlsxExport.ts --bundle --format=cjs --platform=node \
//     --packages=external --outfile=qa_harness/_emit/xlsxExport.cjs
//   node qa_harness/test_r_numbering.cjs
const path = require('path');
const ExcelJS = require('exceljs');
const { parseDeliveryFile } = require(path.join(__dirname, '_emit', 'importDelivery.cjs'));
const { buildPdfPages } = require(path.join(__dirname, '_emit', 'pdfExport.cjs'));
const { nextSeq, newSamplesBatch, newSample } = require(path.join(__dirname, '_emit', 'utils.cjs'));
const { buildWorkbook } = require(path.join(__dirname, '_emit', 'xlsxExport.cjs'));

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}${detail !== undefined ? '  => ' + detail : ''}`);
  } else {
    fail++;
    console.error(`FAIL  ${name}${detail !== undefined ? '  => ' + detail : ''}`);
  }
}

// ---------- 送样单 fixture ----------
const SUB_HEADERS = [
  '自', '至', '原状', '扰动', '常规物性', '液塑限', '颗分',
  '压缩系数压缩模量', '垂直渗透', '水平渗透', '饱和固结快剪', '自然快剪',
];
const SUB_COLS = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];
const DISTURB_COL = 'F';

/** rows: [{ no, disturb }]；自/至固定数字深度 */
function addBlock(ws, startRow, { hole, rows }) {
  ws.getCell(`A${startRow}`).value = '土工试验送样单';
  ws.getCell(`A${startRow + 1}`).value = '工程名称：R样测试工程';
  ws.getCell(`A${startRow + 2}`).value = '孔号';
  ws.getCell(`B${startRow + 2}`).value = hole;
  const hr = startRow + 3;
  ws.getCell(`A${hr}`).value = '土样编号';
  ws.getCell(`B${hr}`).value = '野外定名';
  SUB_HEADERS.forEach((h, i) => {
    ws.getCell(`${SUB_COLS[i]}${hr + 1}`).value = h;
  });
  rows.forEach((row, i) => {
    const r = hr + 2 + i;
    ws.getCell(`A${r}`).value = row.no;
    ws.getCell(`B${r}`).value = '粉质黏土';
    ws.getCell(`C${r}`).value = '1.0';
    ws.getCell(`D${r}`).value = '1.5';
    if (row.disturb) ws.getCell(`${DISTURB_COL}${r}`).value = '√';
    else ws.getCell(`E${r}`).value = '√';
  });
  const footer = hr + 2 + rows.length;
  ws.getCell(`A${footer}`).value = '送样人：';
  return footer + 2;
}

async function parseRows(hole, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  addBlock(ws, 1, { hole, rows });
  const buf = await wb.xlsx.writeBuffer();
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return parseDeliveryFile(ab);
}

(async () => {
  // ---------- 1) 导入：R 样与数字样混合，全部保真 ----------
  const result = await parseRows('ZK1', [
    { no: '1' },
    { no: '2' },
    { no: 'R1', disturb: true },
    { no: '3' },
    { no: 'R2', disturb: true },
  ]);
  const recs = result.records ?? result.recs ?? [];
  check('导入生成 1 份记录', recs.length === 1, String(recs.length));
  const nums = (recs[0]?.record?.samples ?? []).map((s) => s.soilNumber);
  check(
    '土号原样保留 1/2/R1/3/R2（R 样不被改写、不触发暂编）',
    JSON.stringify(nums) === JSON.stringify(['1', '2', 'R1', '3', 'R2']),
    JSON.stringify(nums),
  );
  const disturbs = (recs[0]?.record?.samples ?? []).map((s) => s.disturbance);
  check('R 样行扰动标记联动为「扰动」', JSON.stringify(disturbs) === JSON.stringify(['原状', '原状', '扰动', '原状', '扰动']), JSON.stringify(disturbs));
  const tmpErrs = (result.errors ?? []).filter((e) => String(e?.message ?? e).includes('暂用'));
  check('无「暂用编号」误报', tmpErrs.length === 0, JSON.stringify(result.errors ?? []).slice(0, 120));

  // ---------- 2) PDF：土号列原样显示 R1/R2 ----------
  const pdfRecord = {
    id: 'r-pdf',
    name: 'R样PDF工程 ZK1',
    mode: 'A',
    engineering: { projectCode: '26T123', holeCode: 'ZK1', holeElevation: '', openDate: '2026-10-30' },
    samples: ['1', '2', 'R1', '3', 'R2'].map((no, i) => ({
      id: `s${i}`,
      soilNumber: no,
      fieldRecord: '粉质黏土',
      sampleDepth: '',
      sampleElevation: '',
      color: '褐',
      smell: '无',
      soilType: ['粉质黏土'],
      inclusions: [],
      soilState: [],
      soilStateNote: '',
      testItems: ['固结'],
      il: '',
      ip: '',
      disturbance: no.startsWith('R') ? '扰动' : '原状',
      siltySand: 'none',
      otherTestItems: [],
    })),
    customTestItems: [],
    createdAt: 1,
    updatedAt: 1,
  };
  const pages = buildPdfPages(pdfRecord);
  const allCells = pages.flatMap((p) => Object.entries(p.cells));
  const col1ByRow = {};
  pages.forEach((p) => {
    Object.entries(p.cells).forEach(([k, v]) => {
      const row = Math.floor(Number(k) / 100);
      const col = Number(k) % 100;
      if (col === 1) col1ByRow[`${p.pageNo ?? '?'}-${row}`] = String(v);
    });
  });
  const col1Vals = Object.values(col1ByRow);
  check(
    'PDF 土号列按 -1/-2/-R1/-3/-R2 格式（R 样原位、数字顺位跳过 R）',
    JSON.stringify(col1Vals) === JSON.stringify(['-1', '-2', '-R1', '-3', '-R2']),
    JSON.stringify(col1Vals),
  );
  check('PDF 全部单元格中 -R1/-R2 在场', allCells.some(([, v]) => v === '-R1') && allCells.some(([, v]) => v === '-R2'));

  // ---------- 3) xlsx 单孔：R1 → ZK1-R1（孔号前缀归一） ----------
  const XL = ExcelJS;
  const wb = await buildWorkbook([pdfRecord], XL);
  const ws = wb.getWorksheet('开土记录表');
  const xlsxNums = [5, 6, 7, 8, 9].map((r) => String(ws.getCell(r, 1).value));
  check(
    'xlsx 土号带孔号前缀 ZK1-1/ZK1-2/ZK1-R1/ZK1-3/ZK1-R2',
    JSON.stringify(xlsxNums) === JSON.stringify(['ZK1-1', 'ZK1-2', 'ZK1-R1', 'ZK1-3', 'ZK1-R2']),
    JSON.stringify(xlsxNums),
  );

  // ---------- 4) 追加/批量添加：数字续号跳过 R 样 ----------
  const samples = ['ZK1-1', 'ZK1-2', 'ZK1-R1', 'ZK1-3', 'ZK1-R2'].map((n, i) => ({ id: 's' + i, soilNumber: n }));
  check('数字续号：最大数字 3 → 下一个 4（跳过 R1/R2）', nextSeq(samples), 4);
  const added = newSamplesBatch(2, 'ZK1', samples);
  check('批量追加 2 条续号 ZK1-4/ZK1-5', added.map((s) => s.soilNumber).join(',') === 'ZK1-4,ZK1-5', added.map((s) => s.soilNumber).join(','));

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试执行失败:', e);
  process.exit(1);
});
