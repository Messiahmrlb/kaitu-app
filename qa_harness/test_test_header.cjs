// 回归测试：试验列表头自适应（送样单别名识别 → 记录级显示名覆盖）
//
// 覆盖：
//   classifyShearLabel：饱固快剪（带饱）/ 固结快剪（带固不带饱，含固快）/ 自然快剪（含快剪）/ 慢剪
//   classifyConsolidationAlias：回弹压缩 / 固结系数 → 归「固结」，固结 / 压缩系数压缩模量 → 不覆盖
//   recordTestColumns：默认 8 列不变；shearLabels / consolidationLabel 覆盖
//   parseDeliveryFile：真实 xlsx（子表头含 回弹压缩 / 固结快剪 / 慢剪）→
//                      record.shearLabels / consolidationLabel、勾选数据键、提示文案
//   mergeImportedByHole：同孔表头不一致 → errors（来源错误级），取第一块
//
// 运行：
//   npx esbuild src/testHeader.ts --bundle --format=cjs --platform=node \
//     --outfile=qa_harness/_emit/testHeader.cjs
//   npx esbuild src/constants.ts --bundle --format=cjs --platform=node \
//     --outfile=qa_harness/_emit/constants_test.cjs
//   npx esbuild src/importDelivery.ts --bundle --format=cjs --platform=node \
//     --packages=external --outfile=qa_harness/_emit/importDelivery.cjs
//   node qa_harness/test_test_header.cjs
const path = require('path');
const ExcelJS = require('exceljs');
const {
  classifyShearLabel,
  classifyConsolidationAlias,
} = require(path.join(__dirname, '_emit', 'testHeader.cjs'));
const { recordTestColumns } = require(path.join(__dirname, '_emit', 'constants_test.cjs'));
const { parseDeliveryFile } = require(path.join(__dirname, '_emit', 'importDelivery.cjs'));

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
function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `${a} (期望 ${e})`);
}

// ---------- classifyShearLabel ----------
console.log('\nclassifyShearLabel');
eq('饱固快剪', classifyShearLabel('饱固快剪'), '饱固快剪');
eq('饱和固结快剪（带饱）', classifyShearLabel('饱和固结快剪'), '饱固快剪');
eq('饱和快剪（带饱）', classifyShearLabel('饱和快剪'), '饱固快剪');
eq('固结快剪（带固不带饱）', classifyShearLabel('固结快剪'), '固结快剪');
eq('固快（简称）', classifyShearLabel('固快'), '固结快剪');
eq('自然快剪', classifyShearLabel('自然快剪'), '自然快剪');
eq('只有快剪两个字', classifyShearLabel('快剪'), '自然快剪');
eq('慢剪', classifyShearLabel('慢剪'), '慢剪');
eq('饱和固结慢剪（含慢剪）', classifyShearLabel('饱和固结慢剪'), '慢剪');
eq('含空白的固结快剪', classifyShearLabel('固结 快剪'), '固结快剪');
eq('固结不是剪试验', classifyShearLabel('固结'), null);
eq('回弹压缩不是剪试验', classifyShearLabel('回弹压缩'), null);
eq('空串', classifyShearLabel(''), null);
eq('压缩系数压缩模量不是剪试验', classifyShearLabel('压缩系数压缩模量'), null);
eq('颗分不是剪试验', classifyShearLabel('颗分'), null);
// 误命中防线：固结快剪绝不能落进固结别名
eq('固结快剪不走固结别名', classifyConsolidationAlias('固结快剪'), null);

// ---------- classifyConsolidationAlias ----------
console.log('\nclassifyConsolidationAlias');
eq('回弹压缩', classifyConsolidationAlias('回弹压缩'), '回弹压缩');
eq('回弹再压缩（含回弹）', classifyConsolidationAlias('回弹再压缩'), '回弹再压缩');
eq('固结系数', classifyConsolidationAlias('固结系数'), '固结系数');
eq('固结（默认名不覆盖）', classifyConsolidationAlias('固结'), null);
eq('压缩系数压缩模量（标准写法不覆盖）', classifyConsolidationAlias('压缩系数压缩模量'), null);
eq('空串', classifyConsolidationAlias(''), null);
eq('颗分', classifyConsolidationAlias('颗分'), null);

