// 回归测试：PDF 导出「多孔合并同页」（2026-11 用户需求：小孔拼表省纸）
//
// 覆盖（纯函数层 buildCombinedPdfPages，不依赖 DOM）：
//   分段：A/B 两种鉴别模式表头列不同，不同模式的孔不混表（各模式独立装填）
//   装填：小孔拼入当前页剩余行；剩余行装不下整孔 → 该孔整体另起新页（孔不拆页）
//   大孔：土样 >23 条独占 ceil(n/23) 页（自然分页），尾页剩余行留给后续孔接续
//   土号：每孔第 1 条带孔号前缀（mergedSoilNumber：-1→ZK1-1、原2→ZK1-2、
//         1→ZK2-1 去前导零），其余土短编号（-2 / -R1，与单孔导出同款；
//         2026-11-03 用户反馈：全带前缀时孔号超出列宽出格）；大孔自然分页的
//         续页行序号 >1 不带孔号（严格按用户规则：只有每孔第一个土标孔号）；
//         空土号按孔内序号兜底：首样 ZK3-1、其余 -2
//   开土日期：段内所有孔日期一致 → 该日期；不一致 → ''（留空手填）
//   其余列：与 fillRow 完全一致（颜色/野外记录/扰动√ 等照常落格）
//
// 运行：
//   npx esbuild src/pdfExport.ts --bundle --platform=node --format=cjs \
//     --outfile=qa_harness/_emit/pdfExport.cjs --log-level=warning
//   node qa_harness/test_pdf_combined.cjs
const path = require('path');
const pdf = require(path.join(__dirname, '_emit', 'pdfExport.cjs'));

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

