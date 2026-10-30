/**
 * QA 第 3 轮：自造送样单 xlsx（同孔合并 / 续页沿用 / 来源有误 / 边界）。
 *
 * 表结构对齐 src/importDelivery.ts 的 isHeaderRow / parseOneBlock 期望：
 *   - 第 4 行 = 送样单表头（含「土样编号」「野外定名」）
 *   - 第 5 行 = 子表头（含「自」「至」「扰动」「原状」「常规物性」）
 *   - 第 6 行起 = 土样数据（土样编号列非空即为一条）
 * 孔号行在第 3 行，三种写法：
 *   - value      ：A3=孔号  B3=<孔号>（真实模板写法）
 *   - noLabel    ：完全不写「孔号」行（续页最自然的写法）
 *   - labelAEmpty：A3=孔号  B3 留空（触发 findInfoValue 左邻居回退）
 *   - labelBEmpty：B3=孔号  C3 留空（同样"未写孔号"，但不触发左邻居回退）
 */
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'fixtures');
fs.mkdirSync(outDir, { recursive: true });

const SUB_HEAD = [
  '',
  '自',
  '至',
  '扰动',
  '',
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
const HEAD = ['土样编号', '取土深度', '', '', '野外定名', '状态', '试验项目', '', '', '', '', '', '', ''];

/** 在指定起始行写入一份送样单标题+信息+表头，返回下一行号 */
function writeHead(ws, startRow, opts) {
  let r = startRow;
  ws.getCell(r, 1).value = '土工试验送样单（表一）';
  r += 1;
  ws.getCell(r, 1).value = `工程名称：${opts.projectName ?? '马厂减河治理工程'}`;
  r += 1;
  const mode = opts.holeMode ?? 'value';
  if (mode === 'value') {
    ws.getCell(r, 1).value = '孔号';
    ws.getCell(r, 2).value = opts.hole ?? '';
  } else if (mode === 'labelAEmpty') {
    ws.getCell(r, 1).value = '孔号';
    // B 列故意留空
  } else if (mode === 'labelBEmpty') {
    ws.getCell(r, 2).value = '孔号';
    // C 列故意留空
  }
  // mode === 'noLabel'：这一行也留空
  r += 1;
  HEAD.forEach((v, i) => {
    if (v) ws.getCell(r, i + 1).value = v;
  });
  r += 1;
  SUB_HEAD.forEach((v, i) => {
    if (v) ws.getCell(r, i + 1).value = v;
  });
  return r + 1; // 第一条数据行
}

/** 写入土样数据行，返回下一行号 */
function writeSamples(ws, startRow, samples, fieldRecord) {
  let r = startRow;
  for (const s of samples) {
    const num = typeof s === 'string' ? s : s.soilNumber;
    const fr = typeof s === 'string' ? fieldRecord : s.fieldRecord ?? fieldRecord;
    ws.getCell(r, 1).value = num;
    ws.getCell(r, 2).value = '1.0';
    ws.getCell(r, 3).value = '2.0';
    ws.getCell(r, 5).value = fr;
    ws.getCell(r, 6).value = '原状';
    ws.getCell(r, 7).value = '√';
    r += 1;
  }
  ws.getCell(r, 1).value = '送样人：张工';
  return r + 1;
}

function styleCols(ws) {
  ws.columns = [{ width: 16 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 16 }, { width: 10 }];
}

/** 单表工作表 */
function sheet(wb, name, opts) {
  const ws = wb.addWorksheet(name);
  const after = writeHead(ws, 1, opts);
  writeSamples(ws, after, opts.samples, opts.fieldRecord ?? '粉质黏土');
  styleCols(ws);
  return ws;
}

async function save(wb, fileName) {
  const f = path.join(outDir, fileName);
  await wb.xlsx.writeFile(f);
  console.log('written', fileName);
}

const DEFAULT_FIELD = '粉质黏土';

// ---- m1：同孔两表（ZK1-1 各 2 条）----
{
  const wb = new ExcelJS.Workbook();
  sheet(wb, 'Sheet1', { hole: 'ZK1-1', samples: ['ZK1-1-01', 'ZK1-1-02'] });
  sheet(wb, 'Sheet2', { hole: 'ZK1-1', samples: ['ZK1-1-03', 'ZK1-1-04'] });
  await save(wb, 'qa_m1_same_hole.xlsx');
}

// ---- m2：跨表无孔号 + 接续（19,20 → 21）----
{
  const wb = new ExcelJS.Workbook();
  sheet(wb, 'Sheet1', { hole: 'ZK2-1', samples: ['ZK2-1-19', 'ZK2-1-20'] });
  sheet(wb, 'Sheet2', { holeMode: 'noLabel', samples: ['ZK2-1-21'] });
  await save(wb, 'qa_m2_continue.xlsx');
}

// ---- m3：跨表无孔号 + 从 1 重开（01,02 → 01,02）----
{
  const wb = new ExcelJS.Workbook();
  sheet(wb, 'Sheet1', { hole: 'ZK3-1', samples: ['ZK3-1-01', 'ZK3-1-02'] });
  sheet(wb, 'Sheet2', { holeMode: 'noLabel', samples: ['ZK3-1-01', 'ZK3-1-02'] });
  await save(wb, 'qa_m3_restart.xlsx');
}

// ---- m4：同文件多孔，其中一孔多表 ----
{
  const wb = new ExcelJS.Workbook();
  sheet(wb, 'Sheet1', { hole: 'ZK4', samples: ['ZK4-01'] });
  sheet(wb, 'Sheet2', { hole: 'ZK5', samples: ['ZK5-01'] });
  sheet(wb, 'Sheet3', { hole: 'ZK5', samples: ['ZK5-02'] });
  await save(wb, 'qa_m4_multi_hole.xlsx');
}

// ---- e1：第一块就没有孔号（无任何孔可继承）----
{
  const wb = new ExcelJS.Workbook();
  sheet(wb, 'Sheet1', { holeMode: 'noLabel', samples: ['01', '02'] });
  await save(wb, 'qa_e1_first_no_hole.xlsx');
}

// ---- e2：同一工作表内两块，第二块不写孔号且接续编号 ----
{
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  let r = writeHead(ws, 1, { hole: 'ZK6-1' });
  r = writeSamples(ws, r, ['ZK6-1-01'], DEFAULT_FIELD);
  // 第二块：不写孔号行（r + 1 跳过一行间距）
  r = writeHead(ws, r + 1, { holeMode: 'noLabel' });
  writeSamples(ws, r, ['ZK6-1-02'], DEFAULT_FIELD);
  styleCols(ws);
  await save(wb, 'qa_e2_same_sheet_two_blocks.xlsx');
}

// ---- e3：孔号大小写 / 空格差异（'ZK1-1' vs ' zk1-1 '）----
{
  const wb = new ExcelJS.Workbook();
  sheet(wb, 'Sheet1', { hole: 'ZK1-1', samples: ['ZK1-1-01'] });
  sheet(wb, 'Sheet2', { hole: ' zk1-1 ', samples: ['zk1-1-02'] });
  await save(wb, 'qa_e3_case_space.xlsx');
}

// ---- e4：同孔两块鉴别格式冲突（A 侧「粉质黏土」 vs B 侧「粉粘土」）----
{
  const wb = new ExcelJS.Workbook();
  sheet(wb, 'Sheet1', { hole: 'ZK7-1', samples: ['ZK7-1-01'], fieldRecord: '粉质黏土' });
  sheet(wb, 'Sheet2', { hole: 'ZK7-1', samples: ['ZK7-1-03'], fieldRecord: '粉粘土' });
  await save(wb, 'qa_e4_mode_conflict.xlsx');
}

// ---- e5：「孔号」标签在 A 列、值留空（探测 findInfoValue 左邻居回退）----
{
  const wb = new ExcelJS.Workbook();
  sheet(wb, 'Sheet1', { hole: 'ZK8-1', samples: ['ZK8-1-01'] });
  sheet(wb, 'Sheet2', { holeMode: 'labelAEmpty', samples: ['ZK8-1-02'] });
  await save(wb, 'qa_e5_label_a_empty.xlsx');
}

// ---- e6：「孔号」标签在 B 列、值留空（同样未写孔号，但不触发左邻居回退）----
{
  const wb = new ExcelJS.Workbook();
  sheet(wb, 'Sheet1', { hole: 'ZK9-1', samples: ['ZK9-1-01'] });
  sheet(wb, 'Sheet2', { holeMode: 'labelBEmpty', samples: ['ZK9-1-02'] });
  await save(wb, 'qa_e6_label_b_empty.xlsx');
}

console.log('全部 fixture 已生成于', outDir);
