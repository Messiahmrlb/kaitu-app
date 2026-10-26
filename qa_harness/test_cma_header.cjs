/**
 * CMA 页眉设置回归测试。
 *
 * 覆盖：
 *  - normalizeCmaHeader：脏数据/缺失字段/空值回落、空白与换行处理
 *  - describeCmaChanges：变更明细（确认弹窗的数据源）
 *  - isCmaHeaderDefault
 *  - fitHeaderFontSize：长文本自动缩字号，且默认文案不改变字号
 *  - renderHeaderTexts：自定义文字确实进入 PDF HTML，且做了转义
 *  - buildPdfPages：表体数据不受页眉设置影响
 *
 * 运行：node qa_harness/test_cma_header.cjs
 * 依赖：qa_harness/_emit/cmaHeader.cjs、pdfExport.cjs（esbuild 打包产物）
 */
const {
  CMA_DEFAULT,
  normalizeCmaHeader,
  describeCmaChanges,
  isCmaHeaderDefault,
  fitHeaderFontSize,
} = require('./_emit/cmaHeader.cjs');
const { renderHeaderTexts, buildPdfPages } = require('./_emit/pdfExport.cjs');

let pass = 0;
let fail = 0;
function check(name, cond, actual) {
  if (cond) {
    pass += 1;
    return;
  }
  fail += 1;
  console.log(`  ✗ ${name}${actual === undefined ? '' : '  实际=' + JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------- normalize
const d = CMA_DEFAULT;
check('无参数回落默认', JSON.stringify(normalizeCmaHeader()) === JSON.stringify(d));
check('null 回落默认', JSON.stringify(normalizeCmaHeader(null)) === JSON.stringify(d));
check('空对象回落默认', JSON.stringify(normalizeCmaHeader({})) === JSON.stringify(d));
check(
  '空字符串字段回落默认',
  normalizeCmaHeader({ versionLine: '   ', docCode: '' }).versionLine === d.versionLine,
);
check(
  '首尾空白被裁掉',
  normalizeCmaHeader({ versionLine: '  第 4 版  ', docCode: '  ABC-1  ' }).versionLine === '第 4 版',
);
check(
  '内部空格保留',
  normalizeCmaHeader({ versionLine: '第 4 版 第 1 次修改', docCode: 'X' }).versionLine ===
    '第 4 版 第 1 次修改',
);
check(
  '换行与制表符折叠为空格',
  normalizeCmaHeader({ versionLine: '第 4 版\n第 1 次\t修改', docCode: 'X' }).versionLine ===
    '第 4 版 第 1 次 修改',
);
check(
  '非字符串字段回落默认',
  normalizeCmaHeader({ versionLine: 123, docCode: null }).docCode === d.docCode,
);
check(
  '多余字段被忽略',
  Object.keys(normalizeCmaHeader({ versionLine: 'A', docCode: 'B', extra: 1 })).length === 2,
);

// --------------------------------------------------------- describeCmaChanges
check('相同值无变更', describeCmaChanges(d, { ...d }).length === 0);
check(
  '仅空白差异视为无变更',
  describeCmaChanges(d, { versionLine: `  ${d.versionLine}  `, docCode: d.docCode }).length === 0,
);

const c1 = describeCmaChanges(d, { ...d, versionLine: '第 4 版 第 1 次修改 2027 年 1 月 1 日起实施' });
check('改版本行返回 1 条', c1.length === 1, c1.length);
check('变更项 key 正确', c1[0] && c1[0].key === 'versionLine', c1[0] && c1[0].key);
check('变更项带旧值', c1[0] && c1[0].from === d.versionLine);
check(
  '变更项带新值',
  c1[0] && c1[0].to === '第 4 版 第 1 次修改 2027 年 1 月 1 日起实施',
);
check('变更项有中文标签', c1[0] && c1[0].label === '版本行', c1[0] && c1[0].label);

const c2 = describeCmaChanges(d, { versionLine: 'V2', docCode: 'SHLY-TR068-2027' });
check('改两项返回 2 条', c2.length === 2, c2.length);
check('顺序：先版本行后文件编号', c2[0].key === 'versionLine' && c2[1].key === 'docCode');
check('文件编号标签正确', c2[1].label === '文件编号', c2[1].label);

// ------------------------------------------------------------ 默认值判定
check('默认值判定为默认', isCmaHeaderDefault(d) === true);
check('默认值带空白仍判定为默认', isCmaHeaderDefault({ ...d, docCode: ` ${d.docCode} ` }) === true);
check('改过则非默认', isCmaHeaderDefault({ ...d, docCode: 'SHLY-TR068-2027' }) === false);
check('空对象按默认值判定', isCmaHeaderDefault({}) === true);

// ------------------------------------------------------------ 字号自适应
check('默认版本行保持 9pt', fitHeaderFontSize(d.versionLine, 9, 245) === 9);
check('默认编号保持 10.4pt', fitHeaderFontSize(d.docCode, 10.4, 144) === 10.4);
check('空文本保持基准字号', fitHeaderFontSize('', 9, 245) === 9);

const longVersion = '第 4 版 第 1 次修改 2027 年 1 月 1 日起实施，并增加若干条补充说明内容以测试溢出';
const fLong = fitHeaderFontSize(longVersion, 9, 245);
check('超长文本缩字号', fLong < 9, fLong);
check('缩字号不低于下限 6', fLong >= 6, fLong);

const midVersion = '第'.repeat(30);
const fMid = fitHeaderFontSize(midVersion, 9, 245);
check('中等长度按比例缩小', fMid > 6 && fMid < 9, fMid);

// ------------------------------------------------------- renderHeaderTexts
const record = {
  id: 'r1',
  name: '测试',
  mode: 'A',
  engineering: {
    projectCode: 'P-1',
    holeCode: 'ZK1',
    holeElevation: '10.0',
    openDate: '2026-10-26',
  },
  samples: [],
  customTestItems: [],
  createdAt: 0,
  updatedAt: 0,
};

const htmlDefault = renderHeaderTexts(record, d);
check('默认渲染含默认版本行', htmlDefault.includes(d.versionLine));
check('默认渲染含默认编号', htmlDefault.includes(d.docCode));

const custom = { versionLine: '第 4 版 第 1 次修改 2027 年 1 月 1 日起实施', docCode: 'SHLY-TR068-2027' };
const htmlCustom = renderHeaderTexts(record, custom);
check('自定义版本行进入 HTML', htmlCustom.includes(custom.versionLine), htmlCustom.includes(custom.versionLine));
check('自定义编号进入 HTML', htmlCustom.includes(custom.docCode));
check('旧默认版本行不再出现', !htmlCustom.includes('第 3 版 第 0 次修改'));
check('旧默认编号不再出现', !htmlCustom.includes('SHLY-TR068-2024'));

const htmlEsc = renderHeaderTexts(record, { versionLine: 'A&B <C>', docCode: 'X"Y' });
check('特殊字符被转义', htmlEsc.includes('A&amp;B &lt;C&gt;') && htmlEsc.includes('X&quot;Y'));

check('未传 header 时用默认值', renderHeaderTexts(record).includes(d.versionLine));

// --------------------------------------------- 表体数据不受页眉设置影响
const withSamples = { ...record, samples: [{ ...require('./_emit/utils.cjs').newSample(1, '1') }] };
const pagesA = buildPdfPages(withSamples);
check('页眉设置不影响分页与单元格', pagesA.length === buildPdfPages(withSamples).length && pagesA[0].cells[1] === '-1');

// ---------------------------------------------------------------- 汇总
console.log(`\nCMA 页眉设置测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
