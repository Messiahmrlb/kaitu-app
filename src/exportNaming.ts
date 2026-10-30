/**
 * 导出文件名规则（纯函数、零运行时依赖）。
 *
 * 统一 PDF / Excel 两条导出链路对「工程编号 / 孔号 / 日期」的清洗方式，
 * 避免出现「PDF 文件名干净、Excel 文件名被浏览器截断」的不一致。
 *
 * 非法字符取 Windows / macOS / Android 三端交集：
 *   / \ : * ? " < > | 以及 C0 控制字符
 */
import type { SoilRecord } from './types';

/** 文件名中不允许出现的字符 */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/**
 * 文件名片段清洗：去除首尾空白，把非法字符替换为 `-`；
 * 清洗后为空串时回落 `fallback`（默认「未命名」）。
 *
 * 例：`ZK/1` → `ZK-1`；`A:B` → `A-B`；`'   '` → `fallback`。
 *
 * 注意：PDF 日期/孔号需要「空值保持为空」以走各自的兜底文案，
 * 调用时显式传 `fallback = ''`。
 */
export function sanitizeFileNamePart(input: unknown, fallback = '未命名'): string {
  const cleaned = String(input ?? '')
    .replace(ILLEGAL_FILENAME_CHARS, '-')
    .trim();
  return cleaned || fallback;
}

/**
 * Excel 文件名：`<工程编号>_<孔号>_开土记录表.xlsx`。
 * - 工程编号 / 孔号分别清洗，非法字符替换为 `-`；
 * - 两者都为空时前缀回落「开土记录」（`开土记录_开土记录表.xlsx`）。
 */
export function buildXlsxFileName(record: Pick<SoilRecord, 'engineering'>): string {
  const project = sanitizeFileNamePart(record?.engineering?.projectCode, '');
  const hole = sanitizeFileNamePart(record?.engineering?.holeCode, '');
  const prefix = [project, hole].filter(Boolean).join('_');
  return `${prefix || '开土记录'}_开土记录表.xlsx`;
}

/**
 * 解析孔号的「字母前缀 + 数字」：`ZK12` → `{ prefix: 'ZK', num: '12' }`；
 * 不含字母前缀（纯数字 / 空 / 非「字母+数字」形态）→ prefix 为空串。
 */
export function parseHolePrefix(holeCode: unknown): { prefix: string; num: string } {
  const s = String(holeCode ?? '').trim();
  const m = s.match(/^([A-Za-z]+)(\d+)$/);
  if (m) return { prefix: m[1], num: m[2] };
  return { prefix: '', num: s };
}

/**
 * Excel 导出分组（2026-10-30 用户确认）：同一「工程编号 + 字母孔号前缀」的孔
 * 合并到一张表（一个文件），如同为 ZK1/ZK2/ZK3 → `26T123-ZK(3孔).xlsx`。
 * - 分组键含工程编号（不同工程即使同前缀也不合并）；
 * - 前缀区分大小写（与孔号精确匹配规则一致）；
 * - 无法解析出字母前缀的孔（空号 / 纯数字）单独一组，退化为逐孔一个文件。
 * 组间保持传入顺序。
 */
export function groupXlsxRecords(records: SoilRecord[]): SoilRecord[][] {
  const map = new Map<string, SoilRecord[]>();
  const groups: SoilRecord[][] = [];
  for (const r of records) {
    const { prefix } = parseHolePrefix(r?.engineering?.holeCode);
    const key = prefix
      ? `${String(r?.engineering?.projectCode ?? '').trim()}|${prefix}`
      : `\u0000${r?.id ?? Math.random()}`; // 无前缀：按记录 id 单独成组
    const arr = map.get(key);
    if (arr) arr.push(r);
    else {
      const g = [r];
      map.set(key, g);
      groups.push(g);
    }
  }
  return groups;
}

/**
 * 土号「短编号」归一（2026-10-30 用户反馈：PDF/Word 土号列不应带「原/扰」字）：
 * - `原1` → `1`（去掉「原」字）；
 * - `扰1` / `R1` / `r1` → `R1`（扰动样 R 前缀）；
 * - 已带孔号前缀（`ZK1-3`）→ `3`；
 * - 前导 `-`（`-1`、`-R1`）→ 去掉 `-`；
 * - 纯数字原样（`1`、`01`）；其他复杂编号（`ZK38-1.65`、`abc`）原样保留。
 * 空土号返回空串。PDF / Word 导出显示时在前面补 `-`（空土号按行序兜底 -seq）。
 */
export function stripSoilNumber(holeCode: unknown, soilNumber: unknown): string {
  const hole = String(holeCode ?? '').trim();
  const sn = String(soilNumber ?? '').trim();
  if (!sn) return '';
  if (hole && sn.startsWith(hole + '-')) return sn.slice(hole.length + 1);
  let m = sn.match(/^原(\d+)$/);
  if (m) return m[1];
  m = sn.match(/^(?:扰|[rR])(\d+)$/);
  if (m) return `R${m[1]}`;
  if (sn.startsWith('-')) return sn.slice(1);
  return sn;
}

/** 可归一形态：原N / 扰N / R N / 纯数字 / 前导-，其余（复杂编号）不补孔号前缀 */
const NORMALIZABLE_SN = /^(?:原\d+|扰\d+|[rR]\d+|-?\d+)$/;

/**
 * 合并表内的土样编号归一（用户确认规则）：土号补上孔号前缀，跨孔不重号：
 * - 已以孔号开头（`ZK1-1`、`ZK1-1-01`）→ 原样保留；
 * - `原1` → `ZK1-1`（去掉「原」字）；
 * - `扰1` / `R1` → `ZK1-R1`（扰动样 R 前缀）；
 * - 纯数字 / 前导 `-`（`1`、`-1`、`-01`）→ `ZK1-1` / `ZK1-01`（数字原样保留）；
 * - 其他复杂编号原样保留（不做猜测性改写）。
 * 无孔号 / 无土号时原样返回。
 */
export function mergedSoilNumber(holeCode: unknown, soilNumber: unknown): string {
  const hole = String(holeCode ?? '').trim();
  const sn = String(soilNumber ?? '').trim();
  if (!hole || !sn) return sn;
  if (sn.startsWith(hole)) return sn;
  if (!NORMALIZABLE_SN.test(sn)) return sn;
  return `${hole}-${stripSoilNumber(hole, sn)}`;
}

/**
 * 合并表文件名：`<工程编号>-<字母前缀>(<N>孔).xlsx`，如 `26T123-ZK(3孔).xlsx`。
 * 工程编号 / 前缀缺失时逐级回落，全空回落「开土记录」。
 */
export function buildXlsxGroupFileName(records: SoilRecord[]): string {
  const first = records?.[0];
  const project = sanitizeFileNamePart(first?.engineering?.projectCode, '');
  const { prefix } = parseHolePrefix(first?.engineering?.holeCode);
  const n = records?.length ?? 0;
  const parts = [project, prefix].filter(Boolean).join('-');
  return sanitizeFileNamePart(`${parts || '开土记录'}(${n}孔).xlsx`);
}
