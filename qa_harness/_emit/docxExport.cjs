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

// src/docxExport.ts
var docxExport_exports = {};
__export(docxExport_exports, {
  DEFAULT_HEADER_PAGE_METRICS: () => DEFAULT_HEADER_PAGE_METRICS,
  DOCX_ROWS_PER_PAGE: () => DOCX_ROWS_PER_PAGE,
  applyCmaHeaderXml: () => applyCmaHeaderXml,
  applyDocCodeXml: () => applyDocCodeXml,
  buildDocxBlob: () => buildDocxBlob,
  buildDocxBody: () => buildDocxBody,
  buildMergedDocxFileName: () => buildMergedDocxFileName,
  buildSingleDocxFileName: () => buildSingleDocxFileName,
  estimateHeaderWidthPt: () => estimateHeaderWidthPt,
  exportRecordsDocx: () => exportRecordsDocx,
  fillInfoRow: () => fillInfoRow,
  fitHeaderSizes: () => fitHeaderSizes,
  headerAvailTwips: () => headerAvailTwips,
  headerBaseHalfPt: () => headerBaseHalfPt,
  headerCharEm: () => headerCharEm,
  readHeaderPageMetrics: () => readHeaderPageMetrics,
  resolveStyleHalfPt: () => resolveStyleHalfPt,
  sampleDocxCells: () => sampleDocxCells
});
module.exports = __toCommonJS(docxExport_exports);

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

// src/docxExport.ts
var import_core2 = require("@capacitor/core");
var import_filesystem2 = require("@capacitor/filesystem");
var import_share2 = require("@capacitor/share");

// src/pdfExport.ts
var import_core = require("@capacitor/core");
var import_filesystem = require("@capacitor/filesystem");
var import_share = require("@capacitor/share");

// src/cmaHeader.ts
var CMA_DEFAULT = {
  versionLine: "\u7B2C 3 \u7248 \u7B2C 0 \u6B21\u4FEE\u6539 2024 \u5E74 12 \u6708 1 \u65E5\u8D77\u5B9E\u65BD",
  docCode: "SHLY-TR068-2024"
};

// src/exportNaming.ts
var ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;
function sanitizeFileNamePart(input, fallback = "\u672A\u547D\u540D") {
  const cleaned = String(input ?? "").replace(ILLEGAL_FILENAME_CHARS, "-").trim();
  return cleaned || fallback;
}
function stripSoilNumber(holeCode, soilNumber) {
  const hole = String(holeCode ?? "").trim();
  const sn = String(soilNumber ?? "").trim();
  if (!sn) return "";
  if (hole && sn.startsWith(hole + "-")) return sn.slice(hole.length + 1);
  let m = sn.match(/^原(\d+)$/);
  if (m) return m[1];
  m = sn.match(/^(?:扰|[rR])(\d+)$/);
  if (m) return `R${m[1]}`;
  if (sn.startsWith("-")) return sn.slice(1);
  return sn;
}

// src/pdfExport.ts
var PT = 4 / 3;
var INFO_DATE_SHIFT_PT = 24.4;
var INFO_YEAR_LEFT_PT = 978.4 - INFO_DATE_SHIFT_PT;
var INFO_YEAR_RIGHT_PT = 1104.8 - INFO_DATE_SHIFT_PT;
function withOpenDate(records, openDate) {
  const d = (openDate ?? "").trim();
  if (!d) return records;
  return records.map((r) => ({
    ...r,
    engineering: { ...r.engineering, openDate: d }
  }));
}

