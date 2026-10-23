// 回归测试：renumberFrom —— 在孔内任意位置插入土样后，从该位置起重排连续编号。
// 运行：node qa_harness/test_renumber_from.cjs
const path = require('path');
const { renumberFrom, newSample } = require(path.join(__dirname, '_emit', 'utils.cjs'));

let pass = 0;
let fail = 0;
function check(name, got, want) {
  const ok = got === want;
  if (ok) {
    pass++;
    console.log(`  ok  ${name}  => ${got}`);
  } else {
    fail++;
    console.error(`FAIL  ${name}\n   got=${got}\n  want=${want}`);
  }
}

// 构造 3 条土样，孔号 ZK1，编号 1/2/3
const base = ['ZK1-1', 'ZK1-2', 'ZK1-3'].map((n, i) => newSample(i + 1, n));

// 1) 在索引 1（ZK1-2 之前）插入一条，不预编号（newSample 给 -2），期望重排为 1/2/3/4
const inserted = newSample(99, '-x'); // 插入的新土样，土号暂乱
const r1 = renumberFrom(
  [...base.slice(0, 1), inserted, ...base.slice(1)],
  'ZK1',
  1,
);
check('插入位置前不变', r1[0].soilNumber, 'ZK1-1');
check('插入点新土样=ZK1-2', r1[1].soilNumber, 'ZK1-2');
check('原 ZK1-2 后移为 ZK1-3', r1[2].soilNumber, 'ZK1-3');
check('原 ZK1-3 后移为 ZK1-4', r1[3].soilNumber, 'ZK1-4');

// 2) 孔号为空：编号应为 -1/-2/...
const r2 = renumberFrom([newSample(1, 'a'), newSample(2, 'b')], '', 0);
check('空孔号从0起重排 -1', r2[0].soilNumber, '-1');
check('空孔号 -2', r2[1].soilNumber, '-2');

// 3) from 之后的手工编号被覆盖，from 之前保留（含非连续手工号）
const messy = [
  newSample(1, 'ZK1-1'),
  newSample(2, 'ZK1-9'), // 手工乱号，在 from 之前应保留
  newSample(3, 'ZK1-3'),
];
const r3 = renumberFrom([...messy.slice(0, 2), newSample(4, 'x'), ...messy.slice(2)], 'ZK1', 2);
check('from 之前手工号保留', r3[1].soilNumber, 'ZK1-9');
check('from 处插入=ZK1-3', r3[2].soilNumber, 'ZK1-3');
check('from 之后原 ZK1-3 -> ZK1-4', r3[3].soilNumber, 'ZK1-4');

// 4) 不修改入参（返回新副本）
const src = [newSample(1, 'ZK1-1'), newSample(2, 'ZK1-2')];
const out = renumberFrom(src, 'ZK1', 0);
check('入参未被改动(原[0])', src[0].soilNumber, 'ZK1-1');
check('返回新数组长度一致', out.length, src.length);

console.log(`\nrenumberFrom 测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
