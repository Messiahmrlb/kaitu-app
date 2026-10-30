"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/importDelivery.ts
var importDelivery_exports = {};
__export(importDelivery_exports, {
  detectRecordMode: () => detectRecordMode,
  isChecked: () => isChecked,
  isNumericDepth: () => isNumericDepth,
  matchSoilTypeName: () => matchSoilTypeName,
  mergeImportedByHole: () => mergeImportedByHole,
  normalizeHeader: () => normalizeHeader,
  normalizeSoilName: () => normalizeSoilName,
  parseDeliveryFile: () => parseDeliveryFile,
  soilSeqOf: () => soilSeqOf
});
module.exports = __toCommonJS(importDelivery_exports);

// src/constants.ts
var SOIL_TYPE_A = [
  "\u4E2D\u7802",
  "\u7EC6\u7802",
  "\u7C89\u7802",
  "\u7C89\u571F",
  "\u7C89\u8D28\u9ECF\u571F",
  "\u9ECF\u571F"
];
var SOIL_TYPE_B = [
  "\u7C89\u7802",
  "\u8F7B\u7C89\u8D28\u58E4\u571F",
  "\u4E2D\u7C89\u8D28\u58E4\u571F",
  "\u91CD\u7C89\u8D28\u58E4\u571F",
  "\u7C89\u7C98\u571F",
  "\u7C98\u571F"
];
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
var DEFAULT_SHEAR_LABELS = ["\u9971\u56FA\u5FEB\u526A", "\u81EA\u7136\u5FEB\u526A"];
var DISTURBED_INCOMPATIBLE_TESTS = TEST_ITEMS.filter(
  (t) => !DISTURBED_APPLICABLE_TESTS.includes(t)
);

// src/testHeader.ts
function classifyShearLabel(n) {
  const s = String(n ?? "").replace(/\s+/g, "");
  if (!s) return null;
  if (s.includes("\u6162\u526A")) return "\u6162\u526A";
  if (s.includes("\u5FEB\u526A") || s === "\u56FA\u5FEB") {
    if (s.includes("\u9971")) return "\u9971\u56FA\u5FEB\u526A";
    if (s.includes("\u56FA")) return "\u56FA\u7ED3\u5FEB\u526A";
    return "\u81EA\u7136\u5FEB\u526A";
  }
  return null;
}
function classifyConsolidationAlias(n) {
  const s = String(n ?? "").replace(/\s+/g, "");
  if (!s) return null;
  if (s.includes("\u56DE\u5F39") || s.includes("\u56FA\u7ED3\u7CFB\u6570")) return s;
  return null;
}

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
function coupleDisturbance(sample) {
  const clone = { ...sample, testItems: [...sample.testItems ?? []] };
  if (sample.disturbance === "\u6270\u52A8" && !clone.testItems.includes("\u9897\u5206")) {
    clone.testItems = [...clone.testItems, "\u9897\u5206"];
  }
  return clone;
}

// src/pwaRecovery.ts
var RELOAD_TS_KEY = "kaitu:chunk-reload-at";
var RELOAD_GUARD_MS = 3e4;
function isChunkLoadError(err) {
  const msg = typeof err === "string" ? err : err instanceof Error ? `${err.name} ${err.message}` : String(err?.message ?? err ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk [\w.-]+ failed|dynamically imported module/i.test(
    msg
  );
}
async function purgeOfflineCache() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
  }
}
function recoverFromChunkLoadError() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) ?? 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
  } catch {
  }
  void purgeOfflineCache().finally(() => {
    window.location.reload();
  });
  return true;
}
async function importWithRecovery(loader) {
  try {
    return await loader();
  } catch (e) {
    if (isChunkLoadError(e) && recoverFromChunkLoadError()) {
      return new Promise(() => {
      });
    }
    throw e;
  }
}

