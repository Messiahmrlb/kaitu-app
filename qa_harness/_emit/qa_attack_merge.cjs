// 边界攻击测试：mergeImportedByHole 重复起始校验的极限场景
// 仅用打包产物 _emit/importDelivery.cjs，不触碰源码。
const path = require('path');
const {
  mergeImportedByHole,
} = require(path.join(__dirname, 'importDelivery.cjs'));

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
const mkItem = (hole, sheetName, soilNumbers, extra = {}) => ({
  record: {
    hole,
    mode: 'A',
    name: hole,
    samples: soilNumbers.map((soilNumber) => ({
      id: 's-' + soilNumber,
      soilNumber,
      fieldRecord: '粉质黏土',
      sampleDepth: '',
      sampleElevation: '',
      color: '',
      humidity: '',
      status: '原状',
      checks: {},
    })),
  },
  sheetName,
  sampleCount: soilNumbers.length,
  holeCode: hole,
  warnings: [],
  errors: [],
  holeExplicit: extra.holeExplicit,
});

// a) 同孔 3 块全部 holeExplicit 且都从 1 起 → 整孔拒绝导入（2026-11-03 收紧），报错一次
{
  const r = mergeImportedByHole([
    mkItem('D25', 'S1', ['D25-1'], { holeExplicit: true }),
    mkItem('D25', 'S2', ['D25-01'], { holeExplicit: true }),
    mkItem('D25', 'S3', ['D25-001'], { holeExplicit: true }),
  ]);
  const errs = r.errors.filter((e) => e.includes('都从 1 号土开始'));
  check('a1 3 块都从 1 起 → 整孔拒绝（0 条记录、rejectedHoles=[D25]）',
    r.records.length === 0 && r.rejectedHoles.length === 1 && r.rejectedHoles[0] === 'D25',
    JSON.stringify({ records: r.records.map((x) => x.holeCode), rejectedHoles: r.rejectedHoles }));
  check('a2 重复提交报错恰好 1 次', errs.length === 1, JSON.stringify(r.errors));
  check('a3 文案含「第 1、2、3 份」且为拒绝语义',
    errs[0]?.includes('第 1、2、3 份') && errs[0]?.includes('判定为重复提交') && errs[0]?.includes('拒绝导入'), errs[0]);
}

// b) 两块 holeExplicit 都从 1 起且土号完全相同（都 D25-1）→ 整孔拒绝（拒绝层不做拼接）
{
  const r = mergeImportedByHole([
    mkItem('D25', 'S1', ['D25-1', 'D25-2'], { holeExplicit: true }),
    mkItem('D25', 'S2', ['D25-1', 'D25-2'], { holeExplicit: true }),
  ]);
  check('b1 完全重复的两份 → 整孔拒绝（0 条记录）',
    r.records.length === 0 && r.rejectedHoles[0] === 'D25',
    JSON.stringify({ records: r.records.map((x) => x.holeCode), rejectedHoles: r.rejectedHoles }));
  check('b2 仍报「都从 1 号土开始」',
    r.errors.some((e) => e.includes('都从 1 号土开始')), JSON.stringify(r.errors));
}

// c) holeExplicit 缺省（旧调用方）→ 不报新错
{
  const r = mergeImportedByHole([
    mkItem('D25', 'S1', ['D25-1']),
    mkItem('D25', 'S2', ['D25-01']),
  ]);
  check('c1 holeExplicit 缺省不报重复起始错',
    r.errors.every((e) => !e.includes('都从 1 号土开始')), JSON.stringify(r.errors));
  check('c2 缺省时仍正常合并', r.records.length === 1 && r.records[0].sampleCount === 2);
}

// d) 空 holeCode 组不参与合并/报错（各自独立）
{
  const r = mergeImportedByHole([
    mkItem('', 'S1', ['01'], { holeExplicit: true }),
    mkItem('', 'S2', ['01'], { holeExplicit: true }),
  ]);
  check('d1 空孔号两条记录不合并',
    r.records.length === 2, JSON.stringify(r.records.map((x) => x.holeCode)));
  check('d2 空孔号组无重复起始报错',
    r.errors.every((e) => !e.includes('都从 1 号土开始')), JSON.stringify(r.errors));
}

// e) 混合孔：D25 重复提交被拒绝，ZK9 正常合并不受影响（报错不串孔）
{
  const r = mergeImportedByHole([
    mkItem('D25', 'S1', ['D25-1'], { holeExplicit: true }),
    mkItem('D25', 'S2', ['D25-01'], { holeExplicit: true }),
    mkItem('ZK9', 'S3', ['ZK9-1', 'ZK9-2'], { holeExplicit: true }),
    mkItem('ZK9', 'S4', ['ZK9-3'], { holeExplicit: true }),
  ]);
  const errs = r.errors.filter((e) => e.includes('都从 1 号土开始'));
  check('e1 报错恰好 1 条且只提 D25',
    errs.length === 1 && errs[0].includes('D25') && !errs[0].includes('ZK9'), errs[0]);
  check('e2 rejectedHoles 仅 D25',
    r.rejectedHoles.length === 1 && r.rejectedHoles[0] === 'D25',
    JSON.stringify(r.rejectedHoles));
  check('e3 ZK9 正常合并 1 条 3 样',
    r.records.find((x) => x.holeCode === 'ZK9')?.sampleCount === 3);
}

// f) firstSampleSeq 误判攻击：孔号 ZK1、土号 ZK1-2（序号 2 非 1）
{
  const r = mergeImportedByHole([
    mkItem('ZK1', 'S1', ['ZK1-2'], { holeExplicit: true }),
    mkItem('ZK1', 'S2', ['ZK1-02'], { holeExplicit: true }),
  ]);
  check('f1 孔 ZK1 土 ZK1-2/02 起始序号 2 → 不报重复起始错',
    r.errors.every((e) => !e.includes('都从 1 号土开始')), JSON.stringify(r.errors));
}

// g) 正则特殊字符孔号（如 "ZK.1"）不被当通配符：土号 "ZKA1-1" 不应命中 ZK.1 前缀
{
  const r = mergeImportedByHole([
    mkItem('ZK.1', 'S1', ['ZKA1-1'], { holeExplicit: true }),
    mkItem('ZK.1', 'S2', ['ZKA1-01'], { holeExplicit: true }),
  ]);
  check('g1 特殊字符孔号不误配其它孔前缀',
    r.errors.every((e) => !e.includes('都从 1 号土开始')), JSON.stringify(r.errors));
}

// h) 首样序号为 0（"D25-0"）→ 不算从 1 起
{
  const r = mergeImportedByHole([
    mkItem('D25', 'S1', ['D25-0'], { holeExplicit: true }),
    mkItem('D25', 'S2', ['D25-00'], { holeExplicit: true }),
  ]);
  check('h1 序号 0 不触发重复起始报错',
    r.errors.every((e) => !e.includes('都从 1 号土开始')), JSON.stringify(r.errors));
}

console.log(`\n边界攻击测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
