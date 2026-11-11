/**
 * PDF 导出：逐格还原纸质「开土记录表」（A3 横向）。
 *
 * 技术方案：HTML 复刻模板表格（固定列宽/行高）→ html2canvas 逐页渲染
 * → jsPDF 合成 A3 横向 PDF → 下载（Web 用 Blob，原生端用 Filesystem + Share）。
 *
 * 关键纯函数 buildPdfPages(record) 把「每页数据单元格取值 + 分页」抽离为
 * 不依赖 DOM 的纯逻辑，便于 QA 单测；HTML 渲染层只负责把 cells 拼成表格。
 */
import type { SoilRecord, SoilSample } from './types';
import {
  SOIL_TYPE_A,
  SOIL_TYPE_B,
  INCLUSIONS,
  SOIL_STATES,
  recordTestColumns,
  soilTypeOptions,
} from './constants';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { ExportResult } from './xlsxExport';
import { importWithRecovery } from './pwaRecovery';
import { CMA_DEFAULT, CmaHeaderSettings, fitHeaderFontSize } from './cmaHeader';
import { mergedSoilNumber, sanitizeFileNamePart, stripSoilNumber } from './exportNaming';

// 保留对外导出（历史测试/调用可能直接引用），实现统一收敛到 exportNaming
export { sanitizeFileNamePart } from './exportNaming';

// ---------------------------------------------------------------------------
// 几何常量（单位 pt；px = pt × 4/3，96dpi）
// ---------------------------------------------------------------------------
const PT = 4 / 3;
const px = (pt: number): number => pt * PT;
const PAGE_W_PX = 1587.4; // A3 横向 1190.7pt @96dpi
const PAGE_H_PX = 1122.5; // A3 横向 842pt @96dpi
const TABLE_LEFT_PT = 48.6;
const TABLE_TOP_PT = 146.8;
const TABLE_WIDTH_PT = 1109.0; // 39 列宽之和

/** 39 列宽（pt），与用户 PDF 模板精确一致 */
const COL_WIDTHS_PT: number[] = [
  30.0, 58.2, 19.8, 19.7, 31.5, 20.6, 28.6, 28.7, 28.7, 28.6, 28.6, 28.9, 39.7,
  20.4, 28.6, 28.6, 28.6, 29.1, 28.5, 23.2, 30.0, 30.0, 23.3, 23.2, 22.5, 19.5,
  21.0, 20.3, 21.7, 21.0, 58.2, 29.5, 28.6, 28.6, 28.6, 28.6, 28.6, 28.6, 38.6,
];

const GROUP_ROW_H_PT = 21.4; // 组标题带高
const DATA_ROW_H_PT = 20.9; // 数据行高（统一）
const ROWS_PER_PAGE = 23; // 每页固定 23 行（不足补空）
const TOTAL_COLS = 39;

// 子项带高按模式：A=98.2pt / B=103.0pt
const SUB_ROW_H_PT: Record<'A' | 'B', number> = { A: 98.2, B: 103.0 };
/** 表头字号（pt，px() 已含 pt→px 换算）：2026-11-02 用户反馈 9pt 在格内偏小、
 *  留白多，全表头放大到 15pt。例外：土号/野外记录两个横排窄格保持 9pt
 *  （列宽不足，15pt 会裁字，实测「野外记录」超宽 5px）。 */
const HEADER_FONT_PT = 15;

/** 单元格键：行(0..22)与列(1..39)编码为唯一整数，便于 QA 单测查值 */
const cellKey = (row: number, col: number): number => row * 1000 + col;

// ---------------------------------------------------------------------------
// 纯函数：buildPdfPages（不依赖 DOM，便于单测）
// ---------------------------------------------------------------------------
export interface PdfPage {
  /** 单元格映射：key = cellKey(row,col)，row 0..22，col 1..39 */
  cells: Record<number, string>;
}

/** 把一条土样按 39 列数据映射写入某页某行的单元格；seq 为该土样在全记录中的序号（1 起）；
 *  testKeys 为该记录 8 个试验列的数据键（固结/剪切列显示名可按记录覆盖，见 recordTestColumns）；
 *  holeCode 为孔号（土号去前缀时使用）；
 *  soilNumberDisplay 为合并表模式的土号列覆盖值：每孔第 1 条带孔号前缀（ZK1-1），
 *  其余为短编号（-2 / -R1，见 combinedSoilDisplayAt），均由调用方算好直接落格；
 *  不传（undefined）时保持单孔导出的短编号规则，行为逐字不变 */
