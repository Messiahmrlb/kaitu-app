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

// src/pdfExport.ts
var pdfExport_exports = {};
__export(pdfExport_exports, {
  buildMergedPdfFileName: () => buildMergedPdfFileName,
  buildPdfPages: () => buildPdfPages,
  buildRecordPdfBlob: () => buildRecordPdfBlob,
  buildRecordsPdfBlob: () => buildRecordsPdfBlob,
  buildSinglePdfFileName: () => buildSinglePdfFileName,
  exportRecordPdf: () => exportRecordPdf,
  exportRecordsPdf: () => exportRecordsPdf,
  renderHeaderTexts: () => renderHeaderTexts,
  sanitizeFileNamePart: () => sanitizeFileNamePart,
  withOpenDate: () => withOpenDate
});
module.exports = __toCommonJS(pdfExport_exports);

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
function soilTypeOptions(mode) {
  return mode === "A" ? SOIL_TYPE_A : SOIL_TYPE_B;
}

// src/pdfExport.ts
var import_core = require("@capacitor/core");
var import_filesystem = require("@capacitor/filesystem");
var import_share = require("@capacitor/share");

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

// src/cmaHeader.ts
var CMA_DEFAULT = {
  versionLine: "\u7B2C 3 \u7248 \u7B2C 0 \u6B21\u4FEE\u6539 2024 \u5E74 12 \u6708 1 \u65E5\u8D77\u5B9E\u65BD",
  docCode: "SHLY-TR068-2024"
};
function charEm(c) {
  const code = c.codePointAt(0) ?? 0;
  if (code > 11904) return 1;
  if (c === " ") return 0.32;
  if (c >= "0" && c <= "9") return 0.55;
  if (c >= "A" && c <= "Z") return 0.62;
  if (c >= "a" && c <= "z") return 0.52;
  if ("-_./:".includes(c)) return 0.34;
  return 0.55;
}
function fitHeaderFontSize(text, basePt, maxWidthPt, minPt = 6) {
  const em = [...String(text ?? "")].reduce((sum, c) => sum + charEm(c), 0);
  if (!(em > 0) || !(maxWidthPt > 0)) return basePt;
  const needWidth = em * basePt;
  if (needWidth <= maxWidthPt) return basePt;
  const fitted = basePt * maxWidthPt / needWidth;
  return Math.max(minPt, Math.round(fitted * 100) / 100);
}

// src/exportNaming.ts
var ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;
function sanitizeFileNamePart(input, fallback = "\u672A\u547D\u540D") {
  const cleaned = String(input ?? "").replace(ILLEGAL_FILENAME_CHARS, "-").trim();
  return cleaned || fallback;
}

