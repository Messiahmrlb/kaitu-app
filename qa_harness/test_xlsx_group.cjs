// 回归测试：Excel 导出按「工程编号 + 字母孔号前缀」分组合并（2026-10-30 用户确认规则）
//
// 覆盖：
//   parseHolePrefix：ZK12 / ZKJ3 / zk1 / 空号 / 纯数字 / 扰1
//   groupXlsxRecords：同工程同前缀合并、不同工程不合并、大小写敏感、无前缀单飞、顺序保持
//   mergedSoilNumber：原1→ZK1-1、扰1→ZK1-R1、R1→ZK1-R1、-1/1/01→ZK1-N、
//                     已含孔号原样、复杂编号原样、无孔号原样
//   buildXlsxGroupFileName：26T123-ZK(3孔).xlsx、缺工程编号/缺前缀回落
//   buildWorkbook 多孔合并：土号归一、信息行只写工程编号、√ 按各孔列 key 落位、
//                     附属表（液塑限/颗分/渗透）土号同样归一
//
// 运行：
//   npx esbuild src/exportNaming.ts --bundle --format=cjs --platform=node \
//     --packages=external --outfile=qa_harness/_emit/exportNaming.cjs
//   npx esbuild src/xlsxExport.ts --bundle --format=cjs --platform=node \
//     --packages=external --outfile=qa_harness/_emit/xlsxExport.cjs
//   node qa_harness/test_xlsx_group.cjs
const path = require('path');
const ExcelJS = require('exceljs');
const naming = require(path.join(__dirname, '_emit', 'exportNaming.cjs'));
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

// ---------- parseHolePrefix ----------
{
  const cases = [
    ['ZK12', 'ZK', '12'],
    ['ZKJ3', 'ZKJ', '3'],
    ['zk1', 'zk', '1'],
    ['ZK1-1', '', 'ZK1-1'], // 带后缀的整体不匹配「字母+纯数字」
    ['26T123', '', '26T123'], // 前缀含数字不算字母前缀
    ['1', '', '1'],
    ['', '', ''],
    ['  ZK5  ', 'ZK', '5'],
  ];
  for (const [input, wantPrefix, wantNum] of cases) {
    const got = naming.parseHolePrefix(input);
    check(
      `parseHolePrefix(${JSON.stringify(input)})`,
      got.prefix === wantPrefix && got.num === wantNum,
      JSON.stringify(got),
    );
  }
}

// ---------- groupXlsxRecords ----------
{
  const mk = (id, projectCode, holeCode) => ({
    id,
    mode: 'A',
    engineering: { projectCode, holeCode, holeElevation: '', openDate: '' },
    samples: [],
    customTestItems: [],
  });
  const records = [
    mk('a', '26T123', 'ZK1'),
    mk('b', '26T123', 'ZK2'),
    mk('c', '26T124', 'ZK3'), // 不同工程编号 → 不合并
    mk('d', '26T123', 'zk4'), // 大小写敏感 → 不合并
    mk('e', '26T123', 'ZKJ1'), // 前缀 ZKJ → 不合并
    mk('f', '26T123', '5'), // 无字母前缀 → 单飞
    mk('g', '26T123', ''), // 空孔号 → 单飞
  ];
  const groups = naming.groupXlsxRecords(records);
  check('分组数 = 6（ZK1+ZK2 合并，其余各自成组）', groups.length === 6, String(groups.length));
  check('第一组含 ZK1+ZK2', groups[0].length === 2 && groups[0][0].id === 'a' && groups[0][1].id === 'b', JSON.stringify(groups[0].map((r) => r.id)));
  check('组顺序保持传入顺序', groups[1][0].id === 'c' && groups[2][0].id === 'd' && groups[3][0].id === 'e' && groups[4][0].id === 'f' && groups[5][0].id === 'g', JSON.stringify(groups.slice(1).flat().map((r) => r.id)));
  const single = naming.groupXlsxRecords([mk('x', 'P', 'ZK1')]);
  check('单条记录 → 一组一条', single.length === 1 && single[0].length === 1);
  check('空数组 → 空', naming.groupXlsxRecords([]).length === 0);
}

