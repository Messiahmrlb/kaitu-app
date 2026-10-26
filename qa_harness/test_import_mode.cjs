// 回归测试：detectRecordMode / matchSoilTypeName / normalizeSoilName
//
// 背景：导入送样单时 mode 曾被写死为 'A'，导致三角坐标定名的送样单导入后
// 导出 PDF 仍是「普通目力鉴别」表头。现按野外定名自动识别，导入预览可改。
//
// 运行：npx esbuild src/importDelivery.ts --bundle --format=cjs --platform=node \
//         --packages=external --outfile=qa_harness/_emit/importDelivery.cjs
//       node qa_harness/test_import_mode.cjs
const path = require('path');
const {
  detectRecordMode,
  matchSoilTypeName,
  normalizeSoilName,
} = require(path.join(__dirname, '_emit', 'importDelivery.cjs'));
const { SOIL_TYPE_A, SOIL_TYPE_B } = require(path.join(__dirname, '_emit', 'constants.cjs'));

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

// ---------- 归一化 ----------
check('去空白并把「粘」统一为「黏」', normalizeSoilName(' 粉 粘 土 ') === '粉黏土');
check('空值归一化为空串', normalizeSoilName(undefined) === '');

// ---------- 土名匹配 ----------
check('模式 A 精确匹配 粉质黏土', matchSoilTypeName('粉质黏土', SOIL_TYPE_A) === '粉质黏土');
check('模式 A 精确匹配 中砂', matchSoilTypeName('中砂', SOIL_TYPE_A) === '中砂');
check('模式 B 精确匹配 轻粉质壤土', matchSoilTypeName('轻粉质壤土', SOIL_TYPE_B) === '轻粉质壤土');
check('「粘土」在 B 中匹配到 粘土', matchSoilTypeName('粘土', SOIL_TYPE_B) === '粘土');
check('含修饰的定名取最长包含项', matchSoilTypeName('含有机质轻粉质壤土', SOIL_TYPE_B) === '轻粉质壤土');
check('无法识别的定名返回 null', matchSoilTypeName('强风化砂岩', SOIL_TYPE_B) === null);

// ---------- 鉴别格式判定 ----------
const TRI = ['轻粉质壤土', '中粉质壤土', '重粉质壤土', '粉粘土', '粘土', '粉砂'];
const EYE = ['中砂', '细砂', '粉砂', '粉土', '粉质黏土', '黏土'];

check('三角坐标土名 → B', detectRecordMode(TRI) === 'B', detectRecordMode(TRI));
check('普通目力土名 → A', detectRecordMode(EYE) === 'A', detectRecordMode(EYE));
check('表头显式写「三角坐标」→ B（即使土名全是粉砂）', detectRecordMode(['粉砂', '粉砂'], '某某工程 三角坐标定名') === 'B');
check('空土名列表 → A 兜底', detectRecordMode([]) === 'A');
check('无法识别的定名 → A 兜底', detectRecordMode(['强风化砂岩', '泥岩']) === 'A');
check('平票（仅 粉砂）→ A 兜底', detectRecordMode(['粉砂', '粉砂']) === 'A');
check('混合但 B 占多 → B', detectRecordMode(['粉砂', '轻粉质壤土', '中粉质壤土']) === 'B');
check('混合但 A 占多 → A', detectRecordMode(['粉砂', '中砂', '细砂']) === 'A');
check('原状/扰动等无关字段缺失不抛错', detectRecordMode([null, undefined, '']) === 'A');

// 关键回归：粉质黏土（A）与 粉粘土（B）不能被 粘/黏 归一化搞混
check(
  '粉质黏土不会被判成 B',
  detectRecordMode(['粉质黏土', '粉质黏土'], '') === 'A',
  detectRecordMode(['粉质黏土', '粉质黏土'], ''),
);
check(
  '粉粘土不会被判成 A',
  detectRecordMode(['粉粘土', '粉粘土'], '') === 'B',
  detectRecordMode(['粉粘土', '粉粘土'], ''),
);
check(
  '带修饰的「含姜石粉粘土」仍判 B（按最长命中侧）',
  detectRecordMode(['含姜石粉粘土'], '') === 'B',
  detectRecordMode(['含姜石粉粘土'], ''),
);
check(
  '带修饰的「含有机质粉质黏土」仍判 A',
  detectRecordMode(['含有机质粉质黏土'], '') === 'A',
  detectRecordMode(['含有机质粉质黏土'], ''),
);

console.log(`\ndetectRecordMode / matchSoilTypeName 测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
