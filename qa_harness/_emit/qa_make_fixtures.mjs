/**
 * QA 独立造数据：生成多工作表送样单 xlsx（不参考工程师 fixture）。
 *
 * 表结构对齐 src/importDelivery.ts：
 *   - isHeaderRow 要求某行存在「土样编号」，且下一行有「原状」+ 任一 TEST_LABEL_MAP 标签
 *   - findInfoValue 在表头行上方 15 行内按「孔号」「工程名称」取值
 *   - 数据行：土样编号列非空即视为一条土样
 */
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'fixtures');

/** 子表头（第 5 行）列定义：自 / 至 / 扰动 / 原状 / 常规物性 / 颗分 / ... */
const SUB_HEAD = [
  '', // A 列留空（解析器会跳过 A 列常量碎片）
  '自',
  '至',
  '扰动',
  '', // 野外定名下方留空（子表头无标签）
  '原状',
  '常规物性',
  '颗分',
  '压缩系数压缩模量',
  '垂直渗透',
  '水平渗透',
  '饱和固结快剪',
  '自然快剪',
  '液塑限',
];

/** 写一个工作表 = 一份送样单（单块） */
function addSheet(wb, sheetName, holeCode, samples) {
  const ws = wb.addWorksheet(sheetName);
  ws.getCell('A1').value = '土工试验送样单（表一）';
  ws.getCell('A2').value = `工程名称：马厂减河治理工程`;
  ws.getCell('A3').value = '孔号';
  ws.getCell('B3').value = holeCode;
  ws.getCell('C3').value = '工程编号';
  ws.getCell('D3').value = 'KC-2026-01';

  // 第 4 行：送样单表头
  const HEAD = ['土样编号', '取土深度', '', '', '野外定名', '状态', '试验项目', '', '', '', '', '', '', ''];
  HEAD.forEach((v, i) => {
    if (v) ws.getCell(4, i + 1).value = v;
  });
  // 第 5 行：子表头
  SUB_HEAD.forEach((v, i) => {
    if (v) ws.getCell(5, i + 1).value = v;
  });

  // 第 6 行起：土样数据
  samples.forEach((s, idx) => {
    const r = 6 + idx;
    ws.getCell(r, 1).value = s.soilNumber;
    ws.getCell(r, 2).value = s.from;
    ws.getCell(r, 3).value = s.to;
    ws.getCell(r, 4).value = s.disturbed ? '√' : '';
    ws.getCell(r, 5).value = s.fieldRecord;
    ws.getCell(r, 6).value = '原状';
    // 勾选常规物性 + 颗分（G/H 列）
    ws.getCell(r, 7).value = '√';
    ws.getCell(r, 8).value = '√';
  });

  // 表尾
  const footRow = 6 + samples.length + 1;
  ws.getCell(footRow, 1).value = '送样人：张工';

  ws.columns = [{ width: 14 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 16 }, { width: 10 }];
  return ws;
}

async function save(wb, fileName) {
  const file = path.join(outDir, fileName);
  await wb.xlsx.writeFile(file);
  console.log('written', file);
}

// ---- 文件 1：3 个不同孔号 ----
{
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'Sheet1', 'ZK1', [
    { soilNumber: 'ZK1-1', from: '1.0', to: '2.0', fieldRecord: '粉质黏土' },
    { soilNumber: 'ZK1-2', from: '2.0', to: '3.0', fieldRecord: '粉质黏土' },
  ]);
  addSheet(wb, 'Sheet2', 'ZK2', [{ soilNumber: 'ZK2-1', from: '1.5', to: '2.5', fieldRecord: '黏土' }]);
  addSheet(wb, 'Sheet3', 'ZK3', [
    { soilNumber: 'ZK3-1', from: '3.0', to: '4.0', fieldRecord: '粉土' },
    { soilNumber: 'ZK3-2', from: '4.0', to: '5.0', fieldRecord: '粉土', disturbed: true },
  ]);
  await save(wb, 'qa_multi-sheet.xlsx');
}

// ---- 文件 2：ZK2 重复（Sheet1 与 Sheet3 都是 ZK2）----
{
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'Sheet1', 'ZK2', [
    { soilNumber: 'ZK2-1', from: '1.0', to: '2.0', fieldRecord: '粉质黏土' },
    { soilNumber: 'ZK2-2', from: '2.0', to: '3.0', fieldRecord: '粉质黏土' },
  ]);
  addSheet(wb, 'Sheet2', 'ZK1', [{ soilNumber: 'ZK1-1', from: '1.0', to: '2.0', fieldRecord: '黏土' }]);
  addSheet(wb, 'Sheet3', 'ZK2', [{ soilNumber: 'ZK2-9', from: '9.0', to: '9.5', fieldRecord: '黏土' }]);
  await save(wb, 'qa_dup-hole.xlsx');
}
