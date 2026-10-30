/**
 * 生成导出/导入探针所需的 xlsx 夹具：
 *  - multi-sheet-delivery.xlsx：3 个工作表（ZK1/ZK2/ZK3），每表一份送样单
 *  - dup-hole-delivery.xlsx：2 个工作表（Sheet1/Sheet3），均为同一个孔号 ZK2
 *
 * 运行：node qa_harness/_emit/make_export_fixtures.mjs
 */
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'fixtures');

const HEADERS = ['自', '至', '原状', '扰动', '常规物性', '液塑限', '颗分', '压缩系数压缩模量', '垂直渗透', '水平渗透', '饱和固结快剪', '自然快剪'];

/**
 * 在一个工作表写入一份送样单。
 * @param {ExcelJS.Workbook} wb
 * @param {string} sheetName 工作表名
 * @param {string} holeCode 孔号
 * @param {string[]} soilNames 野外定名列表
 */
function addDeliverySheet(wb, sheetName, holeCode, soilNames) {
  const ws = wb.addWorksheet(sheetName);
  ws.getCell('A1').value = '土工试验送样单';
  ws.getCell('A2').value = '工程名称：导出导入探针工程';
  ws.getCell('A3').value = '孔号';
  ws.getCell('B3').value = holeCode;
  ws.getCell('A4').value = '土样编号';
  ws.getCell('B4').value = '野外定名';
  HEADERS.forEach((h, i) => {
    const col = String.fromCharCode('C'.charCodeAt(0) + i);
    ws.getCell(`${col}5`).value = h;
  });
  soilNames.forEach((name, i) => {
    const r = 6 + i;
    ws.getCell(`A${r}`).value = i + 1;
    ws.getCell(`B${r}`).value = name;
    ws.getCell(`C${r}`).value = (3 + i * 0.5).toFixed(1);
    ws.getCell(`D${r}`).value = (3.5 + i * 0.5).toFixed(1);
    ws.getCell(`E${r}`).value = '√';
    ws.getCell(`G${r}`).value = '√';
  });
  ws.getCell(`A${6 + soilNames.length}`).value = '送样人：';
}

async function main() {
  const multi = new ExcelJS.Workbook();
  addDeliverySheet(multi, 'ZK1单', 'ZK1', ['粉质黏土', '中砂']);
  addDeliverySheet(multi, 'ZK2单', 'ZK2', ['粉质黏土']);
  addDeliverySheet(multi, 'ZK3单', 'ZK3', ['中砂']);
  await multi.xlsx.writeFile(path.join(OUT_DIR, 'multi-sheet-delivery.xlsx'));

  const dup = new ExcelJS.Workbook();
  addDeliverySheet(dup, 'Sheet1', 'ZK2', ['粉质黏土']);
  addDeliverySheet(dup, 'Sheet3', 'ZK2', ['中砂']);
  await dup.xlsx.writeFile(path.join(OUT_DIR, 'dup-hole-delivery.xlsx'));

  console.log('fixtures written:', OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