// ---------- mergedSoilNumber ----------
{
  const cases = [
    // [hole, soilNumber, want]
    ['ZK1', '原1', 'ZK1-1'],
    ['ZK1', '原12', 'ZK1-12'],
    ['ZK38', '扰1', 'ZK38-R1'],
    ['ZK1', 'R1', 'ZK1-R1'],
    ['ZK1', 'r2', 'ZK1-R2'],
    ['ZK1', '1', 'ZK1-1'],
    ['ZK1', '-1', 'ZK1-1'],
    ['ZK1', '-01', 'ZK1-01'], // 数字原样保留
    ['ZK1', 'ZK1-1', 'ZK1-1'], // 已含孔号原样
    ['ZK1', 'ZK1-1-01', 'ZK1-1-01'],
    ['ZK1', 'ZK1-R1', 'ZK1-R1'],
    ['ZK1', '扰1a', '扰1a'], // 复杂编号原样
    ['ZK1', '', ''],
    ['', '1', '1'], // 无孔号原样
    ['ZK1', 'B-3', 'B-3'], // 非短编号形态原样
  ];
  for (const [hole, sn, want] of cases) {
    const got = naming.mergedSoilNumber(hole, sn);
    check(`mergedSoilNumber(${hole}, ${JSON.stringify(sn)})`, got === want, got);
  }
}

// ---------- buildXlsxGroupFileName ----------
{
  const mk = (projectCode, holeCode) => ({
    id: Math.random(),
    mode: 'A',
    engineering: { projectCode, holeCode, holeElevation: '', openDate: '' },
    samples: [],
    customTestItems: [],
  });
  check('26T123-ZK(3孔).xlsx', naming.buildXlsxGroupFileName([mk('26T123', 'ZK1'), mk('26T123', 'ZK2'), mk('26T123', 'ZK3')]) === '26T123-ZK(3孔).xlsx', naming.buildXlsxGroupFileName([mk('26T123', 'ZK1'), mk('26T123', 'ZK2'), mk('26T123', 'ZK3')]));
  check('缺工程编号 → ZK(2孔).xlsx', naming.buildXlsxGroupFileName([mk('', 'ZK1'), mk('', 'ZK2')]) === 'ZK(2孔).xlsx', naming.buildXlsxGroupFileName([mk('', 'ZK1'), mk('', 'ZK2')]));
  check('缺前缀 → 26T123(1孔).xlsx', naming.buildXlsxGroupFileName([mk('26T123', '5')]) === '26T123(1孔).xlsx', naming.buildXlsxGroupFileName([mk('26T123', '5')]));
  check('全缺 → 开土记录(1孔).xlsx', naming.buildXlsxGroupFileName([mk('', '')]) === '开土记录(1孔).xlsx', naming.buildXlsxGroupFileName([mk('', '')]));
}

