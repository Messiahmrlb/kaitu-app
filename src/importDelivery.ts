import type ExcelJS from 'exceljs';
import { SoilRecord, SoilSample, RecordMode } from './types';
import { SOIL_TYPE_A, SOIL_TYPE_B, DEFAULT_SHEAR_LABELS } from './constants';
import { classifyShearLabel, classifyConsolidationAlias } from './testHeader';
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
  /** 来源工作表名（同孔合并后为「、」连接的多个工作表） */
  sheetName: string;
  /** 土样条数 */
  sampleCount: number;
  /** 孔号 */
  holeCode: string;
  /** 该块级别告警（如未找到孔号） */
  warnings: string[];
  /** 该块级别的错误级提示（来源疑似有误，如续页土号重新从 1 开始） */
  errors?: string[];
  /** 同孔合并了几份送样单（未合并为 1） */
  mergedFrom?: number;
  /** 该块内被当作表头残留跳过的行数（「土样编号」出现在土号列，如表二结果表的多行表头） */
  headerJunkRows?: number;
}

/** 整份文件解析结果 */
export interface DeliveryParseResult {
  /** 所有被识别为送样单的块解析结果（同孔已合并，一个孔一条） */
  records: ImportedRecord[];
  /** 文件级告警（如某块跳过原因） */
  warnings: string[];
  /** 文件级错误级提示（来源疑似有误，不阻止导入） */
  errors?: string[];
  /** 同孔合并说明（如「孔号 ZK1-1 的 3 份送样单已合并为 1 条记录」） */
  mergedNotes?: string[];
}

/** 送样单子表头中的试验项目标签 → App 内 testItems 取值（顺序即输出顺序） */
const TEST_LABEL_MAP: { label: string; item: string }[] = [
  { label: '常规物性', item: '物性' },
  { label: '液塑限', item: '物性' }, // 液塑限折叠进「物性」
  { label: '颗分', item: '颗分' },
  { label: '压缩系数压缩模量', item: '固结' },
  { label: '固结', item: '固结' }, // 有的送样单直接写「固结」二字
  { label: '垂直渗透', item: '垂直渗透' },
  { label: '水平渗透', item: '水平渗透' },
  { label: '饱和固结快剪', item: '饱固快剪' },
  { label: '饱固快剪', item: '饱固快剪' }, // 有的送样单写简称（此前漏识别，已补）
  { label: '自然快剪', item: '自然快剪' },
];

/** 未勾选标记集合 */
const NO_SET = new Set<string>(['', '—', '–', '×', '/', '／', '无', '否']);

/** 去重并保持首次出现顺序 */
function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/**
 * 取土样编号末尾的土样序号（纯函数）。
 *
 * 规则：
 * - `ZK1-1-01` → 1（最后一段为土样序号）
 * - `ZK1-R1` → 1（扰动土序号）
 * - `ZK1-1-21` → 21
 * - `ZK1-1` → null（这是孔号形态，最后一段是孔的子编号，不是土样序号）
 * - `01` → 1（纯数字土号）
 * - 无数字 → null
 */
export function soilSeqOf(soilNumber: string): number | null {
  const s = String(soilNumber ?? '').trim();
  if (!s) return null;
  // 纯数字土号（如 01）
  if (/^\d+$/.test(s)) return parseInt(s, 10);

  const m = /(\d+)$/.exec(s);
  if (!m) return null;
  const before = s.slice(0, m.index);
  // 数字前必须是 `-` 或字母（R1 / A1 等）
  if (!/[-A-Za-z]$/.test(before)) return null;

  if (before.endsWith('-')) {
    const head = before.slice(0, -1);
    // `ZK1-1`：数字前只有孔号主体，没有第二段分隔符 → 视为孔号，不是土号
    if (head && !head.includes('-')) return null;
  }
  return parseInt(m[1], 10);
}

/**
 * 同一文件内「同孔多表」合并（纯函数）：
 * - 合并键为 `holeCode.trim()`，精确相等（`ZK1` 与 `ZK1-1` 不同孔）；
 * - 空孔号不参与合并，各自独立；
 * - 以第一块为基础（name / mode / engineering / 时间戳沿用第一块），
 *   samples 按块顺序**原样拼接**：土号只做首尾空白裁剪，绝不重排/改写数字
 *   （土号是现场实物编号，导入必须保真；重复编号由来源错误提示，不在合并层修复）；
 * - sheetName 去重后用「、」连接；
 * - warnings / errors / customTestItems 合并去重。
 */
