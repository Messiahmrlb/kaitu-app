"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/utils.ts
var utils_exports = {};
__export(utils_exports, {
  buildRecordSamples: () => buildRecordSamples,
  coupleDisturbance: () => coupleDisturbance,
  disturbedTestConflicts: () => disturbedTestConflicts,
  genId: () => genId,
  insertSampleAt: () => insertSampleAt,
  isDisturbedTestConflict: () => isDisturbedTestConflict,
  isPermQuickConflict: () => isPermQuickConflict,
  isQuickShearBothConflict: () => isQuickShearBothConflict,
  isRecordDirty: () => isRecordDirty,
  newRecord: () => newRecord,
  newSample: () => newSample,
  newSamplesBatch: () => newSamplesBatch,
  nextSeq: () => nextSeq,
  parseTrailingSeq: () => parseTrailingSeq,
  renumberDigitsOnly: () => renumberDigitsOnly,
  renumberSamplesByHole: () => renumberSamplesByHole,
  setDisturbance: () => setDisturbance,
  sortRecordsByHole: () => sortRecordsByHole,
  todayStr: () => todayStr,
  upsertRecord: () => upsertRecord
});
module.exports = __toCommonJS(utils_exports);

// src/constants.ts
var TEST_ITEMS = [
  "\u7269\u6027",
  "\u9897\u5206",
  "\u56FA\u7ED3",
  "\u5782\u76F4\u6E17\u900F",
  "\u6C34\u5E73\u6E17\u900F",
  "\u9971\u56FA\u5FEB\u526A",
  "\u81EA\u7136\u5FEB\u526A",
  "\u4E09\u8F74"
];
var DISTURBED_APPLICABLE_TESTS = ["\u7269\u6027", "\u9897\u5206"];
var DISTURBED_INCOMPATIBLE_TESTS = TEST_ITEMS.filter(
  (t) => !DISTURBED_APPLICABLE_TESTS.includes(t)
);

