/**
 * Word（docx）导出：以桌面纸质模板为底做「XML 手术」，逐格填入开土记录。
 *
 * 为什么不用 docx 生成库重建：模板的 A3 横向页面、41 列表格、合并单元格、
 * 浮动定位（tblpPr）等版式细节极多，重建保真度差；直接对模板 document.xml
 * 做最小改动（填信息行 + 克隆数据行）可 100% 保留模板外观，也便于用户导出后
 * 在 Word/WPS 里直接编辑内容（导出 Word 的目的）。
 *
 * 模板结构（tpl-normal / tpl-triangle，仅 row2 土名子项不同）：
 * - 单个 <w:tbl>，26 行：row0 信息行(13tc) / row1 列标题(11tc) / row2 子项(39tc)
 *   / row3..24 数据行(22 行 × 39tc，trPr 带 gridAfter=1) / row25 尾行(39tc)；
 * - 数据行 tc 与 row2 子项按位置对应：
 *   tc0 土号 / tc1 野外记录 / tc2 取样深度 / tc3 取样标高 / tc4 颜色 / tc5 气味
 *   / tc6-11 目力鉴别土类 / tc12 夹杂物(整高,留空) / tc13 扰动土
 *   / tc14-24 夹杂物子项(11) / tc25-29 湿密硬可软(5) / tc30 备注 / tc31-38 试验项目(8)；
 * - 表格为浮动定位（horzAnchor=page），多页/多孔 = 复制整表 + 分页段落。
 *
 * 每页固定 22 行数据（模板即 22 行），与 PDF 的 23 行/页不同——各自忠于模板。
 *
 * 受控版式保护（2026-10-30 用户反馈「Word 导出变 3 页」的修复）：
 * 模板多数格带 <w:noWrap/>，内容超宽会把整页布局撑破（表格行溢出到下一页）。
 * 因此所有填充文本按「格宽（tblGrid × gridSpan）自适应缩小字号」保证单行——
 * 行列宽完全不变，与 PDF 的 shrinkOverflow 同哲学。兜底手段（未启用）：
 * 夹杂物/颜色/备注列宽可小幅收窄让给超宽列。
 */
import type { SoilRecord, SoilSample } from './types';
import { INCLUSIONS, SOIL_STATES, recordTestColumns, soilTypeOptions } from './constants';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { ExportResult } from './xlsxExport';
import { withOpenDate } from './pdfExport';
import { sanitizeFileNamePart, stripSoilNumber } from './exportNaming';
import { CMA_DEFAULT, CmaHeaderSettings } from './cmaHeader';

/** 每页数据行数：模板 row3..row24 共 22 行 */
export const DOCX_ROWS_PER_PAGE = 22;

/** Word 文档 MIME（Blob 与 Web Share File 共用） */
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ---------------------------------------------------------------------------
// XML 工具
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TR_RE = /<w:tr(?: [^>]*)?>[\s\S]*?<\/w:tr>/g;
const TC_RE = /<w:tc>[\s\S]*?<\/w:tc>/g;
const GRIDCOL_RE = /<w:gridCol w:w="(\d+)"\/>/g;
const SPAN_RE = /<w:gridSpan w:val="(\d+)"\/>/;
const P_RE = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/;
const RUN_RE = /<w:r>[\s\S]*?<\/w:r>/;
const RPR_RE = /<w:rPr>[\s\S]*?<\/w:rPr>/;
const PPR_RE = /<w:pPr>[\s\S]*?<\/w:pPr>/;
const SZ_RE = /<w:sz w:val="\d+"\/>/;
const SZCS_RE = /<w:szCs w:val="\d+"\/>/;
const LANG_RE = /<w:lang [^>]*\/>/;

/** 页与页之间的分页段落（近零高：不占版面行位，防止把浮动表锚点往下顶） */
const PAGE_BREAK_P =
  '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="14" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:br w:type="page"/></w:r></w:p>';

/** 剥离克隆时会重复的元数据（书签 / paraId / textId），避免产出非法 XML */
function cleanCloneXml(xml: string): string {
  return xml
    .replace(/<w:bookmarkStart[^>]*\/>/g, '')
    .replace(/<w:bookmarkEnd[^>]*\/>/g, '')
    .replace(/ w14:paraId="[^"]*"/g, '')
    .replace(/ w14:textId="[^"]*"/g, '');
}

/** 行头（<w:tr ...> 到第一个 <w:tc> 之前：tblPrEx + trPr 等） */
function trHead(tr: string): string {
  const i = tr.indexOf('<w:tc>');
  return i >= 0 ? tr.slice(0, i) : tr;
}

/** 按替换后的 tc 数组重组一行 */
function rebuildTr(tr: string, tcs: string[]): string {
  return trHead(tr) + tcs.join('') + '</w:tr>';
}

// ---------------------------------------------------------------------------
// 字号自适应（受控版式：列宽行高不变，超宽内容缩字号保证单行）
// ---------------------------------------------------------------------------
/** 估算文本渲染宽度（pt）：全角 1em、半角 0.55em（保守偏大） */
function estimateWidthPt(text: string, halfPt: number): number {
  const em = halfPt / 2;
  let w = 0;
  for (const ch of text) {
    w += ch.charCodeAt(0) > 0xff ? em : em * 0.55;
  }
  return w;
}

/** 把目标字号写入 run rPr（保持子元素顺序：sz/szCs 在 lang 之前；无 rPr 时新建包裹） */
function applySz(rPr: string, halfPt: number): string {
  const sz = `<w:sz w:val="${halfPt}"/><w:szCs w:val="${halfPt}"/>`;
  if (SZ_RE.test(rPr)) {
    return rPr.replace(SZ_RE, `<w:sz w:val="${halfPt}"/>`).replace(SZCS_RE, `<w:szCs w:val="${halfPt}"/>`);
  }
  if (rPr) {
    if (LANG_RE.test(rPr)) return rPr.replace(LANG_RE, `${sz}`);
    return rPr + sz;
  }
  return `<w:rPr>${sz}</w:rPr>`;
}