export function mergeImportedByHole(items: ImportedRecord[]): {
  records: ImportedRecord[];
  mergedNotes: string[];
  errors: string[];
} {
  interface Group {
    hole: string;
    items: ImportedRecord[];
  }
  const groups: Group[] = [];
  const byHole = new Map<string, Group>();

  for (const item of items ?? []) {
    const hole = (item.holeCode ?? '').trim();
    if (!hole) {
      // 空孔号：每个块独立成组，不参与同孔合并
      groups.push({ hole: '', items: [item] });
      continue;
    }
    const existing = byHole.get(hole);
    if (existing) {
      existing.items.push(item);
    } else {
      const group: Group = { hole, items: [item] };
      byHole.set(hole, group);
      groups.push(group);
    }
  }

  const records: ImportedRecord[] = [];
  const mergedNotes: string[] = [];
  const errors: string[] = [];

  for (const group of groups) {
    const first = group.items[0];
    const isMerged = group.items.length > 1;
    const mergedWarnings = uniqueStrings(group.items.flatMap((x) => x.warnings ?? []));
    const mergedErrors = uniqueStrings(group.items.flatMap((x) => x.errors ?? []));

    // 同孔多块表头一致性校验（用户确认：表头不一致 = 来源错误，按重复编号同级提示）。
    // 对比各块的固结列显示名与剪切两列显示名（未覆盖按默认名参与对比）；取第一块，不阻止合并。
    const describeHeader = (r: SoilRecord) =>
      `固结列「${r.consolidationLabel ?? '固结'}」、剪切两列「${(r.shearLabels ?? DEFAULT_SHEAR_LABELS).join('／')}」`;
    const firstHeader = describeHeader(first.record);
    const headerMismatchIdx: number[] = [];
    group.items.forEach((x, i) => {
      if (i > 0 && describeHeader(x.record) !== firstHeader) headerMismatchIdx.push(i + 1);
    });
    if (headerMismatchIdx.length > 0) {
      mergedErrors.push(
        `孔号 ${group.hole || '(空)'} 的多份送样单试验表头不一致（第 1 份：${firstHeader}；第 ${headerMismatchIdx.join('、')} 份不同），疑似送样单来源有误，已按第 1 份表头合并，请核对。`,
      );
    }

    if (!isMerged) {
      records.push({
        ...first,
        warnings: mergedWarnings,
        errors: mergedErrors,
        mergedFrom: 1,
      });
      errors.push(...mergedErrors);
      continue;
    }

    const samples = group.items.flatMap((x) =>
      (x.record.samples ?? []).map((s) => ({
        ...s,
        soilNumber: (s.soilNumber ?? '').trim(),
      })),
    );
    const customTestItems = uniqueStrings(
      group.items.flatMap((x) => x.record.customTestItems ?? []),
    );
    const sheetName = uniqueStrings(group.items.map((x) => x.sheetName)).join('、');

    records.push({
      record: {
        ...first.record,
        samples,
        customTestItems,
      },
      sheetName,
      sampleCount: samples.length,
      holeCode: first.holeCode,
      warnings: mergedWarnings,
      errors: mergedErrors,
      mergedFrom: group.items.length,
    });
    errors.push(...mergedErrors);
    mergedNotes.push(
      `孔号 ${group.hole} 的 ${group.items.length} 份送样单已合并为 1 条记录`,
    );
  }

  return { records, mergedNotes, errors: uniqueStrings(errors) };
}

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

/**
 * 土名归一化：去空白，并把「粘 / 黏」统一为「黏」。
 *
 * 送样单模板对同一土名存在两种写法（粘土 / 黏土、粉粘土 / 粉质黏土），
 * 归一化后再比对，避免因为一个异体字把整份表判成另一种鉴别格式。
 */
export function normalizeSoilName(s: unknown): string {
  return cellText(s).replace(/\s+/g, '').replace(/粘/g, '黏');
}

