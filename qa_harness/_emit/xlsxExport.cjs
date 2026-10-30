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

// src/xlsxExport.ts
var xlsxExport_exports = {};
__export(xlsxExport_exports, {
  buildWorkbook: () => buildWorkbook,
  exportRecord: () => exportRecord,
  exportRecordsXlsx: () => exportRecordsXlsx
});
module.exports = __toCommonJS(xlsxExport_exports);
var import_core = require("@capacitor/core");

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

// src/xlsxExport.ts
var import_filesystem = require("@capacitor/filesystem");
var import_share = require("@capacitor/share");

// src/exportNaming.ts
var ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;
function sanitizeFileNamePart(input, fallback = "\u672A\u547D\u540D") {
  const cleaned = String(input ?? "").replace(ILLEGAL_FILENAME_CHARS, "-").trim();
  return cleaned || fallback;
}
function buildXlsxFileName(record) {
  const project = sanitizeFileNamePart(record?.engineering?.projectCode, "");
  const hole = sanitizeFileNamePart(record?.engineering?.holeCode, "");
  const prefix = [project, hole].filter(Boolean).join("_");
  return `${prefix || "\u5F00\u571F\u8BB0\u5F55"}_\u5F00\u571F\u8BB0\u5F55\u8868.xlsx`;
}

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
var INCLUSIONS = [
  "\u542B\u59DC\u77F3",
  "\u542B\u6709\u673A\u8D28",
  "\u542B\u9508\u6591",
  "\u542B\u690D\u7269\u6839\u7CFB",
  "\u542B\u8D1D\u58F3",
  "\u5747\u8D28\u571F",
  "\u7C89\u571F\u4E2D\u542B\u7C98\u7C92",
  "\u7C98\u571F\u4E2D\u542B\u7C89\u7C92",
  "\u7C89\u7C98\u4E92\u5C42",
  "\u7C89\u7C98\u5939\u5C42",
  "\u7C89\u7C98\u9519\u5C42"
];
var SOIL_STATES = ["\u6E7F", "\u5BC6", "\u786C\u5851", "\u53EF\u5851", "\u8F6F\u5851"];
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
function recordTestColumns(record) {
  const [s1, s2] = record?.shearLabels ?? [];
  const cons = record?.consolidationLabel;
  return TEST_ITEMS.map((t) => {
    if (t === "\u56FA\u7ED3") return { key: "\u56FA\u7ED3", label: cons || "\u56FA\u7ED3" };
    if (t === "\u9971\u56FA\u5FEB\u526A") return { key: s1 || "\u9971\u56FA\u5FEB\u526A", label: s1 || "\u9971\u56FA\u5FEB\u526A" };
    if (t === "\u81EA\u7136\u5FEB\u526A") return { key: s2 || "\u81EA\u7136\u5FEB\u526A", label: s2 || "\u81EA\u7136\u5FEB\u526A" };
    return { key: t, label: t };
  });
}
var DISTURBED_INCOMPATIBLE_TESTS = TEST_ITEMS.filter(
  (t) => !DISTURBED_APPLICABLE_TESTS.includes(t)
);
function siltySandSymbol(v) {
  if (v === "triangle") return "\u25B3";
  if (v === "circle") return "\u25CB";
  return "";
}

