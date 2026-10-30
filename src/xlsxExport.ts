import type ExcelJS from 'exceljs';
import { Capacitor } from '@capacitor/core';
import { importWithRecovery } from './pwaRecovery';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SoilRecord } from './types';
import { buildXlsxFileName } from './exportNaming';
import {
  SOIL_TYPE_A,
  SOIL_TYPE_B,
  INCLUSIONS,
  SOIL_STATES,
  TEST_ITEMS,
  recordTestColumns,
  siltySandSymbol,
} from './constants';

/**
 * xlsx 电子表格生成与导出（替代原 docx 导出）
 *
 * 还原示例「开土记录表.docx」的表格结构：
 *   行1  标题「开土记录表」
 *   行2  工程信息（工程编号 / 孔号 / 孔口标高(m) / 开土日期）合并为 4 组
 *   行3  列标题行（土号 / 野外记录 / 取样深度 / 取样标高 / 颜色 / 气味 /
 *         目力鉴别土类[合并] / 夹杂物[合并] / 土样情况[合并] / 要求实验项目[合并]）
 *   行4  子项展开行（目力鉴别土类各土名 / 夹杂物各子项 / 土样情况各子项+备注 / 实验项目各子项）
 *   行5+ 每条土样一行
 *
 * 「目力鉴别土类」列按记录 mode 显示对应土名（A 或 B）。
 * 液性指数 IL、塑性指数 Ip 不写入表格（仅 App 内显示/保存）。
 *
 * 页面设置：A3 横向、冻结表头（前 4 行）、列宽适配。
 *
 * 另含 4 个附属工作表：液性指数_塑性指数_粉砂判定、颗分统计、渗透统计、
 * 额外试验项目（仅当存在送样单未知试验项目时生成，列名即录入时的未知项目名称）。
 */

/**
 * exceljs 体积大（~1.5MB）且在浏览器端仅在「导出」时才需要，
 * 故改为动态导入，避免其进入首屏依赖图（可规避 Vite 预打包大体积
 * CJS 依赖时偶发的 504 Outdated Optimize Dep / MIME 拦截导致白屏）。
 * 用惰性单例缓存，多次导出只加载一次。
 */
let _exceljs: typeof import('exceljs') | null = null;
async function getExcelJS(): Promise<typeof import('exceljs')> {
  // 分块 404（旧页面指向已删除的构建产物）时自动清缓存并刷新
  if (!_exceljs)
    _exceljs = (await importWithRecovery(() => import('exceljs'))).default as typeof import('exceljs');
  return _exceljs;
}

/** 中文字体 */
const FONT = '宋体';
/** 表头填充色（浅灰） */
const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF2F2F2' } };


/** Uint8Array -> base64（原生端写文件用） */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

/** 统一单元格样式：居中/边框/可选加粗与填充 */
function styleCell(
  cell: ExcelJS.Cell,
  opts: { bold?: boolean; align?: 'left' | 'center' | 'right'; fill?: boolean; size?: number } = {},
): void {
  cell.alignment = { horizontal: opts.align ?? 'center', vertical: 'middle', wrapText: true };
  cell.font = { name: FONT, bold: opts.bold ?? false, size: opts.size ?? 10 };
  if (opts.fill) cell.fill = HEADER_FILL;
  cell.border = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } },
  };
}

/**
 * 生成文件名：<工程编号>_<孔号>_开土记录表.xlsx
 * 片段清洗规则与 PDF 共用 exportNaming（非法字符 → `-`），
 * 避免 Excel 文件名含 `/`、`:` 等被系统/浏览器截断。
 */
function buildFileName(record: SoilRecord): string {
  return buildXlsxFileName(record);
}