/**
 * 在给定土名选项表中查找「野外定名」对应的项（**宽松包含匹配**）。
 * 精确匹配优先；否则取被包含的最长选项（如「含有机质轻粉质壤土」→「轻粉质壤土」）。
 * 找不到返回 null。
 *
 * 注意：包含匹配会把「粉黏土」里的「黏土」也算命中，用于判定格式时
 * 必须先用 {@link exactMatchSoilType} 做精确匹配，避免把「粉粘土」误判成 A。
 */
export function matchSoilTypeName(name: unknown, options: string[]): string | null {
  const n = normalizeSoilName(name);
  if (!n) return null;
  let best: string | null = null;
  let bestLen = 0;
  for (const o of options) {
    const no = normalizeSoilName(o);
    if (!no) continue;
    if (no === n) return o;
    if (n.includes(no) && no.length > bestLen) {
      best = o;
      bestLen = no.length;
    }
  }
  return best;
}

/** 精确匹配（归一化后整串相等），不做事后包含匹配 */
function exactMatchSoilType(name: unknown, options: string[]): string | null {
  const n = normalizeSoilName(name);
  if (!n) return null;
  for (const o of options) {
    if (normalizeSoilName(o) === n) return o;
  }
  return null;
}

/**
 * 判定一份送样单的「鉴别格式」。
 *
 * 判定顺序：
 *  1) 表内出现「三角坐标」字样 → 模式 B（显式声明优先）；
 *  2) 先对全部野外定名做**精确**匹配，命中多的一侧胜出；
 *  3) 若精确匹配一条都没命中（定名带修饰语等），再退回包含匹配；
 *  4) 平票 / 仍无命中 → 模式 A（普通目力鉴别）兜底。
 *
 * 第 2 步先于第 3 步很关键：「粉粘土」经「粘→黏」归一化后包含「黏土」，
 * 若直接做包含匹配会同时命中 A 与 B 造成平票，最终误判成 A。
 *
 * 注意：只做「格式」判断，不会把野外定名写进 soilType（土类仍需导入后逐条手勾）。
 *
 * @param fieldRecords 各土样的野外定名
 * @param contextText  表块头部文本（工作表名、工程名称等），用于识别显式声明
 */
export function detectRecordMode(fieldRecords: unknown[], contextText = ''): RecordMode {
  if (contextText.replace(/\s+/g, '').includes('三角坐标')) return 'B';

  let scoreA = 0;
  let scoreB = 0;
  for (const raw of fieldRecords) {
    if (exactMatchSoilType(raw, SOIL_TYPE_A)) scoreA += 1;
    if (exactMatchSoilType(raw, SOIL_TYPE_B)) scoreB += 1;
  }

  // 精确匹配全部落空时才启用包含匹配（兼容「含有机质…」这类带修饰的定名）。
  // 同一条定名在两侧都命中时，只认命中长度更长的一侧，避免「粉黏土」里的
  // 「黏土」把结果拉成平票。
  if (scoreA + scoreB === 0) {
    for (const raw of fieldRecords) {
      const ma = matchSoilTypeName(raw, SOIL_TYPE_A);
      const mb = matchSoilTypeName(raw, SOIL_TYPE_B);
      if (!ma && !mb) continue;
      if (ma && mb) {
        const la = normalizeSoilName(ma).length;
        const lb = normalizeSoilName(mb).length;
        if (lb > la) scoreB += 1;
        else if (la > lb) scoreA += 1;
        else {
          scoreA += 1;
          scoreB += 1;
        }
      } else if (ma) scoreA += 1;
      else scoreB += 1;
    }
  }

  return scoreB > scoreA ? 'B' : 'A';
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
 * 在 HR 之前查找形如「标签：值」或「标签」+相邻单元格的信息值。
 * 兼容多种写法：
 *  - 合并单元格：工程名称：马厂减河治理工程（同一单元格，取冒号后内容）
 *  - 相邻单元格：孔号 | D25（取相邻非空单元格）
 * 优先取同单元格冒号后内容；若为空则回退到相邻（右→左）非空单元格。
 *
 * @param minRow 搜索下界（含）。同一工作表多块时，孔号搜索需从上一块表头之后开始，
 *               避免把上一块的孔号误当成本块自己写的孔号（否则续页继承/校验失效）。
 */
function findInfoValue(
  ws: ExcelJS.Worksheet,
  hrRow: number,
  label: string,
  minRow = Math.max(1, hrRow - 15),
): string {
  const start = Math.max(1, minRow);
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
      // 回退：相邻非空单元格（先右后左）；A 列没有左邻居，getCell(0) 会抛越界异常
      const right = cellText(row.getCell(c + 1).value).trim();
      if (right) return right;
      const left = c > 1 ? cellText(row.getCell(c - 1).value).trim() : '';
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
    // 已知标签，或剪试验/固结别名（固结快剪、慢剪、回弹压缩、固结系数等）都算试验子表头。
    // 注意不能用「子表头行含土样编号」排除「表二」类工作表：
    // 标准表一的「土样编号」是纵向合并单元格，子表头行同样会显示它。
    if (
      TEST_LABEL_MAP.some((m) => m.label === n) ||
      classifyShearLabel(n) !== null ||
      classifyConsolidationAlias(n) !== null
    )
      hasTest = true;
  }
  return hasYuan && hasTest;
}

