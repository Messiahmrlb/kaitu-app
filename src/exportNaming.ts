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
