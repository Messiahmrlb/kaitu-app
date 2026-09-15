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