// ---------- buildWorkbook 多孔合并 ----------
(async () => {
  const mkSample = (soilNumber, testItems, extra = {}) => ({
    id: Math.random(),
    soilNumber,
    fieldRecord: '粉质黏土',
    sampleDepth: '',
    sampleElevation: '',
    color: '褐',
    smell: '无',
    soilType: ['粉质黏土'],
    inclusions: [],
    soilState: [],
    soilStateNote: '',
    testItems,
    il: '0.5',
    ip: '15.2',
    disturbance: '原状',
    siltySand: 'none',
    otherTestItems: [],
    ...extra,
  });
  const mkRecord = (id, holeCode, samples, engineering = {}) => ({
    id,
    name: `测试工程 ${holeCode}`,
    mode: 'A',
    engineering: { projectCode: '26T123', holeCode, holeElevation: '', openDate: '2026-10-30', ...engineering },
    samples,
    customTestItems: [],
    createdAt: 1,
    updatedAt: 1,
  });

  const rec1 = mkRecord('r1', 'ZK1', [
    mkSample('原1', ['固结']),
    mkSample('扰1', ['垂直渗透'], { disturbance: '扰动', ip: '8' }), // Ip≤10 且扰动 → 纳入颗分
  ]);
  const rec2 = mkRecord('r2', 'ZK2', [
    mkSample('1', ['饱固快剪']),
    mkSample('3', []),
  ]);
  const rec3 = mkRecord('r3', 'ZK3', [mkSample('5', [])]);
  const XL = ExcelJS;
  const wb = await buildWorkbook([rec1, rec2, rec3], XL);
  const ws = wb.worksheets[0];

  // 主表：信息行 + 数据行
  check('信息行第 1 组写「工程编号：26T123」', ws.getCell(2, 1).value === '工程编号：26T123', JSON.stringify(ws.getCell(2, 1).value));
  const infoTexts = [11, 21].map((c) => String(ws.getCell(2, c).value ?? ''));
  check('信息行不再写孔号/标高（组2、组3 空）', infoTexts[0] === '' && infoTexts[1] === '', JSON.stringify(infoTexts));
  check('信息行组 4 写统一开土日期', ws.getCell(2, 31).value === '开土日期(年/月/日)：2026-10-30', JSON.stringify(ws.getCell(2, 31).value));

  // 土号归一：5 条样 = ZK1-1 / ZK1-R1 / ZK2-1 / ZK2-3 / ZK3-5
  const soilNums = [5, 6, 7, 8, 9].map((r) => String(ws.getCell(r, 1).value));
  check(
    '主表土号归一 ZK1-1/ZK1-R1/ZK2-1/ZK2-3/ZK3-5',
    JSON.stringify(soilNums) === JSON.stringify(['ZK1-1', 'ZK1-R1', 'ZK2-1', 'ZK2-3', 'ZK3-5']),
    JSON.stringify(soilNums),
  );

  // √ 落位（TEST_ITEMS 顺序 → 列 33=物性 34=颗分 35=固结 36=垂直渗透 37=水平渗透 38=饱固快剪…）
  check('ZK1-1 固结 √ 在 col35', ws.getCell(5, 35).value === '√', String(ws.getCell(5, 35).value));
  check('ZK1-1 饱固快剪 不在 col38', ws.getCell(5, 38).value !== '√');
  check('ZK1-R1 垂直渗透 √ 在 col36', ws.getCell(6, 36).value === '√', String(ws.getCell(6, 36).value));
  check('ZK2-1 饱固快剪 √ 在 col38', ws.getCell(7, 38).value === '√', String(ws.getCell(7, 38).value));
  check('ZK2-1 固结 不在 col35', ws.getCell(7, 35).value !== '√');

  // 扰动土标记列 15
  check('ZK1-R1 扰动 √ 在 col15', ws.getCell(6, 15).value === '√', String(ws.getCell(6, 15).value));
  check('ZK1-1 原状 col15 空', !ws.getCell(5, 15).value);

  // 附属表 2：液塑限（全部 5 条）
  const ws2 = wb.worksheets[1];
  const ws2Nums = [3, 4, 5, 6, 7].map((r) => String(ws2.getCell(r, 1).value));
  check(
    '液塑限表土号同样归一',
    JSON.stringify(ws2Nums) === JSON.stringify(['ZK1-1', 'ZK1-R1', 'ZK2-1', 'ZK2-3', 'ZK3-5']),
    JSON.stringify(ws2Nums),
  );

  // 附属表 3：颗分（Ip≤10 或扰动：ZK1-R1 Ip=8 扰动 → 只有它）
  const ws3 = wb.worksheets[2];
  check('颗分表仅 ZK1-R1 纳入', String(ws3.getCell(3, 1).value) === 'ZK1-R1' && !ws3.getCell(4, 1).value, JSON.stringify([String(ws3.getCell(3, 1).value), String(ws3.getCell(4, 1).value)]));

  // 附属表 4：渗透（仅 ZK1-R1 做了垂直渗透）
  const ws4 = wb.worksheets[3];
  check('渗透表仅 ZK1-R1', String(ws4.getCell(3, 1).value) === 'ZK1-R1' && !ws4.getCell(4, 1).value);

  // 信息行：组内开土日期不一致 → 留空
  const rec4 = mkRecord('r4', 'ZK4', [mkSample('1', [])], { openDate: '2026-10-01' });
  const wb2 = await buildWorkbook([rec1, rec4], XL);
  check('开土日期不一致时信息行组 4 留空', !wb2.worksheets[0].getCell(2, 31).value, JSON.stringify(wb2.worksheets[0].getCell(2, 31).value));

  // 单孔记录 → 与原单孔行为一致（土号归一后）
  const wb3 = await buildWorkbook([rec1], XL);
  check('单孔表土号同样归一', String(wb3.worksheets[0].getCell(5, 1).value) === 'ZK1-1' && String(wb3.worksheets[0].getCell(6, 1).value) === 'ZK1-R1');

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试执行失败:', e);
  process.exit(1);
});