// src/pdfExport.ts
var PT = 4 / 3;
var px = (pt) => pt * PT;
var PAGE_W_PX = 1587.4;
var PAGE_H_PX = 1122.5;
var TABLE_LEFT_PT = 48.6;
var TABLE_TOP_PT = 146.8;
var TABLE_WIDTH_PT = 1109;
var COL_WIDTHS_PT = [
  30,
  58.2,
  19.8,
  19.7,
  31.5,
  20.6,
  28.6,
  28.7,
  28.7,
  28.6,
  28.6,
  28.9,
  39.7,
  20.4,
  28.6,
  28.6,
  28.6,
  29.1,
  28.5,
  23.2,
  30,
  30,
  23.3,
  23.2,
  22.5,
  19.5,
  21,
  20.3,
  21.7,
  21,
  58.2,
  29.5,
  28.6,
  28.6,
  28.6,
  28.6,
  28.6,
  28.6,
  38.6
];
var GROUP_ROW_H_PT = 21.4;
var DATA_ROW_H_PT = 20.9;
var ROWS_PER_PAGE = 23;
var TOTAL_COLS = 39;
var SUB_ROW_H_PT = { A: 98.2, B: 103 };
var cellKey = (row, col) => row * 1e3 + col;
function fillRow(cells, row, s, mode, seq, testKeys) {
  const set = (col, v) => {
    cells[cellKey(row, col)] = v;
  };
  const soilType = soilTypeOptions(mode);
  set(1, `-${seq}`);
  set(2, s.fieldRecord ?? "");
  set(3, "");
  set(4, "");
  set(5, s.color ?? "");
  set(6, s.smell ?? "");
  for (let i = 0; i < 6; i++) {
    set(7 + i, soilType[i] != null && s.soilType.includes(soilType[i]) ? "\u221A" : "");
  }
  set(13, "");
  set(14, s.disturbance === "\u6270\u52A8" ? "\u221A" : "");
  for (let i = 0; i < INCLUSIONS.length; i++) {
    set(15 + i, s.inclusions.includes(INCLUSIONS[i]) ? "\u221A" : "");
  }
  for (let i = 0; i < SOIL_STATES.length; i++) {
    set(26 + i, s.soilState.includes(SOIL_STATES[i]) ? "\u221A" : "");
  }
  set(31, s.soilStateNote ?? "");
  for (let i = 0; i < testKeys.length; i++) {
    set(32 + i, s.testItems.includes(testKeys[i]) ? "\u221A" : "");
  }
}
function buildPdfPages(record) {
  const samples = record.samples ?? [];
  const testKeys = recordTestColumns(record).map((c) => c.key);
  const totalPages = Math.max(1, Math.ceil(samples.length / ROWS_PER_PAGE));
  const pages = [];
  for (let p = 0; p < totalPages; p++) {
    const cells = {};
    for (let r = 0; r < ROWS_PER_PAGE; r++) {
      const s = samples[p * ROWS_PER_PAGE + r];
      if (s) fillRow(cells, r, s, record.mode, p * ROWS_PER_PAGE + r + 1, testKeys);
    }
    pages.push({ cells });
  }
  return pages;
}
var _h2c = null;
async function getHtml2Canvas() {
  if (!_h2c) _h2c = await importWithRecovery(() => import("html2canvas"));
  return _h2c;
}
var _jspdf = null;
async function getJsPdf() {
  if (!_jspdf) _jspdf = await importWithRecovery(() => import("jspdf"));
  return _jspdf;
}
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function vchars(text) {
  return [...text].map((c) => esc(c)).join("<br>");
}
function uint8ToBase64(bytes) {
  let binary = "";
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}
function localDateStr(date = /* @__PURE__ */ new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function buildSinglePdfFileName(record) {
  const date = sanitizeFileNamePart(record?.engineering?.openDate ?? "", "");
  const hole = sanitizeFileNamePart(record?.engineering?.holeCode ?? "", "");
  const base = date ? `${date}_${hole || "\u672A\u547D\u540D\u5B54"}` : hole || "\u672A\u547D\u540D\u5B54";
  return `${base}.pdf`;
}
function buildMergedPdfFileName(records, today) {
  const count = records?.length ?? 0;
  if (count === 1) return buildSinglePdfFileName(records[0]);
  const day = sanitizeFileNamePart(today || localDateStr(), "") || localDateStr();
  return `\u5F00\u571F\u8BB0\u5F55_${count}\u5B54_${day}.pdf`;
}
function buildPdfFileName(record) {
  return buildSinglePdfFileName(record);
}
function renderInfoLine(eng) {
  const parts = (eng.openDate ?? "").trim().split("-");
  const y = parts[0] ?? "";
  const m = parts[1] ?? "";
  const d = parts[2] ?? "";
  const txt = (leftPt, html) => `<div class="pdf-txt" style="left:${px(leftPt)}px;top:${px(130.8)}px;font-size:${px(11.1)}px;">${html}</div>`;
  return `
    ${txt(54, `\u5DE5\u7A0B\u7F16\u53F7\uFF1A${esc(eng.projectCode ?? "")}`)}
    ${txt(494.6, `\u5B54\u53F7\uFF1A${esc(eng.holeCode ?? "")}`)}
    ${txt(673.4, `\u5B54\u53E3\u6807\u9AD8${esc(eng.holeElevation ?? "")}`)}
    ${txt(742.2, "m")}
    ${txt(978.4, `\u5F00\u571F\u65E5\u671F${esc(y)}`)}
    ${txt(1104.8, "\u5E74")}
    ${txt(1122, esc(m))}
    ${txt(1137.8, "\u6708")}
    ${txt(1153, esc(d))}
    ${txt(1170.8, "\u65E5")}`;
}
function renderHeaderTexts(record, header = CMA_DEFAULT) {
  const eng = record.engineering;
  const versionFs = fitHeaderFontSize(header.versionLine, 9, 1190.7 - 8 - 934.8);
  const codeFs = fitHeaderFontSize(header.docCode, 10.4, 1190.7 - 8 - 1035.8);
  return `
    <div class="pdf-txt" style="left:${px(70.8)}px;top:${px(44.9)}px;font-size:${px(9)}px;">\u5929\u6D25\u5E02\u6C34\u52A1\u89C4\u5212\u52D8\u6D4B\u8BBE\u8BA1\u6709\u9650\u516C\u53F8</div>
    <div class="pdf-txt" style="left:${px(934.8)}px;top:${px(44.9)}px;font-size:${px(versionFs)}px;">${esc(header.versionLine)}</div>
    <div class="pdf-txt" style="left:${px(550.2)}px;top:${px(73.5)}px;font-size:${px(18)}px;font-weight:bold;">\u5F00\u571F\u8BB0\u5F55\u8868</div>
    <div class="pdf-txt" style="left:${px(1035.8)}px;top:${px(94.4)}px;font-size:${px(codeFs)}px;">${esc(header.docCode)}</div>
    ${renderInfoLine(eng)}`;
}
function renderFooter(pageIndex, totalPages) {
  const top = px(794);
  const fsBig = px(12);
  const fsSmall = px(9);
  return `
    <div class="pdf-txt" style="left:${px(154.8)}px;top:${top}px;font-size:${fsBig}px;">\u8BB0\u5F55\u8005\uFF1A</div>
    <div class="pdf-txt" style="left:${px(630.4)}px;top:${top}px;font-size:${fsBig}px;">\u5F00\u571F\u4EBA\uFF1A</div>
    <div class="pdf-txt" style="left:${px(1015.8)}px;top:${top}px;font-size:${fsSmall}px;">\u7B2C</div>
    <div class="pdf-txt" style="left:${px(1032)}px;top:${top}px;font-size:${fsSmall}px;">${pageIndex}</div>
    <div class="pdf-txt" style="left:${px(1051.8)}px;top:${top}px;font-size:${fsSmall}px;">\u9875</div>
    <div class="pdf-txt" style="left:${px(1074.4)}px;top:${top}px;font-size:${fsSmall}px;">\u5171</div>
    <div class="pdf-txt" style="left:${px(1090)}px;top:${top}px;font-size:${fsSmall}px;">${totalPages}</div>
    <div class="pdf-txt" style="left:${px(1110.4)}px;top:${top}px;font-size:${fsSmall}px;">\u9875</div>`;
}
function wholeHeightHeader(text, vertical) {
  if (vertical) {
    return `<th class="pdf-th pdf-whole pdf-vlabel" rowspan="2">${vchars(text)}</th>`;
  }
  return `<th class="pdf-th pdf-whole" rowspan="2">${esc(text)}</th>`;
}
function renderTable(page, record) {
  const mode = record.mode;
  const soilType = soilTypeOptions(mode);
  const subH = SUB_ROW_H_PT[mode];
  const colDefs = COL_WIDTHS_PT.map((w) => `<col style="width:${w * PT}px"/>`).join("");
  const groupRow = `
    <tr class="pdf-grouprow">
      ${wholeHeightHeader("\u571F\u53F7", false)}
      ${wholeHeightHeader("\u91CE\u5916\u8BB0\u5F55", false)}
      ${wholeHeightHeader("\u53D6\u6837\u6DF1\u5EA6", true)}
      ${wholeHeightHeader("\u53D6\u6837\u6807\u9AD8", true)}
      ${wholeHeightHeader("\u989C\u8272", true)}
      ${wholeHeightHeader("\u6C14\u5473", true)}
      <th class="pdf-th" colspan="6">\u76EE\u529B\u9274\u522B\u571F\u7C7B</th>
      ${wholeHeightHeader("\u5939\u6742\u7269", true)}
      ${wholeHeightHeader("\u6270\u52A8\u571F", true)}
      <th class="pdf-th" colspan="17">\u571F\u6837\u60C5\u51B5</th>
      <th class="pdf-th" colspan="8">\u8981\u6C42\u5B9E\u9A8C\u9879\u76EE</th>
    </tr>`;
  const subRow = `
    <tr class="pdf-subrow">
      ${soilType.map((t) => `<th class="pdf-th pdf-vlabel pdf-vsmall">${vchars(t)}</th>`).join("")}
      ${INCLUSIONS.map((t) => `<th class="pdf-th pdf-vlabel pdf-vsmall">${vchars(t)}</th>`).join("")}
      ${SOIL_STATES.map((t) => `<th class="pdf-th pdf-vlabel pdf-vsmall">${vchars(t)}</th>`).join("")}
      <th class="pdf-th pdf-vlabel pdf-vsmall">${vchars("\u5907\u6CE8")}</th>
      ${recordTestColumns(record).map((c) => `<th class="pdf-th pdf-vlabel pdf-vsmall">${vchars(c.label)}</th>`).join("")}
    </tr>`;
  const dataRows = [];
  for (let r = 0; r < ROWS_PER_PAGE; r++) {
    const tds = [];
    for (let c = 1; c <= TOTAL_COLS; c++) {
      const v = page.cells[cellKey(r, c)] ?? "";
      tds.push(`<td class="pdf-td">${esc(v)}</td>`);
    }
    dataRows.push(`<tr class="pdf-datarow">${tds.join("")}</tr>`);
  }
  const tableCss = `
    .pdf-table{position:absolute;left:${px(TABLE_LEFT_PT)}px;top:${px(TABLE_TOP_PT)}px;
      width:${TABLE_WIDTH_PT * PT}px;border-collapse:collapse;table-layout:fixed;}
    .pdf-table *{box-sizing:border-box;}
    .pdf-th,.pdf-td{border:1px solid #000;margin:0;padding:0;text-align:center;
      vertical-align:middle;font-size:${px(9)}px;line-height:1.05;overflow:hidden;white-space:nowrap;}
    .pdf-th{font-weight:bold;background:#fff;}
    .pdf-grouprow th{height:${px(GROUP_ROW_H_PT)}px;}
    .pdf-subrow th{height:${px(subH)}px;}
    .pdf-datarow td{height:${px(DATA_ROW_H_PT)}px;}
    .pdf-whole{font-weight:bold;}
    .pdf-vlabel{white-space:normal;line-height:1.05;}
    .pdf-vsmall{font-size:${px(9)}px;}`;
  return `
    <style>${tableCss}</style>
    <table class="pdf-table">
      <colgroup>${colDefs}</colgroup>
      <thead>${groupRow}${subRow}</thead>
      <tbody>${dataRows.join("")}</tbody>
    </table>`;
}
function buildPageElement(page, record, pageIndex, totalPages, header) {
  const el = document.createElement("div");
  el.className = "pdf-page";
  el.style.cssText = `position:absolute;left:-100000px;top:0;width:${PAGE_W_PX}px;height:${PAGE_H_PX}px;overflow:hidden;background:#fff;color:#000;font-family:'SimSun','\u5B8B\u4F53',serif;`;
  const pageCss = `
    .pdf-page *{box-sizing:border-box;}
    .pdf-txt{position:absolute;white-space:nowrap;}`;
  el.innerHTML = `<style>${pageCss}</style>` + renderHeaderTexts(record, header) + renderTable(page, record) + renderFooter(pageIndex, totalPages);
  return el;
}
function shrinkOverflow(root) {
  const cells = root.querySelectorAll(".pdf-td");
  cells.forEach((cell) => {
    if (cell.scrollWidth > cell.clientWidth + 1) {
      let fs = 12;
      while (fs > 8 && cell.scrollWidth > cell.clientWidth + 1) {
        fs -= 0.5;
        cell.style.fontSize = `${fs}px`;
      }
    }
  });
}
async function buildRecordsPdfBlob(records, header = CMA_DEFAULT) {
  const html2canvas = (await getHtml2Canvas()).default;
  const { jsPDF } = await getJsPdf();
  const pdf = new jsPDF({ unit: "mm", format: "a3", orientation: "landscape" });
  let hasPage = false;
  for (const record of records) {
    const pages = buildPdfPages(record);
    const totalPages = pages.length;
    for (let i = 0; i < totalPages; i++) {
      const el = buildPageElement(pages[i], record, i + 1, totalPages, header);
      document.body.appendChild(el);
      shrinkOverflow(el);
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#fff",
        width: PAGE_W_PX,
        height: PAGE_H_PX,
        windowWidth: PAGE_W_PX,
        windowHeight: PAGE_H_PX
      });
      document.body.removeChild(el);
      const img = canvas.toDataURL("image/jpeg", 0.95);
      if (hasPage) pdf.addPage();
      pdf.addImage(img, "JPEG", 0, 0, 420, 297);
      hasPage = true;
    }
  }
  return pdf.output("blob");
}
async function buildRecordPdfBlob(record, header = CMA_DEFAULT) {
  return buildRecordsPdfBlob([record], header);
}
async function deliverPdfBlob(blob, fileName) {
  if (import_core.Capacitor.isNativePlatform()) {
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = uint8ToBase64(new Uint8Array(arrayBuffer));
    const fsResult = await import_filesystem.Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: import_filesystem.Directory.Documents
    });
    try {
      await import_share.Share.share({ title: "\u5F00\u571F\u8BB0\u5F55\u8868", text: "\u5F00\u571F\u8BB0\u5F55\u8868 PDF \u5BFC\u51FA", files: [fsResult.uri] });
    } catch {
    }
    return { success: true, message: `\u5DF2\u751F\u6210\u5E76\u4FDD\u5B58\u5230\u6587\u6863\u76EE\u5F55\uFF1A${fileName}`, path: fsResult.uri };
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
  return { success: true, message: `\u5DF2\u5BFC\u51FA ${fileName}\uFF08\u6D4F\u89C8\u5668\u4E0B\u8F7D\uFF09` };
}
function withOpenDate(records, openDate) {
  const d = (openDate ?? "").trim();
  if (!d) return records;
  return records.map((r) => ({
    ...r,
    engineering: { ...r.engineering, openDate: d }
  }));
}
async function exportRecordsPdf(records, header = CMA_DEFAULT, openDateOverride = "") {
  if (!records || records.length === 0) {
    return { success: false, message: "\u6CA1\u6709\u9009\u62E9\u8981\u5BFC\u51FA\u7684\u5B54" };
  }
  try {
    const stamped = withOpenDate(records, openDateOverride);
    const merged = stamped.length > 1;
    const fileName = merged ? buildMergedPdfFileName(stamped, openDateOverride.trim() || void 0) : buildSinglePdfFileName(stamped[0]);
    const blob = await buildRecordsPdfBlob(stamped, header);
    const result = await deliverPdfBlob(blob, fileName);
    if (result.success && merged) {
      return { ...result, message: `${result.message}\uFF08${stamped.length} \u4E2A\u5B54\u5DF2\u5408\u5E76\u4E3A\u4E00\u4E2A PDF\uFF09` };
    }
    return result;
  } catch (e) {
    return { success: false, message: "PDF \u5BFC\u51FA\u5931\u8D25\uFF1A" + (e?.message ?? String(e)) };
  }
}
async function exportRecordPdf(record, header = CMA_DEFAULT) {
  try {
    const blob = await buildRecordPdfBlob(record, header);
    return await deliverPdfBlob(blob, buildPdfFileName(record));
  } catch (e) {
    return { success: false, message: "PDF \u5BFC\u51FA\u5931\u8D25\uFF1A" + (e?.message ?? String(e)) };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildMergedPdfFileName,
  buildPdfPages,
  buildRecordPdfBlob,
  buildRecordsPdfBlob,
  buildSinglePdfFileName,
  exportRecordPdf,
  exportRecordsPdf,
  renderHeaderTexts,
  sanitizeFileNamePart,
  withOpenDate
});
