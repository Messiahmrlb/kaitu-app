// 回归测试：isPermQuickConflict / isQuickShearBothConflict
// 这两条规则同时被「批量勾选对话框」「土样卡片提示」「土样录入框实时提示」三处复用，
// 其中录入框在关闭状态下以空对象占位，因此必须容忍 testItems 缺失。
// 运行：node qa_harness/test_shear_perm_conflict.cjs
const path = require('path');
const { isPermQuickConflict, isQuickShearBothConflict } = require(path.join(__dirname, '_emit', 'utils.cjs'));

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}${detail ? '  => ' + detail : ''}`); }
  else { fail++; console.error(`FAIL  ${name}${detail ? '  => ' + detail : ''}`); }
}

const mk = (testItems) => ({ id: 's1', soilNumber: 'ZK1-1', testItems });

// ---------- 渗透 × 快剪 ----------
check('垂直渗透+自然快剪 冲突', isPermQuickConflict(mk(['物性', '垂直渗透', '自然快剪'])));
check('水平渗透+饱固快剪 冲突', isPermQuickConflict(mk(['水平渗透', '饱固快剪'])));
check('仅垂直渗透 不冲突', !isPermQuickConflict(mk(['物性', '垂直渗透'])));
check('仅自然快剪 不冲突', !isPermQuickConflict(mk(['物性', '自然快剪'])));
check('渗透+固结 不冲突', !isPermQuickConflict(mk(['垂直渗透', '固结'])));
check('空试验项 不冲突', !isPermQuickConflict(mk([])));
// 关键：空值保护（曾因 undefined.includes 导致整页白屏）
check('testItems 缺失 不抛错且不冲突', isPermQuickConflict({ id: 's1' }) === false);

// ---------- 两种快剪互斥 ----------
check('饱固快剪+自然快剪 冲突', isQuickShearBothConflict(mk(['物性', '饱固快剪', '自然快剪'])));
check('仅饱固快剪 不冲突', !isQuickShearBothConflict(mk(['饱固快剪'])));
check('仅自然快剪 不冲突', !isQuickShearBothConflict(mk(['自然快剪'])));
check('空试验项 不冲突', !isQuickShearBothConflict(mk([])));
check('testItems 缺失 不抛错且不冲突', isQuickShearBothConflict({ id: 's1' }) === false);
// 空对象占位（SampleDialog 关闭态的真实输入）
let crashed = false;
try { isQuickShearBothConflict({}); } catch (e) { crashed = true; }
check('空对象占位 不抛错', !crashed);

// ---------- 组合 ----------
const both = mk(['垂直渗透', '饱固快剪', '自然快剪']);
check('渗透+两种快剪 两条规则同时命中', isPermQuickConflict(both) && isQuickShearBothConflict(both));

console.log(`\nisPermQuickConflict / isQuickShearBothConflict 测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