function fillRow(cells: Record<number, string>, row: number, s: SoilSample, mode: 'A' | 'B', seq: number, testKeys: string[], holeCode: string, soilNumberDisplay?: string): void {
  const set = (col: number, v: string): void => {
    cells[cellKey(row, col)] = v;
  };
  const soilType = soilTypeOptions(mode);
  // 土号列：显示记录土号（统一归一，与 Excel/Word 同规则 stripSoilNumber）——
  // 原1→-1、扰1/R1→-R1、ZK1-3→-3、-1→-1（2026-10-30 用户反馈：不应带「原/扰」字）；
  // 数字序号去前导零（2026-11-02：-01→-1、R01→-R1，导出不写前导零，存储不动）。
  // 数字编号跳过 R 样顺位（数字样显示忠实于归一结果，App 内插入重排后即连续）。
  // 土号未填时按行序兜底 -1、-2…。
  if (soilNumberDisplay !== undefined) {
    // 多孔合并同页模式：土号已由调用方按 combinedSoilDisplayAt 算好
    // （孔内首样 ZK1-1 / 其余 -2、-R1），直接原样落格、不再二次加工
    set(1, soilNumberDisplay);
  } else {
    const short = stripSoilNumber(holeCode, s.soilNumber);
    set(1, short ? `-${short}` : `-${seq}`);
  }
  set(2, s.fieldRecord ?? '');
  set(3, ''); // 取样深度：模板留空手填
  set(4, ''); // 取样标高：模板留空手填
  set(5, s.color ?? '');
  set(6, s.smell ?? '');
  for (let i = 0; i < 6; i++) {
    set(7 + i, soilType[i] != null && s.soilType.includes(soilType[i]) ? '√' : '');
  }
  set(13, ''); // 夹杂物整高单列：模板留空（实际勾选落在 c15-25）
  set(14, s.disturbance === '扰动' ? '√' : '');
  for (let i = 0; i < INCLUSIONS.length; i++) {
    set(15 + i, s.inclusions.includes(INCLUSIONS[i]) ? '√' : '');
  }
  for (let i = 0; i < SOIL_STATES.length; i++) {
    set(26 + i, s.soilState.includes(SOIL_STATES[i]) ? '√' : '');
  }
  set(31, s.soilStateNote ?? '');
  for (let i = 0; i < testKeys.length; i++) {
    set(32 + i, s.testItems.includes(testKeys[i]) ? '√' : '');
  }
  // IL / Ip / 粉砂判定 / 额外试验项目 一律不出现在 PDF
}

/**
 * 计算 PDF 分页与每页单元格取值（不依赖 DOM，便于单测）。
 * 每页固定 23 行；土样超过 23 条则另起新页；不足 23 行补空行。
 */
export function buildPdfPages(record: SoilRecord): PdfPage[] {
  const samples = record.samples ?? [];
  const testKeys = recordTestColumns(record).map((c) => c.key);
  const holeCode = record.engineering?.holeCode ?? '';
  const totalPages = Math.max(1, Math.ceil(samples.length / ROWS_PER_PAGE));
  const pages: PdfPage[] = [];
  for (let p = 0; p < totalPages; p++) {
    const cells: Record<number, string> = {};
    for (let r = 0; r < ROWS_PER_PAGE; r++) {
      const s = samples[p * ROWS_PER_PAGE + r];
      if (s) fillRow(cells, r, s, record.mode, p * ROWS_PER_PAGE + r + 1, testKeys, holeCode);
    }
    pages.push({ cells });
  }
  return pages;
}

// ---------------------------------------------------------------------------
// 纯函数：buildCombinedPdfPages（多孔合并同页，不依赖 DOM，便于单测）
// ---------------------------------------------------------------------------
/** 合并表单页：在 PdfPage 基础上带上该页所属模式 / 信息行日期文本 / 页眉样板记录 */
export interface CombinedPdfPage extends PdfPage {
  /** 本页所属鉴别模式（决定表头「目力鉴别土类」列） */
  mode: 'A' | 'B';
  /** 信息行「开土日期」文本：所属段内所有孔日期一致 → 该日期；否则 ''（留空手填） */
  dateText: string;
  /** 页眉 / 表头渲染用的样板记录（该段第一条 record） */
  headerRecord: SoilRecord;
}

export interface CombinedPdfPages {
  pages: CombinedPdfPage[];
  /** 与 pages 一一对应的模式序列（QA 断言用） */
  modes: ('A' | 'B')[];
  /** 与 pages 一一对应的开土日期文本序列（QA 断言用） */
  dateTexts: (string | '')[];
}

/** 合并表土号列显示值：mergedSoilNumber 归一 + 空土号按孔内序号兜底（孔内序号 1 起） */
function combinedSoilDisplay(holeCode: string, s: SoilSample, holeSeq: number): string {
  return mergedSoilNumber(holeCode, s.soilNumber) || `${holeCode}-${holeSeq}`;
}

/**
 * 合并表土号列显示值（按孔内序号二分，2026-11-11 用户反馈新规则）：
 * - 孔内第 1 条土：带孔号前缀（{@link combinedSoilDisplay}，ZK1-1 / ZK2-R1）——
 *   每孔首行标孔号即可辨识归属；
 * - 其余土：改用短编号（与单孔导出同款 stripSoilNumber → -2 / -R1）——
 *   全带孔号前缀时孔号会超出列宽（出格），且满页前缀看着乱；
 * - 空土号：首样回退 `${holeCode}-${holeSeq}`，其余回退 `-${holeSeq}`（各保口径）。
 * 跨孔归属靠空白分隔行 + 每孔首行孔号辨识，语义不变。
 *
 * @param holeSeq 孔内全序号（1 起，跨页连续计，不是页内行号）
 */
