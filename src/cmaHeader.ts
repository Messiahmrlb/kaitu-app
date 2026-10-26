/**
 * PDF 页眉「文头」可自定义项（内部称 CMA 设置）。
 *
 * 纸质开土记录表右上角有两排固定文字：
 *  1) 版本行：`第 3 版 第 0 次修改 2024 年 12 月 1 日起实施`
 *  2) 文件编号：`SHLY-TR068-2024`
 * 这两项按年度/换版会变，因此抽成可配置项，由用户在首页「CMA 设置」里维护。
 *
 * 本文件是纯逻辑（无 Capacitor / DOM 依赖），便于回归测试；
 * 持久化读写见 `cmaStorage.ts`。
 */

export interface CmaHeaderSettings {
  /** 页眉右上角版本行 */
  versionLine: string;
  /** 页眉右侧文件编号 */
  docCode: string;
}

/** 出厂默认值：与原始纸质模板一致 */
export const CMA_DEFAULT: CmaHeaderSettings = {
  versionLine: '第 3 版 第 0 次修改 2024 年 12 月 1 日起实施',
  docCode: 'SHLY-TR068-2024',
};

/** 建议长度（超出不阻止保存，仅提示可能压缩字号） */
export const CMA_LIMITS = {
  versionLine: 40,
  docCode: 24,
} as const;

/**
 * 规整外部传入的配置：
 * - 非对象 / 字段缺失 / 非字符串 → 回落默认值
 * - 换行、制表符折叠为空格（PDF 页眉为单行），并去掉首尾空白
 * - 内部空格保留（版本行本身就带空格）
 */
export function normalizeCmaHeader(input: unknown): CmaHeaderSettings {
  const src =
    input && typeof input === 'object' ? (input as Partial<Record<keyof CmaHeaderSettings, unknown>>) : {};
  const pick = (v: unknown, fallback: string): string => {
    const s = typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim() : '';
    return s || fallback;
  };
  return {
    versionLine: pick(src.versionLine, CMA_DEFAULT.versionLine),
    docCode: pick(src.docCode, CMA_DEFAULT.docCode),
  };
}

export interface CmaFieldChange {
  key: keyof CmaHeaderSettings;
  label: string;
  from: string;
  to: string;
}

/** 列出与旧值不同的字段，用于「确认修改」弹窗展示变更明细 */
export function describeCmaChanges(
  before: CmaHeaderSettings,
  after: CmaHeaderSettings,
): CmaFieldChange[] {
  const a = normalizeCmaHeader(before);
  const b = normalizeCmaHeader(after);
  const out: CmaFieldChange[] = [];
  if (a.versionLine !== b.versionLine) {
    out.push({ key: 'versionLine', label: '版本行', from: a.versionLine, to: b.versionLine });
  }
  if (a.docCode !== b.docCode) {
    out.push({ key: 'docCode', label: '文件编号', from: a.docCode, to: b.docCode });
  }
  return out;
}

/** 是否是出厂默认值（用于界面提示「当前为默认」） */
export function isCmaHeaderDefault(s: CmaHeaderSettings): boolean {
  const v = normalizeCmaHeader(s);
  return v.versionLine === CMA_DEFAULT.versionLine && v.docCode === CMA_DEFAULT.docCode;
}

/** 单字符宽度（以 em 为单位）的粗略估算，够用于页眉这类单行短文本 */
function charEm(c: string): number {
  const code = c.codePointAt(0) ?? 0;
  if (code > 0x2e80) return 1; // CJK / 全角标点
  if (c === ' ') return 0.32;
  if (c >= '0' && c <= '9') return 0.55;
  if (c >= 'A' && c <= 'Z') return 0.62;
  if (c >= 'a' && c <= 'z') return 0.52;
  if ('-_./:'.includes(c)) return 0.34;
  return 0.55;
}

/**
 * 按可用宽度收窄字号，保证自定义文本变长时不越出页边。
 * 文本本身就放得下时返回基准字号（不放大），因此默认值与模板外观完全一致。
 *
 * @param text       待渲染文本
 * @param basePt     模板基准字号（pt）
 * @param maxWidthPt 可用宽度（pt）
 * @param minPt      下限字号，防止缩到不可读
 */
export function fitHeaderFontSize(
  text: string,
  basePt: number,
  maxWidthPt: number,
  minPt = 6,
): number {
  const em = [...String(text ?? '')].reduce((sum, c) => sum + charEm(c), 0);
  if (!(em > 0) || !(maxWidthPt > 0)) return basePt;
  const needWidth = em * basePt;
  if (needWidth <= maxWidthPt) return basePt;
  const fitted = (basePt * maxWidthPt) / needWidth;
  return Math.max(minPt, Math.round(fitted * 100) / 100);
}
