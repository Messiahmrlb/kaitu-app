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
  matchSoilTypeName: () => matchSoilTypeName,
  normalizeHeader: () => normalizeHeader,
  normalizeSoilName: () => normalizeSoilName,
  parseDeliveryFile: () => parseDeliveryFile
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
  { label: "\u5782\u76F4\u6E17\u900F", item: "\u5782\u76F4\u6E17\u900F" },
  { label: "\u6C34\u5E73\u6E17\u900F", item: "\u6C34\u5E73\u6E17\u900F" },
  { label: "\u9971\u548C\u56FA\u7ED3\u5FEB\u526A", item: "\u9971\u56FA\u5FEB\u526A" },
  { label: "\u81EA\u7136\u5FEB\u526A", item: "\u81EA\u7136\u5FEB\u526A" }
];
var NO_SET = /* @__PURE__ */ new Set(["", "\u2014", "\u2013", "\xD7", "/", "\uFF0F", "\u65E0", "\u5426"]);
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
function findInfoValue(ws, hrRow, label) {
  const start = Math.max(1, hrRow - 15);
  for (let r = start; r < hrRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      const norm = normalizeHeader(row.getCell(c).value);
      if (!norm.includes(label)) continue;
      const rest = norm.slice(norm.indexOf(label) + label.length).replace(/^[：:\s]+/, "").trim();
      if (rest) return rest;
      const right = cellText(row.getCell(c + 1).value).trim();
      if (right) return right;
      const left = cellText(row.getCell(c - 1).value).trim();
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
    if (TEST_LABEL_MAP.some((m) => m.label === n)) hasTest = true;
  }
  return hasYuan && hasTest;
}
function findHeaderRows(ws) {
  const hrs = [];
  for (let r = 1; r < ws.rowCount; r++) {
    if (isHeaderRow(ws, r)) hrs.push(r);
  }
  return hrs;
}
function parseOneBlock(ws, hr, sub, nextHr) {
  const warnings = [];
  const endRow = Math.min(nextHr - 1, ws.rowCount);
  const soilNoCol = findColByText(ws, hr, "\u571F\u6837\u7F16\u53F7");
  const fieldRecCol = findColByText(ws, hr, "\u91CE\u5916\u5B9A\u540D");
  const fromCol = findColByText(ws, sub, "\u81EA");
  const toCol = findColByText(ws, sub, "\u81F3");
  const distCol = findColByText(ws, sub, "\u6270\u52A8");
  const testCols = [];
  for (const m of TEST_LABEL_MAP) {
    const col = findColByText(ws, sub, m.label);
    if (col >= 0) testCols.push({ col, item: m.item });
  }
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
    if (KNOWN_TEST_LABELS.has(label)) continue;
    if (STRUCT_LABELS.has(label)) continue;
    unknownCols.push({ col: c, label });
  }
  const unknownSeen = /* @__PURE__ */ new Set();
  const holeCode = findInfoValue(ws, hr, "\u5B54\u53F7");
  const projectName = findInfoValue(ws, hr, "\u5DE5\u7A0B\u540D\u79F0");
  if (!holeCode) warnings.push("\u672A\u5728\u5DE5\u4F5C\u8868\u4E2D\u627E\u5230\u201C\u5B54\u53F7\u201D\uFF0C\u8BB0\u5F55\u5C06\u4EE5\u7A7A\u5B54\u53F7\u521B\u5EFA\u3002");
  if (!projectName) warnings.push("\u672A\u5728\u5DE5\u4F5C\u8868\u4E2D\u627E\u5230\u201C\u5DE5\u7A0B\u540D\u79F0\u201D\u3002");
  const samples = [];
  let idx = 0;
  for (let r = sub + 1; r <= endRow; r++) {
    const row = ws.getRow(r);
    const soilNumberRaw = soilNoCol >= 0 ? cellText(row.getCell(soilNoCol).value).trim() : "";
    if (soilNumberRaw === "") continue;
    if (FOOTER_KEYWORDS.some((k) => soilNumberRaw.includes(k))) break;
    idx += 1;
    const s = newSample(idx, soilNumberRaw);
    if (fieldRecCol >= 0) s.fieldRecord = cellText(row.getCell(fieldRecCol).value).trim();
    const from = fromCol >= 0 ? cellText(row.getCell(fromCol).value).trim() : "";
    const to = toCol >= 0 ? cellText(row.getCell(toCol).value).trim() : "";
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
  for (const lbl of unknownSeen) {
    warnings.push(`\u9001\u6837\u5355\u542B\u672A\u77E5\u8BD5\u9A8C\u9879\u76EE\uFF1A${lbl}\uFF08\u5DF2\u5F52\u5165"\u5176\u4ED6\u8BD5\u9A8C\u9879\u76EE"\uFF0C\u4E0D\u5F71\u54CD\u5BFC\u51FA\uFF09`);
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
  return {
    record,
    sheetName: ws.name,
    sampleCount: samples.length,
    holeCode,
    warnings
  };
}
async function parseDeliveryFile(buffer) {
  const XL = (await importWithRecovery(() => import("exceljs"))).default;
  const wb = new XL.Workbook();
  await wb.xlsx.load(buffer);
  const result = { records: [], warnings: [] };
  for (const ws of wb.worksheets) {
    const hrs = findHeaderRows(ws);
    if (hrs.length === 0) continue;
    for (let i = 0; i < hrs.length; i++) {
      const hr = hrs[i];
      const sub = hr + 1;
      const nextHr = i + 1 < hrs.length ? hrs[i + 1] : ws.rowCount + 1;
      try {
        const parsed = parseOneBlock(ws, hr, sub, nextHr);
        if (parsed.sampleCount === 0) {
          result.warnings.push(
            `\u5DE5\u4F5C\u8868\u300C${ws.name}\u300D\u7B2C ${hr} \u884C\u7684\u9001\u6837\u5355\u5757\u672A\u8BC6\u522B\u5230\u571F\u6837\u6570\u636E\uFF0C\u5DF2\u8DF3\u8FC7\u3002`
          );
          continue;
        }
        result.records.push(parsed);
      } catch (e) {
        result.warnings.push(`\u5DE5\u4F5C\u8868\u300C${ws.name}\u300D\u7B2C ${hr} \u884C\u7684\u9001\u6837\u5355\u5757\u89E3\u6790\u5931\u8D25\uFF1A${e?.message ?? String(e)}`);
      }
    }
  }
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  detectRecordMode,
  isChecked,
  matchSoilTypeName,
  normalizeHeader,
  normalizeSoilName,
  parseDeliveryFile
});
