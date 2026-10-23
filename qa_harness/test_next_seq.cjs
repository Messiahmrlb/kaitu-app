// 回归测试：nextSeq —— 追加土样时默认编号应取「最大数字编号+1」，忽略 ZK1-R1 这类字母号。
// 这是插入 R 号后“添加土样”误跳号（-7 而非 -6）的修复依据。
// 运行：node qa_harness/test_next_seq.cjs
const path = require('path');
const { nextSeq, parseTrailingSeq } = require(path.join(__dirname, '_emit', 'utils.cjs'));

let pass = 0;
let fail = 0;
function check(name, got, want) {
  const ok = got === want;
  if (ok) { pass++; console.log(`  ok  ${name}  => ${got}`); }
  else { fail++; console.error(`FAIL  ${name}\n   got=${got}\n  want=${want}`); }
}

// 5 个数字(1-5) + 1 个 R：追加默认应是 6，不是 7
const samples = ['ZK1-1', 'ZK1-2', 'ZK1-3', 'ZK1-4', 'ZK1-5', 'ZK1-R1'].map((n, i) => ({ id: 's' + i, soilNumber: n }));
check('5数字+1R 追加默认=6(忽略R)', nextSeq(samples), 6);

// 纯数字 1-3
const dig = ['-1', '-2', '-3'].map((n, i) => ({ id: 's' + i, soilNumber: n }));
check('纯数字 1-3 追加=4', nextSeq(dig), 4);

// 空列表
check('空列表追加=1', nextSeq([]), 1);

// 只有 R 号：没有数字号，追加=1
const onlyR = ['R1', 'R2'].map((n, i) => ({ id: 's' + i, soilNumber: n }));
check('只有R号 追加=1', nextSeq(onlyR), 1);

// parseTrailingSeq：R 号不匹配数字后缀
check('parseTrailingSeq(ZK1-R1) 为 null', parseTrailingSeq('ZK1-R1'), null);
check('parseTrailingSeq(ZK1-3) 为 3', parseTrailingSeq('ZK1-3'), 3);
check('parseTrailingSeq(-5) 为 5', parseTrailingSeq('-5'), 5);

console.log(`\nnextSeq 测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