// ---------- fixture（模仿 test_docx_export.cjs 的 mkRecord） ----------
function mkSample(no, extra = {}) {
  return {
    id: 's-' + no + '-' + Math.random().toString(36).slice(2, 8),
    soilNumber: no,
    fieldRecord: '',
    sampleDepth: '',
    sampleElevation: '',
    color: '',
    smell: '',
    soilType: [],
    inclusions: [],
    soilState: [],
    soilStateNote: '',
    testItems: [],
    il: '',
    ip: '',
    disturbance: '原状',
    siltySand: 'none',
    otherTestItems: [],
    ...extra,
  };
}
/** n 条土样，土号为 '1'..'n'（纯数字，去前导零规则由 mergedSoilNumber 归一） */
function mkSamples(n) {
  const arr = [];
  for (let i = 1; i <= n; i++) arr.push(mkSample(String(i)));
  return arr;
}
function mkRecord(id, hole, samples, extra = {}) {
  return {
    id,
    mode: 'A',
    engineering: {
      projectCode: '26T123',
      holeCode: hole,
      holeElevation: '12.5',
      openDate: '2026-11-01',
    },
    samples,
    customTestItems: [],
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

// 单元格键与 pdfExport 内部 cellKey(row,col) 同规则：row*1000+col
const key = (row, col) => row * 1000 + col;
const soilCell = (page, row) => page.cells[key(row, 1)] ?? '';

// ---------- 1. 分段 + 拼表矩阵：A 孔 5/7/30 + B 孔 4 ----------
{
  const recs = [
    mkRecord('r1', 'ZK1', mkSamples(5)),
    mkRecord('r2', 'ZK2', mkSamples(7)),
    mkRecord('r3', 'ZK3', mkSamples(30)),
    mkRecord('r4', 'ZK4', mkSamples(4), { mode: 'B' }),
  ];
  const { pages, modes, dateTexts } = pdf.buildCombinedPdfPages(recs);

  // 孔1(5)+孔2(7)=12 行同页；孔3(30) 装不下（剩 11）→ 独占 23+7 两页；
  // B 孔独立一页（与 A 不混表）→ 共 4 页
  check('用例1：共 4 页（A 段 3 页 + B 段 1 页）', pages.length === 4, String(pages.length));
  check('用例1：modes 序列 A,A,A,B（A/B 不混表）', JSON.stringify(modes) === JSON.stringify(['A', 'A', 'A', 'B']), JSON.stringify(modes));
  check('用例1：dateTexts 全为段内统一日期', JSON.stringify(dateTexts) === JSON.stringify(['2026-11-01', '2026-11-01', '2026-11-01', '2026-11-01']), JSON.stringify(dateTexts));

  // 第 1 页：ZK1 的 5 行（行0-4）+ 1 行孔间分隔空行（行5）+ ZK2 的 7 行（行6-12）
  // 新土号规则：每孔首行带孔号前缀，其余短编号 -N
  check('用例1：页1 行0 = ZK1-1（孔首样带孔号）', soilCell(pages[0], 0) === 'ZK1-1', soilCell(pages[0], 0));
  check('用例1：页1 行4 = -5（非首样短编号）', soilCell(pages[0], 4) === '-5', soilCell(pages[0], 4));
  check('用例1：页1 行5 留空（孔间分隔行）', soilCell(pages[0], 5) === '', JSON.stringify(soilCell(pages[0], 5)));
  check('用例1：页1 行6 = ZK2-1（分隔行后孔2 接续，孔首样带孔号）', soilCell(pages[0], 6) === 'ZK2-1', soilCell(pages[0], 6));
  check('用例1：页1 行12 = -7（非首样短编号）', soilCell(pages[0], 12) === '-7', soilCell(pages[0], 12));
  check('用例1：页1 行13 留空（剩 10 行装不下 30+1 分隔行的孔3）', soilCell(pages[0], 13) === '', JSON.stringify(soilCell(pages[0], 13)));

  // 第 2 页：孔3 前 23 条；第 3 页：孔3 尾 7 条
  check('用例1：页2 行0 = ZK3-1（大孔整孔另起新页，孔首样带孔号）', soilCell(pages[1], 0) === 'ZK3-1', soilCell(pages[1], 0));
  check('用例1：页2 行22 = -23（非首样短编号）', soilCell(pages[1], 22) === '-23', soilCell(pages[1], 22));
  check('用例1：页3 行0 = -24（自然分页续行，孔内序号>1 不带孔号——预期行为）', soilCell(pages[2], 0) === '-24', soilCell(pages[2], 0));
  check('用例1：页3 行6 = -30（非首样短编号）', soilCell(pages[2], 6) === '-30', soilCell(pages[2], 6));
  check('用例1：页3 行7 留空（尾页剩 16 行，无后续 A 孔）', soilCell(pages[2], 7) === '');

  // 第 4 页：B 孔独立一页
  check('用例1：页4 行0 = ZK4-1（孔首样带孔号）', soilCell(pages[3], 0) === 'ZK4-1', soilCell(pages[3], 0));
  check('用例1：页4 行3 = -4（非首样短编号）', soilCell(pages[3], 3) === '-4', soilCell(pages[3], 3));
  check('用例1：页4 headerRecord 为 B 段第一条记录（表头列来源）', pages[3].headerRecord.id === 'r4', pages[3].headerRecord.id);
  check('用例1：页1 headerRecord 为 A 段第一条记录', pages[0].headerRecord.id === 'r1', pages[0].headerRecord.id);
}

// ---------- 2. 孔不拆页：孔1 20 条 + 孔2 5 条（20+1 分隔+5 > 23 → 孔2 新页） ----------
{
  const recs = [mkRecord('r1', 'ZK1', mkSamples(20)), mkRecord('r2', 'ZK2', mkSamples(5))];
  const { pages } = pdf.buildCombinedPdfPages(recs);
  check('用例2：总 2 页', pages.length === 2, String(pages.length));
  check('用例2：页1 行0 = ZK1-1（孔首样带孔号）', soilCell(pages[0], 0) === 'ZK1-1', soilCell(pages[0], 0));
  check('用例2：页1 行19 = -20（非首样短编号）', soilCell(pages[0], 19) === '-20', soilCell(pages[0], 19));
  check('用例2：页1 行20 留空（剩 3 行装不下 5+1 分隔行的孔2）', soilCell(pages[0], 20) === '');
  check('用例2：页2 行0 = ZK2-1（孔2 整体新页，未被拦腰拆开；孔首样带孔号）', soilCell(pages[1], 0) === 'ZK2-1', soilCell(pages[1], 0));
  check('用例2：页2 行4 = -5（非首样短编号）', soilCell(pages[1], 4) === '-5', soilCell(pages[1], 4));
}

// ---------- 3. 大孔尾页接续：孔1 26 条（23+3，尾页剩 20）+ 孔2 5 条（分隔 1 行） ----------
{
  const recs = [mkRecord('r1', 'ZK1', mkSamples(26)), mkRecord('r2', 'ZK2', mkSamples(5))];
  const { pages } = pdf.buildCombinedPdfPages(recs);
  check('用例3：总 2 页（孔2 接续在孔1 尾页，不新开页）', pages.length === 2, String(pages.length));
  check('用例3：页2 行0 = -24（大孔续页行，孔内序号>1 不带孔号——预期行为）', soilCell(pages[1], 0) === '-24', soilCell(pages[1], 0));
  check('用例3：页2 行2 = -26（非首样短编号）', soilCell(pages[1], 2) === '-26', soilCell(pages[1], 2));
  check('用例3：页2 行3 留空（接续孔前的分隔行）', soilCell(pages[1], 3) === '', JSON.stringify(soilCell(pages[1], 3)));
  check('用例3：页2 行4 = ZK2-1（落在孔1 尾页分隔行之后，孔首样带孔号）', soilCell(pages[1], 4) === 'ZK2-1', soilCell(pages[1], 4));
  check('用例3：页2 行8 = -5（非首样短编号）', soilCell(pages[1], 8) === '-5', soilCell(pages[1], 8));
}

// ---------- 4. 土号前缀：孔首样 mergedSoilNumber 归一、非首样短编号 ----------
{
  const recs = [
    mkRecord('r1', 'ZK1', [mkSample('-1'), mkSample('原2')]),
    mkRecord('r2', 'ZK2', [mkSample('1'), mkSample('R01')]),
  ];
  const { pages } = pdf.buildCombinedPdfPages(recs);
  check('用例4：样 -1 → ZK1-1（孔首样带孔号）', soilCell(pages[0], 0) === 'ZK1-1', soilCell(pages[0], 0));
  check('用例4：样 原2 → -2（非首样短编号，去「原」字）', soilCell(pages[0], 1) === '-2', soilCell(pages[0], 1));
  check('用例4：行2 留空（孔间分隔行）', soilCell(pages[0], 2) === '', soilCell(pages[0], 2));
  check('用例4：孔 ZK2 样 1 → ZK2-1（分隔行后首行，孔首样带孔号）', soilCell(pages[0], 3) === 'ZK2-1', soilCell(pages[0], 3));
  check('用例4：样 R01 → -R1（非首样短编号：R 前缀 + 去前导零）', soilCell(pages[0], 4) === '-R1', soilCell(pages[0], 4));
  // 已带孔号前缀的原样保留（去前导零）：ZK3-01 → ZK3-1（单样孔 = 孔首样）
  const rec3 = mkRecord('r3', 'ZK3', [mkSample('ZK3-01')]);
  const r3 = pdf.buildCombinedPdfPages([rec3]);
  check('用例4：样 ZK3-01 → ZK3-1（已有前缀归一，孔首样带孔号）', soilCell(r3.pages[0], 0) === 'ZK3-1', soilCell(r3.pages[0], 0));
}

// ---------- 5. 开土日期：段内一致显示、不一致留空 ----------
{
  const same = [
    mkRecord('r1', 'ZK1', mkSamples(20), { engineering: { projectCode: 'P', holeCode: 'ZK1', holeElevation: '', openDate: '2026-11-02' } }),
    mkRecord('r2', 'ZK2', mkSamples(5), { engineering: { projectCode: 'P', holeCode: 'ZK2', holeElevation: '', openDate: '2026-11-02' } }),
  ];
  const a = pdf.buildCombinedPdfPages(same);
  check('用例5：两孔同日期 → 每页 dateText 为该日期', JSON.stringify(a.dateTexts) === JSON.stringify(['2026-11-02', '2026-11-02']), JSON.stringify(a.dateTexts));

  const diff = [
    mkRecord('r1', 'ZK1', mkSamples(20), { engineering: { projectCode: 'P', holeCode: 'ZK1', holeElevation: '', openDate: '2026-11-02' } }),
    mkRecord('r2', 'ZK2', mkSamples(5), { engineering: { projectCode: 'P', holeCode: 'ZK2', holeElevation: '', openDate: '2026-11-03' } }),
  ];
  const b = pdf.buildCombinedPdfPages(diff);
  check('用例5：两孔不同日期 → dateText 留空（手填）', JSON.stringify(b.dateTexts) === JSON.stringify(['', '']), JSON.stringify(b.dateTexts));

  // 一端日期为空也算不一致 → 留空
  const mixedEmpty = [
    mkRecord('r1', 'ZK1', mkSamples(1), { engineering: { projectCode: 'P', holeCode: 'ZK1', holeElevation: '', openDate: '2026-11-02' } }),
    mkRecord('r2', 'ZK2', mkSamples(1), { engineering: { projectCode: 'P', holeCode: 'ZK2', holeElevation: '', openDate: '' } }),
  ];
  const c = pdf.buildCombinedPdfPages(mixedEmpty);
  check('用例5：一孔日期为空 → 留空', c.dateTexts[0] === '', c.dateTexts[0]);
}

// ---------- 6. 空土号回退：首样 ZK3-1、其余 -<孔内序号> ----------
{
  const recs = [mkRecord('r1', 'ZK3', [mkSample(''), mkSample('原2')])];
  const { pages } = pdf.buildCombinedPdfPages(recs);
  check('用例6：空土号第 1 条 → ZK3-1（首样带孔号兜底）', soilCell(pages[0], 0) === 'ZK3-1', soilCell(pages[0], 0));
  check('用例6：样 原2 → -2（非首样短编号去「原」字）', soilCell(pages[0], 1) === '-2', soilCell(pages[0], 1));

  // 全空土号：首样回退 ZK3-1，其余回退 -2（短编号口径）
  const allEmpty = [mkRecord('r1', 'ZK3', [mkSample(''), mkSample('')])];
  const b = pdf.buildCombinedPdfPages(allEmpty);
  check('用例6：全空土号 首→ZK3-1 / 次→-2', soilCell(b.pages[0], 0) === 'ZK3-1' && soilCell(b.pages[0], 1) === '-2', `${soilCell(b.pages[0], 0)}/${soilCell(b.pages[0], 1)}`);
}

// ---------- 7. 其余列与 fillRow 完全一致（勾选√、颜色、野外记录、扰动） ----------
{
  const recs = [
    mkRecord('r1', 'ZK1', [
      mkSample('1', {
        fieldRecord: '粉质黏土夹贝壳',
        color: '褐黄',
        smell: '无',
        soilType: ['粉质黏土'],
        inclusions: ['含贝壳'],
        soilState: ['硬塑'],
        soilStateNote: '备注A',
        disturbance: '扰动',
        testItems: ['固结'],
      }),
    ]),
    mkRecord('r2', 'ZK2', mkSamples(2)),
  ];
  const { pages } = pdf.buildCombinedPdfPages(recs);
  const c = pages[0].cells;
  check('用例7：颜色列照常落格', c[key(0, 5)] === '褐黄', c[key(0, 5)]);
  check('用例7：野外记录列照常落格', c[key(0, 2)] === '粉质黏土夹贝壳', c[key(0, 2)]);
  check('用例7：扰动土列打√', c[key(0, 14)] === '√', c[key(0, 14)]);
  // 试验列 col32 起（物性/颗分/固结/…），「固结」为第 3 列 → col34 打√
  check('用例7：要求实验项目「固结」打√', c[key(0, 34)] === '√', c[key(0, 34)]);
  check('用例7：未勾选的试验列（物性）为空', (c[key(0, 32)] ?? '') === '', c[key(0, 32)]);
  check('用例7：土样情况备注列照常落格', c[key(0, 31)] === '备注A', c[key(0, 31)]);
  // 孔2 接续行的列值也来自自身孔的数据（不串孔；孔间有分隔行 → 行2）
  check('用例7：孔2 接续行土号正确（列值不串孔）', soilCell(pages[0], 2) === 'ZK2-1', soilCell(pages[0], 2));
}

// ---------- 8. 边界：空孔跳过 / 整除 23 条的孔 ----------
{
  // 空孔不占页
  const withEmpty = [
    mkRecord('r1', 'ZK1', []),
    mkRecord('r2', 'ZK2', mkSamples(2)),
  ];
  const a = pdf.buildCombinedPdfPages(withEmpty);
  check('用例8：空孔不占页（1 页，行0 = ZK2-1）', a.pages.length === 1 && soilCell(a.pages[0], 0) === 'ZK2-1', `${a.pages.length}/${soilCell(a.pages[0], 0)}`);

  // 孔恰好 23 条（整除）：占满 1 页，下一孔必须新页
  const exact = [mkRecord('r1', 'ZK1', mkSamples(23)), mkRecord('r2', 'ZK2', mkSamples(1))];
  const b = pdf.buildCombinedPdfPages(exact);
  check('用例8：23 条整除占满整页，下一孔新页（2 页）', b.pages.length === 2, String(b.pages.length));
  check('用例8：页2 行0 = ZK2-1', soilCell(b.pages[1], 0) === 'ZK2-1', soilCell(b.pages[1], 0));

  // 单孔 combine 路径：小孔 1 页（与单孔导出分页一致）
  const solo = pdf.buildCombinedPdfPages([mkRecord('r1', 'ZK1', mkSamples(5))]);
  check('用例8：单孔合并路径仍 1 页', solo.pages.length === 1, String(solo.pages.length));
}

// ---------- 9. 现状路径不受影响：buildPdfPages 单孔土号仍为 -N 形态 ----------
{
  const rec = mkRecord('r1', 'ZK1', mkSamples(5));
  const pages = pdf.buildPdfPages(rec);
  check('回归：单孔 buildPdfPages 土号仍为 -1（不带孔号前缀）', (pages[0].cells[key(0, 1)] ?? '') === '-1', pages[0].cells[key(0, 1)]);
  check('回归：单孔 buildPdfPages 仍 1 页', pages.length === 1, String(pages.length));
}

// ---------- 9. 孔间分隔空行专项（用户增量需求：两孔之间空一行） ----------
{
  // a. 两小孔同页，中间恰 1 个空白分隔行；页首孔前无空行
  const a = pdf.buildCombinedPdfPages([
    mkRecord('r1', 'ZK1', mkSamples(5)),
    mkRecord('r2', 'ZK2', mkSamples(5)),
  ]);
  check('用例9a：两小孔同页（1 页）', a.pages.length === 1, String(a.pages.length));
  check('用例9a：页首孔前无空行（行0 = ZK1-1，孔首样带孔号）', soilCell(a.pages[0], 0) === 'ZK1-1', soilCell(a.pages[0], 0));
  check('用例9a：行4 = -5（非首样短编号）', soilCell(a.pages[0], 4) === '-5', soilCell(a.pages[0], 4));
  check('用例9a：行5 = 孔间空白分隔行', soilCell(a.pages[0], 5) === '', soilCell(a.pages[0], 5));
  check('用例9a：行6 = ZK2-1（分隔行后接续，孔首样带孔号）', soilCell(a.pages[0], 6) === 'ZK2-1', soilCell(a.pages[0], 6));
  check('用例9a：行10 = -5（非首样短编号）', soilCell(a.pages[0], 10) === '-5', soilCell(a.pages[0], 10));
  check('用例9a：行11 起留空', soilCell(a.pages[0], 11) === '' && soilCell(a.pages[0], 22) === '');

  // b. 两孔合计恰好 23 行：23+1 分隔行 > 23 → 被迫换页（正确行为）
  const b = pdf.buildCombinedPdfPages([
    mkRecord('r1', 'ZK1', mkSamples(12)),
    mkRecord('r2', 'ZK2', mkSamples(11)),
  ]);
  check('用例9b：合计 23 行 + 分隔行 > 23 → 换页（2 页）', b.pages.length === 2, String(b.pages.length));
  check('用例9b：页2 行0 = ZK2-1（新页页首无分隔行）', soilCell(b.pages[1], 0) === 'ZK2-1', soilCell(b.pages[1], 0));
  // 对照：合计 22 行 + 分隔行 = 23 → 恰好同页
  const b2 = pdf.buildCombinedPdfPages([
    mkRecord('r1', 'ZK1', mkSamples(12)),
    mkRecord('r2', 'ZK2', mkSamples(10)),
  ]);
  check('用例9b：对照 12+10+1 分隔 = 23 → 恰好同页（1 页）', b2.pages.length === 1, String(b2.pages.length));
  check('用例9b：对照页 行12 = 分隔行', soilCell(b2.pages[0], 12) === '', soilCell(b2.pages[0], 12));
  check('用例9b：对照页 行13 = ZK2-1（孔首样带孔号）', soilCell(b2.pages[0], 13) === 'ZK2-1', soilCell(b2.pages[0], 13));
  check('用例9b：对照页 行22 = -10（占满整页，非首样短编号）', soilCell(b2.pages[0], 22) === '-10', soilCell(b2.pages[0], 22));

  // c. 大孔自然分页后，尾页接续孔前有分隔行
  const c = pdf.buildCombinedPdfPages([
    mkRecord('r1', 'ZK1', mkSamples(26)),
    mkRecord('r2', 'ZK2', mkSamples(3)),
  ]);
  check('用例9c：大孔尾页接续（2 页）', c.pages.length === 2, String(c.pages.length));
  check('用例9c：页2 行0-2 = -24..-26（大孔续页行不带孔号——预期行为：只有每孔第一个土标孔号）', soilCell(c.pages[1], 0) === '-24' && soilCell(c.pages[1], 2) === '-26');
  check('用例9c：页2 行3 = 接续孔前分隔行', soilCell(c.pages[1], 3) === '', soilCell(c.pages[1], 3));
  check('用例9c：页2 行4 = ZK2-1（孔首样带孔号）', soilCell(c.pages[1], 4) === 'ZK2-1', soilCell(c.pages[1], 4));

  // d. 分隔行是「完全空白行」：该行任何列都不应有数据（抽查土号/颜色/备注列）
  const d = pdf.buildCombinedPdfPages([
    mkRecord('r1', 'ZK1', [mkSample('1', { color: '褐黄', soilStateNote: '备注A' })]),
    mkRecord('r2', 'ZK2', [mkSample('1')]),
  ]);
  const sepRow = 1;
  const dCells = d.pages[0].cells;
  const sepCols = [1, 2, 5, 14, 31, 34].map((col) => dCells[key(sepRow, col)] ?? '');
  check('用例9d：分隔行全列空白（土号/野外记录/颜色/扰动/备注/试验列）', sepCols.every((v) => v === ''), JSON.stringify(sepCols));
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail > 0 ? 1 : 0);
