import type ExcelJS from 'exceljs';
import { SoilRecord, SoilSample } from './types';
import { genId, newSample, coupleDisturbance, todayStr } from './utils';
import { importWithRecovery } from './pwaRecovery';

/**
 * 送样单（电子送样单 / 土工试验送样单 表一）解析逻辑。
 *
 * 解析目标：把 Excel 送样单工作表转换为 SoilRecord，逐行土样映射为 SoilSample，
 * 免去用户在 App 中手工录入。
 *
 * 设计要点：
 * - 纯逻辑、无 UI、无 Capacitor 依赖，便于单元测试。
 * - 始终按「表头文本」定位列，绝不依赖固定列号（源表 A 列有常量模板碎片 `6`，必须忽略）。
 * - 一个工作表内可能堆叠多份送样单（多个孔号，各自带独立表头与表尾），
 *   每份「送样单块」解析为一条 SoilRecord（一个孔号一条记录），避免数据丢失。
 * - 每个送样单块在「表尾」（送样人 / 收样人 / 说明）或下一块表头处结束。
 * - exceljs 动态导入，避免进入首屏依赖图。
 */

/** 单份送样单解析结果 */
export interface ImportedRecord {
  /** 组装好的完整记录 */
  record: SoilRecord;
  /** 来源工作表名 */
  sheetName: string;
  /** 土样条数 */
  sampleCount: number;
  /** 孔号 */
  holeCode: string;
  /** 该块级别告警（如未找到孔号） */
  warnings: string[];
}

/** 整份文件解析结果 */
export interface DeliveryParseResult {
  /** 所有被识别为送样单的块解析结果（一个孔号一条） */
  records: ImportedRecord[];
  /** 文件级告警（如某块跳过原因） */
  warnings: string[];
}

/** 送样单子表头中的试验项目标签 → App 内 testItems 取值（顺序即输出顺序） */
const TEST_LABEL_MAP: { label: string; item: string }[] = [
  { label: '常规物性', item: '物性' },
  { label: '液塑限', item: '物性' }, // 液塑限折叠进「物性」
  { label: '颗分', item: '颗分' },
  { label: '压缩系数压缩模量', item: '固结' },
  { label: '垂直渗透', item: '垂直渗透' },
  { label: '水平渗透', item: '水平渗透' },
  { label: '饱和固结快剪', item: '饱固快剪' },
  { label: '自然快剪', item: '自然快剪' },
];

/** 未勾选标记集合 */
const NO_SET = new Set<string>(['', '—', '–', '×', '/', '／', '无', '否']);

/** 表尾标记：命中即视为当前送样单块结束 */
const FOOTER_KEYWORDS = ['送样人', '收样人', '说明'];

/**
 * 归一化表头文本：先提取单元格纯文本（兼容 richText / 公式 / 日期），再去除所有空白（含换行）。
 * 例：压缩\n系数\n压缩\n模量 → 压缩系数压缩模量。
 * 注意：送样单表头多为富文本(richText)对象，必须先用 cellText 提取文本再做归一化。
 */
export function normalizeHeader(s: unknown): string {
  return cellText(s).replace(/\s+/g, '');
}

/** 安全取单元格纯文本（兼容富文本 / 公式 / 日期） */
function cellText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return o.richText
        .map((t: any) => (t && typeof t.text === 'string' ? t.text : ''))
        .join('');
    }
    if (typeof o.text === 'string') return o.text;
    if (typeof o.result !== 'undefined' && o.result !== null) return cellText(o.result);
  }
  return String(v);
}

/**
 * 判定单元格是否被勾选。
 * 规则：trim 后为空或属于 NO_SET（含 —/×/无/否 等）→ 未勾选；
 * 否则（含 √/■/✓ 或其它任何非空非否定标记）→ 已勾选。
 */
export function isChecked(v: unknown): boolean {
  const s = cellText(v).trim();
  if (s === '' || NO_SET.has(s)) return false;
  if (s.includes('√') || s.includes('■') || s.includes('✓')) return true;
  return true;
}

/** 在指定行中按归一化文本查找列号；找不到返回 -1 */
function findColByText(ws: ExcelJS.Worksheet, rowNum: number, text: string): number {
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= row.cellCount; c++) {
    if (normalizeHeader(row.getCell(c).value) === text) return c;
  }
  return -1;
}

/**
 * 在 HR 之前若干行内查找形如「标签：值」或「标签」+相邻单元格的信息值。
 * 兼容多种写法：
 *  - 合并单元格：工程名称：马厂减河治理工程（同一单元格，取冒号后内容）
 *  - 相邻单元格：孔号 | D25（取相邻非空单元格）
 * 优先取同单元格冒号后内容；若为空则回退到相邻（右→左）非空单元格。
 */