// src/xlsxExport.ts
var _exceljs = null;
async function getExcelJS() {
  if (!_exceljs)
    _exceljs = (await importWithRecovery(() => import("exceljs"))).default;
  return _exceljs;
}
var FONT = "\u5B8B\u4F53";
var HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
function uint8ToBase64(bytes) {
  let binary = "";
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}
function styleCell(cell, opts = {}) {
  cell.alignment = { horizontal: opts.align ?? "center", vertical: "middle", wrapText: true };
  cell.font = { name: FONT, bold: opts.bold ?? false, size: opts.size ?? 10 };
  if (opts.fill) cell.fill = HEADER_FILL;
  cell.border = {
    top: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } }
  };
}
function buildFileName(record) {
  return buildXlsxFileName(record);
}
async function buildWorkbook(record, XL) {
  const soilType = record.mode === "A" ? SOIL_TYPE_A : SOIL_TYPE_B;
  const eng = record.engineering;
  const testCols = recordTestColumns(record);
  const wb = new XL.Workbook();
  wb.creator = "\u5F00\u571F\u8BB0\u5F55\u5F55\u5165";
  wb.lastModifiedBy = "\u5F00\u571F\u8BB0\u5F55\u5F55\u5165";
  const ws = wb.addWorksheet("\u5F00\u571F\u8BB0\u5F55\u8868");
  const widths = [10, 18, 10, 10, 8, 8];
  for (let i = 0; i < 7; i++) widths.push(9);
  for (let i = 0; i < 13; i++) widths.push(9);
  for (let i = 0; i < 6; i++) widths.push(8);
  for (let i = 0; i < 8; i++) widths.push(9);
  ws.columns = widths.map((w) => ({ width: w }));
  const TOTAL = widths.length;
  const BASE = 6;
  const SOIL_TYPE_GROUP = [7, 13];
  const SOIL_TYPE_SUB_COLS = [7, 8, 9, 10, 11, 13];
  const INCL_GROUP = [14, 26];
  const DISTURBANCE_COL = 15;
  const INCL_SUB_COLS = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
  const STATE_GROUP = [27, 32];
  const STATE_SUB_COLS = [27, 28, 29, 30, 31];
  const STATE_NOTE_COL = 32;
  const TEST_GROUP = [33, 40];
  const TEST_SUB_COLS = [33, 34, 35, 36, 37, 38, 39, 40];
  const TITLE_ROW = 1;
  const INFO_ROW = 2;
  const HEAD_ROW = 3;
  const SUB_ROW = 4;
  const FIRST_DATA_ROW = 5;
  {
    const cell = ws.getCell(TITLE_ROW, 1);
    cell.value = "\u5F00\u571F\u8BB0\u5F55\u8868";
    styleCell(cell, { bold: true, size: 16, align: "center" });
    ws.mergeCells(TITLE_ROW, 1, TITLE_ROW, TOTAL);
  }
  const infoFields = [
    `\u5DE5\u7A0B\u7F16\u53F7\uFF1A${eng.projectCode}`,
    `\u5B54\u53F7\uFF1A${eng.holeCode}`,
    `\u5B54\u53E3\u6807\u9AD8(m)\uFF1A${eng.holeElevation}`,
    `\u5F00\u571F\u65E5\u671F(\u5E74/\u6708/\u65E5)\uFF1A${eng.openDate}`
  ];
  const infoGroupSize = Math.ceil(TOTAL / 4);
  for (let g = 0; g < 4; g++) {
    const s = g * infoGroupSize + 1;
    const e = Math.min(TOTAL, (g + 1) * infoGroupSize);
    const cell = ws.getCell(INFO_ROW, s);
    cell.value = infoFields[g];
    styleCell(cell, { bold: false, align: "left", fill: true, size: 11 });
    ws.mergeCells(INFO_ROW, s, INFO_ROW, e);
  }
  const headLabels = ["\u571F\u53F7", "\u91CE\u5916\u8BB0\u5F55", "\u53D6\u6837\u6DF1\u5EA6", "\u53D6\u6837\u6807\u9AD8", "\u989C\u8272", "\u6C14\u5473"];
  for (let c = 1; c <= BASE; c++) {
    const cell = ws.getCell(HEAD_ROW, c);
    cell.value = headLabels[c - 1];
    styleCell(cell, { bold: true, fill: true });
  }
  const fillGroupLabel = (s, e, label) => {
    for (let c = s; c <= e; c++) {
      const cell = ws.getCell(HEAD_ROW, c);
      cell.value = label;
      styleCell(cell, { bold: true, fill: true });
    }
  };
  fillGroupLabel(SOIL_TYPE_GROUP[0], SOIL_TYPE_GROUP[1], "\u76EE\u529B\u9274\u522B\u571F\u7C7B");
  fillGroupLabel(INCL_GROUP[0], INCL_GROUP[1], "\u5939\u6742\u7269");
  fillGroupLabel(STATE_GROUP[0], STATE_GROUP[1], "\u571F\u6837\u60C5\u51B5");
  fillGroupLabel(TEST_GROUP[0], TEST_GROUP[1], "\u8981\u6C42\u5B9E\u9A8C\u9879\u76EE");
  for (let c = 1; c <= TOTAL; c++) {
    styleCell(ws.getCell(SUB_ROW, c), { fill: true });
  }
  SOIL_TYPE_SUB_COLS.forEach((c, i) => {
    ws.getCell(SUB_ROW, c).value = soilType[i];
  });
  ws.getCell(SUB_ROW, DISTURBANCE_COL).value = "\u6270\u52A8\u571F";
  INCL_SUB_COLS.forEach((c, i) => {
    ws.getCell(SUB_ROW, c).value = INCLUSIONS[i];
  });
  STATE_SUB_COLS.forEach((c, i) => {
    ws.getCell(SUB_ROW, c).value = SOIL_STATES[i];
  });
  ws.getCell(SUB_ROW, STATE_NOTE_COL).value = "\u5907\u6CE8";
  TEST_SUB_COLS.forEach((c, i) => {
    ws.getCell(SUB_ROW, c).value = testCols[i]?.label ?? TEST_ITEMS[i];
  });
  record.samples.forEach((s, idx) => {
    const r = FIRST_DATA_ROW + idx;
    const set = (c, v) => {
      const cell = ws.getCell(r, c);
      cell.value = v;
      styleCell(cell, { align: c <= BASE ? "left" : "center" });
    };
    set(1, s.soilNumber);
    set(2, s.fieldRecord);
    set(3, "");
    set(4, s.sampleElevation);
    set(5, s.color);
    set(6, s.smell);
    SOIL_TYPE_SUB_COLS.forEach((c, i) => {
      set(c, s.soilType.includes(soilType[i]) ? "\u221A" : "");
    });
    set(DISTURBANCE_COL, s.disturbance === "\u6270\u52A8" ? "\u221A" : "");
    INCL_SUB_COLS.forEach((c, i) => {
      set(c, s.inclusions.includes(INCLUSIONS[i]) ? "\u221A" : "");
    });
    STATE_SUB_COLS.forEach((c, i) => {
      set(c, s.soilState.includes(SOIL_STATES[i]) ? "\u221A" : "");
    });
    set(STATE_NOTE_COL, s.soilStateNote);
    TEST_SUB_COLS.forEach((c, i) => {
      set(c, s.testItems.includes(testCols[i]?.key ?? TEST_ITEMS[i]) ? "\u221A" : "");
    });
    styleCell(ws.getCell(r, 12), { align: "center" });
    styleCell(ws.getCell(r, 14), { align: "center" });
  });
  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 8,
    // 8 = A3
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0
  };
  ws.views = [{ state: "frozen", ySplit: 4 }];
  const ws2 = wb.addWorksheet("\u6DB2\u6027\u6307\u6570_\u5851\u6027\u6307\u6570_\u7C89\u7802\u5224\u5B9A");
  ws2.columns = [
    { width: 14 },
    // 土号
    { width: 14 },
    // 塑性指数(Ip)
    { width: 14 },
    // 液性指数(IL)
    { width: 12 }
    // 粉砂判定
  ];
  {
    const cell = ws2.getCell(1, 1);
    cell.value = "\u6821\u5BF9\u5B57\u6BB5\uFF08\u5851\u6027\u6307\u6570 / \u6DB2\u6027\u6307\u6570 / \u7C89\u7802\u5224\u5B9A\uFF09";
    styleCell(cell, { bold: true, size: 13, align: "center" });
    ws2.mergeCells(1, 1, 1, 4);
  }
  const head2 = ["\u571F\u53F7", "\u5851\u6027\u6307\u6570(Ip)", "\u6DB2\u6027\u6307\u6570(IL)", "\u7C89\u7802\u5224\u5B9A"];
  for (let c = 1; c <= 4; c++) {
    const cell = ws2.getCell(2, c);
    cell.value = head2[c - 1];
    styleCell(cell, { bold: true, fill: true });
  }
  record.samples.forEach((s, idx) => {
    const r = 3 + idx;
    const rows = [
      [1, s.soilNumber],
      [2, s.ip],
      [3, s.il],
      [4, siltySandSymbol(s.siltySand ?? "none")]
    ];
    rows.forEach(([c, v]) => {
      const cell = ws2.getCell(r, c);
      cell.value = v;
      styleCell(cell, { align: "center" });
    });
  });
  ws2.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    // 9 = A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0
  };
  ws2.views = [{ state: "frozen", ySplit: 2 }];
  const ws3 = wb.addWorksheet("\u9897\u5206\u7EDF\u8BA1");
  ws3.columns = [
    { width: 14 },
    // 土号
    { width: 14 },
    // 塑性指数(Ip)
    { width: 14 },
    // 液性指数(IL)
    { width: 12 },
    // 扰动土
    { width: 12 }
    // 纳入颗分
  ];
  const ws3Title = "\u9897\u5206\u7EDF\u8BA1\uFF08\u5851\u6027\u6307\u6570(Ip)\u226410 \u6216 \u52FE\u9009\u6270\u52A8\u571F\uFF09";
  {
    const cell = ws3.getCell(1, 1);
    cell.value = ws3Title;
    styleCell(cell, { bold: true, size: 13, align: "center" });
    ws3.mergeCells(1, 1, 1, 5);
  }
  const head3 = ["\u571F\u53F7", "\u5851\u6027\u6307\u6570(Ip)", "\u6DB2\u6027\u6307\u6570(IL)", "\u6270\u52A8\u571F", "\u7EB3\u5165\u9897\u5206"];
  for (let c = 1; c <= 5; c++) {
    const cell = ws3.getCell(2, c);
    cell.value = head3[c - 1];
    styleCell(cell, { bold: true, fill: true });
  }
  let ws3Row = 3;
  record.samples.forEach((s) => {
    const ipNum = parseFloat(s.ip);
    const ipLe10 = !Number.isNaN(ipNum) && ipNum <= 10;
    const isDisturbed = s.disturbance === "\u6270\u52A8";
    if (!(ipLe10 || isDisturbed)) return;
    const r = ws3Row++;
    const rows3 = [
      [1, s.soilNumber],
      [2, s.ip],
      [3, s.il],
      [4, s.disturbance],
      [5, "\u221A"]
    ];
    rows3.forEach(([c, v]) => {
      const cell = ws3.getCell(r, c);
      cell.value = v;
      styleCell(cell, { align: "center" });
    });
  });
  ws3.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    // 9 = A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0
  };
  ws3.views = [{ state: "frozen", ySplit: 2 }];
  const ws4 = wb.addWorksheet("\u6E17\u900F\u7EDF\u8BA1");
  ws4.columns = [
    { width: 14 },
    // 土号
    { width: 14 },
    // 垂直渗透
    { width: 14 }
    // 水平渗透
  ];
  const ws4Title = "\u6E17\u900F\u7EDF\u8BA1\uFF08\u5782\u76F4\u6E17\u900F / \u6C34\u5E73\u6E17\u900F\uFF09";
  {
    const cell = ws4.getCell(1, 1);
    cell.value = ws4Title;
    styleCell(cell, { bold: true, size: 13, align: "center" });
    ws4.mergeCells(1, 1, 1, 3);
  }
  const head4 = ["\u571F\u53F7", "\u5782\u76F4\u6E17\u900F", "\u6C34\u5E73\u6E17\u900F"];
  for (let c = 1; c <= 3; c++) {
    const cell = ws4.getCell(2, c);
    cell.value = head4[c - 1];
    styleCell(cell, { bold: true, fill: true });
  }
  let ws4Row = 3;
  record.samples.forEach((s) => {
    const vPerm = s.testItems.includes("\u5782\u76F4\u6E17\u900F");
    const hPerm = s.testItems.includes("\u6C34\u5E73\u6E17\u900F");
    if (!vPerm && !hPerm) return;
    const r = ws4Row++;
    const rows4 = [
      [1, s.soilNumber],
      [2, vPerm ? "\u221A" : ""],
      [3, hPerm ? "\u221A" : ""]
    ];
    rows4.forEach(([c, v]) => {
      const cell = ws4.getCell(r, c);
      cell.value = v;
      styleCell(cell, { align: "center" });
    });
  });
  ws4.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    // 9 = A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0
  };
  ws4.views = [{ state: "frozen", ySplit: 2 }];
  const extraNames = [];
  const extraSeen = /* @__PURE__ */ new Set();
  record.samples.forEach((s) => {
    (s.otherTestItems ?? []).forEach((name) => {
      if (name && !extraSeen.has(name)) {
        extraSeen.add(name);
        extraNames.push(name);
      }
    });
  });
  if (extraNames.length > 0) {
    const ws5 = wb.addWorksheet("\u989D\u5916\u8BD5\u9A8C\u9879\u76EE");
    ws5.columns = [
      { width: 14 },
      // 土样编号
      ...extraNames.map(() => ({ width: 18 }))
      // 各未知项目一列
    ];
    const ws5Title = "\u989D\u5916\u8BD5\u9A8C\u9879\u76EE\uFF08\u9001\u6837\u5355\u672A\u77E5\u8BD5\u9A8C\u9879\u76EE\uFF09";
    {
      const cell = ws5.getCell(1, 1);
      cell.value = ws5Title;
      styleCell(cell, { bold: true, size: 13, align: "center" });
      ws5.mergeCells(1, 1, 1, extraNames.length + 1);
    }
    const head5 = ["\u571F\u6837\u7F16\u53F7", ...extraNames];
    for (let c = 1; c <= head5.length; c++) {
      const cell = ws5.getCell(2, c);
      cell.value = head5[c - 1];
      styleCell(cell, { bold: true, fill: true });
    }
    let ws5Row = 3;
    record.samples.forEach((s) => {
      const items = s.otherTestItems ?? [];
      if (items.length === 0) return;
      const r = ws5Row++;
      const c0 = ws5.getCell(r, 1);
      c0.value = s.soilNumber;
      styleCell(c0, { align: "center" });
      extraNames.forEach((name, i) => {
        const cell = ws5.getCell(r, i + 2);
        cell.value = items.includes(name) ? "\u221A" : "";
        styleCell(cell, { align: "center" });
      });
    });
    ws5.pageSetup = {
      orientation: "landscape",
      paperSize: 9,
      // 9 = A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0
    };
    ws5.views = [{ state: "frozen", ySplit: 2 }];
  }
  return wb;
}
async function exportRecord(record) {
  try {
    const XL = await getExcelJS();
    const wb = await buildWorkbook(record, XL);
    const buf = await wb.xlsx.writeBuffer();
    const uint8 = new Uint8Array(buf);
    const fileName = buildFileName(record);
    if (import_core.Capacitor.isNativePlatform()) {
      const base64 = uint8ToBase64(uint8);
      const fsResult = await import_filesystem.Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: import_filesystem.Directory.Documents
      });
      try {
        await import_share.Share.share({
          title: "\u5F00\u571F\u8BB0\u5F55\u8868",
          text: "\u5F00\u571F\u8BB0\u5F55\u8868\u5BFC\u51FA",
          files: [fsResult.uri]
        });
      } catch {
      }
      return {
        success: true,
        message: `\u5DF2\u751F\u6210\u5E76\u4FDD\u5B58\u5230\u6587\u6863\u76EE\u5F55\uFF1A${fileName}`,
        path: fsResult.uri
      };
    }
    const blob = new Blob([uint8], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true, message: `\u5DF2\u5BFC\u51FA ${fileName}\uFF08\u6D4F\u89C8\u5668\u4E0B\u8F7D\uFF09` };
  } catch (e) {
    return { success: false, message: "\u5BFC\u51FA\u5931\u8D25\uFF1A" + (e?.message ?? String(e)) };
  }
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function exportRecordsXlsx(records) {
  if (!records || records.length === 0) {
    return { success: false, message: "\u6CA1\u6709\u9009\u62E9\u8981\u5BFC\u51FA\u7684\u5B54" };
  }
  let successCount = 0;
  const failures = [];
  for (let i = 0; i < records.length; i++) {
    if (i > 0) await delay(300);
    const record = records[i];
    const label = (record.engineering?.holeCode ?? "").trim() || "\u672A\u547D\u540D\u5B54";
    try {
      const res = await exportRecord(record);
      if (res.success) {
        successCount += 1;
      } else {
        failures.push(`${label}\uFF1A${res.message}`);
      }
    } catch (e) {
      failures.push(`${label}\uFF1A${e?.message ?? String(e)}`);
    }
  }
  if (successCount === 0) {
    return {
      success: false,
      message: `\u5BFC\u51FA\u5931\u8D25\uFF08${records.length} \u4E2A\u6587\u4EF6\u5747\u672A\u6210\u529F\uFF09\uFF1A${failures.join("\uFF1B")}`
    };
  }
  const native = import_core.Capacitor.isNativePlatform();
  const tail = failures.length ? `\uFF0C${failures.length} \u4E2A\u5931\u8D25\uFF08${failures.join("\uFF1B")}\uFF09` : "";
  if (native) {
    return {
      success: true,
      message: `\u5DF2\u5BFC\u51FA ${successCount} \u4E2A\u6587\u4EF6\u5230\u6587\u6863\u76EE\u5F55\uFF08\u5DF2\u9010\u4E2A\u6253\u5F00\u7CFB\u7EDF\u5206\u4EAB\uFF09${tail}`
    };
  }
  return {
    success: true,
    message: `\u5DF2\u5BFC\u51FA ${successCount} \u4E2A\u6587\u4EF6\uFF08\u6BCF\u4E2A\u5B54\u4E00\u4E2A\u6587\u4EF6\uFF0C\u6D4F\u89C8\u5668\u53EF\u80FD\u8BE2\u95EE\u662F\u5426\u5141\u8BB8\u591A\u4E2A\u4E0B\u8F7D\uFF09${tail}`
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildWorkbook,
  exportRecord,
  exportRecordsXlsx
});