// ---------- recordTestColumns ----------
console.log('\nrecordTestColumns');
const DEFAULT_ITEMS = ['物性', '颗分', '固结', '垂直渗透', '水平渗透', '饱固快剪', '自然快剪', '三轴'];
eq('无覆盖：列与默认 8 项一致', recordTestColumns(null).map((c) => c.label), DEFAULT_ITEMS);
eq('无覆盖：键与默认 8 项一致', recordTestColumns(undefined).map((c) => c.key), DEFAULT_ITEMS);
{
  const cols = recordTestColumns({ shearLabels: ['固结快剪', '慢剪'] });
  eq('剪槽覆盖后显示名', cols.map((c) => c.label), ['物性', '颗分', '固结', '垂直渗透', '水平渗透', '固结快剪', '慢剪', '三轴']);
  eq('剪槽覆盖后数据键', cols.map((c) => c.key), ['物性', '颗分', '固结', '垂直渗透', '水平渗透', '固结快剪', '慢剪', '三轴']);
}
{
  const cols = recordTestColumns({ consolidationLabel: '回弹压缩' });
  const cons = cols.find((c) => c.key === '固结');
  check('固结列显示回弹压缩、键仍为固结', cons.label === '回弹压缩' && cons.key === '固结');
}
{
  const cols = recordTestColumns({ shearLabels: ['固结快剪', '慢剪'], consolidationLabel: '固结系数' });
  check('固结+剪切同时覆盖', cols.find((c) => c.key === '固结').label === '固结系数' && cols[5].label === '固结快剪' && cols[6].label === '慢剪');
}

// ---------- parseDeliveryFile：真实 xlsx ----------
console.log('\nparseDeliveryFile（别名子表头）');
const ALIAS_SUB_HEADERS = ['自', '至', '原状', '扰动', '常规物性', '颗分', '回弹压缩', '固结快剪', '慢剪'];
const STD_SUB_HEADERS = ['自', '至', '原状', '扰动', '常规物性', '颗分', '压缩系数压缩模量', '垂直渗透', '水平渗透', '饱和固结快剪', '自然快剪'];

/**
 * 写一份送样单块（子表头可自定义）。
 * 勾选规则：soilChecks = [{ colIndex, }] — 在子表头第 colIndex（0 起）列打 √。
 */
function addBlock(ws, startRow, { hole, subHeaders, soilRows }) {
  ws.getCell(`A${startRow}`).value = '土工试验送样单';
  ws.getCell(`A${startRow + 1}`).value = '工程名称：表头测试工程';
  ws.getCell(`A${startRow + 2}`).value = '孔号';
  ws.getCell(`B${startRow + 2}`).value = hole;
  const hr = startRow + 3;
  ws.getCell(`A${hr}`).value = '土样编号';
  ws.getCell(`B${hr}`).value = '野外定名';
  subHeaders.forEach((h, i) => {
    const col = String.fromCharCode('C'.charCodeAt(0) + i);
    ws.getCell(`${col}${hr + 1}`).value = h;
  });
  soilRows.forEach((checks, i) => {
    const r = hr + 2 + i;
    ws.getCell(`A${r}`).value = `${hole}-1-${String(i + 1).padStart(2, '0')}`;
    ws.getCell(`B${r}`).value = '粉质黏土';
    ws.getCell(`C${r}`).value = '1.0';
    ws.getCell(`D${r}`).value = '1.5';
    ws.getCell(`E${r}`).value = '√'; // 原状
    checks.forEach((ci) => {
      const col = String.fromCharCode('C'.charCodeAt(0) + ci);
      ws.getCell(`${col}${r}`).value = '√';
    });
  });
  const footer = hr + 2 + soilRows.length;
  ws.getCell(`A${footer}`).value = '送样人：';
  return footer + 2;
}