function findInfoValue(ws: ExcelJS.Worksheet, hrRow: number, label: string): string {
  const start = Math.max(1, hrRow - 15);
  for (let r = start; r < hrRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      const norm = normalizeHeader(row.getCell(c).value);
      if (!norm.includes(label)) continue;
      // 同单元格：标签后紧跟的内容（去掉前导冒号/空格）
      const rest = norm
        .slice(norm.indexOf(label) + label.length)
        .replace(/^[：:\s]+/, '')
        .trim();
      if (rest) return rest;
      // 回退：相邻非空单元格（先右后左）
      const right = cellText(row.getCell(c + 1).value).trim();
      if (right) return right;
      const left = cellText(row.getCell(c - 1).value).trim();
      if (left) return left;
    }
  }
  return '';
}

/**
 * 判断第 r 行是否为送样单表头行(HR)：
 *  - 含有「土样编号」
 *  - 且不含子表头标记（自/至/原状/扰动）—— 以此与子表头行区分
 *  - 且其下一行是有效子表头（含「原状」且含某试验项目标签）
 */
function isHeaderRow(ws: ExcelJS.Worksheet, r: number): boolean {
  const row = ws.getRow(r);
  let hasTN = false;
  for (let c = 1; c <= row.cellCount; c++) {
    if (normalizeHeader(row.getCell(c).value) === '土样编号') hasTN = true;
  }
  if (!hasTN) return false;
  for (let c = 1; c <= row.cellCount; c++) {
    const n = normalizeHeader(row.getCell(c).value);
    if (n === '自' || n === '至' || n === '原状' || n === '扰动') return false;
  }
  const sub = ws.getRow(r + 1);
  let hasYuan = false;
  let hasTest = false;
  for (let c = 1; c <= sub.cellCount; c++) {
    const n = normalizeHeader(sub.getCell(c).value);
    if (n === '原状') hasYuan = true;
    if (TEST_LABEL_MAP.some((m) => m.label === n)) hasTest = true;
  }
  return hasYuan && hasTest;
}

/** 定位工作表中所有送样单表头行（一个工作表可能堆叠多份，即多个孔号） */
function findHeaderRows(ws: ExcelJS.Worksheet): number[] {
  const hrs: number[] = [];
  for (let r = 1; r < ws.rowCount; r++) {
    if (isHeaderRow(ws, r)) hrs.push(r);
  }
  return hrs;
}