// src/importDelivery.ts
var TEST_LABEL_MAP = [
  { label: "\u5E38\u89C4\u7269\u6027", item: "\u7269\u6027" },
  { label: "\u6DB2\u5851\u9650", item: "\u7269\u6027" },
  // 液塑限折叠进「物性」
  { label: "\u9897\u5206", item: "\u9897\u5206" },
  { label: "\u538B\u7F29\u7CFB\u6570\u538B\u7F29\u6A21\u91CF", item: "\u56FA\u7ED3" },
  { label: "\u56FA\u7ED3", item: "\u56FA\u7ED3" },
  // 有的送样单直接写「固结」二字
  { label: "\u5782\u76F4\u6E17\u900F", item: "\u5782\u76F4\u6E17\u900F" },
  { label: "\u6C34\u5E73\u6E17\u900F", item: "\u6C34\u5E73\u6E17\u900F" },
  { label: "\u9971\u548C\u56FA\u7ED3\u5FEB\u526A", item: "\u9971\u56FA\u5FEB\u526A" },
  { label: "\u9971\u56FA\u5FEB\u526A", item: "\u9971\u56FA\u5FEB\u526A" },
  // 有的送样单写简称（此前漏识别，已补）
  { label: "\u81EA\u7136\u5FEB\u526A", item: "\u81EA\u7136\u5FEB\u526A" }
];
var NO_SET = /* @__PURE__ */ new Set(["", "\u2014", "\u2013", "\xD7", "/", "\uFF0F", "\u65E0", "\u5426"]);
function uniqueStrings(values) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
function soilSeqOf(soilNumber) {
  const s = String(soilNumber ?? "").trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const m = /(\d+)$/.exec(s);
  if (!m) return null;
  const before = s.slice(0, m.index);
  if (!/[-A-Za-z]$/.test(before)) return null;
  if (before.endsWith("-")) {
    const head = before.slice(0, -1);
    if (head && !head.includes("-")) return null;
  }
  return parseInt(m[1], 10);
}
function mergeImportedByHole(items) {
  const groups = [];
  const byHole = /* @__PURE__ */ new Map();
  for (const item of items ?? []) {
    const hole = (item.holeCode ?? "").trim();
    if (!hole) {
      groups.push({ hole: "", items: [item] });
      continue;
    }
    const existing = byHole.get(hole);
    if (existing) {
      existing.items.push(item);
    } else {
      const group = { hole, items: [item] };
      byHole.set(hole, group);
      groups.push(group);
    }
  }
  const records = [];
  const mergedNotes = [];
  const errors = [];
  for (const group of groups) {
    const first = group.items[0];
    const isMerged = group.items.length > 1;
    const mergedWarnings = uniqueStrings(group.items.flatMap((x) => x.warnings ?? []));
    const mergedErrors = uniqueStrings(group.items.flatMap((x) => x.errors ?? []));
    const describeHeader = (r) => `\u56FA\u7ED3\u5217\u300C${r.consolidationLabel ?? "\u56FA\u7ED3"}\u300D\u3001\u526A\u5207\u4E24\u5217\u300C${(r.shearLabels ?? DEFAULT_SHEAR_LABELS).join("\uFF0F")}\u300D`;
    const firstHeader = describeHeader(first.record);
    const headerMismatchIdx = [];
    group.items.forEach((x, i) => {
      if (i > 0 && describeHeader(x.record) !== firstHeader) headerMismatchIdx.push(i + 1);
    });
    if (headerMismatchIdx.length > 0) {
      mergedErrors.push(
        `\u5B54\u53F7 ${group.hole || "(\u7A7A)"} \u7684\u591A\u4EFD\u9001\u6837\u5355\u8BD5\u9A8C\u8868\u5934\u4E0D\u4E00\u81F4\uFF08\u7B2C 1 \u4EFD\uFF1A${firstHeader}\uFF1B\u7B2C ${headerMismatchIdx.join("\u3001")} \u4EFD\u4E0D\u540C\uFF09\uFF0C\u7591\u4F3C\u9001\u6837\u5355\u6765\u6E90\u6709\u8BEF\uFF0C\u5DF2\u6309\u7B2C 1 \u4EFD\u8868\u5934\u5408\u5E76\uFF0C\u8BF7\u6838\u5BF9\u3002`
      );
    }
    if (!isMerged) {
      records.push({
        ...first,
        warnings: mergedWarnings,
        errors: mergedErrors,
        mergedFrom: 1
      });
      errors.push(...mergedErrors);
      continue;
    }
    const samples = group.items.flatMap(
      (x) => (x.record.samples ?? []).map((s) => ({
        ...s,
        soilNumber: (s.soilNumber ?? "").trim()
      }))
    );
    const customTestItems = uniqueStrings(
      group.items.flatMap((x) => x.record.customTestItems ?? [])
    );
    const sheetName = uniqueStrings(group.items.map((x) => x.sheetName)).join("\u3001");
    records.push({
      record: {
        ...first.record,
        samples,
        customTestItems
      },
      sheetName,
      sampleCount: samples.length,
      holeCode: first.holeCode,
      warnings: mergedWarnings,
      errors: mergedErrors,
      mergedFrom: group.items.length
    });
    errors.push(...mergedErrors);
    mergedNotes.push(
      `\u5B54\u53F7 ${group.hole} \u7684 ${group.items.length} \u4EFD\u9001\u6837\u5355\u5DF2\u5408\u5E76\u4E3A 1 \u6761\u8BB0\u5F55`
    );
  }
  return { records, mergedNotes, errors: uniqueStrings(errors) };
}
var FOOTER_KEYWORDS = ["\u9001\u6837\u4EBA", "\u6536\u6837\u4EBA", "\u8BF4\u660E"];
function normalizeHeader(s) {
  return cellText(s).replace(/\s+/g, "");
}
function cellText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v;
    if (Array.isArray(o.richText)) {
      return o.richText.map((t) => t && typeof t.text === "string" ? t.text : "").join("");
    }
    if (typeof o.text === "string") return o.text;
    if (typeof o.result !== "undefined" && o.result !== null) return cellText(o.result);
  }
  return String(v);
}
function isChecked(v) {
  const s = cellText(v).trim();
  if (s === "" || NO_SET.has(s)) return false;
  if (s.includes("\u221A") || s.includes("\u25A0") || s.includes("\u2713")) return true;
  return true;
}
function normalizeSoilName(s) {
  return cellText(s).replace(/\s+/g, "").replace(/粘/g, "\u9ECF");
}
function matchSoilTypeName(name, options) {
  const n = normalizeSoilName(name);
  if (!n) return null;
  let best = null;
  let bestLen = 0;
  for (const o of options) {
    const no = normalizeSoilName(o);
    if (!no) continue;
    if (no === n) return o;
    if (n.includes(no) && no.length > bestLen) {
      best = o;
      bestLen = no.length;
    }
  }
  return best;
}
function exactMatchSoilType(name, options) {
  const n = normalizeSoilName(name);
  if (!n) return null;
  for (const o of options) {
    if (normalizeSoilName(o) === n) return o;
  }
  return null;
}
function detectRecordMode(fieldRecords, contextText = "") {
  if (contextText.replace(/\s+/g, "").includes("\u4E09\u89D2\u5750\u6807")) return "B";
  let scoreA = 0;
  let scoreB = 0;
  for (const raw of fieldRecords) {
    if (exactMatchSoilType(raw, SOIL_TYPE_A)) scoreA += 1;
    if (exactMatchSoilType(raw, SOIL_TYPE_B)) scoreB += 1;
  }
  if (scoreA + scoreB === 0) {
    for (const raw of fieldRecords) {
      const ma = matchSoilTypeName(raw, SOIL_TYPE_A);
      const mb = matchSoilTypeName(raw, SOIL_TYPE_B);
      if (!ma && !mb) continue;
      if (ma && mb) {
        const la = normalizeSoilName(ma).length;
        const lb = normalizeSoilName(mb).length;
        if (lb > la) scoreB += 1;
        else if (la > lb) scoreA += 1;
        else {
          scoreA += 1;
          scoreB += 1;
        }
      } else if (ma) scoreA += 1;
      else scoreB += 1;
    }
  }
  return scoreB > scoreA ? "B" : "A";
}
function findColByText(ws, rowNum, text) {
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= row.cellCount; c++) {
    if (normalizeHeader(row.getCell(c).value) === text) return c;
  }
  return -1;
}
function findInfoValue(ws, hrRow, label, minRow = Math.max(1, hrRow - 15)) {
  const start = Math.max(1, minRow);
  for (let r = start; r < hrRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      const norm = normalizeHeader(row.getCell(c).value);
      if (!norm.includes(label)) continue;
      const rest = norm.slice(norm.indexOf(label) + label.length).replace(/^[：:\s]+/, "").trim();
      if (rest) return rest;
      const right = cellText(row.getCell(c + 1).value).trim();
      if (right) return right;
      const left = c > 1 ? cellText(row.getCell(c - 1).value).trim() : "";
      if (left) return left;
    }
  }
  return "";
}
function isHeaderRow(ws, r) {
  const row = ws.getRow(r);
  let hasTN = false;
  for (let c = 1; c <= row.cellCount; c++) {
    if (normalizeHeader(row.getCell(c).value) === "\u571F\u6837\u7F16\u53F7") hasTN = true;
  }
  if (!hasTN) return false;
  for (let c = 1; c <= row.cellCount; c++) {
    const n = normalizeHeader(row.getCell(c).value);
    if (n === "\u81EA" || n === "\u81F3" || n === "\u539F\u72B6" || n === "\u6270\u52A8") return false;
  }
  const sub = ws.getRow(r + 1);
  let hasYuan = false;
  let hasTest = false;
  for (let c = 1; c <= sub.cellCount; c++) {
    const n = normalizeHeader(sub.getCell(c).value);
    if (n === "\u539F\u72B6") hasYuan = true;
    if (TEST_LABEL_MAP.some((m) => m.label === n) || classifyShearLabel(n) !== null || classifyConsolidationAlias(n) !== null)
      hasTest = true;
  }
  return hasYuan && hasTest;
}
function isNumericDepth(v) {
  const s = String(v ?? "").replace(/\s+/g, "").replace(/[～～~—–]/g, "-");
  if (s === "") return true;
  return /^\d+(\.\d+)?(\-\d+(\.\d+)?)?(m|米)?$/i.test(s);
}
function findHeaderRows(ws) {
  const hrs = [];
  for (let r = 1; r < ws.rowCount; r++) {
    if (isHeaderRow(ws, r)) hrs.push(r);
  }
  return hrs;
}
function parseOneBlock(ws, hr, sub, nextHr, inheritedHole = "", holeSearchStart = 1) {
  const warnings = [];
  const errors = [];
  const endRow = Math.min(nextHr - 1, ws.rowCount);
  const soilNoCol = findColByText(ws, hr, "\u571F\u6837\u7F16\u53F7");
  const fieldRecCol = findColByText(ws, hr, "\u91CE\u5916\u5B9A\u540D");
  const fromCol = findColByText(ws, sub, "\u81EA");
  const toCol = findColByText(ws, sub, "\u81F3");
  const distCol = findColByText(ws, sub, "\u6270\u52A8");
  const testCols = [];
  const shearSlots = [];
  let consolidationAlias = null;
  const KNOWN_TEST_LABELS = new Set(TEST_LABEL_MAP.map((m) => m.label));
  const STRUCT_LABELS = /* @__PURE__ */ new Set([
    "\u81EA",
    "\u81F3",
    "\u539F\u72B6",
    "\u6270\u52A8",
    "\u571F\u6837\u7F16\u53F7",
    "\u53D6\u571F\u6DF1\u5EA6",
    "\u91CE\u5916\u5B9A\u540D",
    "\u72B6\u6001",
    "\u8BD5\u9A8C\u9879\u76EE"
  ]);
  const unknownCols = [];
  const subRow = ws.getRow(sub);
  for (let c = 1; c <= subRow.cellCount; c++) {
    if (c === 1) continue;
    const label = normalizeHeader(subRow.getCell(c).value);
    if (label === "") continue;
    if (STRUCT_LABELS.has(label)) continue;
    if (KNOWN_TEST_LABELS.has(label)) {
      const item = TEST_LABEL_MAP.find((m) => m.label === label).item;
      if (item === "\u9971\u56FA\u5FEB\u526A" || item === "\u81EA\u7136\u5FEB\u526A") {
        if (shearSlots.some((s) => s.kind === item)) {
          unknownCols.push({ col: c, label });
          continue;
        }
        shearSlots.push({ kind: item, label: item });
      }
      testCols.push({ col: c, item });
      continue;
    }
    const shearKind = classifyShearLabel(label);
    if (shearKind !== null) {
      if (shearSlots.some((s) => s.kind === shearKind)) {
        unknownCols.push({ col: c, label });
        continue;
      }
      shearSlots.push({ kind: shearKind, label: shearKind });
      testCols.push({ col: c, item: shearKind });
      continue;
    }
    const consAlias = classifyConsolidationAlias(label);
    if (consAlias !== null) {
      consolidationAlias = consolidationAlias ?? consAlias;
      testCols.push({ col: c, item: "\u56FA\u7ED3" });
      continue;
    }
    unknownCols.push({ col: c, label });
  }
  const unknownSeen = /* @__PURE__ */ new Set();
  const shearLabels = shearSlots.length > 0 ? [
    shearSlots[0]?.label ?? DEFAULT_SHEAR_LABELS[0],
    shearSlots[1]?.label ?? DEFAULT_SHEAR_LABELS[1]
  ] : void 0;
  const hasShearOverride = !!shearLabels && (shearLabels[0] !== DEFAULT_SHEAR_LABELS[0] || shearLabels[1] !== DEFAULT_SHEAR_LABELS[1]);
  const ownHoleCode = findInfoValue(ws, hr, "\u5B54\u53F7", holeSearchStart);
  const inherited = !ownHoleCode && !!inheritedHole;
  const holeCode = ownHoleCode || inheritedHole;
  const projectName = findInfoValue(ws, hr, "\u5DE5\u7A0B\u540D\u79F0");
  if (inherited) {
    warnings.push(
      `\u5DE5\u4F5C\u8868\u300C${ws.name}\u300D\u7B2C ${hr} \u884C\u672A\u5199\u5B54\u53F7\uFF0C\u5DF2\u6CBF\u7528\u4E0A\u4E00\u5F20\u7684 ${holeCode}`
    );
  } else if (!holeCode) {
    warnings.push("\u672A\u5728\u5DE5\u4F5C\u8868\u4E2D\u627E\u5230\u201C\u5B54\u53F7\u201D\uFF0C\u8BB0\u5F55\u5C06\u4EE5\u7A7A\u5B54\u53F7\u521B\u5EFA\u3002");
  }
  if (!projectName) warnings.push("\u672A\u5728\u5DE5\u4F5C\u8868\u4E2D\u627E\u5230\u201C\u5DE5\u7A0B\u540D\u79F0\u201D\u3002");
  const samples = [];
  let headerJunkRows = 0;
  const depthJunk = [];
  let idx = 0;
  for (let r = sub + 1; r <= endRow; r++) {
    const row = ws.getRow(r);
    const soilNumberRaw = soilNoCol >= 0 ? cellText(row.getCell(soilNoCol).value).trim() : "";
    if (soilNumberRaw === "") continue;
    if (soilNumberRaw === "\u571F\u6837\u7F16\u53F7" || soilNumberRaw === "\u91CE\u5916\u5B9A\u540D") {
      headerJunkRows += 1;
      continue;
    }
    if (FOOTER_KEYWORDS.some((k) => soilNumberRaw.includes(k))) break;
    const from = fromCol >= 0 ? cellText(row.getCell(fromCol).value).trim() : "";
    const to = toCol >= 0 ? cellText(row.getCell(toCol).value).trim() : "";
    if (from && !isNumericDepth(from)) depthJunk.push({ row: r, colName: "\u81EA", value: from });
    if (to && !isNumericDepth(to)) depthJunk.push({ row: r, colName: "\u81F3", value: to });
    idx += 1;
    const s = newSample(idx, soilNumberRaw);
    if (fieldRecCol >= 0) s.fieldRecord = cellText(row.getCell(fieldRecCol).value).trim();
    s.sampleDepth = from && to ? `${from}~${to}` : from;
    if (distCol >= 0 && isChecked(row.getCell(distCol).value)) {
      s.disturbance = "\u6270\u52A8";
    }
    const items = [];
    for (const t of testCols) {
      if (isChecked(row.getCell(t.col).value) && !items.includes(t.item)) {
        items.push(t.item);
      }
    }
    s.testItems = items;
    const other = [];
    for (const u of unknownCols) {
      if (isChecked(row.getCell(u.col).value) && !other.includes(u.label)) {
        other.push(u.label);
        unknownSeen.add(u.label);
      }
    }
    s.otherTestItems = other;
    samples.push(coupleDisturbance(s));
  }
  if (inherited && samples.length > 0) {
    const firstSoilNumber = (samples[0].soilNumber ?? "").trim();
    if (soilSeqOf(firstSoilNumber) === 1) {
      errors.push(
        `\u5DE5\u4F5C\u8868\u300C${ws.name}\u300D\u7B2C ${hr} \u884C\u672A\u5199\u5B54\u53F7\u3001\u571F\u53F7\u53C8\u4ECE ${firstSoilNumber} \u91CD\u65B0\u5F00\u59CB\uFF0C\u7591\u4F3C\u9001\u6837\u5355\u6765\u6E90\u6709\u8BEF\uFF08\u540C\u4E00\u5B54\u7684\u7EED\u9875\u5E94\u63A5\u7EED\u7F16\u53F7\uFF09\uFF0C\u5DF2\u6309\u6CBF\u7528\u300C${holeCode}\u300D\u5408\u5E76\uFF0C\u8BF7\u6838\u5BF9\u8BE5\u8868\u662F\u5426\u5C5E\u4E8E\u672C\u5B54\u3002`
      );
    }
  }
  if (depthJunk.length > 0) {
    const shown = depthJunk.slice(0, 3).map((d) => `\u7B2C ${d.row} \u884C\u300C${d.colName}\u300D\u5217\u51FA\u73B0\u300C${d.value}\u300D`).join("\u3001");
    const more = depthJunk.length > 3 ? `\u7B49\u5171 ${depthJunk.length} \u5904` : "";
    errors.push(
      `\u5DE5\u4F5C\u8868\u300C${ws.name}\u300D${shown}${more}\uFF0C\u6DF1\u5EA6\u5217\u5E94\u4E3A\u6570\u5B57\u3002\u7591\u4F3C\u571F\u6837\u7F16\u53F7\u5199\u4E32\u884C\u6216\u6570\u636E\u533A\u5217\u9519\u4F4D\uFF08\u5982\u6570\u636E\u533A\u591A\u4E86\u4E00\u5217\u5B54\u53F7\uFF09\uFF0C\u6BCF\u4E2A\u5B54\u53EF\u80FD\u53EA\u8BC6\u522B\u5230 1 \u6761\u571F\u6837\u3001\u6570\u636E\u4E0E\u5B9E\u9645\u4E0D\u7B26\uFF0C\u8BF7\u6838\u5BF9\u8BE5\u5757\uFF08\u5B54\u53F7 ${holeCode || "\u672A\u77E5"}\uFF09\u3002`
    );
  }
  for (const lbl of unknownSeen) {
    warnings.push(`\u9001\u6837\u5355\u542B\u672A\u77E5\u8BD5\u9A8C\u9879\u76EE\uFF1A${lbl}\uFF08\u5DF2\u5F52\u5165"\u5176\u4ED6\u8BD5\u9A8C\u9879\u76EE"\uFF0C\u4E0D\u5F71\u54CD\u5BFC\u51FA\uFF09`);
  }
  const overrideParts = [];
  if (consolidationAlias) overrideParts.push(`\u56FA\u7ED3\u5217\u663E\u793A\u300C${consolidationAlias}\u300D`);
  if (hasShearOverride)
    overrideParts.push(`\u526A\u5207\u4E24\u5217\u663E\u793A\u300C${shearLabels[0]}\uFF0F${shearLabels[1]}\u300D`);
  if (overrideParts.length > 0) {
    warnings.push(
      `\u8868\u5934\u6309\u9001\u6837\u5355\u539F\u6587\u663E\u793A\uFF1A${overrideParts.join("\uFF0C")}\uFF08\u52FE\u9009\u6570\u636E\u4E0E\u5BFC\u51FA\u8868\u5934\u4FDD\u6301\u4E00\u81F4\uFF09`
    );
  }
  const contextParts = [ws.name, projectName];
  for (let r = Math.max(1, hr - 15); r <= sub; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) contextParts.push(cellText(row.getCell(c).value));
  }
  const mode = detectRecordMode(
    samples.map((s) => s.fieldRecord),
    contextParts.join(" ")
  );
  const now = Date.now();
  const name = (projectName ? projectName + " " : "") + holeCode;
  const record = {
    id: genId(),
    name: name || `\u5F00\u571F\u8BB0\u5F55 ${todayStr()}`,
    mode,
    engineering: {
      projectCode: "",
      holeCode,
      holeElevation: "",
      openDate: todayStr()
    },
    samples,
    customTestItems: Array.from(unknownSeen),
    createdAt: now,
    updatedAt: now
  };
  if (hasShearOverride) record.shearLabels = shearLabels;
  if (consolidationAlias) record.consolidationLabel = consolidationAlias;
  return {
    record,
    sheetName: ws.name,
    sampleCount: samples.length,
    holeCode,
    warnings,
    errors,
    headerJunkRows
  };
}
async function parseDeliveryFile(buffer) {
  const XL = (await importWithRecovery(() => import("exceljs"))).default;
  const wb = new XL.Workbook();
  await wb.xlsx.load(buffer);
  const result = {
    records: [],
    warnings: [],
    errors: [],
    mergedNotes: []
  };
  let lastHoleCode = "";
  const hasSoilNumberMarker = (ws) => {
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= row.cellCount; c++) {
        if (normalizeHeader(row.getCell(c).value) === "\u571F\u6837\u7F16\u53F7") return true;
      }
    }
    return false;
  };
  for (const ws of wb.worksheets) {
    const hrs = findHeaderRows(ws);
    if (hrs.length === 0) {
      if (hasSoilNumberMarker(ws)) {
        result.warnings.push(
          `\u5DE5\u4F5C\u8868\u300C${ws.name}\u300D\u4E0D\u662F\u6807\u51C6\u9001\u6837\u5355\uFF08\u8868\u4E00\uFF09\u683C\u5F0F\uFF0C\u5DF2\u8DF3\u8FC7\u5BFC\u5165\u3002`
        );
      }
      continue;
    }
    for (let i = 0; i < hrs.length; i++) {
      const hr = hrs[i];
      const sub = hr + 1;
      const nextHr = i + 1 < hrs.length ? hrs[i + 1] : ws.rowCount + 1;
      const holeSearchStart = i > 0 ? hrs[i - 1] + 1 : 1;
      try {
        const parsed = parseOneBlock(
          ws,
          hr,
          sub,
          nextHr,
          lastHoleCode,
          holeSearchStart
        );
        if (parsed.holeCode) lastHoleCode = parsed.holeCode;
        if (parsed.sampleCount === 0) {
          result.warnings.push(
            parsed.headerJunkRows ? `\u5DE5\u4F5C\u8868\u300C${ws.name}\u300D\u7B2C ${hr} \u884C\u7684\u5757\u672A\u8BC6\u522B\u5230\u571F\u6837\u6570\u636E\uFF0C\u8868\u5934\u7591\u4F3C\u4E3A\u300C\u8868\u4E8C\u300D\u7ED3\u679C\u8868/\u591A\u884C\u8868\u5934\uFF0C\u5DF2\u8DF3\u8FC7\u5BFC\u5165\u3002` : `\u5DE5\u4F5C\u8868\u300C${ws.name}\u300D\u7B2C ${hr} \u884C\u7684\u9001\u6837\u5355\u5757\u672A\u8BC6\u522B\u5230\u571F\u6837\u6570\u636E\uFF0C\u5DF2\u8DF3\u8FC7\u3002`
          );
          continue;
        }
        result.records.push(parsed);
      } catch (e) {
        const reason = e?.message ?? String(e);
        result.warnings.push(
          `\u5DE5\u4F5C\u8868\u300C${ws.name}\u300D\u7B2C ${hr} \u884C\u7684\u9001\u6837\u5355\u5757\u89E3\u6790\u5931\u8D25\uFF0C\u5DF2\u8DF3\u8FC7\uFF08\u539F\u56E0\uFF1A${reason}\uFF09\uFF0C\u8BF7\u68C0\u67E5\u8BE5\u8868\u683C\u5F0F\u662F\u5426\u4E0E\u6A21\u677F\u4E00\u81F4\u3002`
        );
      }
    }
  }
  const merged = mergeImportedByHole(result.records);
  result.records = merged.records;
  result.mergedNotes = merged.mergedNotes;
  result.errors = merged.errors;
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  detectRecordMode,
  isChecked,
  isNumericDepth,
  matchSoilTypeName,
  mergeImportedByHole,
  normalizeHeader,
  normalizeSoilName,
  parseDeliveryFile,
  soilSeqOf
});