/**
 * 深度列取值是否为合法数字深度（纯函数）。
 * 合法：1.65、18.8-19、5.8m、1.3~1.5（可带单位/区间/全角波浪线/长破折）；
 * 非法（疑似土号写串行/列错位）：扰1、原2、ZK38 等非数字内容。
 * 注意「扰1」含数字，所以不能用「含数字」判断，必须整体匹配深度模式。
 */
export function isNumericDepth(v: string): boolean {
  const s = String(v ?? '')
    .replace(/\s+/g, '')
    .replace(/[～～~—–]/g, '-');
  if (s === '') return true; // 空值不判错（由调用方决定是否跳过检查）
  return /^\d+(\.\d+)?(\-\d+(\.\d+)?)?(m|米)?$/i.test(s);
}

/** 定位工作表中所有送样单表头行（一个工作表可能堆叠多份，即多个孔号） */
function findHeaderRows(ws: ExcelJS.Worksheet): number[] {
  const hrs: number[] = [];
  for (let r = 1; r < ws.rowCount; r++) {
    if (isHeaderRow(ws, r)) hrs.push(r);
  }
  return hrs;
}

/**
 * 解析单个送样单块（HR=hr，子表头=hr+1，数据止于 nextHr 或表尾或表末）。
 *
 * @param inheritedHole 本文件中上一个非空孔号（跨工作表累计）；本块未写孔号时沿用。
 * @param holeSearchStart 孔号搜索下界（同一工作表多块时从上一块表头之后开始）。
 */
