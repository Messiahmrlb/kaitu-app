// 回归测试：buildRecordSamples —— 新建记录按孔号生成土样时，
// 勾选「扰动土用 R 表示」后应额外生成 孔号-R1…孔号-Rn（标记为扰动并联动颗分），
// 且不勾选时只生成原状编号。孔号为空时前缀省略（-1 / -R1）。
// 运行：node qa_harness/test_build_record_samples.cjs
const path = require('path');
const { buildRecordSamples } = require(path.join(__dirname, '_emit', 'utils.cjs'));

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}${detail ? '  => ' + detail : ''}`); }
  else { fail++; console.error(`FAIL  ${name}${detail ? '  => ' + detail : ''}`); }
}

// 1) 不勾选 R：孔号 ZK1，2 个原状 => ZK1-1, ZK1-2，无 R，disturbance 默认原状
const a = buildRecordSamples('ZK1', 2, 0);
check('只生成原状：长度=2', a.length === 2, a.length);
check('只生成原状：编号 ZK1-1 / ZK1-2', a[0].soilNumber === 'ZK1-1' && a[1].soilNumber === 'ZK1-2', a.map(s => s.soilNumber).join(','));

// 2) 勾选 R=2：孔号 ZK1，2 原状 + 2 R => ZK1-1,ZK1-2,ZK1-R1,ZK1-R2
const b = buildRecordSamples('ZK1', 2, 2);
check('原状+R：长度=4', b.length === 4, b.length);
check('原状+R：编号顺序正确', b.map(s => s.soilNumber).join(',') === 'ZK1-1,ZK1-2,ZK1-R1,ZK1-R2', b.map(s => s.soilNumber).join(','));
check('R 号标记为扰动', b[2].disturbance === '扰动' && b[3].disturbance === '扰动', `${b[2].disturbance}/${b[3].disturbance}`);
check('原状号仍为原状', b[0].disturbance === '原状' && b[1].disturbance === '原状', `${b[0].disturbance}/${b[1].disturbance}`);

// 3) 仅 R（原状=0）：孔号 ZK2，0 原状 + 2 R => ZK2-R1, ZK2-R2
const c = buildRecordSamples('ZK2', 0, 2);
check('仅R：长度=2', c.length === 2, c.length);
check('仅R：编号 ZK2-R1 / ZK2-R2', c[0].soilNumber === 'ZK2-R1' && c[1].soilNumber === 'ZK2-R2', c.map(s => s.soilNumber).join(','));
check('仅R：均标记扰动', c.every(s => s.disturbance === '扰动'), c.map(s => s.disturbance).join(','));

// 4) 孔号为空：前缀省略，-1, -R1
const d = buildRecordSamples('', 1, 1);
check('空孔号：原状 -1', d[0].soilNumber === '-1', d[0].soilNumber);
check('空孔号：R -R1', d[1] && d[1].soilNumber === '-R1', d[1] && d[1].soilNumber);

// 5) 负数/非法输入被夹紧为 0
const e = buildRecordSamples('ZK9', -3, 'bad');
check('非法输入夹紧为 0：长度=0', e.length === 0, e.length);

console.log(`\nbuildRecordSamples 测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
