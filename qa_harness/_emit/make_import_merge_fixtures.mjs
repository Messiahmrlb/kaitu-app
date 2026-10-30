/**
 * 生成导入合并/来源校验所需的 xlsx 夹具：
 *  - same-hole-2-sheets.xlsx：Sheet1/Sheet2 均为孔号 ZK1-1，
 *    土号分别 ZK1-1-01..02、ZK1-1-03..04 → 导入应合并为 1 条记录 4 条土样
 *  - page2-no-hole-restart.xlsx：Sheet1 孔号 ZK2-1（01..02）；
 *    Sheet2 不写孔号、土号从 ZK2-1-01 重新开始 → 预览应出现红色来源错误
 *
 * 运行：node qa_harness/_emit/make_import_merge_fixtures.mjs
 */
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'fixtures');

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

/** 在指定起始行写入一份送样单块（hole 为空时不写孔号行） */
function addBlock(ws, startRow, { hole, soilNumbers, projectName = '同孔合并测试工程' }) {
  ws.getCell(`A${startRow}`).value = '土工试验送样单';
  ws.getCell(`A${startRow + 1}`).value = `工程名称：${projectName}`;
  if (hole) {
    ws.getCell(`A${startRow + 2}`).value = '孔号';
    ws.getCell(`B${startRow + 2}`).value = hole;
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
  ws.getCell(`A${hr + 2 + soilNumbers.length}`).value = '送样人：';
  return hr + 4 + soilNumbers.length;
}

async function main() {
  const sameHole = new ExcelJS.Workbook();
  addBlock(sameHole.addWorksheet('Sheet1'), 1, {
    hole: 'ZK1-1',
    soilNumbers: ['ZK1-1-01', 'ZK1-1-02'],
  });
  addBlock(sameHole.addWorksheet('Sheet2'), 1, {
    hole: 'ZK1-1',
    soilNumbers: ['ZK1-1-03', 'ZK1-1-04'],
  });
  await sameHole.xlsx.writeFile(path.join(OUT_DIR, 'same-hole-2-sheets.xlsx'));

  const restart = new ExcelJS.Workbook();
  addBlock(restart.addWorksheet('Sheet1'), 1, {
    hole: 'ZK2-1',
    soilNumbers: ['ZK2-1-01', 'ZK2-1-02'],
  });
  addBlock(restart.addWorksheet('Sheet2'), 1, {
    hole: '',
    soilNumbers: ['ZK2-1-01', 'ZK2-1-02'],
  });
  await restart.xlsx.writeFile(path.join(OUT_DIR, 'page2-no-hole-restart.xlsx'));

  console.log('import merge fixtures written:', OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
