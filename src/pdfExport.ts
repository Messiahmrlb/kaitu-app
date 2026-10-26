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
  TEST_ITEMS,
  soilTypeOptions,
} from './constants';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { ExportResult } from './xlsxExport';
import { importWithRecovery } from './pwaRecovery';
import { CMA_DEFAULT, CmaHeaderSettings, fitHeaderFontSize } from './cmaHeader';

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

/** 单元格键：行(0..22)与列(1..39)编码为唯一整数，便于 QA 单测查值 */
const cellKey = (row: number, col: number): number => row * 1000 + col;

// ---------------------------------------------------------------------------
// 纯函数：buildPdfPages（不依赖 DOM，便于单测）
// ---------------------------------------------------------------------------
export interface PdfPage {
  /** 单元格映射：key = cellKey(row,col)，row 0..22，col 1..39 */
  cells: Record<number, string>;
}

/** 把一条土样按 39 列数据映射写入某页某行的单元格；seq 为该土样在全记录中的序号（1 起） */
function fillRow(cells: Record<number, string>, row: number, s: SoilSample, mode: 'A' | 'B', seq: number): void {
  const set = (col: number, v: string): void => {
    cells[cellKey(row, col)] = v;
  };
  const soilType = soilTypeOptions(mode);
  // 土号列：按全记录顺序输出 -1, -2 …（不含孔号前缀，与纸质开土记录表一致）
  set(1, `-${seq}`);
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
  for (let i = 0; i < TEST_ITEMS.length; i++) {
    set(32 + i, s.testItems.includes(TEST_ITEMS[i]) ? '√' : '');
  }
  // IL / Ip / 粉砂判定 / 额外试验项目 一律不出现在 PDF
}

/**
 * 计算 PDF 分页与每页单元格取值（不依赖 DOM，便于单测）。
 * 每页固定 23 行；土样超过 23 条则另起新页；不足 23 行补空行。
 */
