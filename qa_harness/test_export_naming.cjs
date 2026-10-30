// 回归测试：PDF / Excel 导出文件名规则（纯函数，无需浏览器）
//
// 覆盖：
//   单孔   <开土日期>_<孔号>.pdf（空值兜底「未命名孔」）
//   多孔   开土记录_<N>孔_<当天日期>.pdf（1 孔时与单孔一致）
//   Excel  <工程编号>_<孔号>_开土记录表.xlsx（两段均清洗）
//   非法字符（/ \ : * ? " < > |）替换为 `-`
//
// 运行：
//   npx esbuild src/pdfExport.ts --bundle --format=cjs --platform=node \
//     --packages=external --outfile=qa_harness/_emit/pdfExport.cjs
//   npx esbuild src/exportNaming.ts --bundle --format=cjs --platform=node \
//     --outfile=qa_harness/_emit/exportNaming.cjs
//   node qa_harness/test_export_naming.cjs
const path = require('path');
const {
  buildSinglePdfFileName,
  buildMergedPdfFileName,
} = require(path.join(__dirname, '_emit', 'pdfExport.cjs'));
const {
  buildXlsxFileName,
} = require(path.join(__dirname, '_emit', 'exportNaming.cjs'));

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

/** 构造最小记录对象（文件名只依赖 engineering 两个字段） */
const rec = (openDate, holeCode) => ({ engineering: { openDate, holeCode } });
/** 构造 Excel 文件名所需的记录对象 */
const recXlsx = (projectCode, holeCode) => ({ engineering: { projectCode, holeCode } });

// ---------- 单孔文件名 ----------
check(
  '日期 + 孔号',
  buildSinglePdfFileName(rec('2026-10-26', 'ZK1')) === '2026-10-26_ZK1.pdf',
  buildSinglePdfFileName(rec('2026-10-26', 'ZK1')),
);
check(
  '只有孔号（无日期）',
  buildSinglePdfFileName(rec('', 'ZK1')) === 'ZK1.pdf',
  buildSinglePdfFileName(rec('', 'ZK1')),
);
check(
  '只有日期（孔号为空 → 未命名孔）',
  buildSinglePdfFileName(rec('2026-10-26', '')) === '2026-10-26_未命名孔.pdf',
  buildSinglePdfFileName(rec('2026-10-26', '')),
);
check(
  '日期与孔号都为空 → 未命名孔.pdf',
  buildSinglePdfFileName(rec('', '')) === '未命名孔.pdf',
  buildSinglePdfFileName(rec('', '')),
);
check(
  '孔号中的斜杠替换为 -',
  buildSinglePdfFileName(rec('2026-10-26', 'ZK/1')) === '2026-10-26_ZK-1.pdf',
  buildSinglePdfFileName(rec('2026-10-26', 'ZK/1')),
);
check(
  '孔号中的反斜杠 / 冒号等非法字符全部替换',
  buildSinglePdfFileName(rec('2026-10-26', 'A\\B:C*D?E"F<G>H|I')) ===
    '2026-10-26_A-B-C-D-E-F-G-H-I.pdf',
  buildSinglePdfFileName(rec('2026-10-26', 'A\\B:C*D?E"F<G>H|I')),
);
check(
  '文件名不含任何非法字符',
  !/[\\/:*?"<>|]/.test(buildSinglePdfFileName(rec('2026/10/26', 'ZK:1'))),
  buildSinglePdfFileName(rec('2026/10/26', 'ZK:1')),
);
check(
  '孔号中的空格保留（合法字符）',
  buildSinglePdfFileName(rec('2026-10-26', 'ZK 1')) === '2026-10-26_ZK 1.pdf',
  buildSinglePdfFileName(rec('2026-10-26', 'ZK 1')),
);
check(
  '首尾空白被裁剪',
  buildSinglePdfFileName(rec(' 2026-10-26 ', ' ZK1 ')) === '2026-10-26_ZK1.pdf',
  buildSinglePdfFileName(rec(' 2026-10-26 ', ' ZK1 ')),
);

// ---------- 多孔合并文件名 ----------
const three = [rec('2026-10-26', 'ZK1'), rec('2026-10-26', 'ZK2'), rec('2026-10-26', 'ZK3')];
check(
  '3 孔 + 指定日期',
  buildMergedPdfFileName(three, '2026-10-30') === '开土记录_3孔_2026-10-30.pdf',
  buildMergedPdfFileName(three, '2026-10-30'),
);
check(
  '1 孔时与单孔规则一致',
  buildMergedPdfFileName([three[0]], '2026-10-30') === '2026-10-26_ZK1.pdf',
  buildMergedPdfFileName([three[0]], '2026-10-30'),
);
check(
  '2 孔 + 指定日期',
  buildMergedPdfFileName(three.slice(0, 2), '2026-10-30') === '开土记录_2孔_2026-10-30.pdf',
  buildMergedPdfFileName(three.slice(0, 2), '2026-10-30'),
);
const autoName = buildMergedPdfFileName(three);
check(
  '默认日期为本地当天 YYYY-MM-DD',
  /^开土记录_3孔_\d{4}-\d{2}-\d{2}\.pdf$/.test(autoName),
  autoName,
);
check(
  '0 孔也能生成合法文件名（不会抛错）',
  /^开土记录_0孔_\d{4}-\d{2}-\d{2}\.pdf$/.test(buildMergedPdfFileName([])),
  buildMergedPdfFileName([]),
);

// ---------- Excel 文件名（与 PDF 共用清洗规则） ----------
const xlsxSlash = buildXlsxFileName(recXlsx('KC-01', 'ZK/1'));
check(
  'xlsx：孔号含斜杠时文件名不含 /',
  xlsxSlash === 'KC-01_ZK-1_开土记录表.xlsx' && !xlsxSlash.includes('/'),
  xlsxSlash,
);
check(
  'xlsx：工程编号含冒号被替换为 -',
  buildXlsxFileName(recXlsx('KC:01', 'ZK1')) === 'KC-01_ZK1_开土记录表.xlsx',
  buildXlsxFileName(recXlsx('KC:01', 'ZK1')),
);
check(
  'xlsx：工程编号与孔号都为空 → 开土记录_开土记录表.xlsx',
  buildXlsxFileName(recXlsx('', '')) === '开土记录_开土记录表.xlsx',
  buildXlsxFileName(recXlsx('', '')),
);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
