// 回归测试：插入土样 + 仅重排数字编号（保留 ZK1-R1 这类手工编号）。
// 运行：node qa_harness/test_insert_renumber.cjs
const path = require('path');
const { insertSampleAt, renumberDigitsOnly, newSample } = require(path.join(__dirname, '_emit', 'utils.cjs'));

let pass = 0;
let fail = 0;
function check(name, got, want) {
  const ok = got === want;
  if (ok) { pass++; console.log(`  ok  ${name}  => ${got}`); }
  else { fail++; console.error(`FAIL  ${name}\n   got=${got}\n  want=${want}`); }
}

// 构造：ZK1-1, ZK1-R1, ZK1-2（数字与 R 混排）
const base = ['ZK1-1', 'ZK1-R1', 'ZK1-2'].map((n, i) => newSample(i + 1, n));

// 1) insertSampleAt 仅在位置插入，不动任何已有土号
const ins = newSample(99, 'ZK1-R2');
const afterInsert = insertSampleAt(base, 1, ins); // 插在 ZK1-R1 之前
check('插入后长度+1', afterInsert.length, 4);
check('插入位置前不变', afterInsert[0].soilNumber, 'ZK1-1');
check('插入的土样保留 R2', afterInsert[1].soilNumber, 'ZK1-R2');
check('原 ZK1-R1 仍在', afterInsert[2].soilNumber, 'ZK1-R1');
check('原 ZK1-2 仍在', afterInsert[3].soilNumber, 'ZK1-2');
check('入参未被改动', base[1].soilNumber, 'ZK1-R1');

// 2) renumberDigitsOnly：数字编号重排为连续 1,2,3，R 编号不动
const renum = renumberDigitsOnly(afterInsert, 'ZK1');
// 顺序：ZK1-1(数字→1), ZK1-R2(R不动), ZK1-R1(R不动), ZK1-2(数字→2)
check('数字1保持', renum[0].soilNumber, 'ZK1-1');
check('R2 不动', renum[1].soilNumber, 'ZK1-R2');
check('R1 不动', renum[2].soilNumber, 'ZK1-R1');
check('数字2重排为 ZK1-2(仍是2)', renum[3].soilNumber, 'ZK1-2');

// 3) 末尾有 R1，插入后 R1 不被改成数字（用户反馈的场景2）
const end = ['ZK1-1', 'ZK1-R1'].map((n, i) => newSample(i + 1, n));
const endIns = insertSampleAt(end, 1, newSample(99, 'ZK1-X'));
const endRenum = renumberDigitsOnly(endIns, 'ZK1');
check('末尾 R1 在插入后仍保留', endRenum[2].soilNumber, 'ZK1-R1');

// 4) 无孔号：数字用 -1/-2，R 仍不动
const noHole = ['-1', 'R1'].map((n, i) => newSample(i + 1, n));
const noHoleRenum = renumberDigitsOnly(noHole, '');
check('无孔号数字重排 -1', noHoleRenum[0].soilNumber, '-1');
check('无孔号 R1 不动', noHoleRenum[1].soilNumber, 'R1');

// 5) 插入一条纯数字土样，会被纳入连续编号
const dig = ['ZK1-1', 'ZK1-2'].map((n, i) => newSample(i + 1, n));
const digIns = insertSampleAt(dig, 1, newSample(99, 'ZK1-9')); // 插入时写了 ZK1-9
const digRenum = renumberDigitsOnly(digIns, 'ZK1');
check('插入的数字 ZK1-9 被重排为 ZK1-2', digRenum[1].soilNumber, 'ZK1-2');
check('原 ZK1-2 后移为 ZK1-3', digRenum[2].soilNumber, 'ZK1-3');

console.log(`\ninsert/renumberDigitsOnly 测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
