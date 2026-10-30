/**
 * 数据模型定义
 *
 * 整份「开土记录」在 App 中以 SoilRecord 为单位：
 * - engineering：工程级表头信息（工程编号 / 孔号 / 孔口标高 / 开土日期）
 * - mode：鉴别格式 A（普通目力鉴别）或 B（三角坐标定名），决定「目力鉴别土类」可选项
 * - samples：逐条土样（每条一行）
 *
 * 注意：SoilSample 中的 il / ip（液性指数 / 塑性指数）仅 App 内显示与本地保存，
 * 导出并打印的 xlsx 表格中不包含这两列。
 */

/** 鉴别格式：A=普通目力鉴别，B=三角坐标定名 */
export type RecordMode = 'A' | 'B';

/** 工程级表头信息 */
export interface EngineeringInfo {
  /** 工程编号 */
  projectCode: string;
  /** 孔号 */
  holeCode: string;
  /** 孔口标高(m) */
  holeElevation: string;
  /** 开土日期(年/月/日)，格式 YYYY-MM-DD */
  openDate: string;
}

/** 单条土样 */
export interface SoilSample {
  /** 内部唯一 id（不写入文档） */
  id: string;
  /** 土号（如 -1、-2，可改） */
  soilNumber: string;
  /** 野外记录（自由文本） */
  fieldRecord: string;
  /** 取样深度 */
  sampleDepth: string;
  /** 取样标高 */
  sampleElevation: string;
  /** 颜色 */
  color: string;
  /** 气味 */
  smell: string;
  /** 目力鉴别土类（多选，选项由 mode 决定） */
  soilType: string[];
  /** 夹杂物（多选） */
  inclusions: string[];
  /** 土样情况（多选：湿/密/硬塑/可塑/软塑） */
  soilState: string[];
  /** 土样情况-备注（文本） */
  soilStateNote: string;
  /** 要求实验项目（多选） */
  testItems: string[];
  /** 液性指数 IL（仅 App 内显示/保存，不打印） */
  il: string;
  /** 塑性指数 Ip（仅 App 内显示/保存，不打印） */
  ip: string;
  /** 扰动土：原状 / 扰动（二选一；导出主表第15列仅「扰动」打√） */
  disturbance: '原状' | '扰动';
  /** 粉砂判定：三角形(triangle) / 空心圆(circle) / 空(none，两者都不选)（导出第二工作表） */
  siltySand: 'triangle' | 'circle' | 'none';
  /** 其他试验项目（APP 内留底的未知试验项自由文本；不写入导出 40 列主表） */
  otherTestItems: string[];
}

/** 一份完整的开土记录 */
export interface SoilRecord {
  /** 内部唯一 id */
  id: string;
  /** 记录名称（便于用户在列表中区分，可改） */
  name: string;
  /** 鉴别格式 */
  mode: RecordMode;
  /** 工程级表头信息 */
  engineering: EngineeringInfo;
  /** 土样列表 */
  samples: SoilSample[];
  /** 自定义/额外试验项目名称列表（按记录独立，各记录互不串） */
  customTestItems: string[];
  /**
   * 剪切试验两列的显示名（默认 饱固快剪/自然快剪）。
   * 导入送样单按子表头识别：如「固结快剪」「慢剪」等别名写法时记录原文；
   * 勾选数据键 = 显示名（四种归一名之一），导出与 UI 全部跟随显示名。
   */
  shearLabels?: [string, string];
  /** 固结列显示名（默认「固结」；送样单写「回弹压缩」等别名时记录原文，数据键恒为「固结」） */
  consolidationLabel?: string;
  /** 创建时间（毫秒时间戳） */
  createdAt: number;
  /** 最后更新时间（毫秒时间戳） */
  updatedAt: number;
}
