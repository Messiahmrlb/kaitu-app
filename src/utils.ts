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
 * 在指定位置插入一条土样，返回新数组（不修改入参）。
 * 注意：只做插入，不改变任何已有土样的土号——用户（尤其扰动土用 ZK1-R1 这类编号时）
 * 希望手工控制编号，自动重排会把 R 编号覆盖成数字，故插入不做重排。
 */
export function insertSampleAt(
  samples: SoilSample[],
  atIndex: number,
  sample: SoilSample,
): SoilSample[] {
  const list = [...samples];
  list.splice(atIndex, 0, sample);
  return list;
}

/**
 * 仅对「纯数字编号」的土样重新顺序编号（孔号前缀 + 序号 1,2,3…），
 * 保留 ZK1-R1 这类含字母（R）的手工编号不动。用于插入土样后让数字编号连续、R 编号不被覆盖。
 * 判定数字编号：去掉可选的「孔号-」前缀（无孔号则去掉前导「-」）后，剩余部分全为数字。
 */
export function renumberDigitsOnly(
  samples: SoilSample[],
  holeCode: string,
): SoilSample[] {
  const hole = (holeCode ?? '').trim();
  let seq = 0;
  return samples.map((s) => {
    if (isDigitSoilNumber(s.soilNumber, hole)) {
      seq += 1;
      return { ...s, soilNumber: hole ? `${hole}-${seq}` : `-${seq}` };
    }
    return { ...s };
  });
}

/** 判定土号是否为「纯数字编号」（去掉可选孔号前缀后剩余部分全为数字） */
function isDigitSoilNumber(n: string, hole: string): boolean {
  let rest = n ?? '';
  if (hole && rest.startsWith(hole + '-')) rest = rest.slice(hole.length + 1);
  else if (!hole && rest.startsWith('-')) rest = rest.slice(1);
  return rest.length > 0 && /^\d+$/.test(rest);
}

/**
 * 孔号变更时，将现有土样的土号前缀从 oldHole 实时替换为 newHole。
 * - 仅改写「土号刚好等于 `${oldHole}-${seq}`」的土样（seq 为末尾 -数字），其余原样返回；
 * - 若 oldHole 为空，则匹配纯 `-${seq}` 形式的土号；
 * - 新土号 = `${newHole}-${seq}`（newHole 为空时退回 `-${seq}`）。
 * 不修改入参，返回新的数组/对象副本。
 */
export function renumberSamplesByHole(
  samples: SoilSample[],
  oldHole: string,
  newHole: string,
): SoilSample[] {
  const oldTrim = (oldHole ?? '').trim();
  const newTrim = (newHole ?? '').trim();
  if (newTrim === oldTrim) return samples;
  return samples.map((s) => {
    const seq = parseTrailingSeq(s.soilNumber);
    // 只要土号带「-数字」后缀（无论当前前缀是孔号还是空），都按新孔号统一重编号。
    // 这样导入的 D25-1 与 App 内手加的 -1 在改孔号时会一致跟随，不再出现「只改了几个」。
    // 完全手工填写、不含 -数字 后缀的土号（如 'abc'）原样保留，不被误改。
    if (seq == null) return s;
    const newSoil = newTrim ? `${newTrim}-${seq}` : `-${seq}`;
    if (newSoil === s.soilNumber) return s;
    return { ...s, soilNumber: newSoil };
  });
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
