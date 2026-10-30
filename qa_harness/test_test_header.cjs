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

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail > 0 ? 1 : 0);
})();
