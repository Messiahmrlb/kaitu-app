/**
 * 字段常量：两类模式下的选项、夹杂物、土样情况、实验项目。
 * 这些选项与示例「开土记录表.docx」的列结构严格一致。
 */

/** 模式 A：普通目力鉴别 的土名选项 */
export const SOIL_TYPE_A: string[] = [
  '中砂',
  '细砂',
  '粉砂',
  '粉土',
  '粉质黏土',
  '黏土',
];

/** 模式 B：三角坐标定名 的土名选项 */
export const SOIL_TYPE_B: string[] = [
  '粉砂',
  '轻粉质壤土',
  '中粉质壤土',
  '重粉质壤土',
  '粉粘土',
  '粘土',
];

/** 夹杂物（11 项，顺序与示例一致） */
export const INCLUSIONS: string[] = [
  '含姜石',
  '含有机质',
  '含锈斑',
  '含植物根系',
  '含贝壳',
  '均质土',
  '粉土中含粘粒',
  '粘土中含粉粒',
  '粉粘互层',
  '粉粘夹层',
  '粉粘错层',
];

/** 土样情况（5 项多选） */
export const SOIL_STATES: string[] = ['湿', '密', '硬塑', '可塑', '软塑'];

/** 要求实验项目（8 项，顺序与示例一致） */
export const TEST_ITEMS: string[] = [
  '物性',
  '颗分',
  '固结',
  '垂直渗透',
  '水平渗透',
  '饱固快剪',
  '自然快剪',
  '三轴',
];

/** 对扰动土也适用的试验项目：点「全选」时不跳过扰动土；其余项（固结/渗透/快剪/三轴）仅对原状土勾选 */
export const DISTURBED_APPLICABLE_TESTS: string[] = ['物性', '颗分'];

/** 剪切类试验四种归一名（含送样单别名「固结快剪」「慢剪」）：渗透冲突判定范围 */
export const SHEAR_TEST_KEYS: string[] = ['饱固快剪', '固结快剪', '自然快剪', '慢剪'];

/** 主表固定的两个剪槽默认名 */
export const DEFAULT_SHEAR_LABELS: [string, string] = ['饱固快剪', '自然快剪'];

/** 记录级试验列定义（子表头标签 + 数据键）：剪切两列与固结列名按记录覆盖 */
export interface TestColumn {
  /** 数据键（写入 sample.testItems / 打 √ 查找用） */
  key: string;
  /** 表头显示名（xlsx / PDF / UI 一致使用） */
  label: string;
}

/**
 * 按记录解析主表 8 个试验列：
 * - 固结列：label 取 record.consolidationLabel（送样单写「回弹压缩」等别名时为原文），键恒为「固结」；
 * - 剪切两列：label/key 取 record.shearLabels（如「固结快剪」「慢剪」），缺省回落默认名；
 * - 其余列与 TEST_ITEMS 一致。
 * 无覆盖（undefined / 旧数据）时输出与 TEST_ITEMS 完全相同，行为向后兼容。
 */
export function recordTestColumns(
  record?: { shearLabels?: [string, string]; consolidationLabel?: string } | null,
): TestColumn[] {
  const [s1, s2] = record?.shearLabels ?? [];
  const cons = record?.consolidationLabel;
  return TEST_ITEMS.map((t) => {
    if (t === '固结') return { key: '固结', label: cons || '固结' };
    if (t === '饱固快剪') return { key: s1 || '饱固快剪', label: s1 || '饱固快剪' };
    if (t === '自然快剪') return { key: s2 || '自然快剪', label: s2 || '自然快剪' };
    return { key: t, label: t };
  });
}

/** 扰动土不适用的试验项目：除 物性/颗分 外的所有项目（固结/两种渗透/两种剪切/三轴等），勾选时提示冲突 */
export const DISTURBED_INCOMPATIBLE_TESTS: string[] = TEST_ITEMS.filter(
  (t) => !DISTURBED_APPLICABLE_TESTS.includes(t),
);

/** 模式标签，用于列表/对话框展示 */
export const MODE_LABELS: Record<'A' | 'B', string> = {
  A: '普通目力鉴别',
  B: '三角坐标定名',
};

/** 根据模式返回对应的土名选项 */
export function soilTypeOptions(mode: 'A' | 'B'): string[] {
  return mode === 'A' ? SOIL_TYPE_A : SOIL_TYPE_B;
}

/** 扰动土 互斥取值：原状 / 扰动 */
export const DISTURBANCE: ('原状' | '扰动')[] = ['原状', '扰动'];

/** 粉砂判定 选项：三角形 / 空心圆 / 空（两者都不选） */
export const SILTY_SAND: { value: 'triangle' | 'circle' | 'none'; label: string }[] = [
  { value: 'triangle', label: '三角形' },
  { value: 'circle', label: '空心圆' },
  { value: 'none', label: '空' },
];

/** 粉砂判定符号：三角形 -> △，空心圆 -> ○，空/未选 -> ''（不填） */
export function siltySandSymbol(v: 'triangle' | 'circle' | 'none'): string {
  if (v === 'triangle') return '△';
  if (v === 'circle') return '○';
  return '';
}
