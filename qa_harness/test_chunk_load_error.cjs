/**
 * 分块加载失败识别回归测试
 *
 * 目的：确保「懒加载 chunk 404」能被识别并触发自愈，而普通业务错误不会被误判
 * （误判会导致页面无端刷新，丢掉用户正在填的数据）。
 */
const { isChunkLoadError } = require('./_emit/pwaRecovery.cjs');

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    pass += 1;
    console.log(`  ok  ${name}`);
  } else {
    fail += 1;
    console.error(`  FAIL ${name}: 期望 ${expected}，实际 ${actual}`);
  }
}

// --- 应识别为分块加载失败 ---
check(
  'Chromium 动态 import 404',
  isChunkLoadError(
    new TypeError(
      'Failed to fetch dynamically imported module: https://messiahmrlb.github.io/kaitu-app/assets/exceljs.min-C0HdsQ6i.js',
    ),
  ),
  true,
);
check(
  'Safari / Firefox 动态 import 失败',
  isChunkLoadError(new TypeError('error loading dynamically imported module')),
  true,
);
check(
  'module script 加载失败',
  isChunkLoadError(new Error('Importing a module script failed.')),
  true,
);
check('webpack 风格 ChunkLoadError', isChunkLoadError(new Error('ChunkLoadError: Loading chunk 12 failed')), true);
check('字符串形式的报错', isChunkLoadError('Failed to fetch dynamically imported module'), true);
check(
  'modulepreload 失败',
  isChunkLoadError(new Error('Unable to preload CSS for /assets/index-abc.css')),
  true,
);

// --- 不应误判 ---
check('业务解析错误', isChunkLoadError(new Error('解析失败：工作表「送样单」第 3 行缺少孔号')), false);
check('网络请求失败（接口层）', isChunkLoadError(new TypeError('Failed to fetch')), false);
check('空错误', isChunkLoadError(undefined), false);
check('null 错误', isChunkLoadError(null), false);
check('无 message 的对象', isChunkLoadError({}), false);
check('Excel 文件损坏', isChunkLoadError(new Error('Corrupted zip: missing 12 bytes.')), false);

console.log(`\nisChunkLoadError 测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
