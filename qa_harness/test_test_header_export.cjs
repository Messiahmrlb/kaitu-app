// 回归测试：试验列表头覆盖在导出层的落点（xlsx 子表头 + PDF 单元格）
//
// 覆盖：
//   xlsx buildWorkbook：别名记录的子表头第 33-40 列显示 回弹压缩/固结快剪/慢剪；
//                       √ 按数据键落在正确列；默认记录输出不变
//   pdf buildPdfPages：别名记录的 √ 列位（col 32+i）与默认记录一致性行为
//
// 运行：
//   npx esbuild src/xlsxExport.ts --bundle --format=cjs --platform=node \
//     --packages=external --outfile=qa_harness/_emit/xlsxExport.cjs
//   npx esbuild src/pdfExport.ts --bundle --format=cjs --platform=node \
//     --packages=external --outfile=qa_harness/_emit/pdfExport.cjs
//   node qa_harness/test_test_header_export.cjs
const path = require('path');
const ExcelJS = require('exceljs');
const { buildWorkbook } = require(path.join(__dirname, '_emit', 'xlsxExport.cjs'));
const { buildPdfPages } = require(path.join(__dirname, '_emit', 'pdfExport.cjs'));

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

/** 最小记录构造：一条土样，testItems 可指定 */
function rec(opts, testItems) {
  return {
    id: 'r1',
    name: '测试',
    mode: 'A',
    engineering: { projectCode: 'EX26T2211', holeCode: 'ZK1', holeElevation: '', openDate: '2026-10-30' },
    samples: [
      {
        id: 's1',
        soilNumber: '-1',
        fieldRecord: '',
        sampleDepth: '',
        sampleElevation: '',
        color: '',
        smell: '',
        soilType: ['粉质黏土'],
        inclusions: [],
        soilState: [],
        soilStateNote: '',
        testItems,
        il: '',
        ip: '',
        disturbance: '原状',
        siltySand: 'none',
        otherTestItems: [],
      },
    ],
    customTestItems: [],
    createdAt: 1,
    updatedAt: 1,
    ...opts,
  };
}

const cellKey = (row, col) => row * 100 + col;

(async () => {
  const XL = ExcelJS;

  // ---- xlsx：别名记录 ----
  {
    const record = rec({ shearLabels: ['固结快剪', '慢剪'], consolidationLabel: '回弹压缩' }, ['固结', '慢剪']);
    const wb = await buildWorkbook([record], XL);
    const ws = wb.getWorksheet('开土记录表');
    const labels = [];
    for (let c = 33; c <= 40; c++) labels.push(String(ws.getCell(4, c).value));
    check(
      'xlsx 子表头显示别名',
      JSON.stringify(labels) === JSON.stringify(['物性', '颗分', '回弹压缩', '垂直渗透', '水平渗透', '固结快剪', '慢剪', '三轴']),
      labels.join(','),
    );
    // 样1 勾了 固结+慢剪：√ 应在 col35(回弹压缩列) 与 col37(慢剪列)
    check('xlsx 固结√落在「回弹压缩」列(col35)', ws.getCell(5, 35).value === '√', String(ws.getCell(5, 35).value));
    check('xlsx 慢剪√落在「慢剪」列(col39)', ws.getCell(5, 39).value === '√', String(ws.getCell(5, 39).value));
    check('xlsx 固结快剪列(col38)无√', (ws.getCell(5, 38).value ?? '') === '', String(ws.getCell(5, 38).value ?? ''));
  }

  // ---- xlsx：默认记录不变 ----
  {
    const record = rec({}, ['固结', '饱固快剪']);
    const wb = await buildWorkbook([record], XL);
    const ws = wb.getWorksheet('开土记录表');
    const labels = [];
    for (let c = 33; c <= 40; c++) labels.push(String(ws.getCell(4, c).value));
    check(
      'xlsx 默认记录子表头不变',
      JSON.stringify(labels) === JSON.stringify(['物性', '颗分', '固结', '垂直渗透', '水平渗透', '饱固快剪', '自然快剪', '三轴']),
      labels.join(','),
    );
    check('xlsx 默认饱固快剪√在 col38', ws.getCell(5, 38).value === '√');
  }

  // ---- pdf：别名记录 √ 列位 ----
  {
    const record = rec({ shearLabels: ['固结快剪', '慢剪'], consolidationLabel: '回弹压缩' }, ['固结', '慢剪']);
    const pages = buildPdfPages(record);
    const cells = pages[0].cells;
    check('pdf 固结√在 col34（第3试验列）', cells[cellKey(0, 34)] === '√', String(cells[cellKey(0, 34)] ?? ''));
    check('pdf 慢剪√在 col38', cells[cellKey(0, 38)] === '√', String(cells[cellKey(0, 38)] ?? ''));
    check('pdf 固结快剪列 col37 无√', (cells[cellKey(0, 37)] ?? '') === '');
  }

  // ---- pdf：默认记录 √ 列位不变 ----
  {
    const record = rec({}, ['固结', '饱固快剪']);
    const pages = buildPdfPages(record);
    const cells = pages[0].cells;
    check('pdf 默认固结√在 col34', cells[cellKey(0, 34)] === '√');
    check('pdf 默认饱固快剪√在 col37', cells[cellKey(0, 37)] === '√', String(cells[cellKey(0, 37)] ?? ''));
  }

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail > 0 ? 1 : 0);
})();