function parseOneBlock(
  ws: ExcelJS.Worksheet,
  hr: number,
  sub: number,
  nextHr: number,
  inheritedHole = '',
  holeSearchStart = 1,
): ImportedRecord {
  const warnings: string[] = [];
  const errors: string[] = [];
  const endRow = Math.min(nextHr - 1, ws.rowCount);

  // 定位各列（在 HR / 子表头中按文本查找）
  const soilNoCol = findColByText(ws, hr, '土样编号');
  const fieldRecCol = findColByText(ws, hr, '野外定名');
  const fromCol = findColByText(ws, sub, '自');
  const toCol = findColByText(ws, sub, '至');
  const distCol = findColByText(ws, sub, '扰动');
  const testCols: { col: number; item: string }[] = [];
  // 剪试验槽位分配：按子表头出现顺序，第 1 个剪列 → 槽1（默认 饱固快剪 位），
  // 第 2 个 → 槽2（默认 自然快剪 位）；槽显示名仅在别名（固结快剪/慢剪）时记原文。
  const shearSlots: { kind: string; label: string }[] = [];
  let consolidationAlias: string | null = null;

  // 子表头统一扫描：已知标签精确匹配 / 剪试验别名归一 / 固结别名归一 / 其余归「未知试验项目」。
  // 注意必须先判剪试验再判固结：「固结快剪」含「固结」二字，包含匹配会误命中固结列。
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
    if (STRUCT_LABELS.has(label)) continue;
    if (KNOWN_TEST_LABELS.has(label)) {
      const item = TEST_LABEL_MAP.find((m) => m.label === label)!.item;
      // 精确匹配到的剪试验列同样要占槽位：否则同一张表同时出现
      // 「饱和固结快剪」与「固结快剪」时，饱固快剪的 √ 会因槽位键不符而丢失
      if (item === '饱固快剪' || item === '自然快剪') {
        if (shearSlots.some((s) => s.kind === item)) {
          unknownCols.push({ col: c, label });
          continue;
        }
        shearSlots.push({ kind: item, label: item }); // 默认名不覆盖显示
      }
      testCols.push({ col: c, item });
      continue;
    }
    const shearKind = classifyShearLabel(label);
    if (shearKind !== null) {
      // 同一种剪试验出现两列（如「饱固快剪」+「饱和固结快剪」）：第 2 列按未知项目留底，避免 √ 数据互相覆盖
      if (shearSlots.some((s) => s.kind === shearKind)) {
        unknownCols.push({ col: c, label });
        continue;
      }
      shearSlots.push({ kind: shearKind, label: shearKind });
      testCols.push({ col: c, item: shearKind });
      continue;
    }
    const consAlias = classifyConsolidationAlias(label);
    if (consAlias !== null) {
      // 固结别名（回弹压缩 / 固结系数）：数据归「固结」键，表头显示记原文
      consolidationAlias = consolidationAlias ?? consAlias;
      testCols.push({ col: c, item: '固结' });
      continue;
    }
    unknownCols.push({ col: c, label });
  }
  const unknownSeen = new Set<string>();

  // 记录级表头覆盖：仅当剪槽/固结列出现非默认名时写入（默认名不写，行为与旧版一致）
  const shearLabels: [string, string] | undefined =
    shearSlots.length > 0
      ? [
          shearSlots[0]?.label ?? DEFAULT_SHEAR_LABELS[0],
          shearSlots[1]?.label ?? DEFAULT_SHEAR_LABELS[1],
        ]
      : undefined;
  const hasShearOverride =
    !!shearLabels &&
    (shearLabels[0] !== DEFAULT_SHEAR_LABELS[0] || shearLabels[1] !== DEFAULT_SHEAR_LABELS[1]);

  // 孔号 / 工程名称（HR 之前的若干行）
  const ownHoleCode = findInfoValue(ws, hr, '孔号', holeSearchStart);
  const inherited = !ownHoleCode && !!inheritedHole;
  const holeCode = ownHoleCode || inheritedHole;
  const projectName = findInfoValue(ws, hr, '工程名称');
  if (inherited) {
    warnings.push(
      `工作表「${ws.name}」第 ${hr} 行未写孔号，已沿用上一张的 ${holeCode}`,
    );
  } else if (!holeCode) {
    warnings.push('未在工作表中找到“孔号”，记录将以空孔号创建。');
  }
  if (!projectName) warnings.push('未在工作表中找到“工程名称”。');

  // 逐行解析土样（土样编号非空即视为数据行；遇表尾标记则结束本块）
  const samples: SoilSample[] = [];
  let headerJunkRows = 0;
  /** 深度列非数字的行（疑似土号写串行/列错位）：[行号, 列名, 原文] */
  const depthJunk: { row: number; colName: string; value: string }[] = [];
  /** 未填土号但深度列有内容的行：暂用「孔号-深度」编号，避免丢样 */
  const provisionalRows: number[] = [];
  let provisionalExample = '';
  const usedProvisional = new Set<string>();
  let idx = 0;
  for (let r = sub + 1; r <= endRow; r++) {
    const row = ws.getRow(r);
    const from = fromCol >= 0 ? cellText(row.getCell(fromCol).value).trim() : '';
    const to = toCol >= 0 ? cellText(row.getCell(toCol).value).trim() : '';
    let soilNumberRaw = soilNoCol >= 0 ? cellText(row.getCell(soilNoCol).value).trim() : '';
    if (soilNumberRaw === '') {
      // 未填土号：若深度列也全空则为空白行/块间间隔，跳过；
      // 若深度列有内容则视为漏填土号的土样，暂用「孔号-至深度（缺至用自）」
      // 编号避免丢样（用户 2026-10-30 确认），重复时追加 -2/-3 后缀
      if (!from && !to) continue;
      const base = `${holeCode || '待编'}-${to || from}`;
      let pid = base;
      let n = 2;
      while (usedProvisional.has(pid)) pid = `${base}-${n++}`;
      usedProvisional.add(pid);
      if (!provisionalExample) provisionalExample = pid;
      provisionalRows.push(r);
      soilNumberRaw = pid;
    }
    // 多行表头残留（如「表二」结果表的错位表头）：土号列出现结构标签而非真实土号，跳过该行
    if (soilNumberRaw === '土样编号' || soilNumberRaw === '野外定名') {
      headerJunkRows += 1;
      continue;
    }
    if (FOOTER_KEYWORDS.some((k) => soilNumberRaw.includes(k))) break; // 表尾，结束本块

    // 深度列检查：「自/至」必须是数字深度。出现「扰1」这类内容说明数据行
    // 整体写串行/列错位（如数据区多了一列孔号），会导致每孔只识别到 1 条土样
    if (from && !isNumericDepth(from)) depthJunk.push({ row: r, colName: '自', value: from });
    if (to && !isNumericDepth(to)) depthJunk.push({ row: r, colName: '至', value: to });

    idx += 1;
    const s = newSample(idx, soilNumberRaw);
    if (fieldRecCol >= 0) s.fieldRecord = cellText(row.getCell(fieldRecCol).value).trim();

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

  // 续页校验：本块未写孔号、沿用了文件中的上一个孔号后，
  // 若第一条土样编号又从 1 开始，说明该表可能不是上一孔的续页，提示核对来源。
  // 注意：仍按沿用孔号参与同孔合并，因此文案要说明处理结果，避免用户疑惑。
  if (inherited && samples.length > 0) {
    const firstSoilNumber = (samples[0].soilNumber ?? '').trim();
    if (soilSeqOf(firstSoilNumber) === 1) {
      errors.push(
        `工作表「${ws.name}」第 ${hr} 行未写孔号、土号又从 ${firstSoilNumber} 重新开始，疑似送样单来源有误（同一孔的续页应接续编号），已按沿用「${holeCode}」合并，请核对该表是否属于本孔。`,
      );
    }
  }

  // 暂用编号提示（黄色 warning）：漏填土号的行已按深度暂编，提醒改回真实土号
  if (provisionalRows.length > 0) {
    warnings.push(
      `工作表「${ws.name}」第 ${provisionalRows.join('、')} 行未填土样编号，已暂用「${provisionalExample}」格式的编号（孔号-至深度，缺至用自深度），请核对后改为实际土号。`,
    );
  }

  // 深度列写串行检查（来源错误级，红色提示，不阻止导入）
  if (depthJunk.length > 0) {
    const shown = depthJunk.slice(0, 3).map((d) => `第 ${d.row} 行「${d.colName}」列出现「${d.value}」`).join('、');
    const more = depthJunk.length > 3 ? `等共 ${depthJunk.length} 处` : '';
    errors.push(
      `工作表「${ws.name}」${shown}${more}，深度列应为数字。疑似土样编号写串行或数据区列错位（如数据区多了一列孔号），每个孔可能只识别到 1 条土样、数据与实际不符，请核对该块（孔号 ${holeCode || '未知'}）。`,
    );
  }

  // 本块内出现过的未知试验项目，逐条告警（提示已归入"其他试验项目"，不影响导出）
  for (const lbl of unknownSeen) {
    warnings.push(`送样单含未知试验项目：${lbl}（已归入"其他试验项目"，不影响导出）`);
  }

  // 表头按送样单原文显示的提示（黄色 warning，导入预览可见）
  const overrideParts: string[] = [];
  if (consolidationAlias) overrideParts.push(`固结列显示「${consolidationAlias}」`);
  if (hasShearOverride)
    overrideParts.push(`剪切两列显示「${shearLabels![0]}／${shearLabels![1]}」`);
  if (overrideParts.length > 0) {
    warnings.push(
      `表头按送样单原文显示：${overrideParts.join('，')}（勾选数据与导出表头保持一致）`,
    );
  }

  // 鉴别格式：按野外定名自动判定，导入预览里允许用户改动。
  // 表头区域文本一并传入，用于识别模板里显式写明的「三角坐标」。
  const contextParts: string[] = [ws.name, projectName];
  for (let r = Math.max(1, hr - 15); r <= sub; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) contextParts.push(cellText(row.getCell(c).value));
  }
  const mode = detectRecordMode(
    samples.map((s) => s.fieldRecord),
    contextParts.join(' '),
  );

  // 组装记录
  const now = Date.now();
  const name = (projectName ? projectName + ' ' : '') + holeCode;
  const record: SoilRecord = {
    id: genId(),
    name: name || `开土记录 ${todayStr()}`,
    mode,
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
  // 表头覆盖：仅非默认名时写入（旧数据 / 默认表头不带这两个字段，行为不变）
  if (hasShearOverride) record.shearLabels = shearLabels;
  if (consolidationAlias) record.consolidationLabel = consolidationAlias;

  return {
    record,
    sheetName: ws.name,
    sampleCount: samples.length,
    holeCode,
    warnings,
    errors,
    headerJunkRows,
  };
}