// src/utils.ts
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function todayStr() {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function newSample(index, soilNumber) {
  return {
    id: genId(),
    soilNumber: soilNumber ?? `-${index}`,
    fieldRecord: "",
    sampleDepth: "",
    sampleElevation: "",
    color: "",
    smell: "",
    soilType: [],
    inclusions: [],
    soilState: [],
    soilStateNote: "",
    testItems: [],
    il: "",
    ip: "",
    disturbance: "\u539F\u72B6",
    siltySand: "none",
    otherTestItems: []
  };
}
function parseTrailingSeq(soilNumber) {
  const m = /-(\d+)$/.exec(soilNumber ?? "");
  return m ? parseInt(m[1], 10) : null;
}
function nextSeq(samples) {
  let max = 0;
  for (const s of samples) {
    const seq = parseTrailingSeq(s.soilNumber);
    if (seq !== null && seq > max) max = seq;
  }
  return max + 1;
}
function newSamplesBatch(count, holeCode, samples) {
  const start = nextSeq(samples);
  const prefix = (holeCode ?? "").trim();
  const list = [];
  for (let i = 0; i < count; i++) {
    const seq = start + i;
    const soilNumber = prefix ? `${prefix}-${seq}` : `-${seq}`;
    list.push(newSample(seq, soilNumber));
  }
  return list;
}
function buildRecordSamples(holeCode, normalCount, rCount) {
  const hole = (holeCode ?? "").trim();
  const list = newSamplesBatch(Math.max(0, normalCount), hole, []);
  for (let i = 0; i < Math.max(0, rCount); i++) {
    const s = newSample(i + 1, hole ? `${hole}-R${i + 1}` : `-R${i + 1}`);
    s.disturbance = "\u6270\u52A8";
    list.push(setDisturbance(s, "\u6270\u52A8"));
  }
  return list;
}
function insertSampleAt(samples, atIndex, sample) {
  const list = [...samples];
  list.splice(atIndex, 0, sample);
  return list;
}
function renumberDigitsOnly(samples, holeCode) {
  const hole = (holeCode ?? "").trim();
  let seq = 0;
  return samples.map((s) => {
    if (isDigitSoilNumber(s.soilNumber, hole)) {
      seq += 1;
      return { ...s, soilNumber: hole ? `${hole}-${seq}` : `-${seq}` };
    }
    return { ...s };
  });
}
function isDigitSoilNumber(n, hole) {
  let rest = n ?? "";
  if (hole && rest.startsWith(hole + "-")) rest = rest.slice(hole.length + 1);
  else if (!hole && rest.startsWith("-")) rest = rest.slice(1);
  return rest.length > 0 && /^\d+$/.test(rest);
}
function renumberSamplesByHole(samples, oldHole, newHole) {
  const oldTrim = (oldHole ?? "").trim();
  const newTrim = (newHole ?? "").trim();
  if (newTrim === oldTrim) return samples;
  return samples.map((s) => {
    const seq = parseTrailingSeq(s.soilNumber);
    if (seq == null) return s;
    const newSoil = newTrim ? `${newTrim}-${seq}` : `-${seq}`;
    if (newSoil === s.soilNumber) return s;
    return { ...s, soilNumber: newSoil };
  });
}
function coupleDisturbance(sample) {
  const clone = { ...sample, testItems: [...sample.testItems ?? []] };
  if (sample.disturbance === "\u6270\u52A8" && !clone.testItems.includes("\u9897\u5206")) {
    clone.testItems = [...clone.testItems, "\u9897\u5206"];
  }
  return clone;
}
function setDisturbance(sample, next) {
  const clone = { ...sample, testItems: [...sample.testItems ?? []] };
  clone.disturbance = next;
  if (next === "\u6270\u52A8") {
    if (!clone.testItems.includes("\u9897\u5206")) clone.testItems = [...clone.testItems, "\u9897\u5206"];
  } else {
    const ip = parseFloat(String(sample.ip ?? ""));
    const ipLe10 = !Number.isNaN(ip) && ip <= 10;
    if (clone.testItems.includes("\u9897\u5206") && !(sample.disturbance === "\u539F\u72B6" && ipLe10)) {
      clone.testItems = clone.testItems.filter((t) => t !== "\u9897\u5206");
    }
  }
  return clone;
}
function isPermQuickConflict(sample) {
  const items = sample.testItems ?? [];
  const hasPermeability = items.includes("\u5782\u76F4\u6E17\u900F") || items.includes("\u6C34\u5E73\u6E17\u900F");
  const hasQuickShear = items.includes("\u9971\u56FA\u5FEB\u526A") || items.includes("\u81EA\u7136\u5FEB\u526A");
  return hasPermeability && hasQuickShear;
}
function isQuickShearBothConflict(sample) {
  return sample.testItems.includes("\u9971\u56FA\u5FEB\u526A") && sample.testItems.includes("\u81EA\u7136\u5FEB\u526A");
}
function disturbedTestConflicts(sample) {
  if (sample.disturbance !== "\u6270\u52A8") return [];
  const items = sample.testItems ?? [];
  return DISTURBED_INCOMPATIBLE_TESTS.filter((t) => items.includes(t));
}
function isDisturbedTestConflict(sample) {
  return disturbedTestConflicts(sample).length > 0;
}
function newRecord(mode) {
  return {
    id: genId(),
    name: `\u5F00\u571F\u8BB0\u5F55 ${todayStr()}`,
    mode,
    engineering: {
      projectCode: "",
      holeCode: "",
      holeElevation: "",
      openDate: todayStr()
    },
    samples: [newSample(1)],
    customTestItems: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
function naturalSoilNumber(s) {
  const i = s.lastIndexOf("-");
  if (i >= 0 && /\d/.test(s.slice(i + 1))) {
    return [s.slice(0, i), parseInt(s.slice(i + 1), 10) || 0];
  }
  const m = /(\d+)$/.exec(s);
  if (m) return [s.slice(0, m.index ?? 0), parseInt(m[1], 10)];
  return [s, 0];
}
function sortRecordsByHole(records, dir) {
  const arr = [...records];
  arr.sort((a, b) => {
    const [pa, na] = naturalSoilNumber(a.engineering.holeCode);
    const [pb, nb] = naturalSoilNumber(b.engineering.holeCode);
    let cmp = pa.localeCompare(pb, "zh");
    if (cmp === 0) cmp = na - nb;
    return dir === "asc" ? cmp : -cmp;
  });
  return arr;
}
function upsertRecord(records, rec) {
  return records.some((r) => r.id === rec.id) ? records.map((r) => r.id === rec.id ? rec : r) : [...records, rec];
}
function isRecordDirty(records, rec) {
  const stored = records.find((r) => r.id === rec.id);
  return !stored || stored.updatedAt !== rec.updatedAt;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildRecordSamples,
  coupleDisturbance,
  disturbedTestConflicts,
  genId,
  insertSampleAt,
  isDisturbedTestConflict,
  isPermQuickConflict,
  isQuickShearBothConflict,
  isRecordDirty,
  newRecord,
  newSample,
  newSamplesBatch,
  nextSeq,
  parseTrailingSeq,
  renumberDigitsOnly,
  renumberSamplesByHole,
  setDisturbance,
  sortRecordsByHole,
  todayStr,
  upsertRecord
});