function combinedSoilDisplayAt(holeCode: string, s: SoilSample, holeSeq: number): string {
  if (holeSeq === 1) return combinedSoilDisplay(holeCode, s, holeSeq);
  const short = stripSoilNumber(holeCode, s.soilNumber);
  return short ? `-${short}` : `-${holeSeq}`;
}

/**
 * 一个模式段内的装填（孔不拆页核心算法）：
 * - 当前页剩余行装得下「整孔 + 孔间分隔空行」→ 整孔接续装入（小孔拼表省纸）；
 *   孔落在已有内容的页上时，其前面先放 1 个完全空白行（用户增量需求：
 *   两孔之间空一行方便看，空行计入 23 行；每页第一个孔前不放空行）；
 * - 装不下 → 当前页收尾（不足行即自然留白），该孔另起新页；
 * - 土样 > 23 条的大孔独占 ceil(n/23) 页（自然分页，不算拆页），
 *   末页剩余行仍留给后续孔接续（只要装得下「整孔 + 分隔行」）。
 */
function fillSegment(seg: SoilRecord[]): CombinedPdfPage[] {
  const mode = seg[0].mode;
  const headerRecord = seg[0];
  // 开土日期：段内所有孔一致才显示该日期，否则留空（用户可先用批量改日期统一再导出）
  const dates = seg.map((r) => (r.engineering?.openDate ?? '').trim());
  const dateText = dates.every((d) => d === dates[0]) ? dates[0] : '';

  const pages: CombinedPdfPage[] = [];
  let cells: Record<number, string> | null = null;
  let remaining = 0;
  // 当前页是否已有内容：决定下一孔前是否放分隔空行（页首孔前不放）
  let hasContent = false;

  for (const record of seg) {
    const samples = record.samples ?? [];
    const n = samples.length;
    if (n === 0) continue; // 空孔不占页（也不产生分隔行）
    const testKeys = recordTestColumns(record).map((c) => c.key);
    const holeCode = record.engineering?.holeCode ?? '';
    // 孔间分隔空行占 1 个物理行（不写格即渲染为空白行，与现有空填充行同款）
    const sep = hasContent ? 1 : 0;

    if (n + sep <= remaining) {
      // 整孔装入当前页剩余行（基行 = 已占用行数 + 分隔行）
      const base = ROWS_PER_PAGE - remaining + sep;
      for (let i = 0; i < n; i++) {
        // 土号：孔内第 1 条带孔号前缀，其余短编号（combinedSoilDisplayAt 新规则）
        fillRow(cells as Record<number, string>, base + i, samples[i], mode, i + 1, testKeys, holeCode, combinedSoilDisplayAt(holeCode, samples[i], i + 1));
      }
      remaining -= n + sep;
      continue;
    }

    // 装不下整孔：当前页收尾，该孔整体另起新页（孔不许被拦腰拆开跨页）
    cells = null;
    remaining = 0;
    hasContent = false;
    const fullPages = Math.floor(n / ROWS_PER_PAGE);
    const tail = n % ROWS_PER_PAGE;
    for (let p = 0; p < fullPages; p++) {
      const c: Record<number, string> = {};
      for (let i = 0; i < ROWS_PER_PAGE; i++) {
        const idx = p * ROWS_PER_PAGE + i;
        // idx+1 为孔内全序号（跨页连续计），非页内行号——首样判断必须用它
        fillRow(c, i, samples[idx], mode, i + 1, testKeys, holeCode, combinedSoilDisplayAt(holeCode, samples[idx], idx + 1));
      }
      pages.push({ cells: c, mode, dateText, headerRecord });
    }
    if (tail > 0) {
      const c: Record<number, string> = {};
      for (let i = 0; i < tail; i++) {
        const idx = fullPages * ROWS_PER_PAGE + i;
        // idx+1 为孔内全序号（跨页连续计），非页内行号——续页行序号 >1 不带孔号
        fillRow(c, i, samples[idx], mode, i + 1, testKeys, holeCode, combinedSoilDisplayAt(holeCode, samples[idx], idx + 1));
      }
      pages.push({ cells: c, mode, dateText, headerRecord });
      cells = c;
      remaining = ROWS_PER_PAGE - tail; // 大孔尾页剩余行留给后续孔判断
      hasContent = true;
    }
    // tail === 0（整除）：下一孔必然装不下（remaining=0），自然另起新页
  }
  return pages;
}

