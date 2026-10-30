/**
 * 送样单试验子表头的别名归一（纯函数，便于单测）。
 *
 * 背景：不同送样单对同一位置试验列的写法不同：
 * - 剪试验两列（默认「饱固快剪」「自然快剪」）可能出现：
 *   饱固快剪（带「饱」+快剪）、固结快剪（带「固」不带「饱」，简称固快，不做饱和）、
 *   自然快剪（或只写「快剪」两个字）、慢剪；
 * - 固结列（默认「固结」）可能出现：回弹压缩、固结系数 等别名。
 *
 * 归一结果（canonical kind）就是数据键：勾选数据存 kind，
 * 表头显示存送样单原文（仅当原文 ≠ 默认名时才写记录级覆盖）。
 * 匹配必须先判剪试验再判固结：「固结快剪」含「固结」二字，
 * 若固结用包含匹配会误命中剪列（同「粘→黏」归一化的教训）。
 */

/** 剪试验四种归一名（即数据键） */
export type ShearKind = '饱固快剪' | '固结快剪' | '自然快剪' | '慢剪';

/** 需要覆盖默认表头名的剪试验（饱固快剪 / 自然快剪本身是默认名，无需覆盖） */
const NON_DEFAULT_SHEAR: readonly string[] = ['固结快剪', '慢剪'];

/**
 * 剪试验子表头归一：返回四种 kind 之一；不是剪试验返回 null。
 * 入参应为已归一化（无空白）的表头文本。
 * 规则（按用户 2026-10-30 确认）：
 * - 含「慢剪」→ 慢剪；
 * - 含「快剪」或恰为「固快」→ 剪试验，再细分：
 *   含「饱」→ 饱固快剪；含「固」→ 固结快剪；其余（自然快剪 / 快剪）→ 自然快剪。
 */
export function classifyShearLabel(n: string): ShearKind | null {
  const s = String(n ?? '').replace(/\s+/g, '');
  if (!s) return null;
  if (s.includes('慢剪')) return '慢剪';
  if (s.includes('快剪') || s === '固快') {
    if (s.includes('饱')) return '饱固快剪';
    if (s.includes('固')) return '固结快剪';
    return '自然快剪';
  }
  return null;
}

/**
 * 固结列别名识别：回弹压缩 / 固结系数 等 → 归一到「固结」，显示名记原文。
 * 「固结」「压缩系数压缩模量」是默认/标准写法，返回 null（不覆盖表头）。
 */
export function classifyConsolidationAlias(n: string): string | null {
  const s = String(n ?? '').replace(/\s+/g, '');
  if (!s) return null;
  if (s.includes('回弹') || s.includes('固结系数')) return s;
  return null;
}

/** 剪试验 kind 是否需要覆盖默认表头名 */
export function isNonDefaultShearKind(kind: ShearKind): boolean {
  return NON_DEFAULT_SHEAR.includes(kind);
}