// src/docxExport.ts
var DOCX_ROWS_PER_PAGE = 23;
var DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var TR_RE = /<w:tr(?: [^>]*)?>[\s\S]*?<\/w:tr>/g;
var TC_RE = /<w:tc>[\s\S]*?<\/w:tc>/g;
var GRIDCOL_RE = /<w:gridCol w:w="(\d+)"\/>/g;
var SPAN_RE = /<w:gridSpan w:val="(\d+)"\/>/;
var P_RE = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/;
var RUN_RE = /<w:r>[\s\S]*?<\/w:r>/;
var RPR_RE = /<w:rPr>[\s\S]*?<\/w:rPr>/;
var PPR_RE = /<w:pPr>[\s\S]*?<\/w:pPr>/;
var SZ_RE = /<w:sz w:val="\d+"\/>/;
var SZCS_RE = /<w:szCs w:val="\d+"\/>/;
var LANG_RE = /<w:lang [^>]*\/>/;
var PAGE_BREAK_P = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="14" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:br w:type="page"/></w:r></w:p>';
function cleanCloneXml(xml) {
  return xml.replace(/<w:bookmarkStart[^>]*\/>/g, "").replace(/<w:bookmarkEnd[^>]*\/>/g, "").replace(/ w14:paraId="[^"]*"/g, "").replace(/ w14:textId="[^"]*"/g, "");
}
function trHead(tr) {
  const i = tr.indexOf("<w:tc>");
  return i >= 0 ? tr.slice(0, i) : tr;
}
function rebuildTr(tr, tcs) {
  return trHead(tr) + tcs.join("") + "</w:tr>";
}
function estimateWidthPt(text, halfPt) {
  const em = halfPt / 2;
  let w = 0;
  for (const ch of text) {
    w += ch.charCodeAt(0) > 255 ? em : em * 0.55;
  }
  return w;
}
function applySz(rPr, halfPt) {
  const sz = `<w:sz w:val="${halfPt}"/><w:szCs w:val="${halfPt}"/>`;
  if (SZ_RE.test(rPr)) {
    return rPr.replace(SZ_RE, `<w:sz w:val="${halfPt}"/>`).replace(SZCS_RE, `<w:szCs w:val="${halfPt}"/>`);
  }
  if (rPr) {
    if (LANG_RE.test(rPr)) return rPr.replace(LANG_RE, `${sz}`);
    return rPr + sz;
  }
  return `<w:rPr>${sz}</w:rPr>`;
}
function fillTc(tcXml, text, widthTwips = 0, defaultHalfPt = 18) {
  if (!text) return tcXml;
  return tcXml.replace(P_RE, (p) => {
    const pPr = p.match(PPR_RE)?.[0] ?? "";
    const run = p.match(RUN_RE)?.[0] ?? "";
    const rPr0 = run.match(RPR_RE)?.[0] ?? "";
    const halfOf = (xml) => Number(xml.match(SZ_RE)?.[0]?.match(/\d+/)?.[0] ?? 0);
    const base = halfOf(rPr0) || halfOf(pPr) || defaultHalfPt;
    let halfPt = base;
    if (widthTwips > 0) {
      const availPt = widthTwips / 20 - 216 / 20 - 2;
      while (halfPt > 13 && estimateWidthPt(text, halfPt) > availPt) halfPt -= 1;
    }
    return `<w:p>${pPr}<w:r>${applySz(rPr0, halfPt)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  });
}
function fillRowCells(rowXml, gridWidths, fill, defaultHalfPt) {
  const tcs = rowXml.match(TC_RE) ?? [];
  let gridIdx = 0;
  for (let i = 0; i < tcs.length; i++) {
    const tc = tcs[i];
    const span = Number(tc.match(SPAN_RE)?.[1] ?? 1);
    const text = fill[i];
    if (text) {
      let widthTwips = 0;
      for (let k = gridIdx; k < gridIdx + span && k < gridWidths.length; k++) {
        widthTwips += gridWidths[k] ?? 0;
      }
      tcs[i] = fillTc(tc, text, widthTwips, defaultHalfPt);
    }
    gridIdx += span;
  }
  return rebuildTr(cleanCloneXml(rowXml), tcs);
}
function sampleDocxCells(s, mode, seq, testKeys, holeCode) {
  const v = new Array(39).fill("");
  const soilType = soilTypeOptions(mode);
  const short = stripSoilNumber(holeCode, s.soilNumber);
  v[0] = short ? `-${short}` : `-${seq}`;
  v[1] = s.fieldRecord ?? "";
  v[4] = s.color ?? "";
  v[5] = s.smell ?? "";
  for (let i = 0; i < 6; i++) {
    v[6 + i] = soilType[i] != null && s.soilType.includes(soilType[i]) ? "\u221A" : "";
  }
  v[13] = s.disturbance === "\u6270\u52A8" ? "\u221A" : "";
  for (let i = 0; i < INCLUSIONS.length; i++) {
    v[14 + i] = s.inclusions.includes(INCLUSIONS[i]) ? "\u221A" : "";
  }
  for (let i = 0; i < SOIL_STATES.length; i++) {
    v[25 + i] = s.soilState.includes(SOIL_STATES[i]) ? "\u221A" : "";
  }
  v[30] = s.soilStateNote ?? "";
  for (let i = 0; i < testKeys.length && i < 8; i++) {
    v[31 + i] = s.testItems.includes(testKeys[i]) ? "\u221A" : "";
  }
  return v;
}
function infoParts(openDate) {
  const parts = (openDate ?? "").trim().split("-");
  return { y: parts[0] ?? "", m: parts[1] ?? "", d: parts[2] ?? "" };
}
function fillInfoRow(row0, gridWidths, record) {
  const tcs = row0.match(TC_RE) ?? [];
  if (tcs.length < 13) throw new Error("docx \u6A21\u677F\u4FE1\u606F\u884C\u7ED3\u6784\u5F02\u5E38");
  const eng = record.engineering;
  const { y, m, d } = infoParts(eng?.openDate ?? "");
  return fillRowCells(row0, gridWidths, {
    0: `\u5DE5\u7A0B\u7F16\u53F7\uFF1A${eng?.projectCode ?? ""}`,
    5: `\u5B54\u53F7\uFF1A${eng?.holeCode ?? ""}`,
    9: `\u5B54\u53E3\u6807\u9AD8${eng?.holeElevation ?? ""}`,
    12: `\u5F00\u571F\u65E5\u671F${y || "    "}\u5E74${m || "  "}\u6708${d || "  "}\u65E5`
  }, 22);
}
function fillTestHeaderRow(row2, labels) {
  const tcs = row2.match(TC_RE) ?? [];
  if (tcs.length !== 39) throw new Error("docx \u6A21\u677F\u5B50\u9879\u884C\u7ED3\u6784\u5F02\u5E38");
  for (let i = 0; i < labels.length && i < 8; i++) {
    const label = labels[i];
    if (label) tcs[31 + i] = fillTc(tcs[31 + i], label);
  }
  return rebuildTr(cleanCloneXml(row2), tcs);
}
function fillDataRow(rowTpl, gridWidths, fill) {
  if (!fill) return cleanCloneXml(rowTpl);
  return fillRowCells(rowTpl, gridWidths, fill, 18);
}
function cellsToFill(cells) {
  const fill = {};
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]) fill[i] = cells[i];
  }
  return fill;
}
function buildDocxBody(tplXml, records) {
  const tblStart = tplXml.indexOf("<w:tbl>");
  const TBL_END = "</w:tbl>";
  const tblEnd = tplXml.lastIndexOf(TBL_END);
  if (tblStart < 0 || tblEnd < 0) throw new Error("docx \u6A21\u677F\u7F3A\u5C11\u8868\u683C");
  const tbl = tplXml.slice(tblStart, tblEnd + TBL_END.length);
  const firstTr = tbl.indexOf("<w:tr");
  const tblOpen = tbl.slice(0, firstTr);
  const gridWidths = Array.from(tblOpen.matchAll(GRIDCOL_RE), (m) => Number(m[1]));
  if (gridWidths.length === 0) throw new Error("docx \u6A21\u677F\u7F3A\u5C11 tblGrid");
  const trs = tbl.slice(firstTr, tbl.length - TBL_END.length).match(TR_RE) ?? [];
  if (trs.length < 26) throw new Error(`docx \u6A21\u677F\u884C\u6570\u5F02\u5E38\uFF1A${trs.length}`);
  const tailRowTpl = cleanCloneXml(trs[25] ?? "");
  const rowTpl = cleanCloneXml(trs[3] ?? "");
  const headRow1 = cleanCloneXml(trs[1] ?? "");
  const infoRowTpl = trs[0] ?? "";
  const subRowTpl = trs[2] ?? "";
  const pages = [];
  for (const record of records) {
    const samples = record.samples ?? [];
    const recCols = recordTestColumns(record);
    const testKeys = recCols.map((c) => c.key);
    const testLabels = recCols.map((c) => c.label);
    const holeCode = record.engineering?.holeCode ?? "";
    const totalPages = Math.max(1, Math.ceil(samples.length / DOCX_ROWS_PER_PAGE));
    for (let p = 0; p < totalPages; p++) {
      const rows = [
        fillInfoRow(infoRowTpl, gridWidths, record),
        headRow1,
        fillTestHeaderRow(subRowTpl, testLabels)
      ];
      for (let r = 0; r < DOCX_ROWS_PER_PAGE; r++) {
        const idx = p * DOCX_ROWS_PER_PAGE + r;
        const s = samples[idx];
        const fill = s ? cellsToFill(sampleDocxCells(s, record.mode, idx + 1, testKeys, holeCode)) : null;
        const rowXml = r === DOCX_ROWS_PER_PAGE - 1 ? tailRowTpl : rowTpl;
        rows.push(fillDataRow(rowXml, gridWidths, fill));
      }
      pages.push(tblOpen + rows.join("") + TBL_END);
    }
  }
  return tplXml.slice(0, tblStart) + pages.join(PAGE_BREAK_P) + tplXml.slice(tblEnd + TBL_END.length);
}
function localDateStr(date = /* @__PURE__ */ new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function buildSingleDocxFileName(record) {
  const date = sanitizeFileNamePart(record?.engineering?.openDate ?? "", "");
  const hole = sanitizeFileNamePart(record?.engineering?.holeCode ?? "", "");
  const base = date ? `${date}_${hole || "\u672A\u547D\u540D\u5B54"}` : hole || "\u672A\u547D\u540D\u5B54";
  return `${base}.docx`;
}
function buildMergedDocxFileName(records, today) {
  const count = records?.length ?? 0;
  if (count === 1) return buildSingleDocxFileName(records[0]);
  const day = sanitizeFileNamePart(today || localDateStr(), "") || localDateStr();
  return `\u5F00\u571F\u8BB0\u5F55_${count}\u5B54_${day}.docx`;
}
async function fetchTemplateBytes(mode) {
  const { DOCX_TEMPLATE_URLS } = await import("./docxAssets");
  const res = await fetch(DOCX_TEMPLATE_URLS[mode]);
  if (!res.ok) throw new Error(`\u6A21\u677F\u52A0\u8F7D\u5931\u8D25\uFF08${res.status}\uFF09`);
  return new Uint8Array(await res.arrayBuffer());
}
var HEADER_RUN_RE = /<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/g;
var HEADER_TEXT_RE = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g;
function runText(run) {
  HEADER_TEXT_RE.lastIndex = 0;
  let t = "";
  let m;
  while ((m = HEADER_TEXT_RE.exec(run)) !== null) t += m[1];
  return t;
}
function runRPr(run) {
  return run.match(RPR_RE)?.[0] ?? "";
}
var DEFAULT_HEADER_PAGE_METRICS = {
  pageWidthTwips: 23814,
  marginLeftTwips: 1417,
  marginRightTwips: 1417
};
function headerAvailTwips(m) {
  return Math.max(0, m.pageWidthTwips - m.marginLeftTwips - m.marginRightTwips);
}
function readHeaderPageMetrics(documentXml) {
  const sect = documentXml.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/)?.[0] ?? documentXml;
  const pgSz = sect.match(/<w:pgSz [^>]*\/>/)?.[0] ?? "";
  const pgMar = sect.match(/<w:pgMar [^>]*\/>/)?.[0] ?? "";
  const num = (xml, attr) => {
    const v = xml.match(new RegExp(`w:${attr}="(-?\\d+)"`))?.[1];
    return v == null ? 0 : Number(v);
  };
  const width = num(pgSz, "w") || DEFAULT_HEADER_PAGE_METRICS.pageWidthTwips;
  const left = pgMar ? num(pgMar, "left") : DEFAULT_HEADER_PAGE_METRICS.marginLeftTwips;
  const right = pgMar ? num(pgMar, "right") : DEFAULT_HEADER_PAGE_METRICS.marginRightTwips;
  return { pageWidthTwips: width, marginLeftTwips: left, marginRightTwips: right };
}
function headerCharEm(c) {
  if (c === "\u3000") return 1;
  if (c === " ") return 0.5;
  const code = c.codePointAt(0) ?? 0;
  if (code >= 11904) return 1;
  return 0.5;
}
function estimateHeaderWidthPt(text, halfPt) {
  let em = 0;
  for (const c of text) em += headerCharEm(c);
  return em * halfPt / 2;
}
var HEADER_MIN_VERSION_HALF_PT = 16;
var HEADER_MIN_SPACE_HALF_PT = 10;
var HEADER_MIN_SPACING_TWIPS = -30;
function fitHeaderSizes(prefixText, versionText, baseHalfPt, availablePt) {
  const base = baseHalfPt > 0 ? baseHalfPt : 18;
  const prefixPt = estimateHeaderWidthPt(prefixText, base);
  const versionPt = estimateHeaderWidthPt(versionText, base);
  const totalPt = prefixPt + versionPt;
  const charCount = [...versionText].length;
  const noShrink = {
    baseHalfPt: base,
    versionHalfPt: base,
    spaceHalfPt: base,
    spacingTwips: 0,
    availablePt,
    estimatedPt: totalPt,
    shrunkVersion: false,
    shrunkSpaces: false
  };
  if (!versionText || !(availablePt > 0) || totalPt <= availablePt) return noShrink;
  const needPt = totalPt - availablePt;
  if (charCount > 0) {
    const needTwips = Math.ceil(needPt * 20 / charCount);
    if (needTwips <= -HEADER_MIN_SPACING_TWIPS) {
      return {
        ...noShrink,
        spacingTwips: -needTwips,
        estimatedPt: totalPt - needTwips / 20 * charCount
      };
    }
  }
  const spacingTwips = HEADER_MIN_SPACING_TWIPS;
  const spacingPt = spacingTwips / 20;
  const roomPt = availablePt - prefixPt - spacingPt * charCount;
  let versionHalf = HEADER_MIN_VERSION_HALF_PT;
  if (roomPt > 0 && versionPt > 0) {
    versionHalf = Math.floor(base * roomPt / versionPt);
  }
  versionHalf = Math.max(HEADER_MIN_VERSION_HALF_PT, Math.min(base, versionHalf));
  const widthAt = (vHalf, sHalf) => prefixPt * sHalf / base + versionPt * vHalf / base + spacingPt * charCount;
  let spaceHalf = base;
  let estimatedPt = widthAt(versionHalf, spaceHalf);
  while (estimatedPt > availablePt && spaceHalf > HEADER_MIN_SPACE_HALF_PT) {
    spaceHalf -= 1;
    estimatedPt = widthAt(versionHalf, spaceHalf);
  }
  return {
    baseHalfPt: base,
    versionHalfPt: versionHalf,
    spaceHalfPt: spaceHalf,
    spacingTwips,
    availablePt,
    estimatedPt,
    shrunkVersion: versionHalf < base,
    shrunkSpaces: spaceHalf < base
  };
}
function rPrHalfPt(rPr) {
  const v = rPr.match(/<w:sz w:val="(\d+)"\/>/)?.[1];
  return v == null ? 0 : Number(v);
}
function withRunFormat(rPr, halfPt, spacingTwips = 0) {
  const sz = `<w:sz w:val="${halfPt}"/><w:szCs w:val="${halfPt}"/>`;
  const sp = spacingTwips ? `<w:spacing w:val="${Math.round(spacingTwips)}"/>` : "";
  const inject = sp + sz;
  if (!rPr) return `<w:rPr>${inject}</w:rPr>`;
  const body = rPr.replace(/^<w:rPr>/, "").replace(/<\/w:rPr>$/, "").replace(/<w:spacing [^>]*\/>/g, "").replace(/<w:sz [^>]*\/>/g, "").replace(/<w:szCs [^>]*\/>/g, "");
  const ANCHOR_RE = /<w:u [^>]*\/>|<w:u\/>|<w:effect [^>]*\/>|<w:bdr [^>]*\/>|<w:shd [^>]*\/>|<w:vertAlign [^>]*\/>|<w:lang [^>]*\/>/;
  const anchor = body.match(ANCHOR_RE);
  if (anchor) return `<w:rPr>${body.replace(ANCHOR_RE, inject + anchor[0])}</w:rPr>`;
  return `<w:rPr>${body}${inject}</w:rPr>`;
}
function paragraphStyleId(pXml) {
  return pXml.match(/<w:pStyle w:val="([^"]+)"\/>/)?.[1] ?? "";
}
function docDefaultHalfPt(stylesXml) {
  const defaults = stylesXml.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/)?.[0] ?? "";
  const v = defaults.match(/<w:sz w:val="(\d+)"\/>/)?.[1];
  return v == null ? 20 : Number(v);
}
function resolveStyleHalfPt(stylesXml, styleId) {
  if (!stylesXml || !styleId) return docDefaultHalfPt(stylesXml);
  const styles = /* @__PURE__ */ new Map();
  const re = /<w:style [\s\S]*?<\/w:style>/g;
  let m;
  while ((m = re.exec(stylesXml)) !== null) {
    const xml = m[0];
    const id = xml.match(/w:styleId="([^"]+)"/)?.[1];
    if (!id) continue;
    styles.set(id, {
      basedOn: xml.match(/<w:basedOn w:val="([^"]+)"\/>/)?.[1] ?? "",
      halfPt: rPrHalfPt(xml.match(RPR_RE)?.[0] ?? "")
    });
  }
  let cursor = styleId;
  const seen = /* @__PURE__ */ new Set();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const style = styles.get(cursor);
    if (!style) break;
    if (style.halfPt > 0) return style.halfPt;
    cursor = style.basedOn;
  }
  return docDefaultHalfPt(stylesXml);
}
function headerBaseHalfPt(headerXml, stylesXml = "") {
  const para = headerXml.match(/<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/)?.[0] ?? headerXml;
  const runs = para.match(HEADER_RUN_RE) ?? [];
  for (const run of runs) {
    const t = runText(run);
    if (t.trim() === "" || t.includes("\u516C\u53F8")) continue;
    const half = rPrHalfPt(runRPr(run));
    if (half > 0) return half;
  }
  const styleId = paragraphStyleId(para);
  if (stylesXml) return resolveStyleHalfPt(stylesXml, styleId);
  return 20;
}
function applyCmaHeaderXml(headerXml, header, ctx = {}) {
  const runs = headerXml.match(HEADER_RUN_RE) ?? [];
  const texts = runs.map(runText);
  const isVersionRun = (t) => t.trim() !== "" && !t.includes("\u516C\u53F8");
  let first = -1;
  let last = -1;
  for (let i = 0; i < runs.length; i++) {
    if (isVersionRun(texts[i])) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return headerXml;
  const versionLine = (header.versionLine ?? "").trim();
  const page = ctx.page ?? DEFAULT_HEADER_PAGE_METRICS;
  const availablePt = Math.max(0, headerAvailTwips(page) / 20 - 8);
  const baseHalfPt = headerBaseHalfPt(headerXml, ctx.stylesXml ?? "");
  const prefixText = texts.slice(0, first).join("");
  const fit = fitHeaderSizes(prefixText, versionLine, baseHalfPt, availablePt);
  const rPr = runRPr(runs[first]);
  const replacement = versionLine ? `<w:r>${withRunFormat(rPr, fit.versionHalfPt, fit.spacingTwips)}<w:t xml:space="preserve">${esc(versionLine)}</w:t></w:r>` : "";
  const spaceSz = fit.shrunkSpaces ? fit.spaceHalfPt : 0;
  const respaceRun = (run, text) => {
    if (!spaceSz || !text || text.trim() !== "") return run;
    return run.replace(RPR_RE, withRunFormat(runRPr(run), spaceSz));
  };
  let out = "";
  let cursor = 0;
  for (let i = 0; i < runs.length; i++) {
    const idx = headerXml.indexOf(runs[i], cursor);
    if (idx < 0) return headerXml;
    out += headerXml.slice(cursor, idx);
    if (i === first) out += replacement;
    else if (i < first) out += respaceRun(runs[i], texts[i]);
    else if (i > last) out += runs[i];
    cursor = idx + runs[i].length;
  }
  return out + headerXml.slice(cursor);
}
var DOC_CODE_PATTERN = /^[A-Z]{2,6}-TR\d{3}-\d{4}$/;
var RIGHT_JC_RE = /<w:jc[^>]*w:val="right"[^>]*\/>/;
var PARA_RE = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g;
var RUN_ANY_RE = /<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/;
function paragraphText(pXml) {
  const out = [];
  const re = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(pXml)) !== null) out.push(m[1] ?? "");
  return out.join("");
}
function applyDocCodeXml(documentXml, docCode) {
  const code = (docCode ?? "").trim();
  if (!code) return documentXml;
  return documentXml.replace(PARA_RE, (para) => {
    const pPr = para.match(PPR_RE)?.[0] ?? "";
    if (!RIGHT_JC_RE.test(pPr)) return para;
    if (!DOC_CODE_PATTERN.test(paragraphText(para).trim())) return para;
    const openTag = para.match(/^<w:p(?: [^>]*)?>/)?.[0] ?? "<w:p>";
    const firstRun = para.match(RUN_ANY_RE)?.[0] ?? "";
    const rPr = firstRun.match(RPR_RE)?.[0] ?? "";
    return `${openTag}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(code)}</w:t></w:r></w:p>`;
  });
}
async function buildDocxBlob(records, templateBytes, header = null) {
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import("fflate");
  const files = unzipSync(templateBytes);
  const xmlEntry = "word/document.xml";
  if (!files[xmlEntry]) throw new Error("docx \u6A21\u677F\u7F3A\u5C11 document.xml");
  const tplDocumentXml = strFromU8(files[xmlEntry]);
  const bodyXml = buildDocxBody(tplDocumentXml, records);
  const outXml = applyDocCodeXml(bodyXml, header?.docCode ?? "");
  files[xmlEntry] = strToU8(outXml);
  if (header) {
    const headerEntry = "word/header1.xml";
    if (files[headerEntry]) {
      files[headerEntry] = strToU8(
        applyCmaHeaderXml(strFromU8(files[headerEntry]), header, {
          page: readHeaderPageMetrics(tplDocumentXml),
          stylesXml: files["word/styles.xml"] ? strFromU8(files["word/styles.xml"]) : ""
        })
      );
    }
  }
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped], { type: DOCX_MIME });
}
function uint8ToBase64(bytes) {
  let binary = "";
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}
function isShareCancelled(e) {
  if (!e || typeof e !== "object") return false;
  const err = e;
  if (err.name === "AbortError") return true;
  return typeof err.message === "string" && /cancel|取消/i.test(err.message);
}
async function deliverDocxBlob(blob, fileName) {
  if (import_core2.Capacitor.isNativePlatform()) {
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = uint8ToBase64(new Uint8Array(arrayBuffer));
    const fsResult = await import_filesystem2.Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: import_filesystem2.Directory.Documents
    });
    try {
      await import_share2.Share.share({ title: "\u5F00\u571F\u8BB0\u5F55\u8868", text: "\u5F00\u571F\u8BB0\u5F55\u8868 Word \u5BFC\u51FA", files: [fsResult.uri] });
      return {
        success: true,
        message: `\u5DF2\u4FDD\u5B58\u5230\u6587\u6863\u76EE\u5F55\u5E76\u6253\u5F00\u7CFB\u7EDF\u5206\u4EAB\uFF1A${fileName}`,
        path: fsResult.uri
      };
    } catch (e) {
      const cancelled = isShareCancelled(e);
      return {
        success: true,
        message: cancelled ? `\u5DF2\u4FDD\u5B58\u5230\u6587\u6863\u76EE\u5F55\uFF08\u5DF2\u53D6\u6D88\u5206\u4EAB\uFF09\uFF1A${fileName}` : `\u6587\u4EF6\u5DF2\u4FDD\u5B58\u5230\u6587\u6863\u76EE\u5F55\uFF1A${fileName}`,
        path: fsResult.uri
      };
    }
  }
  const nav = navigator;
  if (typeof nav.share === "function") {
    const file = new File([blob], fileName, { type: DOCX_MIME });
    let canShareFile = false;
    try {
      canShareFile = typeof nav.canShare === "function" && nav.canShare({ files: [file] });
    } catch {
      canShareFile = false;
    }
    if (canShareFile) {
      try {
        await nav.share({ files: [file], title: "\u5F00\u571F\u8BB0\u5F55\u8868", text: "\u5F00\u571F\u8BB0\u5F55\u8868 Word \u5BFC\u51FA" });
        return { success: true, message: `\u5DF2\u901A\u8FC7\u7CFB\u7EDF\u5206\u4EAB\u53D1\u9001\uFF1A${fileName}` };
      } catch (e) {
        if (isShareCancelled(e)) {
          return { success: true, message: `\u5DF2\u53D6\u6D88\u5206\u4EAB ${fileName}` };
        }
      }
    }
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
async function exportRecordsDocx(records, openDateOverride = "", cmaHeader = CMA_DEFAULT) {
  if (!records || records.length === 0) {
    return { success: false, message: "\u6CA1\u6709\u9009\u62E9\u8981\u5BFC\u51FA\u7684\u5B54" };
  }
  try {
    const stamped = withOpenDate(records, openDateOverride);
    const groupA = stamped.filter((r) => r.mode !== "B");
    const groupB = stamped.filter((r) => r.mode === "B");
    const mixed = groupA.length > 0 && groupB.length > 0;
    const groups = mixed ? [
      { records: groupA, tag: "\u666E\u901A\u5B9A\u540D" },
      { records: groupB, tag: "\u4E09\u89D2\u5750\u6807" }
    ] : [{ records: stamped, tag: "" }];
    const today = openDateOverride.trim() || void 0;
    const messages = [];
    for (const group of groups) {
      const merged = group.records.length > 1;
      const baseName = merged ? buildMergedDocxFileName(group.records, today) : buildSingleDocxFileName(group.records[0]);
      const fileName = mixed && merged ? baseName.replace("\u5F00\u571F\u8BB0\u5F55_", `\u5F00\u571F\u8BB0\u5F55_${group.tag}_`) : baseName;
      const bytes = await fetchTemplateBytes(group.records[0].mode);
      const blob = await buildDocxBlob(group.records, bytes, cmaHeader);
      messages.push((await deliverDocxBlob(blob, fileName)).message);
    }
    return {
      success: true,
      message: messages.length > 1 ? `\u5DF2\u5BFC\u51FA ${messages.length} \u4E2A Word \u6587\u4EF6` : messages[0]
    };
  } catch (e) {
    return { success: false, message: "Word \u5BFC\u51FA\u5931\u8D25\uFF1A" + (e?.message ?? String(e)) };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_HEADER_PAGE_METRICS,
  DOCX_ROWS_PER_PAGE,
  applyCmaHeaderXml,
  applyDocCodeXml,
  buildDocxBlob,
  buildDocxBody,
  buildMergedDocxFileName,
  buildSingleDocxFileName,
  estimateHeaderWidthPt,
  exportRecordsDocx,
  fillInfoRow,
  fitHeaderSizes,
  headerAvailTwips,
  headerBaseHalfPt,
  headerCharEm,
  readHeaderPageMetrics,
  resolveStyleHalfPt,
  sampleDocxCells
});