/**
 * 替换 tc 内第一个段落的所有 run 为单个 run（保留原段落属性与字体），
 * 空文本不动（保留模板空白格）。
 *
 * 字号规则（2026-10-30「Word 导出变 3 页」修复的关键）：
 * - 基准字号继承自原段落：原 run rPr 的 sz → 原段落标记 rPr 的 sz → defaultHalfPt；
 *   模板 Normal 默认 15pt（sz=30），不显式写 sz 会继承 15pt，两位数土号/野外记录
 *   在窄格内换行、行高翻倍、整表溢出到下一页；
 * - 无论是否缩小，都把 sz/szCs 显式写入 run（避免继承 15pt）；
 * - widthTwips 提供时做自适应：内容估算宽度超过格内可用宽度就逐级缩小字号
 *   （最低 6.5pt）确保单行——noWrap 格超宽会撑破整页版式。
 */
function fillTc(tcXml: string, text: string, widthTwips = 0, defaultHalfPt = 18): string {
  if (!text) return tcXml;
  return tcXml.replace(P_RE, (p) => {
    const pPr = p.match(PPR_RE)?.[0] ?? '';
    const run = p.match(RUN_RE)?.[0] ?? '';
    const rPr0 = run.match(RPR_RE)?.[0] ?? '';
    const halfOf = (xml: string): number =>
      Number(xml.match(SZ_RE)?.[0]?.match(/\d+/)?.[0] ?? 0);
    const base = halfOf(rPr0) || halfOf(pPr) || defaultHalfPt;
    let halfPt = base;
    if (widthTwips > 0) {
      // 模板单元格边距左右各 108 twips，再留 2pt 余量
      const availPt = widthTwips / 20 - 216 / 20 - 2;
      while (halfPt > 13 && estimateWidthPt(text, halfPt) > availPt) halfPt -= 1;
    }
    return `<w:p>${pPr}<w:r>${applySz(rPr0, halfPt)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  });
}

/**
 * 按填充映射重写一行：fill 为 tc 下标 → 文本；遍历 tc 时累加 gridSpan 计算各格
 * 在 tblGrid 中的实际宽度（twips），供字号自适应使用。
 * defaultHalfPt 为该行填充文本的默认字号（半点）：信息行 22（11pt）、数据行 20（10pt）。
 */
function fillRowCells(
  rowXml: string,
  gridWidths: number[],
  fill: Record<number, string>,
  defaultHalfPt: number,
): string {
  const tcs = rowXml.match(TC_RE) ?? [];
  let gridIdx = 0;
  for (let i = 0; i < tcs.length; i++) {
    const tc = tcs[i];
    const span = Number(tc.match(SPAN_RE)?.[1] ?? 1);
    const text = fill[i];
    if (text) {
      let widthTwips = 0;
      for (let k = gridIdx; k < gridIdx + span && k < gridWidths.length; k++) {
        widthTwips += gridWidths[k] ?? 0;
      }
      tcs[i] = fillTc(tc, text, widthTwips, defaultHalfPt);
    }
    gridIdx += span;
  }
  return rebuildTr(cleanCloneXml(rowXml), tcs);
}

// ---------------------------------------------------------------------------
// 单元格取值（与 pdfExport.fillRow 同一语义，列位对应 docx 模板 39tc）
// ---------------------------------------------------------------------------
/** 一条土样 → 39 个数据格文本（下标即 tc 下标；空串表示留白） */
export function sampleDocxCells(
  s: SoilSample,
  mode: 'A' | 'B',
  seq: number,
  testKeys: string[],
  holeCode: string,
): string[] {
  const v: string[] = new Array(39).fill('');
  const soilType = soilTypeOptions(mode);
  // 土号统一归一（与 PDF/Excel 同规则 stripSoilNumber）：原1→-1、扰1/R1→-R1、
  // ZK1-3→-3；空土号按行序兜底 -seq（2026-10-30 用户反馈：不应带「原/扰」字）
  const short = stripSoilNumber(holeCode, s.soilNumber);
  v[0] = short ? `-${short}` : `-${seq}`;
  v[1] = s.fieldRecord ?? '';
  // tc2 取样深度 / tc3 取样标高：模板留空手填
  v[4] = s.color ?? '';
  v[5] = s.smell ?? '';
  for (let i = 0; i < 6; i++) {
    v[6 + i] = soilType[i] != null && s.soilType.includes(soilType[i]) ? '√' : '';
  }
  // tc12 夹杂物整高列留空（实际勾选落在 tc14-24）
  v[13] = s.disturbance === '扰动' ? '√' : '';
  for (let i = 0; i < INCLUSIONS.length; i++) {
    v[14 + i] = s.inclusions.includes(INCLUSIONS[i]) ? '√' : '';
  }
  for (let i = 0; i < SOIL_STATES.length; i++) {
    v[25 + i] = s.soilState.includes(SOIL_STATES[i]) ? '√' : '';
  }
  v[30] = s.soilStateNote ?? '';
  for (let i = 0; i < testKeys.length && i < 8; i++) {
    v[31 + i] = s.testItems.includes(testKeys[i]) ? '√' : '';
  }
  return v;
}

/** 信息行工程信息取值：开土日期 y/m/d，缺省补空位（保持「年 月 日」字样） */
function infoParts(openDate: string): { y: string; m: string; d: string } {
  const parts = (openDate ?? '').trim().split('-');
  return { y: parts[0] ?? '', m: parts[1] ?? '', d: parts[2] ?? '' };
}

/** 填 row0 信息行：工程编号 / 孔号 / 孔口标高 / 开土日期（与 PDF 信息行一致） */
export function fillInfoRow(row0: string, gridWidths: number[], record: SoilRecord): string {
  const tcs = row0.match(TC_RE) ?? [];
  if (tcs.length < 13) throw new Error('docx 模板信息行结构异常');
  const eng = record.engineering;
  const { y, m, d } = infoParts(eng?.openDate ?? '');
  return fillRowCells(row0, gridWidths, {
    0: `工程编号：${eng?.projectCode ?? ''}`,
    5: `孔号：${eng?.holeCode ?? ''}`,
    9: `孔口标高${eng?.holeElevation ?? ''}`,
    12: `开土日期${y || '    '}年${m || '  '}月${d || '  '}日`,
  }, 22);
}

/**
 * 填 row2 子项行的 8 个试验列标题（tc31-38）：与 PDF 一致，
 * 列名随记录的固结/剪切别名（recordTestColumns 的 label，如「回弹压缩」「慢剪」）
 * 自动修正；√ 落位本就按列 key 判定，此处让表头文字与勾选列保持一致。
 * 竖排格不做字号自适应（行高由最高子项格决定，别名长度 ≤ 既有最长子项）。
 */
function fillTestHeaderRow(row2: string, labels: string[]): string {
  const tcs = row2.match(TC_RE) ?? [];
  if (tcs.length !== 39) throw new Error('docx 模板子项行结构异常');
  for (let i = 0; i < labels.length && i < 8; i++) {
    const label = labels[i];
    if (label) tcs[31 + i] = fillTc(tcs[31 + i], label);
  }
  return rebuildTr(cleanCloneXml(row2), tcs);
}

/**
 * 填一条数据行（fill 为 null 时输出模板空白行）。
 * defaultHalfPt=18（9pt）必须显式写 sz：模板 Normal 默认 15pt（sz=30），不写会
 * 继承 15pt 导致两位数土号/野外记录在窄格内换行、行高翻倍、整表溢出到下一页
 * （2026-10-30「Word 导出变 3 页」根因）。9pt 与 PDF 数据字号一致，且单行内容
 * 行高与空段落同样贴齐 docGrid 408 网格，表格总高与模板完全一致。
 */
function fillDataRow(
  rowTpl: string,
  gridWidths: number[],
  fill: Record<number, string> | null,
): string {
  if (!fill) return cleanCloneXml(rowTpl);
  return fillRowCells(rowTpl, gridWidths, fill, 18);
}

/** 把 sampleDocxCells 的数组转成 {tc下标: 文本} 映射 */
function cellsToFill(cells: string[]): Record<number, string> {
  const fill: Record<number, string> = {};
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]) fill[i] = cells[i];
  }
  return fill;
}

/**
 * 纯函数：以模板 document.xml 为底生成整篇 document.xml。
 * - 每条记录按 22 行/页分页，页与页、孔与孔之间插入分页段落；
 * - 每页都是完整一张表（信息行按所属记录填写，列标题/子项原样保留）。
 */
export function buildDocxBody(tplXml: string, records: SoilRecord[]): string {
  const tblStart = tplXml.indexOf('<w:tbl>');
  const TBL_END = '</w:tbl>';
  const tblEnd = tplXml.lastIndexOf(TBL_END);
  if (tblStart < 0 || tblEnd < 0) throw new Error('docx 模板缺少表格');
  const tbl = tplXml.slice(tblStart, tblEnd + TBL_END.length);
  const firstTr = tbl.indexOf('<w:tr');
  const tblOpen = tbl.slice(0, firstTr); // <w:tbl><w:tblPr>…</w:tblGrid>
  const gridWidths = Array.from(tblOpen.matchAll(GRIDCOL_RE), (m) => Number(m[1]));
  if (gridWidths.length === 0) throw new Error('docx 模板缺少 tblGrid');
  const trs = tbl.slice(firstTr, tbl.length - TBL_END.length).match(TR_RE) ?? [];
  if (trs.length < 26) throw new Error(`docx 模板行数异常：${trs.length}`);
  const tailRow = cleanCloneXml(trs[25] ?? '');
  const rowTpl = cleanCloneXml(trs[3] ?? '');
  const headRow1 = cleanCloneXml(trs[1] ?? '');
  const infoRowTpl = trs[0] ?? '';
  const subRowTpl = trs[2] ?? '';

  const pages: string[] = [];
  for (const record of records) {
    const samples = record.samples ?? [];
    const recCols = recordTestColumns(record);
    const testKeys = recCols.map((c) => c.key);
    const testLabels = recCols.map((c) => c.label);
    const holeCode = record.engineering?.holeCode ?? '';
    const totalPages = Math.max(1, Math.ceil(samples.length / DOCX_ROWS_PER_PAGE));
    for (let p = 0; p < totalPages; p++) {
      const rows: string[] = [
        fillInfoRow(infoRowTpl, gridWidths, record),
        headRow1,
        fillTestHeaderRow(subRowTpl, testLabels),
      ];
      for (let r = 0; r < DOCX_ROWS_PER_PAGE; r++) {
        const idx = p * DOCX_ROWS_PER_PAGE + r;
        const s = samples[idx];
        const fill = s
          ? cellsToFill(sampleDocxCells(s, record.mode, idx + 1, testKeys, holeCode))
          : null;
        rows.push(fillDataRow(rowTpl, gridWidths, fill));
      }
      pages.push(tblOpen + rows.join('') + tailRow + TBL_END);
    }
  }
  return tplXml.slice(0, tblStart) + pages.join(PAGE_BREAK_P) + tplXml.slice(tblEnd + TBL_END.length);
}

// ---------------------------------------------------------------------------
// 文件名（与 PDF 规则完全一致，扩展名 .docx）
// ---------------------------------------------------------------------------
function localDateStr(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 单孔文件名：`<开土日期>_<孔号>.docx`（空值兜底与 PDF 相同） */
export function buildSingleDocxFileName(record: SoilRecord): string {
  const date = sanitizeFileNamePart(record?.engineering?.openDate ?? '', '');
  const hole = sanitizeFileNamePart(record?.engineering?.holeCode ?? '', '');
  const base = date ? `${date}_${hole || '未命名孔'}` : hole || '未命名孔';
  return `${base}.docx`;
}

/** 多孔合并文件名：`开土记录_<N>孔_<当天日期>.docx`；单孔与 buildSingleDocxFileName 一致 */
export function buildMergedDocxFileName(records: SoilRecord[], today?: string): string {
  const count = records?.length ?? 0;
  if (count === 1) return buildSingleDocxFileName(records[0]);
  const day = sanitizeFileNamePart(today || localDateStr(), '') || localDateStr();
  return `开土记录_${count}孔_${day}.docx`;
}

// ---------------------------------------------------------------------------
// 模板资源：见 docxAssets.ts（Vite ?url，动态加载以保持本模块纯净可测）
// ---------------------------------------------------------------------------
async function fetchTemplateBytes(mode: 'A' | 'B'): Promise<Uint8Array> {
  const { DOCX_TEMPLATE_URLS } = await import('./docxAssets');
  const res = await fetch(DOCX_TEMPLATE_URLS[mode]);
  if (!res.ok) throw new Error(`模板加载失败（${res.status}）`);
  return new Uint8Array(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// CMA 页眉设置（版本行 / 文件编号）应用于 Word（2026-10-30 用户要求）
// 模板 header1.xml（唯一非空页眉）单段落：公司名 run + 两个空格定位 run +
// 版本行多个 run（'第','3','版第0次修改 202','4','年',…）。文件编号不在页眉
// （2026-10-30 用户澄清：在正文右对齐段落，见 applyDocCodeXml）——页眉只换版本行，
// 不新增段落，避免页眉变高把浮动表锚点下移破坏版式。
// ---------------------------------------------------------------------------
const HEADER_RUN_RE = /<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/g;
const HEADER_TEXT_RE = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g;

/** run 内的可见文本（w:t 串联） */
function runText(run: string): string {
  HEADER_TEXT_RE.lastIndex = 0;
  let t = '';
  let m: RegExpExecArray | null;
  while ((m = HEADER_TEXT_RE.exec(run)) !== null) t += m[1];
  return t;
}

/** run 的 rPr（无则空串） */
function runRPr(run: string): string {
  return run.match(RPR_RE)?.[0] ?? '';
}

// ---------------------------------------------------------------------------
// 页眉宽度自适应（2026-11-02 用户反馈「实施」折行 / 分页异常）
//
// 根因：模板 header1.xml 只有一个段落（pStyle=5「header」，其 rPr 继承 sz=18 即
// 9pt）：公司名 run + 两段共 162 个半角空格的定位 run + 版本行 9 个 run。版本行
// 文本比模板原文长（CMA 默认值多了若干空格）时整段总宽超过 A3 可用宽度
// （23814-1417-1417=20980 twips = 1049pt），Word 把末尾「实施」两字折到第二行，
// 页眉变高 → 浮动表格整体下移 → 分页异常。
//
// 修法（三级，优先级从高到低，受控文档「字号比位置更敏感」）：
//   1) 字号不动（9pt，与公司名同号）+ 轻微负字距 `<w:spacing w:val="-N"/>`：
//      N = ceil(超出量 × 20 / 版本行字符数)，下限 -30（-1.5pt/字）；
//   2) 字距到下限仍超宽 → 再缩版本行字号（下限 sz16 / 8pt）；
//   3) 仍超宽（版本行极长）→ 才缩定位空格 run（会让版本行整体左移，仅兜底）。
// 公司名与定位空格 run 默认不动，版本行起点保持模板的 934.8pt。
// 见 {@link fitHeaderSizes}。
//
// 字宽刻度来自 Word 实测（导出 PDF 后 pdfplumber 量字符盒）：
//   CJK/全角 1.0em、ASCII 字母数字 0.5em（9pt 下 4.5pt）、
//   半角空格 0.5em（9pt 下实测 4.56pt ≈ 0.507em；宋体空格不是 0.25em）、
//   全角空格 1.0em。
// ---------------------------------------------------------------------------

/** 页边几何（twips）：来自 document.xml 的 sectPr */
export interface HeaderPageMetrics {
  pageWidthTwips: number;
  marginLeftTwips: number;
  marginRightTwips: number;
}

/** 模板兜底几何（tpl-normal / tpl-triangle 相同：A3 横向 + 左右各 1417） */
export const DEFAULT_HEADER_PAGE_METRICS: HeaderPageMetrics = {
  pageWidthTwips: 23814,
  marginLeftTwips: 1417,
  marginRightTwips: 1417,
};

/** 页眉可用宽度（twips）：pgSz.w - pgMar.left - pgMar.right */
export function headerAvailTwips(m: HeaderPageMetrics): number {
  return Math.max(0, m.pageWidthTwips - m.marginLeftTwips - m.marginRightTwips);
}

/** 从 document.xml（模板）读取 sectPr 的页面宽度与左右页边距 */
export function readHeaderPageMetrics(documentXml: string): HeaderPageMetrics {
  const sect = documentXml.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/)?.[0] ?? documentXml;
  const pgSz = sect.match(/<w:pgSz [^>]*\/>/)?.[0] ?? '';
  const pgMar = sect.match(/<w:pgMar [^>]*\/>/)?.[0] ?? '';
  const num = (xml: string, attr: string): number => {
    const v = xml.match(new RegExp(`w:${attr}="(-?\\d+)"`))?.[1];
    return v == null ? 0 : Number(v);
  };
  const width = num(pgSz, 'w') || DEFAULT_HEADER_PAGE_METRICS.pageWidthTwips;
  const left = pgMar ? num(pgMar, 'left') : DEFAULT_HEADER_PAGE_METRICS.marginLeftTwips;
  const right = pgMar ? num(pgMar, 'right') : DEFAULT_HEADER_PAGE_METRICS.marginRightTwips;
  return { pageWidthTwips: width, marginLeftTwips: left, marginRightTwips: right };
}

/** 单字符宽度（em）：见上方实测刻度说明 */
export function headerCharEm(c: string): number {
  if (c === '　') return 1; // 全角空格
  if (c === ' ') return 0.5; // 半角空格（宋体渲染为半个全角宽）
  const code = c.codePointAt(0) ?? 0;
  if (code >= 0x2e80) return 1; // CJK / 全角标点
  return 0.5; // ASCII 字母、数字、标点
}

/** 估算一段页眉文本的宽度（pt）；halfPt 为该 run 的字号（半点） */
export function estimateHeaderWidthPt(text: string, halfPt: number): number {
  let em = 0;
  for (const c of text) em += headerCharEm(c);
  return (em * halfPt) / 2;
}

/** 版本行/空格 run 的最终字号（半点）、字距与推导信息 */
export interface HeaderFitResult {
  /** 版本行基准字号（半点），用于判定是否缩小 */
  baseHalfPt: number;
  /** 版本行最终字号（半点） */
  versionHalfPt: number;
  /** 空格定位 run 的最终字号（半点），未兜底时等于 baseHalfPt */
  spaceHalfPt: number;
  /** 版本行字距（twips，负值为压缩；0 表示不写 spacing） */
  spacingTwips: number;
  /** 可用宽度（pt） */
  availablePt: number;
  /** 按最终字号/字距估算的整段宽度（pt） */
  estimatedPt: number;
  /** 版本行是否被缩小 */
  shrunkVersion: boolean;
  /** 是否启用了空格 run 缩字号兜底 */
  shrunkSpaces: boolean;
}

/** 版本行字号下限 8pt（sz16）：一级（负字距）不够时才用 */
const HEADER_MIN_VERSION_HALF_PT = 16;
/** 空格 run 兜底下限 5pt（sz10）：仅作安全阀，正常路径不会走到 */
const HEADER_MIN_SPACE_HALF_PT = 10;
/** 版本行字距下限：-1.5pt/字（w:spacing 单位为 1/20 pt，即 -30） */
const HEADER_MIN_SPACING_TWIPS = -30;

/**
 * 计算页眉字号/字距：优先「不缩字号 + 轻微负字距」，缩字号与缩空格只作兜底。
 *
 * 1. 未超宽 → 保持基准字号，不写字距；
 * 2. 超宽 → 版本行保持基准字号（9pt，与公司名同号），逐字压缩
 *    `w:spacing = -ceil(超出量×20/字符数)`，下限 -30（-1.5pt/字）；
 * 3. 字距到下限仍超宽 → 版本行缩字号（0.5pt 粒度，下限 8pt）；
 * 4. 仍超宽（版本行极长）→ 逐级缩小空格 run（下限 5pt）。
 *
 * @param prefixText 版本行之前的全部可见文本（公司名 + 定位空格）
 * @param versionText 新版本行文本
 * @param baseHalfPt 页眉基准字号（半点，模板 pStyle=5 → 18）
 * @param availablePt 页眉可用宽度（pt）
 */
export function fitHeaderSizes(
  prefixText: string,
  versionText: string,
  baseHalfPt: number,
  availablePt: number,
): HeaderFitResult {
  const base = baseHalfPt > 0 ? baseHalfPt : 18;
  const prefixPt = estimateHeaderWidthPt(prefixText, base);
  const versionPt = estimateHeaderWidthPt(versionText, base);
  const totalPt = prefixPt + versionPt;
  const charCount = [...versionText].length;
  const noShrink: HeaderFitResult = {
    baseHalfPt: base,
    versionHalfPt: base,
    spaceHalfPt: base,
    spacingTwips: 0,
    availablePt,
    estimatedPt: totalPt,
    shrunkVersion: false,
    shrunkSpaces: false,
  };
  if (!versionText || !(availablePt > 0) || totalPt <= availablePt) return noShrink;

  // 一级：字号不动，仅加负字距（每字符需压缩 = 超出量 / 字符数，向上取整到 twips）
  const needPt = totalPt - availablePt;
  if (charCount > 0) {
    const needTwips = Math.ceil((needPt * 20) / charCount);
    if (needTwips <= -HEADER_MIN_SPACING_TWIPS) {
      return {
        ...noShrink,
        spacingTwips: -needTwips,
        estimatedPt: totalPt - (needTwips / 20) * charCount,
      };
    }
  }

  // 二级：字距已到 -1.5pt/字 仍不够 → 再缩版本行字号
  const spacingTwips = HEADER_MIN_SPACING_TWIPS;
  const spacingPt = spacingTwips / 20;
  const roomPt = availablePt - prefixPt - spacingPt * charCount;
  let versionHalf = HEADER_MIN_VERSION_HALF_PT;
  if (roomPt > 0 && versionPt > 0) {
    versionHalf = Math.floor((base * roomPt) / versionPt);
  }
  versionHalf = Math.max(HEADER_MIN_VERSION_HALF_PT, Math.min(base, versionHalf));

  const widthAt = (vHalf: number, sHalf: number): number =>
    (prefixPt * sHalf) / base + (versionPt * vHalf) / base + spacingPt * charCount;

  // 三级：仍超宽 → 空格 run 缩字号（仅此时才动定位）
  let spaceHalf = base;
  let estimatedPt = widthAt(versionHalf, spaceHalf);
  while (estimatedPt > availablePt && spaceHalf > HEADER_MIN_SPACE_HALF_PT) {
    spaceHalf -= 1;
    estimatedPt = widthAt(versionHalf, spaceHalf);
  }

  return {
    baseHalfPt: base,
    versionHalfPt: versionHalf,
    spaceHalfPt: spaceHalf,
    spacingTwips,
    availablePt,
    estimatedPt,
    shrunkVersion: versionHalf < base,
    shrunkSpaces: spaceHalf < base,
  };
}

/** 从 rPr 读取显式字号（半点），无则 0 */
function rPrHalfPt(rPr: string): number {
  const v = rPr.match(/<w:sz w:val="(\d+)"\/>/)?.[1];
  return v == null ? 0 : Number(v);
}

/**
 * 把字距 / 字号写入 rPr 的合法位置，保留 rFonts / w:u 等既有属性。
 *
 * OOXML `w:rPr` 子元素顺序固定：… color, **spacing**, w, kern, position, **sz, szCs**,
 * highlight, u, effect, …, lang。因此 `<w:spacing>` 必须排在 `<w:sz>/<w:szCs>` 之前，
 * 否则 Word 直接忽略（与「裸 sz 无效」是同一类坑）。已有的 spacing/sz/szCs 先剔除。
 *
 * @param halfPt 字号（半点）
 * @param spacingTwips 字距（twips，负值压缩）；0 表示不写
 */
function withRunFormat(rPr: string, halfPt: number, spacingTwips = 0): string {
  const sz = `<w:sz w:val="${halfPt}"/><w:szCs w:val="${halfPt}"/>`;
  const sp = spacingTwips ? `<w:spacing w:val="${Math.round(spacingTwips)}"/>` : '';
  const inject = sp + sz;
  if (!rPr) return `<w:rPr>${inject}</w:rPr>`;
  const body = rPr
    .replace(/^<w:rPr>/, '')
    .replace(/<\/w:rPr>$/, '')
    .replace(/<w:spacing [^>]*\/>/g, '')
    .replace(/<w:sz [^>]*\/>/g, '')
    .replace(/<w:szCs [^>]*\/>/g, '');
  const ANCHOR_RE =
    /<w:u [^>]*\/>|<w:u\/>|<w:effect [^>]*\/>|<w:bdr [^>]*\/>|<w:shd [^>]*\/>|<w:vertAlign [^>]*\/>|<w:lang [^>]*\/>/;
  const anchor = body.match(ANCHOR_RE);
  if (anchor) return `<w:rPr>${body.replace(ANCHOR_RE, inject + anchor[0])}</w:rPr>`;
  return `<w:rPr>${body}${inject}</w:rPr>`;
}

/** 段落样式 id（pPr 的 pStyle），无则空串 */
function paragraphStyleId(pXml: string): string {
  return pXml.match(/<w:pStyle w:val="([^"]+)"\/>/)?.[1] ?? '';
}

/** docDefaults 的默认字号（半点），无则 20（Word/OOXML 默认 10pt） */
function docDefaultHalfPt(stylesXml: string): number {
  const defaults = stylesXml.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/)?.[0] ?? '';
  const v = defaults.match(/<w:sz w:val="(\d+)"\/>/)?.[1];
  return v == null ? 20 : Number(v);
}

/**
 * 解析页眉段落样式链的最终字号（半点）：styleId → basedOn → …（不处理表样式）。
 * 找不到样式时回落 docDefaults。
 */
export function resolveStyleHalfPt(stylesXml: string, styleId: string): number {
  if (!stylesXml || !styleId) return docDefaultHalfPt(stylesXml);
  const styles = new Map<string, { basedOn: string; halfPt: number }>();
  const re = /<w:style [\s\S]*?<\/w:style>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stylesXml)) !== null) {
    const xml = m[0];
    const id = xml.match(/w:styleId="([^"]+)"/)?.[1];
    if (!id) continue;
    styles.set(id, {
      basedOn: xml.match(/<w:basedOn w:val="([^"]+)"\/>/)?.[1] ?? '',
      halfPt: rPrHalfPt(xml.match(RPR_RE)?.[0] ?? ''),
    });
  }
  let cursor = styleId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const style = styles.get(cursor);
    if (!style) break;
    if (style.halfPt > 0) return style.halfPt;
    cursor = style.basedOn;
  }
  return docDefaultHalfPt(stylesXml);
}

/**
 * 页眉基准字号（半点）：版本行 run 的显式 sz → 页眉段落 pStyle 链 → Word 默认。
 * 模板 pStyle=5（header 样式，basedOn Normal）→ 18（9pt）。
 */
export function headerBaseHalfPt(headerXml: string, stylesXml = ''): number {
  const para = headerXml.match(/<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/)?.[0] ?? headerXml;
  const runs = para.match(HEADER_RUN_RE) ?? [];
  for (const run of runs) {
    const t = runText(run);
    if (t.trim() === '' || t.includes('公司')) continue;
    const half = rPrHalfPt(runRPr(run));
    if (half > 0) return half;
  }
  const styleId = paragraphStyleId(para);
  if (stylesXml) return resolveStyleHalfPt(stylesXml, styleId);
  return 20;
}

/**
 * 把 CMA 设置写入页眉 XML：公司名 / 空白定位 run 保留；版本行区（首个非空白且
 * 不含「公司」的 run 起，至最后一个非空白 run 止）合并替换为 `versionLine`
 * （沿用原版本行 run 的 rPr，并写入显式 sz/szCs）。
 *
 * 2026-10-30 用户澄清：**文件编号在正文，不在页眉**，因此本函数不处理 docCode
 * （由 {@link applyDocCodeXml} 写入 document.xml 的右对齐编号段落）。
 *
 * 2026-11-02 修复「实施」折行：版本行会按页眉可用宽度自动缩字号（见
 * {@link fitHeaderSizes}），保证页眉始终只有一个段落、一行，不把浮动表下移。
 *
 * @param ctx.page      模板页面几何（缺省用 A3 横向 + 1417 左右边距）
 * @param ctx.stylesXml 模板 styles.xml（用于解析 pStyle 继承字号）
 */
export function applyCmaHeaderXml(
  headerXml: string,
  header: CmaHeaderSettings,
  ctx: { page?: HeaderPageMetrics; stylesXml?: string } = {},
): string {
  const runs = headerXml.match(HEADER_RUN_RE) ?? [];
  const texts = runs.map(runText);
  const isVersionRun = (t: string): boolean => t.trim() !== '' && !t.includes('公司');
  let first = -1;
  let last = -1;
  for (let i = 0; i < runs.length; i++) {
    if (isVersionRun(texts[i])) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return headerXml;

  const versionLine = (header.versionLine ?? '').trim();
  const page = ctx.page ?? DEFAULT_HEADER_PAGE_METRICS;
  // 可用宽度留 8pt 余量：估算式略小于 Word 实测（宋体空格实测 0.507em > 0.5em）
  const availablePt = Math.max(0, headerAvailTwips(page) / 20 - 8);
  const baseHalfPt = headerBaseHalfPt(headerXml, ctx.stylesXml ?? '');
  const prefixText = texts.slice(0, first).join('');
  const fit = fitHeaderSizes(prefixText, versionLine, baseHalfPt, availablePt);

  const rPr = runRPr(runs[first]);
  const replacement = versionLine
    ? `<w:r>${withRunFormat(rPr, fit.versionHalfPt, fit.spacingTwips)}<w:t xml:space="preserve">${esc(versionLine)}</w:t></w:r>`
    : '';
  // 兜底：仅对「纯空格」定位 run 缩字号（不带字距），公司名与版本行不动
  const spaceSz = fit.shrunkSpaces ? fit.spaceHalfPt : 0;
  const respaceRun = (run: string, text: string): string => {
    if (!spaceSz || !text || text.trim() !== '') return run;
    return run.replace(RPR_RE, withRunFormat(runRPr(run), spaceSz));
  };

  let out = '';
  let cursor = 0;
  for (let i = 0; i < runs.length; i++) {
    const idx = headerXml.indexOf(runs[i], cursor);
    if (idx < 0) return headerXml; // 结构异常兜底：原样返回
    out += headerXml.slice(cursor, idx);
    if (i === first) out += replacement;
    else if (i < first) out += respaceRun(runs[i], texts[i]);
    else if (i > last) out += runs[i];
    cursor = idx + runs[i].length;
  }
  return out + headerXml.slice(cursor);
}

// ---------------------------------------------------------------------------
// 文件编号（正文右对齐段落，2026-10-30 用户澄清：CMA 版本号在页眉、文件编号在正文）
// 模板 document.xml 开头（标题「开土记录表」之后）有一个右对齐段落，
// 文本由 5 个 run 拼成 `SHLY-TR068-2024`（等线 sz=21）。只改这一个段落，
// 模板其余内容（标题、表格）零改动。
// ---------------------------------------------------------------------------
/** 模板文件编号格式：SHLY-TR068-2024（2-6 位大写字母 + -TR + 3 位数字 + -4 位年份） */
const DOC_CODE_PATTERN = /^[A-Z]{2,6}-TR\d{3}-\d{4}$/;
/** 右对齐段落属性（容忍属性间空格差异） */
const RIGHT_JC_RE = /<w:jc[^>]*w:val="right"[^>]*\/>/;
const PARA_RE = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g;
const RUN_ANY_RE = /<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/;

/** 段落内可见文本（w:t 串联，自动处理被拆分到多个 run 的编号） */
function paragraphText(pXml: string): string {
  const out: string[] = [];
  const re = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pXml)) !== null) out.push(m[1] ?? '');
  return out.join('');
}

/**
 * 把「文件编号」写入正文（document.xml）。
 *
 * 定位规则（只命中模板中唯一的一个编号段落）：
 * - pPr 含 `<w:jc w:val="right"/>`（右对齐）；
 * - 段落纯文本匹配 {@link DOC_CODE_PATTERN}（跨 run 拼接后判断，故 `S`+`HLY`+
 *   `-`+`TR068-202`+`4` 能正确识别为 `SHLY-TR068-2024`）。
 * 命中后把段落内所有 run 合并为一个 run（沿用首个 run 的 rPr，保留 pPr 与段落
 * 属性），文本替换为 docCode。标题等其它右对齐段落文本不匹配，不会被误伤。
 *
 * @param docCode 新文件编号；为空或纯空白时原样返回（保留模板值）
 */
export function applyDocCodeXml(documentXml: string, docCode: string): string {
  const code = (docCode ?? '').trim();
  if (!code) return documentXml;
  return documentXml.replace(PARA_RE, (para) => {
    const pPr = para.match(PPR_RE)?.[0] ?? '';
    if (!RIGHT_JC_RE.test(pPr)) return para;
    if (!DOC_CODE_PATTERN.test(paragraphText(para).trim())) return para;
    const openTag = para.match(/^<w:p(?: [^>]*)?>/)?.[0] ?? '<w:p>';
    const firstRun = para.match(RUN_ANY_RE)?.[0] ?? '';
    const rPr = firstRun.match(RPR_RE)?.[0] ?? '';
    return `${openTag}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(code)}</w:t></w:r></w:p>`;
  });
}

// ---------------------------------------------------------------------------
// 导出入口
// ---------------------------------------------------------------------------
/**
 * 生成 docx Blob（不触发下载）：fetch 模板 → fflate 解包 → document.xml 手术 +
 * 页眉 CMA 设置（header 存在时）→ 重打包。
 * records 内所有记录须同一 mode（调用方按 mode 分组）。
 */
export async function buildDocxBlob(
  records: SoilRecord[],
  templateBytes: Uint8Array,
  header: CmaHeaderSettings | null = null,
): Promise<Blob> {
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import('fflate');
  const files = unzipSync(templateBytes);
  const xmlEntry = 'word/document.xml';
  if (!files[xmlEntry]) throw new Error('docx 模板缺少 document.xml');
  const tplDocumentXml = strFromU8(files[xmlEntry]);
  // 顺序：先填表（buildDocxBody），再把文件编号写入正文右对齐段落。
  // 两者操作的是不同节点（表格 vs 表格前的编号段落），先后不影响表格结构。
  const bodyXml = buildDocxBody(tplDocumentXml, records);
  const outXml = applyDocCodeXml(bodyXml, header?.docCode ?? '');
  files[xmlEntry] = strToU8(outXml);
  // CMA 页眉：只替换版本行（文件编号在正文，见 applyDocCodeXml）；
  // 页面几何取模板 sectPr，样式表用于解析页眉 pStyle 的继承字号
  if (header) {
    const headerEntry = 'word/header1.xml';
    if (files[headerEntry]) {
      files[headerEntry] = strToU8(
        applyCmaHeaderXml(strFromU8(files[headerEntry]), header, {
          page: readHeaderPageMetrics(tplDocumentXml),
          stylesXml: files['word/styles.xml'] ? strFromU8(files['word/styles.xml']) : '',
        }),
      );
    }
  }
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped as BlobPart], { type: DOCX_MIME });
}

/** Uint8Array → base64（原生端写文件用，照抄 xlsxExport） */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

/**
 * Web Share API Level 2 的最小类型声明。
 * 部分 TypeScript lib.dom 版本没有 `navigator.canShare` / `ShareData.files`，
 * 用局部接口收窄，避免 `as any` 扩散。
 */
interface WebShareFileData {
  files?: File[];
  title?: string;
  text?: string;
}

interface ShareCapableNavigator {
  canShare?: (data?: WebShareFileData) => boolean;
  share?: (data?: WebShareFileData) => Promise<void>;
}

/** 分享/写入被用户主动取消（Web Share 抛 AbortError；Capacitor Share 抛「cancel」文案） */
function isShareCancelled(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: unknown; message?: unknown };
  if (err.name === 'AbortError') return true;
  return typeof err.message === 'string' && /cancel|取消/i.test(err.message);
}

/**
 * 交付 docx Blob：
 * - 原生端（Capacitor）：写文档目录后调系统分享；分享取消/失败都视为「文件已保存」，
 *   只有写文件失败才抛给上层；
 * - Web/PWA：优先 Web Share API Level 2（系统分享面板，微信/QQ/邮件可直接发送），
 *   不支持或分享异常时回退 `<a download>` 浏览器下载。
 *
 * 2026-10-30 用户反馈：手机上导出 Word 常卡在浏览器下载页加载不出来
 * （PWA / 微信内置浏览器对 `a.download` + Blob 支持差），故 Web 端优先系统分享。
 */
async function deliverDocxBlob(blob: Blob, fileName: string): Promise<ExportResult> {
  if (Capacitor.isNativePlatform()) {
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = uint8ToBase64(new Uint8Array(arrayBuffer));
    const fsResult = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Documents,
    });
    try {
      await Share.share({ title: '开土记录表', text: '开土记录表 Word 导出', files: [fsResult.uri] });
      return {
        success: true,
        message: `已保存到文档目录并打开系统分享：${fileName}`,
        path: fsResult.uri,
      };
    } catch (e) {
      // 用户取消分享（或无可用分享目标）不代表导出失败：文件已经在文档目录里
      const cancelled = isShareCancelled(e);
      return {
        success: true,
        message: cancelled
          ? `已保存到文档目录（已取消分享）：${fileName}`
          : `文件已保存到文档目录：${fileName}`,
        path: fsResult.uri,
      };
    }
  }

  // Web / PWA：优先系统分享（Level 2 支持文件）
  const nav = navigator as Navigator & ShareCapableNavigator;
  if (typeof nav.share === 'function') {
    const file = new File([blob], fileName, { type: DOCX_MIME });
    let canShareFile = false;
    try {
      canShareFile = typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
    } catch {
      canShareFile = false;
    }
    if (canShareFile) {
      try {
        await nav.share({ files: [file], title: '开土记录表', text: '开土记录表 Word 导出' });
        return { success: true, message: `已通过系统分享发送：${fileName}` };
      } catch (e) {
        // 用户取消：不误报失败，也不再触发下载（用户已明确放弃）
        if (isShareCancelled(e)) {
          return { success: true, message: `已取消分享 ${fileName}` };
        }
        // 其它异常（微信内置浏览器常见 NotAllowedError / DataError）：回退下载
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { success: true, message: `已导出 ${fileName}（浏览器下载）` };
}

/**
 * 批量导出 Word（组织与 PDF 完全一致，用户确认 2026-10-30）：
 * - 1 个记录 → 单文件 `<开土日期>_<孔号>.docx`；
 * - >1 个记录 → 合并为一个文件 `开土记录_<N>孔_<当天日期>.docx`；
 * - openDateOverride 非空时统一本次导出的开土日期（页内信息行与文件名）；
 * - 混合模式（普通定名 + 三角坐标）时按 mode 分组出两个文件，
 *   文件名加「普通定名 / 三角坐标」段区分（单一模板装不下两种土名行）。
 */
export async function exportRecordsDocx(
  records: SoilRecord[],
  openDateOverride = '',
  cmaHeader: CmaHeaderSettings = CMA_DEFAULT,
): Promise<ExportResult> {
  if (!records || records.length === 0) {
    return { success: false, message: '没有选择要导出的孔' };
  }
  try {
    const stamped = withOpenDate(records, openDateOverride);
    const groupA = stamped.filter((r) => r.mode !== 'B');
    const groupB = stamped.filter((r) => r.mode === 'B');
    const mixed = groupA.length > 0 && groupB.length > 0;
    const groups: { records: SoilRecord[]; tag: string }[] = mixed
      ? [
          { records: groupA, tag: '普通定名' },
          { records: groupB, tag: '三角坐标' },
        ]
      : [{ records: stamped, tag: '' }];

    const today = openDateOverride.trim() || undefined;
    const messages: string[] = [];
    for (const group of groups) {
      const merged = group.records.length > 1;
      const baseName = merged
        ? buildMergedDocxFileName(group.records, today)
        : buildSingleDocxFileName(group.records[0]);
      // 混合分组时给合并文件名插模式段：开土记录_普通定名_N孔_日期.docx
      const fileName =
        mixed && merged ? baseName.replace('开土记录_', `开土记录_${group.tag}_`) : baseName;
      const bytes = await fetchTemplateBytes(group.records[0].mode);
      const blob = await buildDocxBlob(group.records, bytes, cmaHeader);
      messages.push((await deliverDocxBlob(blob, fileName)).message);
    }
    return {
      success: true,
      message: messages.length > 1 ? `已导出 ${messages.length} 个 Word 文件` : messages[0],
    };
  } catch (e: any) {
    return { success: false, message: 'Word 导出失败：' + (e?.message ?? String(e)) };
  }
}