/**
 * 解析整份送样单文件。
 * 对每一个被识别为送样单的工作表，找出其中所有送样单块并解析；
 * 同一工作表内未写孔号的续页会继承上一块孔号；最后按孔号合并同孔多表。
 * 无数据行的块会被跳过并记入 warnings。
 */
export async function parseDeliveryFile(buffer: ArrayBuffer): Promise<DeliveryParseResult> {
  // 分块可能因「页面停留在旧版本」而 404，此处带自愈：清缓存并自动刷新
  const XL = (await importWithRecovery(() => import('exceljs'))).default;
  const wb = new XL.Workbook();
  await wb.xlsx.load(buffer);

  const result: DeliveryParseResult = {
    records: [],
    warnings: [],
    errors: [],
    mergedNotes: [],
  };

  // 文件级孔号继承：跨工作表、跨块都沿用「最近一次出现的非空孔号」。
  // 用户原话是「他没写孔号就沿用」，因此沿用是默认行为，不区分工作表。
  let lastHoleCode = '';

  /** 工作表中是否出现「土样编号」字样（疑似送样单但格式不标准的标记） */
  const hasSoilNumberMarker = (ws: ExcelJS.Worksheet): boolean => {
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= row.cellCount; c++) {
        if (normalizeHeader(row.getCell(c).value) === '土样编号') return true;
      }
    }
    return false;
  };

  for (const ws of wb.worksheets) {
    const hrs = findHeaderRows(ws);
    if (hrs.length === 0) {
      // 表内含「土样编号」却构不成标准送样单块：多为「表二」结果表或多行错位表头，
      // 明确提示已跳过；完全无关的工作表（无土样编号）保持静默，避免噪音
      if (hasSoilNumberMarker(ws)) {
        result.warnings.push(
          `工作表「${ws.name}」不是标准送样单（表一）格式，已跳过导入。`,
        );
      }
      continue;
    }

    for (let i = 0; i < hrs.length; i++) {
      const hr = hrs[i];
      const sub = hr + 1;
      const nextHr = i + 1 < hrs.length ? hrs[i + 1] : ws.rowCount + 1;
      // 同一工作表多块：孔号只能从上一块表头之后找，避免读到上一块的孔号
      const holeSearchStart = i > 0 ? hrs[i - 1] + 1 : 1;
      try {
        const parsed = parseOneBlock(
          ws,
          hr,
          sub,
          nextHr,
          lastHoleCode,
          holeSearchStart,
        );
        if (parsed.holeCode) lastHoleCode = parsed.holeCode;
        if (parsed.sampleCount === 0) {
          result.warnings.push(
            parsed.headerJunkRows
              ? `工作表「${ws.name}」第 ${hr} 行的块未识别到土样数据，表头疑似为「表二」结果表/多行表头，已跳过导入。`
              : `工作表「${ws.name}」第 ${hr} 行的送样单块未识别到土样数据，已跳过。`,
          );
          continue;
        }
        result.records.push(parsed);
      } catch (e: any) {
        const reason = e?.message ?? String(e);
        result.warnings.push(
          `工作表「${ws.name}」第 ${hr} 行的送样单块解析失败，已跳过（原因：${reason}），请检查该表格式是否与模板一致。`,
        );
      }
    }
  }

  // 同孔多表合并（同一文件内、孔号精确相等），并汇总合并说明与错误级提示
  const merged = mergeImportedByHole(result.records);
  result.records = merged.records;
  result.mergedNotes = merged.mergedNotes;
  result.errors = merged.errors;

  return result;
}