/** 组装工作簿（纯逻辑，不依赖平台，便于测试） */
export async function buildWorkbook(
  record: SoilRecord,
  XL: typeof import('exceljs'),
): Promise<ExcelJS.Workbook> {
  const soilType = record.mode === 'A' ? SOIL_TYPE_A : SOIL_TYPE_B;
  const eng = record.engineering;
  // 试验列（固结/剪切两列显示名可按记录覆盖，见 testHeader / constants.recordTestColumns）
  const testCols = recordTestColumns(record);

  const wb = new XL.Workbook();
  wb.creator = '开土记录录入';
  wb.lastModifiedBy = '开土记录录入';

  // ====================================================================
  // 主表：开土记录表（严格贴合原始 40 列空表结构）
  // ====================================================================
  const ws = wb.addWorksheet('开土记录表');

  // ---- 列宽（固定 40 列，按各组宽度数组拼接）----
  const widths: number[] = [10, 18, 10, 10, 8, 8]; // 1-6 基础列
  for (let i = 0; i < 7; i++) widths.push(9); // 7-13  目力鉴别土类（第12列留空）
  for (let i = 0; i < 13; i++) widths.push(9); // 14-26 夹杂物（含第15列扰动土）
  for (let i = 0; i < 6; i++) widths.push(8); // 27-32 土样情况（含第32列备注）
  for (let i = 0; i < 8; i++) widths.push(9); // 33-40 要求实验项目
  ws.columns = widths.map((w) => ({ width: w }));

  const TOTAL = widths.length; // 40

  // ---- 固定列号（与原始 40 列空表一致）----
  const BASE = 6;
  const SOIL_TYPE_GROUP: [number, number] = [7, 13];
  const SOIL_TYPE_SUB_COLS = [7, 8, 9, 10, 11, 13]; // 第 12 列留空
  const INCL_GROUP: [number, number] = [14, 26];
  const DISTURBANCE_COL = 15; // 扰动土标记列
  const INCL_SUB_COLS = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
  const STATE_GROUP: [number, number] = [27, 32];
  const STATE_SUB_COLS = [27, 28, 29, 30, 31];
  const STATE_NOTE_COL = 32; // 备注
  const TEST_GROUP: [number, number] = [33, 40];
  const TEST_SUB_COLS = [33, 34, 35, 36, 37, 38, 39, 40];

  const TITLE_ROW = 1;
  const INFO_ROW = 2;
  const HEAD_ROW = 3;
  const SUB_ROW = 4;
  const FIRST_DATA_ROW = 5;

  // ---- 行1：标题（整行合并，美观）----
  {
    const cell = ws.getCell(TITLE_ROW, 1);
    cell.value = '开土记录表';
    styleCell(cell, { bold: true, size: 16, align: 'center' });
    ws.mergeCells(TITLE_ROW, 1, TITLE_ROW, TOTAL);
  }

  // ---- 行2：工程信息（每组合并成一格，美观；分组仍对应原表列）----
  const infoFields = [
    `工程编号：${eng.projectCode}`,
    `孔号：${eng.holeCode}`,
    `孔口标高(m)：${eng.holeElevation}`,
    `开土日期(年/月/日)：${eng.openDate}`,
  ];
  const infoGroupSize = Math.ceil(TOTAL / 4);
  for (let g = 0; g < 4; g++) {
    const s = g * infoGroupSize + 1;
    const e = Math.min(TOTAL, (g + 1) * infoGroupSize);
    const cell = ws.getCell(INFO_ROW, s);
    cell.value = infoFields[g];
    styleCell(cell, { bold: false, align: 'left', fill: true, size: 11 });
    ws.mergeCells(INFO_ROW, s, INFO_ROW, e);
  }

  // ---- 行3：列标题行（分组名写入分组内每一列，不合并，贴合原表）----
  const headLabels = ['土号', '野外记录', '取样深度', '取样标高', '颜色', '气味'];
  for (let c = 1; c <= BASE; c++) {
    const cell = ws.getCell(HEAD_ROW, c);
    cell.value = headLabels[c - 1];
    styleCell(cell, { bold: true, fill: true });
  }
  const fillGroupLabel = (s: number, e: number, label: string) => {
    for (let c = s; c <= e; c++) {
      const cell = ws.getCell(HEAD_ROW, c);
      cell.value = label;
      styleCell(cell, { bold: true, fill: true });
    }
  };
  fillGroupLabel(SOIL_TYPE_GROUP[0], SOIL_TYPE_GROUP[1], '目力鉴别土类');
  fillGroupLabel(INCL_GROUP[0], INCL_GROUP[1], '夹杂物');
  fillGroupLabel(STATE_GROUP[0], STATE_GROUP[1], '土样情况');
  fillGroupLabel(TEST_GROUP[0], TEST_GROUP[1], '要求实验项目');

  // ---- 行4：子项展开行（先给所有列加边框/填充，再填标签）----
  for (let c = 1; c <= TOTAL; c++) {
    styleCell(ws.getCell(SUB_ROW, c), { fill: true });
  }
  SOIL_TYPE_SUB_COLS.forEach((c, i) => {
    ws.getCell(SUB_ROW, c).value = soilType[i];
  });
  ws.getCell(SUB_ROW, DISTURBANCE_COL).value = '扰动土'; // 第15列
  INCL_SUB_COLS.forEach((c, i) => {
    ws.getCell(SUB_ROW, c).value = INCLUSIONS[i];
  });
  STATE_SUB_COLS.forEach((c, i) => {
    ws.getCell(SUB_ROW, c).value = SOIL_STATES[i];
  });
  ws.getCell(SUB_ROW, STATE_NOTE_COL).value = '备注';
  TEST_SUB_COLS.forEach((c, i) => {
    ws.getCell(SUB_ROW, c).value = testCols[i]?.label ?? TEST_ITEMS[i];
  });

  // ---- 行5+：每条土样一行 ----
  record.samples.forEach((s, idx) => {
    const r = FIRST_DATA_ROW + idx;
    const set = (c: number, v: string) => {
      const cell = ws.getCell(r, c);
      cell.value = v;
      styleCell(cell, { align: c <= BASE ? 'left' : 'center' });
    };
    set(1, s.soilNumber);
    set(2, s.fieldRecord);
    // 取土深度：保留原列（列宽/表头不变，保证粘贴进 Word 格式不乱），但数据格留空
    set(3, '');
    set(4, s.sampleElevation);
    set(5, s.color);
    set(6, s.smell);
    SOIL_TYPE_SUB_COLS.forEach((c, i) => {
      set(c, s.soilType.includes(soilType[i]) ? '√' : '');
    });
    // 第15列扰动土：仅「扰动」打 √，原状留空
    set(DISTURBANCE_COL, s.disturbance === '扰动' ? '√' : '');
    INCL_SUB_COLS.forEach((c, i) => {
      set(c, s.inclusions.includes(INCLUSIONS[i]) ? '√' : '');
    });
    STATE_SUB_COLS.forEach((c, i) => {
      set(c, s.soilState.includes(SOIL_STATES[i]) ? '√' : '');
    });
    set(STATE_NOTE_COL, s.soilStateNote);
    TEST_SUB_COLS.forEach((c, i) => {
      set(c, s.testItems.includes(testCols[i]?.key ?? TEST_ITEMS[i]) ? '√' : '');
    });
    // 留空占位列（第12列=目力鉴别土类、第14列=夹杂物合并起始）补边框
    styleCell(ws.getCell(r, 12), { align: 'center' });
    styleCell(ws.getCell(r, 14), { align: 'center' });
    // IL / Ip 不写入主表
  });

  // ---- 页面设置：A3 横向，适配一页宽 ----
  ws.pageSetup = {
    orientation: 'landscape',
    paperSize: 8 as ExcelJS.PaperSize, // 8 = A3
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  // ---- 冻结表头（前 4 行：标题/工程信息/列标题/子项）----
  ws.views = [{ state: 'frozen', ySplit: 4 }];

  // ====================================================================
  // 第二工作表：液性指数 / 塑性指数 / 粉砂判定（校对用）
  // ====================================================================
  const ws2 = wb.addWorksheet('液性指数_塑性指数_粉砂判定');
  ws2.columns = [
    { width: 14 }, // 土号
    { width: 14 }, // 塑性指数(Ip)
    { width: 14 }, // 液性指数(IL)
    { width: 12 }, // 粉砂判定
  ];

  // 标题行（整行合并，美观）
  {
    const cell = ws2.getCell(1, 1);
    cell.value = '校对字段（塑性指数 / 液性指数 / 粉砂判定）';
    styleCell(cell, { bold: true, size: 13, align: 'center' });
    ws2.mergeCells(1, 1, 1, 4);
  }

  // 表头行
  const head2 = ['土号', '塑性指数(Ip)', '液性指数(IL)', '粉砂判定'];
  for (let c = 1; c <= 4; c++) {
    const cell = ws2.getCell(2, c);
    cell.value = head2[c - 1];
    styleCell(cell, { bold: true, fill: true });
  }

  // 数据行
  record.samples.forEach((s, idx) => {
    const r = 3 + idx;
    const rows: [number, string][] = [
      [1, s.soilNumber],
      [2, s.ip],
      [3, s.il],
      [4, siltySandSymbol(s.siltySand ?? 'none')],
    ];
    rows.forEach(([c, v]) => {
      const cell = ws2.getCell(r, c);
      cell.value = v;
      styleCell(cell, { align: 'center' });
    });
  });

  // 页面设置与冻结表头
  ws2.pageSetup = {
    orientation: 'landscape',
    paperSize: 9 as ExcelJS.PaperSize, // 9 = A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  ws2.views = [{ state: 'frozen', ySplit: 2 }];

  // ====================================================================
  // 第三工作表：颗分统计（塑性指数(Ip)≤10 或 勾选扰动土 的土纳入）
  // ====================================================================
  const ws3 = wb.addWorksheet('颗分统计');
  ws3.columns = [
    { width: 14 }, // 土号
    { width: 14 }, // 塑性指数(Ip)
    { width: 14 }, // 液性指数(IL)
    { width: 12 }, // 扰动土
    { width: 12 }, // 纳入颗分
  ];
  const ws3Title = '颗分统计（塑性指数(Ip)≤10 或 勾选扰动土）';
  {
    const cell = ws3.getCell(1, 1);
    cell.value = ws3Title;
    styleCell(cell, { bold: true, size: 13, align: 'center' });
    ws3.mergeCells(1, 1, 1, 5);
  }
  const head3 = ['土号', '塑性指数(Ip)', '液性指数(IL)', '扰动土', '纳入颗分'];
  for (let c = 1; c <= 5; c++) {
    const cell = ws3.getCell(2, c);
    cell.value = head3[c - 1];
    styleCell(cell, { bold: true, fill: true });
  }
  // 仅保留纳入颗分的土样（Ip≤10 或 勾选扰动），剔除不做的行
  let ws3Row = 3;
  record.samples.forEach((s) => {
    const ipNum = parseFloat(s.ip);
    const ipLe10 = !Number.isNaN(ipNum) && ipNum <= 10;
    const isDisturbed = s.disturbance === '扰动';
    if (!(ipLe10 || isDisturbed)) return;
    const r = ws3Row++;
    const rows3: [number, string][] = [
      [1, s.soilNumber],
      [2, s.ip],
      [3, s.il],
      [4, s.disturbance],
      [5, '√'],
    ];
    rows3.forEach(([c, v]) => {
      const cell = ws3.getCell(r, c);
      cell.value = v;
      styleCell(cell, { align: 'center' });
    });
  });
  ws3.pageSetup = {
    orientation: 'landscape',
    paperSize: 9 as ExcelJS.PaperSize, // 9 = A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  ws3.views = [{ state: 'frozen', ySplit: 2 }];

  // ====================================================================
  // 第四工作表：渗透统计（垂直渗透 / 水平渗透 分列）
  // ====================================================================
  const ws4 = wb.addWorksheet('渗透统计');
  ws4.columns = [
    { width: 14 }, // 土号
    { width: 14 }, // 垂直渗透
    { width: 14 }, // 水平渗透
  ];
  const ws4Title = '渗透统计（垂直渗透 / 水平渗透）';
  {
    const cell = ws4.getCell(1, 1);
    cell.value = ws4Title;
    styleCell(cell, { bold: true, size: 13, align: 'center' });
    ws4.mergeCells(1, 1, 1, 3);
  }
  const head4 = ['土号', '垂直渗透', '水平渗透'];
  for (let c = 1; c <= 3; c++) {
    const cell = ws4.getCell(2, c);
    cell.value = head4[c - 1];
    styleCell(cell, { bold: true, fill: true });
  }
  // 仅保留做了渗透（垂直或水平）的土样，剔除不做的行
  let ws4Row = 3;
  record.samples.forEach((s) => {
    const vPerm = s.testItems.includes('垂直渗透');
    const hPerm = s.testItems.includes('水平渗透');
    if (!vPerm && !hPerm) return;
    const r = ws4Row++;
    const rows4: [number, string][] = [
      [1, s.soilNumber],
      [2, vPerm ? '√' : ''],
      [3, hPerm ? '√' : ''],
    ];
    rows4.forEach(([c, v]) => {
      const cell = ws4.getCell(r, c);
      cell.value = v;
      styleCell(cell, { align: 'center' });
    });
  });
  ws4.pageSetup = {
    orientation: 'landscape',
    paperSize: 9 as ExcelJS.PaperSize, // 9 = A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  ws4.views = [{ state: 'frozen', ySplit: 2 }];

  // ====================================================================
  // 第五工作表：额外试验项目（送样单未知试验项目，列名用录入时的名称）
  // ====================================================================
  // 汇总全部土样的未知试验项目名称（去重，保持首次出现顺序）
  const extraNames: string[] = [];
  const extraSeen = new Set<string>();
  record.samples.forEach((s) => {
    (s.otherTestItems ?? []).forEach((name) => {
      if (name && !extraSeen.has(name)) {
        extraSeen.add(name);
        extraNames.push(name);
      }
    });
  });
  // 仅在存在未知试验项目时才新增此表（无则不影响原 4 表结构）
  if (extraNames.length > 0) {
    const ws5 = wb.addWorksheet('额外试验项目');
    ws5.columns = [
      { width: 14 }, // 土样编号
      ...extraNames.map(() => ({ width: 18 })), // 各未知项目一列
    ];
    const ws5Title = '额外试验项目（送样单未知试验项目）';
    {
      const cell = ws5.getCell(1, 1);
      cell.value = ws5Title;
      styleCell(cell, { bold: true, size: 13, align: 'center' });
      ws5.mergeCells(1, 1, 1, extraNames.length + 1);
    }
    const head5 = ['土样编号', ...extraNames];
    for (let c = 1; c <= head5.length; c++) {
      const cell = ws5.getCell(2, c);
      cell.value = head5[c - 1];
      styleCell(cell, { bold: true, fill: true });
    }
    // 仅列出含未知试验项目的土样，避免空白行
    let ws5Row = 3;
    record.samples.forEach((s) => {
      const items = s.otherTestItems ?? [];
      if (items.length === 0) return;
      const r = ws5Row++;
      const c0 = ws5.getCell(r, 1);
      c0.value = s.soilNumber;
      styleCell(c0, { align: 'center' });
      extraNames.forEach((name, i) => {
        const cell = ws5.getCell(r, i + 2);
        cell.value = items.includes(name) ? '√' : '';
        styleCell(cell, { align: 'center' });
      });
    });
    ws5.pageSetup = {
      orientation: 'landscape',
      paperSize: 9 as ExcelJS.PaperSize, // 9 = A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };
    ws5.views = [{ state: 'frozen', ySplit: 2 }];
  }

  return wb;
}

/** 导出结果 */
export interface ExportResult {
  success: boolean;
  message: string;
  path?: string;
}

/**
 * 生成并导出 xlsx：
 * - 原生（安卓）：写入文档目录后用系统分享菜单导出（微信/邮件/保存到下载等）。
 * - Web：通过浏览器下载（Blob + a 标签）。
 */
export async function exportRecord(record: SoilRecord): Promise<ExportResult> {
  try {
    const XL = await getExcelJS();
    const wb = await buildWorkbook(record, XL);
    const buf = await wb.xlsx.writeBuffer();
    const uint8 = new Uint8Array(buf as unknown as ArrayBuffer);
    const fileName = buildFileName(record);

    if (Capacitor.isNativePlatform()) {
      const base64 = uint8ToBase64(uint8);
      const fsResult = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Documents,
      });
      try {
        await Share.share({
          title: '开土记录表',
          text: '开土记录表导出',
          files: [fsResult.uri],
        });
      } catch {
        // 用户取消分享或无可分享目标，文件已保存
      }
      return {
        success: true,
        message: `已生成并保存到文档目录：${fileName}`,
        path: fsResult.uri,
      };
    }

    // Web 端：浏览器下载
    const blob = new Blob([uint8], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
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
    return { success: false, message: '导出失败：' + (e?.message ?? String(e)) };
  }
}

/** 等待指定毫秒（批量下载间隔，避免浏览器把连续下载判定为弹窗/多文件拦截） */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 批量导出 xlsx：每个孔生成一个独立文件（不会把多个孔塞进同一个工作簿）。
 *
 * - Web 端：逐个触发浏览器下载，孔之间间隔 300ms，降低被浏览器拦截的概率；
 *   首次多文件下载时浏览器可能弹出「是否允许多个下载」的询问。
 * - 原生端：逐个写入文档目录并调用系统分享（沿用 {@link exportRecord} 的既有行为），
 *   文件较多时会依次弹出分享面板，取消分享不影响文件已保存。
 *
 * 返回汇总结果：全部成功 / 部分失败 / 全部失败。
 */
export async function exportRecordsXlsx(records: SoilRecord[]): Promise<ExportResult> {
  if (!records || records.length === 0) {
    return { success: false, message: '没有选择要导出的孔' };
  }

  let successCount = 0;
  const failures: string[] = [];

  for (let i = 0; i < records.length; i++) {
    if (i > 0) await delay(300);
    const record = records[i];
    const label = (record.engineering?.holeCode ?? '').trim() || '未命名孔';
    try {
      const res = await exportRecord(record);
      if (res.success) {
        successCount += 1;
      } else {
        failures.push(`${label}：${res.message}`);
      }
    } catch (e: any) {
      failures.push(`${label}：${e?.message ?? String(e)}`);
    }
  }

  if (successCount === 0) {
    return {
      success: false,
      message: `导出失败（${records.length} 个文件均未成功）：${failures.join('；')}`,
    };
  }

  const native = Capacitor.isNativePlatform();
  const tail = failures.length
    ? `，${failures.length} 个失败（${failures.join('；')}）`
    : '';

  if (native) {
    return {
      success: true,
      message: `已导出 ${successCount} 个文件到文档目录（已逐个打开系统分享）${tail}`,
    };
  }

  return {
    success: true,
    message: `已导出 ${successCount} 个文件（每个孔一个文件，浏览器可能询问是否允许多个下载）${tail}`,
  };
}
