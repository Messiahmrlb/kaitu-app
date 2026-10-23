// 回归测试：双指缩放比例计算 pinchScale（纯函数）
// 运行：node qa_harness/test_pinch_scale.cjs
const path = require('path');
const { pinchScale } = require(path.join(__dirname, '_emit', 'utils.cjs'));

let pass = 0;
let fail = 0;
function check(name, got, want) {
  const ok = Math.abs(got - want) < 1e-9;
  if (ok) {
    pass++;
    console.log(`  ok  ${name}  => ${got}`);
  } else {
    fail++;
    console.error(`FAIL  ${name}  got=${got} want=${want}`);
  }
}

// 基准：startScale=1, startDist=100
check('放大 2 倍间距 -> 2', pinchScale(1, 100, 200), 2);
check('缩小到一半间距 -> 0.5 (但下限 1 夹紧)', pinchScale(1, 100, 50, 1, 4), 1);
check('不变 -> 1', pinchScale(1, 100, 100), 1);
check('从 2 倍再放大到 3 倍间距 -> 3', pinchScale(2, 100, 150), 3);
check('上限夹紧 4', pinchScale(3, 100, 400), 4); // 3*4=12 -> clamp 4
check('下限夹紧 1', pinchScale(1, 100, 10), 1); // 1*0.1=0.1 -> clamp 1
check('curDist<=0 退回 startScale', pinchScale(2, 100, 0), 2);
check('startDist<=0 退回 startScale', pinchScale(2, 0, 200), 2);
check('自定义区间 [0.5, 8]', pinchScale(1, 100, 800, 0.5, 8), 8);

console.log(`\npinchScale 测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
