// 回归测试：disturbedTestConflicts / isDisturbedTestConflict
// 扰动土仅适用 物性/颗分，勾选 固结/两种渗透/两种剪切/三轴 中任意一个即提示冲突。
// 运行：node qa_harness/test_disturbed_conflict.cjs
const path = require('path');
const { disturbedTestConflicts, isDisturbedTestConflict } = require(path.join(__dirname, '_emit', 'utils.cjs'));

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}${detail ? '  => ' + detail : ''}`); }
  else { fail++; console.error(`FAIL  ${name}${detail ? '  => ' + detail : ''}`); }
}

const mk = (disturbance, testItems) => ({ id: 's1', soilNumber: 'ZK1-R1', disturbance, testItems });

// 1) 原状土：即使勾了固结/三轴也不冲突
check('原状土 无冲突', !isDisturbedTestConflict(mk('原状', ['固结', '三轴'])));
check('原状土 返回空数组', disturbedTestConflicts(mk('原状', ['固结'])).length === 0);

// 2) 扰动土 勾 固结 -> 冲突含 固结
const c1 = disturbedTestConflicts(mk('扰动', ['固结']));
check('扰动+固结 冲突', c1.length === 1 && c1[0] === '固结', c1.join(','));

// 3) 扰动土 勾 两种剪切（饱固快剪+自然快剪）
const c2 = disturbedTestConflicts(mk('扰动', ['饱固快剪', '自然快剪']));
check('扰动+两种剪切 冲突', c2.includes('饱固快剪') && c2.includes('自然快剪'), c2.join(','));

// 4) 扰动土 勾 两种渗透（垂直渗透+水平渗透）
const c3 = disturbedTestConflicts(mk('扰动', ['垂直渗透', '水平渗透']));
check('扰动+两种渗透 冲突', c3.includes('垂直渗透') && c3.includes('水平渗透'), c3.join(','));

// 5) 扰动土 勾 三轴
check('扰动+三轴 冲突', disturbedTestConflicts(mk('扰动', ['三轴'])).join(',') === '三轴');

// 6) 扰动土 仅 物性/颗分 -> 无冲突
check('扰动+物性+颗分 无冲突', !isDisturbedTestConflict(mk('扰动', ['物性', '颗分'])));

// 7) 扰动土 混合：物性+颗分+固结 -> 仅报告 固结
const c4 = disturbedTestConflicts(mk('扰动', ['物性', '颗分', '固结', '三轴']));
check('扰动 混合 仅报不兼容项', c4.includes('固结') && c4.includes('三轴') && !c4.includes('物性') && !c4.includes('颗分'), c4.join(','));

// 8) 扰动土 testItems 为空 -> 无冲突
check('扰动 无试验项 无冲突', !isDisturbedTestConflict(mk('扰动', [])));

console.log(`\ndisturbedTestConflicts 测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
