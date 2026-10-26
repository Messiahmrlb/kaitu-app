/**
 * 探针：导入「三角坐标定名」电子送样单后，记录会变成什么模式，PDF 又会是什么样式。
 *
 * 做法：
 *  1) 用 exceljs 生成一份符合 App 解析规则的送样单（野外定名填三角坐标土名）
 *  2) 走真实的 parseDeliveryFile 解析
 *  3) 检查 record.mode / sample.soilType / buildPdfPages 的单元格
 *  4) 打印 PDF 表头会用的土类选项（由 record.mode 决定）
 */
import ExcelJS from 'exceljs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseDeliveryFile } = require('./importDelivery.cjs');
const { buildPdfPages } = require('./pdfExport.cjs');
const { soilTypeOptions, SOIL_TYPE_A, SOIL_TYPE_B } = require('./constants.cjs');

/** 三角坐标定名风格的土名（取自 App 模式 B 选项） */
const TRI_NAMES = ['轻粉质壤土', '中粉质壤土', '重粉质壤土', '粉粘土', '粘土', '粉砂'];

async function buildDeliverySheet() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('送样单');

  ws.getCell('A1').value = '土工试验送样单';
  ws.getCell('A2').value = '工程名称：故城县城区水系连通工程';
  ws.getCell('A3').value = '孔号';
  ws.getCell('B3').value = 'ZK1';

  // 表头行(HR)：含「土样编号」，不含 自/至/原状/扰动
  ws.getCell('A4').value = '土样编号';
  ws.getCell('B4').value = '野外定名';

  // 子表头行(HR+1)：含「原状」+ 试验项目标签
  const sub = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];
  const labels = [
    '自', '至', '原状', '扰动',
    '常规物性', '液塑限', '颗分', '压缩系数压缩模量',
    '垂直渗透', '水平渗透', '饱和固结快剪', '自然快剪',
  ];
  sub.forEach((col, i) => {
    ws.getCell(`${col}5`).value = labels[i];
  });

  // 数据行：三角坐标土名 + 勾选试验项
  TRI_NAMES.forEach((name, i) => {
    const r = 6 + i;
    ws.getCell(`A${r}`).value = i + 1;
    ws.getCell(`B${r}`).value = name;
    ws.getCell(`C${r}`).value = (3 + i * 0.5).toFixed(1);
    ws.getCell(`D${r}`).value = (3.5 + i * 0.5).toFixed(1);
    ws.getCell(`E${r}`).value = '√'; // 原状
    ws.getCell(`G${r}`).value = '√'; // 常规物性
    if (i < 3) ws.getCell(`I${r}`).value = '√'; // 颗分
    if (i >= 2) ws.getCell(`K${r}`).value = '√'; // 垂直渗透
  });

  // 表尾
  ws.getCell(`A${6 + TRI_NAMES.length}`).value = '送样人：';

  return wb.xlsx.writeBuffer();
}

const buf = await buildDeliverySheet();
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const result = await parseDeliveryFile(ab);

console.log('═══ 解析结果 ═══');
console.log('识别送样单份数:', result.records.length);
console.log('文件级告警:', result.warnings.length ? result.warnings : '（无）');

const rec = result.records[0];
console.log('\n═══ 记录层 ═══');
console.log('孔号:', rec.holeCode);
console.log('样本数:', rec.sampleCount);
console.log('record.mode =', JSON.stringify(rec.record.mode), '→', rec.record.mode === 'A' ? '普通目力鉴别' : '三角坐标定名');
console.log('块告警:', rec.warnings.length ? rec.warnings : '（无）');

console.log('\n═══ 逐条土样 ═══');
rec.record.samples.forEach((s, i) => {
  console.log(
    `  ${i + 1}. 野外定名=${JSON.stringify(s.fieldRecord)}  soilType=${JSON.stringify(s.soilType)}  试验项=${JSON.stringify(s.testItems)}`,
  );
});

console.log('\n═══ PDF 表头（由 record.mode 决定）═══');
console.log('PDF 实际使用:', JSON.stringify(soilTypeOptions(rec.record.mode)));
console.log('模式 A 选项 :', JSON.stringify(SOIL_TYPE_A));
console.log('模式 B 选项 :', JSON.stringify(SOIL_TYPE_B));

const page = buildPdfPages(rec.record)[0];
const cellKey = (r, c) => r * 1000 + c;
console.log('\n═══ PDF 第 1 页「目力鉴别土类」列（第 7~12 列）═══');
for (let r = 0; r < Math.min(rec.sampleCount, 6); r++) {
  const vals = [];
  for (let c = 7; c <= 12; c++) vals.push(page.cells[cellKey(r, c)] || '空');
  console.log(`  第${r + 1}行: ${vals.join(' | ')}`);
}

const triCount = rec.record.samples.filter((s) => (s.soilType ?? []).length > 0).length;
const anyTick = Object.keys(page.cells).some((k) => {
  const col = Number(k) % 1000;
  return col >= 7 && col <= 12 && page.cells[k] === '√';
});

console.log('\n═══ 判定 ═══');
console.log('土类勾选已写入的土样数:', triCount, '/', rec.record.samples.length);
console.log('PDF 目力鉴别土类列是否出现 √:', anyTick);
console.log('PDF 表头样式:', rec.record.mode === 'B' ? '三角坐标定名' : '普通目力鉴别（A）');