/**
 * 计算多孔合并同页的分页与每页单元格取值（不依赖 DOM，便于单测）。
 *
 * 分段规则：按鉴别模式分段（A/B 表头列不同，不同模式的孔不得混表），
 * 每个模式一个序列（按模式首次出现顺序输出各段页，段内保持传入顺序）。
 *
 * 装填规则：见 {@link fillSegment}——孔不拆页，小孔拼表，大孔自然分页；
 * 孔间放 1 个空白分隔行（用户增量需求：两孔之间空一行方便看，空行计入 23 行）。
 * 土号列：每孔第 1 条带孔号前缀（mergedSoilNumber），其余短编号（-2 / -R1，
 * 2026-11-11 用户反馈：全带前缀时孔号超出列宽出格）；空土号按各自口径兜底。
 */
export function buildCombinedPdfPages(records: SoilRecord[]): CombinedPdfPages {
  // 按模式分组（保持模式首次出现顺序；组内保持传入顺序）
  const segments: SoilRecord[][] = [];
  const byMode = new Map<'A' | 'B', SoilRecord[]>();
  for (const r of records) {
    if (!r) continue;
    const arr = byMode.get(r.mode);
    if (arr) arr.push(r);
    else {
      const g = [r];
      byMode.set(r.mode, g);
      segments.push(g);
    }
  }
  const pages: CombinedPdfPage[] = [];
  for (const seg of segments) pages.push(...fillSegment(seg));
  return {
    pages,
    modes: pages.map((p) => p.mode),
    dateTexts: pages.map((p) => p.dateText),
  };
}

// ---------------------------------------------------------------------------
// 惰性加载 html2canvas / jsPDF（避免进首屏依赖图）
// ---------------------------------------------------------------------------
let _h2c: typeof import('html2canvas') | null = null;
async function getHtml2Canvas(): Promise<typeof import('html2canvas')> {
  // 分块 404（旧页面指向已删除的构建产物）时自动清缓存并刷新
  if (!_h2c) _h2c = await importWithRecovery(() => import('html2canvas'));
  return _h2c;
}