async function parseSheets(sheetDefs) {
  const wb = new ExcelJS.Workbook();
  sheetDefs.forEach((def) => {
    const ws = wb.addWorksheet(def.name);
    let row = 1;
    def.blocks.forEach((b) => {
      row = addBlock(ws, row, b);
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return parseDeliveryFile(ab);
}

(async () => {
  // 场景 1：别名子表头（回弹压缩 / 固结快剪 / 慢剪）
  {
    const res = await parseSheets([
      {
        name: '别名表',
        blocks: [
          {
            hole: 'ZK1',
            subHeaders: ALIAS_SUB_HEADERS, // C自 D至 E原状 F扰动 G常规物性 H颗分 I回弹压缩 J固结快剪 K慢剪
            soilRows: [[5, 6, 8], [6, 7]], // 样1: 颗分+固结(回弹)+慢剪; 样2: 固结(回弹)+固结快剪
          },
        ],
      },
    ]);
    check('识别出 1 条记录', res.records.length === 1, JSON.stringify(res.errors));
    const rec = res.records[0].record;
    eq('shearLabels 按送样单原文', rec.shearLabels, ['固结快剪', '慢剪']);
    eq('consolidationLabel 记原文', rec.consolidationLabel, '回弹压缩');
    const s1 = rec.samples[0];
    const s2 = rec.samples[1];
    check('样1 勾选固结(回弹压缩归一)', s1.testItems.includes('固结'), s1.testItems.join(','));
    check('样1 勾选慢剪', s1.testItems.includes('慢剪'), s1.testItems.join(','));
    check('样2 勾选固结快剪', s2.testItems.includes('固结快剪'), s2.testItems.join(','));
    check('样2 也勾了回弹压缩（归一为固结）', s2.testItems.includes('固结'), s2.testItems.join(','));
    check('有黄色提示表头按原文显示', res.records[0].warnings.some((w) => w.includes('表头按送样单原文显示')), res.records[0].warnings.join(' | '));
    // 导出列映射：键能对上显示名
    const cols = recordTestColumns(rec);
    check('样1 慢剪 √ 落在显示「慢剪」的列', cols.find((c) => c.key === '慢剪').label === '慢剪');
    check('样1 固结 √ 落在显示「回弹压缩」的列', cols.find((c) => c.key === '固结').label === '回弹压缩');
  }

  // 场景 2：标准子表头 → 无覆盖字段、无覆盖提示（向后兼容）
  {
    const res = await parseSheets([
      {
        name: '标准表',
        blocks: [
          {
            hole: 'ZK2',
            subHeaders: STD_SUB_HEADERS,
            soilRows: [[9], [10]], // 样1: 饱和固结快剪(索引9)；样2: 自然快剪(索引10)
          },
        ],
      },
    ]);
    const rec = res.records[0].record;
    check('标准表不写 shearLabels', rec.shearLabels === undefined, JSON.stringify(rec.shearLabels));
    check('标准表不写 consolidationLabel', rec.consolidationLabel === undefined);
    check('标准表无覆盖提示', !res.records[0].warnings.some((w) => w.includes('表头按送样单原文显示')), res.records[0].warnings.join(' | '));
    check('样1 饱固快剪照常识别', rec.samples[0].testItems.includes('饱固快剪'), rec.samples[0].testItems.join(','));
    check('样2 自然快剪照常识别', rec.samples[1].testItems.includes('自然快剪'), rec.samples[1].testItems.join(','));
  }

  // 场景 3：同孔两块表头不一致 → 来源错误级提示，取第一块
  {
    const res = await parseSheets([
      {
        name: '混合表',
        blocks: [
          { hole: 'ZK3', subHeaders: ALIAS_SUB_HEADERS, soilRows: [[8]] },
          { hole: 'ZK3', subHeaders: STD_SUB_HEADERS, soilRows: [[10]] },
        ],
      },
    ]);
    const rec = res.records[0];
    check('同孔两块合并为 1 条', res.records.length === 1 && rec.mergedFrom === 2, `mergedFrom=${rec.mergedFrom}`);
    check('表头不一致报来源错误', rec.errors.some((e) => e.includes('表头不一致') && e.includes('疑似送样单来源有误')), rec.errors.join(' | '));
    eq('取第一块的 shearLabels', rec.record.shearLabels, ['固结快剪', '慢剪']);
    eq('取第一块的 consolidationLabel', rec.record.consolidationLabel, '回弹压缩');
  }

  // 场景 4：同孔两块表头一致 → 不报错误
  {
    const res = await parseSheets([
      {
        name: '一致表',
        blocks: [
          { hole: 'ZK4', subHeaders: ALIAS_SUB_HEADERS, soilRows: [[8]] },
          { hole: 'ZK4', subHeaders: ALIAS_SUB_HEADERS, soilRows: [[7]] },
        ],
      },
    ]);
    const rec = res.records[0];
    check('表头一致不报错误', rec.errors.length === 0, rec.errors.join(' | '));
    eq('shearLabels 正常', rec.record.shearLabels, ['固结快剪', '慢剪']);
  }

  // 场景 5：「表二」结果表（多行错位表头、无数据）整体跳过，不产生垃圾记录
  // 复刻真实文件：伪表头行(土样编号+…+原状+试验标签) 后跟重复表头行与空行、表尾
  {
    const wb = new ExcelJS.Workbook();
    // 正常表一
    const ws1 = wb.addWorksheet('表一');
    addBlock(ws1, 1, { hole: 'ZK5', subHeaders: ALIAS_SUB_HEADERS, soilRows: [[7]] });
    // 表二样式：r7 伪HR(土样编号…试验项目组标签)、r8-r9 重复子表头（含 土样编号/自/至/原状/扰动+试验标签）、空数据区、表尾
    const ws2 = wb.addWorksheet('表2');
    ws2.getCell('A5').value = '工程名称：';
    ws2.getCell('A6').value = '孔号';
    ws2.getCell('A7').value = '土样编号';
    ws2.getCell('B7').value = '取土深度（m）';
    ws2.getCell('D7').value = '野外 定名';
    ws2.getCell('E7').value = '状态';
    ws2.getCell('G7').value = '试验项目';
    const junkSub = ['土样编号', '自', '至', '野外 定名', '原状', '扰动', '天然含水率', '湿密度', '液塑限', '颗分', '饱和固结快剪', '自然快剪'];
    [8, 9].forEach((r) => {
      junkSub.forEach((h, i) => {
        ws2.getCell(String.fromCharCode('A'.charCodeAt(0) + i) + r).value = h;
      });
    });
    ws2.getCell('A39').value = '送样人：';
    const buf = await wb.xlsx.writeBuffer();
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await parseDeliveryFile(ab);
    check('只导入表一的 1 条记录', res.records.length === 1 && res.records[0].holeCode === 'ZK5', `n=${res.records.length}`);
    check('表二被跳过并给出提示', res.warnings.some((w) => w.includes('表2') && w.includes('已跳过')), res.warnings.join(' | '));
    check('无垃圾土号（无「土样编号」样本）', res.records.every((r) => r.record.samples.every((s) => s.soilNumber !== '土样编号')));
  }

  // 场景 6：表二里有真实数据行（非空结果表）→ 仍按现有块解析导入，
  // 但「土样编号」表头残留行绝不成为样本（守卫不误伤）
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('表2有数据');
    ws.getCell('A5').value = '工程名称：';
    ws.getCell('A6').value = '孔号';
    ws.getCell('B6').value = 'ZK6';
    ws.getCell('A7').value = '土样编号';
    const junkSub = ['土样编号', '自', '至', '野外 定名', '原状', '扰动', '天然含水率', '液塑限', '颗分', '饱和固结快剪'];
    [8, 9].forEach((r) => {
      junkSub.forEach((h, i) => {
        ws.getCell(String.fromCharCode('A'.charCodeAt(0) + i) + r).value = h;
      });
    });
    // 数据行：土号 + 勾选（饱和固结快剪=索引10→J列）
    ws.getCell('A10').value = '原1';
    ws.getCell('B10').value = '1.3';
    ws.getCell('C10').value = '1.5';
    ws.getCell('D10').value = '粉质黏土';
    ws.getCell('E10').value = '√';
    ws.getCell('J10').value = '√';
    ws.getCell('A11').value = '送样人：';
    const buf = await wb.xlsx.writeBuffer();
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await parseDeliveryFile(ab);
    check('表二数据行正常导入为 1 条记录', res.records.length === 1 && res.records[0].record.samples.length === 1, JSON.stringify(res.warnings));
    eq('土号保真', res.records[0].record.samples[0].soilNumber, '原1');
    check('勾选归一到饱固快剪', res.records[0].record.samples[0].testItems.includes('饱固快剪'));
  }

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail > 0 ? 1 : 0);
})();