/** 解析单个送样单块（HR=hr，子表头=hr+1，数据止于 nextHr 或表尾或表末） */
function parseOneBlock(
  ws: ExcelJS.Worksheet,
  hr: number,
  sub: number,
  nextHr: number,
): ImportedRecord {
  const warnings: string[] = [];
  const endRow = Math.min(nextHr - 1, ws.rowCount);

  // 定位各列（在 HR / 子表头中按文本查找）
  const soilNoCol = findColByText(ws, hr, '土样编号');
  const fieldRecCol = findColByText(ws, hr, '野外定名');
  const fromCol = findColByText(ws, sub, '自');
  const toCol = findColByText(ws, sub, '至');
  const distCol = findColByText(ws, sub, '扰动');
  const testCols: { col: number; item: string }[] = [];
  for (const m of TEST_LABEL_MAP) {
    const col = findColByText(ws, sub, m.label);
    if (col >= 0) testCols.push({ col, item: m.item });
  }

  // 未知试验项目列：子表头中所有「非已知 label、非结构标签」的非空列头，归入「其他试验项目」
  const KNOWN_TEST_LABELS = new Set(TEST_LABEL_MAP.map((m) => m.label));
  const STRUCT_LABELS = new Set([
    '自',
    '至',
    '原状',
    '扰动',
    '土样编号',
    '取土深度',
    '野外定名',
    '状态',
    '试验项目',
  ]);
  const unknownCols: { col: number; label: string }[] = [];
  const subRow = ws.getRow(sub);
  for (let c = 1; c <= subRow.cellCount; c++) {
    if (c === 1) continue; // 忽略 A 列常量模板碎片「6」（页面边距，非数据列）
    const label = normalizeHeader(subRow.getCell(c).value);
    if (label === '') continue;
    if (KNOWN_TEST_LABELS.has(label)) continue;
    if (STRUCT_LABELS.has(label)) continue;
    unknownCols.push({ col: c, label });
  }
  const unknownSeen = new Set<string>();

  // 孔号 / 工程名称（HR 之前的若干行）
  const holeCode = findInfoValue(ws, hr, '孔号');
  const projectName = findInfoValue(ws, hr, '工程名称');
  if (!holeCode) warnings.push('未在工作表中找到“孔号”，记录将以空孔号创建。');
  if (!projectName) warnings.push('未在工作表中找到“工程名称”。');

  // 逐行解析土样（土样编号非空即视为数据行；遇表尾标记则结束本块）
  const samples: SoilSample[] = [];
  let idx = 0;
  for (let r = sub + 1; r <= endRow; r++) {
    const row = ws.getRow(r);
    const soilNumberRaw = soilNoCol >= 0 ? cellText(row.getCell(soilNoCol).value).trim() : '';
    if (soilNumberRaw === '') continue; // 非数据行（空白行 / 块间间隔）
    if (FOOTER_KEYWORDS.some((k) => soilNumberRaw.includes(k))) break; // 表尾，结束本块

    idx += 1;
    const s = newSample(idx, soilNumberRaw);
    if (fieldRecCol >= 0) s.fieldRecord = cellText(row.getCell(fieldRecCol).value).trim();

    const from = fromCol >= 0 ? cellText(row.getCell(fromCol).value).trim() : '';
    const to = toCol >= 0 ? cellText(row.getCell(toCol).value).trim() : '';
    s.sampleDepth = from && to ? `${from}~${to}` : from;

    // 仅当「扰动」列被勾选时才标记为扰动；原状保持默认，不单独记录
    if (distCol >= 0 && isChecked(row.getCell(distCol).value)) {
      s.disturbance = '扰动';
    }

    const items: string[] = [];
    for (const t of testCols) {
      if (isChecked(row.getCell(t.col).value) && !items.includes(t.item)) {
        items.push(t.item);
      }
    }
    s.testItems = items;

    // 未知试验项目列：被勾选则归入「其他试验项目」（APP 内留底，不写导出表）
    const other: string[] = [];
    for (const u of unknownCols) {
      if (isChecked(row.getCell(u.col).value) && !other.includes(u.label)) {
        other.push(u.label);
        unknownSeen.add(u.label);
      }
    }
    s.otherTestItems = other;

    // 扰动土联动：扰动时确保含「颗分」（返回克隆，不改入参）
    samples.push(coupleDisturbance(s));
  }

  // 本块内出现过的未知试验项目，逐条告警（提示已归入"其他试验项目"，不影响导出）
  for (const lbl of unknownSeen) {
    warnings.push(`送样单含未知试验项目：${lbl}（已归入"其他试验项目"，不影响导出）`);
  }

  // 组装记录
  const now = Date.now();
  const name = (projectName ? projectName + ' ' : '') + holeCode;
  const record: SoilRecord = {
    id: genId(),
    name: name || `开土记录 ${todayStr()}`,
    mode: 'A',
    engineering: {
      projectCode: '',
      holeCode,
      holeElevation: '',
      openDate: todayStr(),
    },
    samples,
    customTestItems: Array.from(unknownSeen),
    createdAt: now,
    updatedAt: now,
  };

  return {
    record,
    sheetName: ws.name,
    sampleCount: samples.length,
    holeCode,
    warnings,
  };
}

/**
 * 解析整份送样单文件。
 * 对每一个被识别为送样单的工作表，找出其中所有送样单块（每个孔号一份），
 * 各自解析为一条 SoilRecord。无数据行的块会被跳过并记入 warnings。
 */
export async function parseDeliveryFile(buffer: ArrayBuffer): Promise<DeliveryParseResult> {
  // 分块可能因「页面停留在旧版本」而 404，此处带自愈：清缓存并自动刷新
  const XL = (await importWithRecovery(() => import('exceljs'))).default;
  const wb = new XL.Workbook();
  await wb.xlsx.load(buffer);

  const result: DeliveryParseResult = { records: [], warnings: [] };

  for (const ws of wb.worksheets) {
    const hrs = findHeaderRows(ws);
    if (hrs.length === 0) continue; // 非送样单工作表（如计算表），跳过

    for (let i = 0; i < hrs.length; i++) {
      const hr = hrs[i];
      const sub = hr + 1;
      const nextHr = i + 1 < hrs.length ? hrs[i + 1] : ws.rowCount + 1;
      try {
        const parsed = parseOneBlock(ws, hr, sub, nextHr);
        if (parsed.sampleCount === 0) {
          result.warnings.push(
            `工作表「${ws.name}」第 ${hr} 行的送样单块未识别到土样数据，已跳过。`,
          );
          continue;
        }
        result.records.push(parsed);
      } catch (e: any) {
        result.warnings.push(`工作表「${ws.name}」第 ${hr} 行的送样单块解析失败：${e?.message ?? String(e)}`);
      }
    }
  }

  return result;
}