let _jspdf: typeof import('jspdf') | null = null;
async function getJsPdf(): Promise<typeof import('jspdf')> {
  if (!_jspdf) _jspdf = await importWithRecovery(() => import('jspdf'));
  return _jspdf;
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 竖排文字：逐字拆成纵向堆叠（用 <br> 换行，保持 th 为正常表格单元，避免 flex 破坏表格布局） */
function vchars(text: string): string {
  return [...text].map((c) => esc(c)).join('<br>');
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

/** 本地日期 YYYY-MM-DD（不用 toISOString，避免时区导致跨日） */
function localDateStr(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 单孔 PDF 文件名：`<开土日期>_<孔号>.pdf`。
 * - 孔号为空 → 用「未命名孔」兜底；
 * - 日期为空 → 只写孔号（如 `ZK1.pdf`）；
 * - 两者都为空 → `未命名孔.pdf`；
 * - 孔号/日期中的非法字符替换为 `-`。
 */
export function buildSinglePdfFileName(record: SoilRecord): string {
  // 显式传 fallback=''：空日期/空孔号由本函数按 PDF 规则统一兜底
  const date = sanitizeFileNamePart(record?.engineering?.openDate ?? '', '');
  const hole = sanitizeFileNamePart(record?.engineering?.holeCode ?? '', '');
  const base = date ? `${date}_${hole || '未命名孔'}` : hole || '未命名孔';
  return `${base}.pdf`;
}

/**
 * 多孔合并 PDF 文件名：`开土记录_<N>孔_<当天日期>.pdf`。
 * 单孔时与 {@link buildSinglePdfFileName} 保持一致（便于调用方统一处理）。
 *
 * @param today 可注入的当天日期（YYYY-MM-DD），便于单测
 */
export function buildMergedPdfFileName(records: SoilRecord[], today?: string): string {
  const count = records?.length ?? 0;
  if (count === 1) return buildSinglePdfFileName(records[0]);
  const day = sanitizeFileNamePart(today || localDateStr(), '') || localDateStr();
  return `开土记录_${count}孔_${day}.pdf`;
}

/** 兼容旧调用：单孔文件名规则 */
function buildPdfFileName(record: SoilRecord): string {
  return buildSinglePdfFileName(record);
}

// ---------------------------------------------------------------------------
// HTML 模板渲染（DOM，仅导出时运行）
// ---------------------------------------------------------------------------
/** 信息行第二排的基线（pt）与字号（pt）——同排所有文本共用，保证垂直对齐 */
const INFO_LINE_TOP_PT = 130.8;
const INFO_LINE_FONT_PT = 11.1;
/**
 * 日期组（开土日期标签 + 年/月/日）整体相对模板原坐标的左移量。
 * 2026-11-02 用户反馈：日期组右移后「日」字（原 1170.8pt 起）超出表格右缘
 * （TABLE_LEFT 48.6 + TABLE_WIDTH 1109 = 1157.6pt）。左移 24.4pt 后
 * 「日」右缘 = 1146.4 + 11.1 ≈ 1157.5pt，正好贴齐表格右缘不越界。
 */
const INFO_DATE_SHIFT_PT = 24.4;
/**
 * 「开土日期 + 年份」右对齐框：右缘 = 「年」字左缘，宽度 126.4pt。
 * 标签与年份同框，右对齐后年份右缘自动贴住「年」字。
 */
const INFO_YEAR_LEFT_PT = 978.4 - INFO_DATE_SHIFT_PT;
const INFO_YEAR_RIGHT_PT = 1104.8 - INFO_DATE_SHIFT_PT;
const INFO_YEAR_WIDTH_PT = 126.4;

/**
 * @param dateText 合并表模式：覆盖信息行的开土日期（段内所有孔一致 → 该日期，
 *                 不一致 → '' 只画「开土日期」标签供手填）；
 *                 不传（undefined）时保持单孔行为：取记录自身 openDate
 */
function renderInfoLine(eng: SoilRecord['engineering'], dateText?: string): string {
  const openDate = dateText !== undefined ? dateText : (eng.openDate ?? '');
  const parts = openDate.trim().split('-');
  const y = parts[0] ?? '';
  const m = parts[1] ?? '';
  const d = parts[2] ?? '';
  const txt = (leftPt: number, html: string): string =>
    `<div class="pdf-txt" style="left:${px(leftPt)}px;top:${px(INFO_LINE_TOP_PT)}px;font-size:${px(INFO_LINE_FONT_PT)}px;">${html}</div>`;
  // 「开土日期」标签与年份同框并右对齐（2026-11-02 用户反馈：标签离年份太远）。
  // 年份位数固定 4 位，右对齐后年份右缘正好落在框右缘 = 「年」字左缘，
  // 标签紧贴年份左侧，不再与年份之间出现大段空白。
  // 年份为空时（批量改日期允许留空）仍把标签放在框左缘，避免错位。
  const yearBox = (year: string): string => {
    const boxStyle = `left:${px(INFO_YEAR_LEFT_PT)}px;top:${px(INFO_LINE_TOP_PT)}px;`;
    if (!year) {
      return `<div class="pdf-txt" style="${boxStyle}font-size:${px(INFO_LINE_FONT_PT)}px;">开土日期</div>`;
    }
    return `<div class="pdf-txt" style="${boxStyle}width:${px(INFO_YEAR_WIDTH_PT)}px;text-align:right;font-size:${px(INFO_LINE_FONT_PT)}px;">开土日期${esc(year)}</div>`;
  };
  return `
    ${txt(54, `工程编号：${esc(eng.projectCode ?? '')}`)}
    ${txt(494.6, `孔号：${esc(eng.holeCode ?? '')}`)}
    ${txt(673.4, `孔口标高${esc(eng.holeElevation ?? '')}`)}
    ${txt(742.2, 'm')}
    ${yearBox(y)}
    ${txt(INFO_YEAR_RIGHT_PT, '年')}
    ${txt(1122 - INFO_DATE_SHIFT_PT, esc(m))}
    ${txt(1137.8 - INFO_DATE_SHIFT_PT, '月')}
    ${txt(1153 - INFO_DATE_SHIFT_PT, esc(d))}
    ${txt(1170.8 - INFO_DATE_SHIFT_PT, '日')}`;
}

/**
 * 渲染页眉固定文字（公司名 / 标题 / 版本行 / 文件编号 / 工程信息行）。
 *
 * 版本行与文件编号由「CMA 设置」维护（全局、持久化），导出时传入；
 * 两者按页边可用宽度自动收窄字号，自定义文本变长时不会越出纸边。
 * 导出为纯函数以便回归测试直接检查 HTML。
 *
 * @param dateText 合并表模式的信息行开土日期覆盖（见 {@link renderInfoLine}）；
 *                 不传时行为不变
 */
export function renderHeaderTexts(
  record: SoilRecord,
  header: CmaHeaderSettings = CMA_DEFAULT,
  dateText?: string,
): string {
  const eng = record.engineering;
  // 可用宽度：页面右边距约 1190.7pt，减去各自左边距并留 8pt 余量
  const versionFs = fitHeaderFontSize(header.versionLine, 9, 1190.7 - 8 - 934.8);
  const codeFs = fitHeaderFontSize(header.docCode, 10.4, 1190.7 - 8 - 1035.8);
  return `
    <div class="pdf-txt" style="left:${px(70.8)}px;top:${px(44.9)}px;font-size:${px(9)}px;">天津市水务规划勘测设计有限公司</div>
    <div class="pdf-txt" style="left:${px(934.8)}px;top:${px(44.9)}px;font-size:${px(versionFs)}px;">${esc(header.versionLine)}</div>
    <div class="pdf-txt" style="left:${px(550.2)}px;top:${px(73.5)}px;font-size:${px(18)}px;font-weight:bold;">开土记录表</div>
    <div class="pdf-txt" style="left:${px(1035.8)}px;top:${px(94.4)}px;font-size:${px(codeFs)}px;">${esc(header.docCode)}</div>
    ${renderInfoLine(eng, dateText)}`;
}

function renderFooter(pageIndex: number, totalPages: number): string {
  const top = px(794);
  const fsBig = px(12);
  const fsSmall = px(9);
  return `
    <div class="pdf-txt" style="left:${px(154.8)}px;top:${top}px;font-size:${fsBig}px;">记录者：</div>
    <div class="pdf-txt" style="left:${px(630.4)}px;top:${top}px;font-size:${fsBig}px;">开土人：</div>
    <div class="pdf-txt" style="left:${px(1015.8)}px;top:${top}px;font-size:${fsSmall}px;">第</div>
    <div class="pdf-txt" style="left:${px(1032)}px;top:${top}px;font-size:${fsSmall}px;">${pageIndex}</div>
    <div class="pdf-txt" style="left:${px(1051.8)}px;top:${top}px;font-size:${fsSmall}px;">页</div>
    <div class="pdf-txt" style="left:${px(1074.4)}px;top:${top}px;font-size:${fsSmall}px;">共</div>
    <div class="pdf-txt" style="left:${px(1090)}px;top:${top}px;font-size:${fsSmall}px;">${totalPages}</div>
    <div class="pdf-txt" style="left:${px(1110.4)}px;top:${top}px;font-size:${fsSmall}px;">页</div>`;
}

/** 跨两带的整高表头单元格（rowspan=2）；vertical=true 表示竖排文字。
 *  竖排格加 pdf-hbig 放大到表头字号；土号/野外记录横排窄格保持基准 9pt */
function wholeHeightHeader(text: string, vertical: boolean): string {
  if (vertical) {
    return `<th class="pdf-th pdf-whole pdf-vlabel pdf-hbig" rowspan="2">${vchars(text)}</th>`;
  }
  return `<th class="pdf-th pdf-whole" rowspan="2">${esc(text)}</th>`;
}

/** 渲染单页表格 HTML（导出供预览/QA 脚本复用） */
export function renderTable(page: PdfPage, record: SoilRecord): string {  const mode = record.mode;
  const soilType = soilTypeOptions(mode);
  const subH = SUB_ROW_H_PT[mode];
  const colDefs = COL_WIDTHS_PT.map((w) => `<col style="width:${w * PT}px"/>`).join('');

  const groupRow = `
    <tr class="pdf-grouprow">
      ${wholeHeightHeader('土号', false)}
      ${wholeHeightHeader('野外记录', false)}
      ${wholeHeightHeader('取样深度', true)}
      ${wholeHeightHeader('取样标高', true)}
      ${wholeHeightHeader('颜色', true)}
      ${wholeHeightHeader('气味', true)}
      <th class="pdf-th pdf-hbig" colspan="6">目力鉴别土类</th>
      ${wholeHeightHeader('夹杂物', true)}
      ${wholeHeightHeader('扰动土', true)}
      <th class="pdf-th pdf-hbig" colspan="17">土样情况</th>
      <th class="pdf-th pdf-hbig" colspan="8">要求实验项目</th>
    </tr>`;

  const subRow = `
    <tr class="pdf-subrow">
      ${soilType.map((t) => `<th class="pdf-th pdf-vlabel pdf-vsmall">${vchars(t)}</th>`).join('')}
      ${INCLUSIONS.map((t) => `<th class="pdf-th pdf-vlabel pdf-vsmall">${vchars(t)}</th>`).join('')}
      ${SOIL_STATES.map((t) => `<th class="pdf-th pdf-vlabel pdf-vsmall">${vchars(t)}</th>`).join('')}
      <th class="pdf-th pdf-vlabel pdf-vsmall">${vchars('备注')}</th>
      ${recordTestColumns(record)
        .map((c) => `<th class="pdf-th pdf-vlabel pdf-vtest">${vchars(c.label)}</th>`)
        .join('')}
    </tr>`;

  const dataRows: string[] = [];
  for (let r = 0; r < ROWS_PER_PAGE; r++) {
    const tds: string[] = [];
    for (let c = 1; c <= TOTAL_COLS; c++) {
      const v = page.cells[cellKey(r, c)] ?? '';
      tds.push(`<td class="pdf-td">${esc(v)}</td>`);
    }
    dataRows.push(`<tr class="pdf-datarow">${tds.join('')}</tr>`);
  }

  const tableCss = `
    .pdf-table{position:absolute;left:${px(TABLE_LEFT_PT)}px;top:${px(TABLE_TOP_PT)}px;
      width:${TABLE_WIDTH_PT * PT}px;border-collapse:collapse;table-layout:fixed;}
    .pdf-table *{box-sizing:border-box;}
    .pdf-th,.pdf-td{border:1px solid #000;margin:0;padding:0;text-align:center;
      vertical-align:middle;font-size:${px(9)}px;line-height:1.05;overflow:hidden;white-space:nowrap;}
    .pdf-th{font-weight:bold;background:#fff;}
    .pdf-grouprow th{height:${px(GROUP_ROW_H_PT)}px;}
    .pdf-subrow th{height:${px(subH)}px;}
    .pdf-datarow td{height:${px(DATA_ROW_H_PT)}px;}
    .pdf-whole{font-weight:bold;}
    .pdf-vlabel{white-space:normal;line-height:1.05;}
    .pdf-vsmall{font-size:${px(HEADER_FONT_PT)}px;}
    /* 表头放大统一 15pt（2026-11-02）：pdf-hbig 覆盖分组行 + 整高竖排标题，
       vsmall 为子项带竖排标题，vtest 为要求实验项目 8 列；
       土号/野外记录横排窄格不加 hbig，保持基准 9pt（列宽不足会裁字） */
    .pdf-hbig{font-size:${px(HEADER_FONT_PT)}px;}
    .pdf-vtest{font-size:${px(HEADER_FONT_PT)}px;}`;

  return `
    <style>${tableCss}</style>
    <table class="pdf-table">
      <colgroup>${colDefs}</colgroup>
      <thead>${groupRow}${subRow}</thead>
      <tbody>${dataRows.join('')}</tbody>
    </table>`;
}

/** 生成单页 DOM（离屏），含表头文字、表格、页脚；
 *  dateText 为合并表模式的信息行开土日期覆盖（不传时单孔行为不变） */
function buildPageElement(
  page: PdfPage,
  record: SoilRecord,
  pageIndex: number,
  totalPages: number,
  header: CmaHeaderSettings,
  dateText?: string,
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pdf-page';
  el.style.cssText =
    `position:absolute;left:-100000px;top:0;width:${PAGE_W_PX}px;height:${PAGE_H_PX}px;` +
    `overflow:hidden;background:#fff;color:#000;font-family:'SimSun','宋体',serif;`;
  const pageCss = `
    .pdf-page *{box-sizing:border-box;}
    .pdf-txt{position:absolute;white-space:nowrap;box-sizing:border-box;}`;
  el.innerHTML =
    `<style>${pageCss}</style>` +
    renderHeaderTexts(record, header, dateText) +
    renderTable(page, record) +
    renderFooter(pageIndex, totalPages);
  return el;
}

/** 渲染前对数据单元格做溢出缩小字号（重点第 1 列土号），不改列宽行高 */
function shrinkOverflow(root: HTMLElement): void {
  const cells = root.querySelectorAll<HTMLElement>('.pdf-td');
  cells.forEach((cell) => {
    if (cell.scrollWidth > cell.clientWidth + 1) {
      let fs = 12; // 起始 9pt
      while (fs > 8 && cell.scrollWidth > cell.clientWidth + 1) {
        fs -= 0.5;
        cell.style.fontSize = `${fs}px`;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// 导出入口
// ---------------------------------------------------------------------------
/** 批量导出 PDF 的可选项 */
export interface RecordsPdfOptions {
  /**
   * 多孔合并同页（小孔拼表省纸）：
   * - 相同鉴别模式的孔拼入同一张 23 行表（不同模式表头列不同，不混表）；
   * - 孔不拆页：剩余行装不下整孔时该孔整体另起新页；
   * - 土号：每孔第 1 条带孔号前缀（ZK1-1 / ZK2-R1）辨识归属，
   *   其余土用短编号（-2 / -R1，与单孔导出同款）——全带前缀时孔号会出格；
   * - 缺省 / false → 现有行为（每孔从新页开始），逐字不变。
   */
  combine?: boolean;
}

/**
 * 生成多记录 PDF Blob（不触发下载）。
 *
 * 分页策略（combine=false / 缺省，现状不变）：
 * - 每条记录按自身 23 行/页分页（页脚「第 X 页 / 共 Y 页」仍为孔内页码）；
 * - 记录之间直接接续，不插入空白页，仅在新一页前调用一次 `pdf.addPage()`。
 * 因此总页数 = 各记录页数之和，页序与传入顺序一致。
 *
 * combine=true（多孔合并同页）：按 {@link buildCombinedPdfPages} 分段装填，
 * 同模式孔拼入同一张表，页脚页码为合并后的全局页码。
 */
export async function buildRecordsPdfBlob(
  records: SoilRecord[],
  header: CmaHeaderSettings = CMA_DEFAULT,
  opts: RecordsPdfOptions = {},
): Promise<Blob> {
  const html2canvas = (await getHtml2Canvas()).default;
  const { jsPDF } = await getJsPdf();

  const pdf = new jsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape' });
  let hasPage = false;

  if (opts.combine) {
    // 多孔合并同页：先整体算好分页（纯函数），再逐页渲染；
    // 页眉信息行用该段第一条记录 + 段内统一日期（不一致留空）
    const combined = buildCombinedPdfPages(records);
    const totalPages = combined.pages.length;
    for (let i = 0; i < totalPages; i++) {
      const p = combined.pages[i];
      const el = buildPageElement(p, p.headerRecord, i + 1, totalPages, header, p.dateText);
      document.body.appendChild(el);
      shrinkOverflow(el);
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#fff',
        width: PAGE_W_PX,
        height: PAGE_H_PX,
        windowWidth: PAGE_W_PX,
        windowHeight: PAGE_H_PX,
      });
      document.body.removeChild(el);
      const img = canvas.toDataURL('image/jpeg', 0.95);
      if (hasPage) pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, 0, 420, 297);
      hasPage = true;
    }
    return pdf.output('blob');
  }

  for (const record of records) {
    const pages = buildPdfPages(record);
    const totalPages = pages.length;
    for (let i = 0; i < totalPages; i++) {
      const el = buildPageElement(pages[i], record, i + 1, totalPages, header);
      document.body.appendChild(el);
      shrinkOverflow(el);
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#fff',
        width: PAGE_W_PX,
        height: PAGE_H_PX,
        windowWidth: PAGE_W_PX,
        windowHeight: PAGE_H_PX,
      });
      document.body.removeChild(el);
      const img = canvas.toDataURL('image/jpeg', 0.95);
      if (hasPage) pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, 0, 420, 297);
      hasPage = true;
    }
  }

  return pdf.output('blob');
}

/** 生成单记录 PDF Blob（不触发下载），便于测试与复用；header 为 CMA 页眉设置 */
export async function buildRecordPdfBlob(
  record: SoilRecord,
  header: CmaHeaderSettings = CMA_DEFAULT,
): Promise<Blob> {
  return buildRecordsPdfBlob([record], header);
}

/**
 * 把 PDF Blob 交付给用户：
 * - 原生端：写入文档目录后用系统分享菜单导出；
 * - Web：浏览器下载。
 * 单孔导出与多孔合并导出共用，避免两套复制粘贴的逻辑漂移。
 */
async function deliverPdfBlob(blob: Blob, fileName: string): Promise<ExportResult> {
  if (Capacitor.isNativePlatform()) {
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = uint8ToBase64(new Uint8Array(arrayBuffer));
    const fsResult = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Documents,
    });
    try {
      await Share.share({ title: '开土记录表', text: '开土记录表 PDF 导出', files: [fsResult.uri] });
    } catch {
      // 用户取消分享或无可分享目标，文件已保存
    }
    return { success: true, message: `已生成并保存到文档目录：${fileName}`, path: fsResult.uri };
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 立即 revoke 在部分浏览器会中断大文件下载，延后释放更稳妥
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { success: true, message: `已导出 ${fileName}（浏览器下载）` };
}

/**
 * 导出用开土日期覆盖（纯函数）：填写日期时克隆记录并统一 engineering.openDate，
 * 不改动调用方传入的原记录；留空原样返回。
 */
export function withOpenDate(records: SoilRecord[], openDate: string): SoilRecord[] {
  const d = (openDate ?? '').trim();
  if (!d) return records;
  return records.map((r) => ({
    ...r,
    engineering: { ...r.engineering, openDate: d },
  }));
}

/**
 * 批量导出 PDF：
 * - 1 个记录 → 单文件，命名为 `<开土日期>_<孔号>.pdf`；
 * - >1 个记录 → 合并为一个 PDF，命名为 `开土记录_<N>孔_<当天日期>.pdf`。
 * - openDateOverride 非空时：本次导出的所有记录开土日期（页内工程信息行）
 *   与文件名日期统一使用该日期（仅影响本次导出，不改动存储的记录）。
 * - opts.combine=true 时启用「多孔合并同页」（见 {@link RecordsPdfOptions}）。
 */
export async function exportRecordsPdf(
  records: SoilRecord[],
  header: CmaHeaderSettings = CMA_DEFAULT,
  openDateOverride = '',
  opts: RecordsPdfOptions = {},
): Promise<ExportResult> {
  if (!records || records.length === 0) {
    return { success: false, message: '没有选择要导出的孔' };
  }
  try {
    const stamped = withOpenDate(records, openDateOverride);
    const merged = stamped.length > 1;
    const fileName = merged
      ? buildMergedPdfFileName(stamped, openDateOverride.trim() || undefined)
      : buildSinglePdfFileName(stamped[0]);
    const blob = await buildRecordsPdfBlob(stamped, header, opts);
    const result = await deliverPdfBlob(blob, fileName);
    if (result.success && merged) {
      return { ...result, message: `${result.message}（${stamped.length} 个孔已合并为一个 PDF）` };
    }
    return result;
  } catch (e: any) {
    return { success: false, message: 'PDF 导出失败：' + (e?.message ?? String(e)) };
  }
}

/**
 * 生成并导出单孔 PDF（A3 横向，单孔成页，超 23 行另起页）。
 * - header 为 CMA 页眉设置（版本行 / 文件编号），由调用方从持久化设置传入。
 * - 原生端：写入文档目录后用系统分享菜单导出。
 * - Web：浏览器下载。
 */
export async function exportRecordPdf(
  record: SoilRecord,
  header: CmaHeaderSettings = CMA_DEFAULT,
): Promise<ExportResult> {
  try {
    const blob = await buildRecordPdfBlob(record, header);
    return await deliverPdfBlob(blob, buildPdfFileName(record));
  } catch (e: any) {
    return { success: false, message: 'PDF 导出失败：' + (e?.message ?? String(e)) };
  }
}