export function buildPdfPages(record: SoilRecord): PdfPage[] {
  const samples = record.samples ?? [];
  const totalPages = Math.max(1, Math.ceil(samples.length / ROWS_PER_PAGE));
  const pages: PdfPage[] = [];
  for (let p = 0; p < totalPages; p++) {
    const cells: Record<number, string> = {};
    for (let r = 0; r < ROWS_PER_PAGE; r++) {
      const s = samples[p * ROWS_PER_PAGE + r];
      if (s) fillRow(cells, r, s, record.mode, p * ROWS_PER_PAGE + r + 1);
    }
    pages.push({ cells });
  }
  return pages;
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

/** 文件名：<开土日期>_<孔号>.pdf，都为空时用「开土记录」兜底 */
function buildPdfFileName(record: SoilRecord): string {
  const d = (record.engineering.openDate ?? '').trim();
  const h = (record.engineering.holeCode ?? '').trim();
  const prefix = [d, h].filter(Boolean).join('_');
  return `${prefix || '开土记录'}.pdf`;
}

// ---------------------------------------------------------------------------
// HTML 模板渲染（DOM，仅导出时运行）
// ---------------------------------------------------------------------------
function renderInfoLine(eng: SoilRecord['engineering']): string {
  const parts = (eng.openDate ?? '').trim().split('-');
  const y = parts[0] ?? '';
  const m = parts[1] ?? '';
  const d = parts[2] ?? '';
  const txt = (leftPt: number, html: string): string =>
    `<div class="pdf-txt" style="left:${px(leftPt)}px;top:${px(130.8)}px;font-size:${px(11.1)}px;">${html}</div>`;
  return `
    ${txt(54, `工程编号：${esc(eng.projectCode ?? '')}`)}
    ${txt(494.6, `孔号：${esc(eng.holeCode ?? '')}`)}
    ${txt(673.4, `孔口标高${esc(eng.holeElevation ?? '')}`)}
    ${txt(742.2, 'm')}
    ${txt(978.4, `开土日期${esc(y)}`)}
    ${txt(1104.8, '年')}
    ${txt(1122, esc(m))}
    ${txt(1137.8, '月')}
    ${txt(1153, esc(d))}
    ${txt(1170.8, '日')}`;
}

/**
 * 渲染页眉固定文字（公司名 / 标题 / 版本行 / 文件编号 / 工程信息行）。
 *
 * 版本行与文件编号由「CMA 设置」维护（全局、持久化），导出时传入；
 * 两者按页边可用宽度自动收窄字号，自定义文本变长时不会越出纸边。
 * 导出为纯函数以便回归测试直接检查 HTML。
 */
export function renderHeaderTexts(
  record: SoilRecord,
  header: CmaHeaderSettings = CMA_DEFAULT,
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
    ${renderInfoLine(eng)}`;
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

/** 跨两带的整高表头单元格（rowspan=2）；vertical=true 表示竖排文字 */
function wholeHeightHeader(text: string, vertical: boolean): string {
  if (vertical) {
    return `<th class="pdf-th pdf-whole pdf-vlabel" rowspan="2">${vchars(text)}</th>`;
  }
  return `<th class="pdf-th pdf-whole" rowspan="2">${esc(text)}</th>`;
}

function renderTable(page: PdfPage, record: SoilRecord): string {
  const mode = record.mode;
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
      <th class="pdf-th" colspan="6">目力鉴别土类</th>
      ${wholeHeightHeader('夹杂物', true)}
      ${wholeHeightHeader('扰动土', true)}
      <th class="pdf-th" colspan="17">土样情况</th>
      <th class="pdf-th" colspan="8">要求实验项目</th>
    </tr>`;

  const subRow = `
    <tr class="pdf-subrow">
      ${soilType.map((t) => `<th class="pdf-th pdf-vlabel pdf-vsmall">${vchars(t)}</th>`).join('')}
      ${INCLUSIONS.map((t) => `<th class="pdf-th pdf-vlabel pdf-vsmall">${vchars(t)}</th>`).join('')}
      ${SOIL_STATES.map((t) => `<th class="pdf-th pdf-vlabel pdf-vsmall">${vchars(t)}</th>`).join('')}
      <th class="pdf-th pdf-vlabel pdf-vsmall">${vchars('备注')}</th>
      ${TEST_ITEMS.map((t) => `<th class="pdf-th pdf-vlabel pdf-vsmall">${vchars(t)}</th>`).join('')}
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
    .pdf-vsmall{font-size:${px(9)}px;}`;

  return `
    <style>${tableCss}</style>
    <table class="pdf-table">
      <colgroup>${colDefs}</colgroup>
      <thead>${groupRow}${subRow}</thead>
      <tbody>${dataRows.join('')}</tbody>
    </table>`;
}

/** 生成单页 DOM（离屏），含表头文字、表格、页脚 */
function buildPageElement(
  page: PdfPage,
  record: SoilRecord,
  pageIndex: number,
  totalPages: number,
  header: CmaHeaderSettings,
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pdf-page';
  el.style.cssText =
    `position:absolute;left:-100000px;top:0;width:${PAGE_W_PX}px;height:${PAGE_H_PX}px;` +
    `overflow:hidden;background:#fff;color:#000;font-family:'SimSun','宋体',serif;`;
  const pageCss = `
    .pdf-page *{box-sizing:border-box;}
    .pdf-txt{position:absolute;white-space:nowrap;}`;
  el.innerHTML =
    `<style>${pageCss}</style>` +
    renderHeaderTexts(record, header) +
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
/** 生成 PDF Blob（不触发下载），便于测试与复用；header 为 CMA 页眉设置 */
export async function buildRecordPdfBlob(
  record: SoilRecord,
  header: CmaHeaderSettings = CMA_DEFAULT,
): Promise<Blob> {
  const pages = buildPdfPages(record);
  const totalPages = pages.length;
  const html2canvas = (await getHtml2Canvas()).default;
  const { jsPDF } = await getJsPdf();

  const pdf = new jsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape' });
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
    if (i > 0) pdf.addPage();
    pdf.addImage(img, 'JPEG', 0, 0, 420, 297);
  }

  return pdf.output('blob');
}

/**
 * 生成并导出 PDF（A3 横向，单孔成页，超 23 行另起页）。
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
    const fileName = buildPdfFileName(record);

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
    URL.revokeObjectURL(url);
    return { success: true, message: `已导出 ${fileName}（浏览器下载）` };
  } catch (e: any) {
    return { success: false, message: 'PDF 导出失败：' + (e?.message ?? String(e)) };
  }
}
