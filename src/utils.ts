import { SoilSample, SoilRecord, RecordMode } from './types';

/** 生成短随机 id（时间与随机串组合） */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 当前日期字符串 YYYY-MM-DD */
export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 创建一条空白土样，序号 index 用于默认土号（-index）
 *  @param soilNumber 可选，显式指定土号（批量编号时使用）；不传则默认 -index
 */
export function newSample(index: number, soilNumber?: string): SoilSample {
  return {
    id: genId(),
    soilNumber: soilNumber ?? `-${index}`,
    fieldRecord: '',
    sampleDepth: '',
    sampleElevation: '',
    color: '',
    smell: '',
    soilType: [],
    inclusions: [],
    soilState: [],
    soilStateNote: '',
    testItems: [],
    il: '',
    ip: '',
    disturbance: '原状',
    siltySand: 'none',
    otherTestItems: [],
  };
}

/**
 * 解析土号末尾的 -数字，返回该数字；无匹配返回 null。
 * 例如：'ZK1-3' -> 3，'-5' -> 5，'ABC' -> null，'ZK1-1a' -> null。
 */
export function parseTrailingSeq(soilNumber: string): number | null {
  const m = /-(\d+)$/.exec(soilNumber ?? '');
  return m ? parseInt(m[1], 10) : null;
}

/** 现有土样中末尾序号的最大值 + 1，作为新批次起始序号（无则 1） */
export function nextSeq(samples: SoilSample[]): number {
  let max = 0;
  for (const s of samples) {
    const seq = parseTrailingSeq(s.soilNumber);
    if (seq !== null && seq > max) max = seq;
  }
  return max + 1;
}

/**
 * 批量生成 count 条空白土样，土号按 孔号 前缀自动编号。
 * - 孔号非空：土号 = `${孔号}-${seq}`，如 孔号 ZK1 -> ZK1-1、ZK1-2...
 * - 孔号为空：土号 = `-${seq}`，如 -1、-2...
 * seq 从现有最大末尾序号 + 1 起算，固定追加，绝不覆盖已有土样。
 */
export function newSamplesBatch(
  count: number,
  holeCode: string,
  samples: SoilSample[],
): SoilSample[] {
  const start = nextSeq(samples);
  const prefix = (holeCode ?? '').trim();
  const list: SoilSample[] = [];
  for (let i = 0; i < count; i++) {
    const seq = start + i;
    const soilNumber = prefix ? `${prefix}-${seq}` : `-${seq}`;
    list.push(newSample(seq, soilNumber));
  }
  return list;
}

/**
 * 扰动土联动规则：返回 sample 的克隆副本，绝不修改入参。
 * - disturbance === '扰动'：确保 testItems 中包含「颗分」（去重、保持原有顺序）。
 * - disturbance === '原状'：原样返回克隆（不改动 testItems）。
 */
export function coupleDisturbance(sample: SoilSample): SoilSample {
  const clone: SoilSample = { ...sample, testItems: [...(sample.testItems ?? [])] };
  if (sample.disturbance === '扰动' && !clone.testItems.includes('颗分')) {
    clone.testItems = [...clone.testItems, '颗分'];
  }
  return clone;
}

/**
 * 扰动土 ↔ 颗分 可逆联动：返回 sample 的克隆副本，绝不修改入参。
 * - next === '扰动'：确保 testItems 中包含「颗分」（去重、保持原有顺序）。
 * - next === '原状'：摘掉「颗分」，除非该土样当前为「原状且塑性指数 Ip≤10」
 *   （此情形本应做颗分，导出颗分统计表也会纳入，故保留）。
 */
export function setDisturbance(sample: SoilSample, next: '原状' | '扰动'): SoilSample {
  const clone: SoilSample = { ...sample, testItems: [...(sample.testItems ?? [])] };
  // 同步 disturbance 字段本身（调用方未必显式设置，故此处兜底，确保 UI 与导出一致）
  clone.disturbance = next;
  if (next === '扰动') {
    if (!clone.testItems.includes('颗分')) clone.testItems = [...clone.testItems, '颗分'];
  } else {
    // 原状：摘掉颗分，除非"原状且塑性指数 Ip≤10"（此情形本应做颗分，且导出颗分统计表会纳入）
    // 注意：判定用 sample.disturbance（切换前的原值），不受上面 clone.disturbance = next 影响
    const ip = parseFloat(String(sample.ip ?? ''));
    const ipLe10 = !Number.isNaN(ip) && ip <= 10;
    if (clone.testItems.includes('颗分') && !(sample.disturbance === '原状' && ipLe10)) {
      clone.testItems = clone.testItems.filter((t: string) => t !== '颗分');
    }
  }
  return clone;
}

/**
 * 渗透/快剪冲突判定：当 sample 同时包含「渗透」（垂直渗透 或 水平渗透）
 * 与「快剪」（饱固快剪 或 自然快剪）时返回 true，否则 false。
 * 用于在批量勾选对话框中对冲突行标红提示。
 */
export function isPermQuickConflict(sample: SoilSample): boolean {
  const items = sample.testItems ?? [];
  const hasPermeability = items.includes('垂直渗透') || items.includes('水平渗透');
  const hasQuickShear = items.includes('饱固快剪') || items.includes('自然快剪');
  return hasPermeability && hasQuickShear;
}

/**
 * 快剪项互斥冲突判定：当 sample 同时勾选「饱固快剪」与「自然快剪」时返回 true。
 * 用于在批量勾选对话框中对冲突行标红提示（二者一般不同时做）。
 */
export function isQuickShearBothConflict(sample: SoilSample): boolean {
  return sample.testItems.includes('饱固快剪') && sample.testItems.includes('自然快剪');
}

/** 创建一份空白记录（含一条默认土样） */
export function newRecord(mode: RecordMode): SoilRecord {
  return {
    id: genId(),
    name: `开土记录 ${todayStr()}`,
    mode,
    engineering: {
      projectCode: '',
      holeCode: '',
      holeElevation: '',
      openDate: todayStr(),
    },
    samples: [newSample(1)],
    customTestItems: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * 土号/孔号自然排序：按最后一个 '-' 拆成 [前缀, 数字]，数字部分按数值比，
 * 保证 D25-2 < D25-10（避免字符串排序把 10 排在 2 前）。
 */
function naturalSoilNumber(s: string): [string, number] {
  const i = s.lastIndexOf('-');
  if (i >= 0 && /\d/.test(s.slice(i + 1))) {
    return [s.slice(0, i), parseInt(s.slice(i + 1), 10) || 0];
  }
  const m = /(\d+)$/.exec(s);
  if (m) return [s.slice(0, m.index ?? 0), parseInt(m[1], 10)];
  return [s, 0];
}

/**
 * 记录按孔号（engineering.holeCode）自然排序：按最后一个 '-' 拆 [前缀, 数字]，
 * 数字按数值比，保证 D25-2 < D25-10、M10 < M11。
 * dir 为 'desc' 时整体反转。空孔号不崩溃（归为前缀空串、数字 0）。
 */
export function sortRecordsByHole(records: SoilRecord[], dir: 'asc' | 'desc'): SoilRecord[] {
  const arr = [...records];
  arr.sort((a, b) => {
    const [pa, na] = naturalSoilNumber(a.engineering.holeCode);
    const [pb, nb] = naturalSoilNumber(b.engineering.holeCode);
    let cmp = pa.localeCompare(pb, 'zh');
    if (cmp === 0) cmp = na - nb;
    return dir === 'asc' ? cmp : -cmp;
  });
  return arr;
}
