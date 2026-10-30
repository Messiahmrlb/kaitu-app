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

// src/exportNaming.ts
var exportNaming_exports = {};
__export(exportNaming_exports, {
  buildXlsxFileName: () => buildXlsxFileName,
  buildXlsxGroupFileName: () => buildXlsxGroupFileName,
  groupXlsxRecords: () => groupXlsxRecords,
  mergedSoilNumber: () => mergedSoilNumber,
  parseHolePrefix: () => parseHolePrefix,
  sanitizeFileNamePart: () => sanitizeFileNamePart,
  stripSoilNumber: () => stripSoilNumber
});
module.exports = __toCommonJS(exportNaming_exports);
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
function parseHolePrefix(holeCode) {
  const s = String(holeCode ?? "").trim();
  const m = s.match(/^([A-Za-z]+)(\d+)$/);
  if (m) return { prefix: m[1], num: m[2] };
  return { prefix: "", num: s };
}
function groupXlsxRecords(records) {
  const map = /* @__PURE__ */ new Map();
  const groups = [];
  for (const r of records) {
    const { prefix } = parseHolePrefix(r?.engineering?.holeCode);
    const key = prefix ? `${String(r?.engineering?.projectCode ?? "").trim()}|${prefix}` : `\0${r?.id ?? Math.random()}`;
    const arr = map.get(key);
    if (arr) arr.push(r);
    else {
      const g = [r];
      map.set(key, g);
      groups.push(g);
    }
  }
  return groups;
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
var NORMALIZABLE_SN = /^(?:原\d+|扰\d+|[rR]\d+|-?\d+)$/;
function mergedSoilNumber(holeCode, soilNumber) {
  const hole = String(holeCode ?? "").trim();
  const sn = String(soilNumber ?? "").trim();
  if (!hole || !sn) return sn;
  if (sn.startsWith(hole)) return sn;
  if (!NORMALIZABLE_SN.test(sn)) return sn;
  return `${hole}-${stripSoilNumber(hole, sn)}`;
}
function buildXlsxGroupFileName(records) {
  const first = records?.[0];
  const project = sanitizeFileNamePart(first?.engineering?.projectCode, "");
  const { prefix } = parseHolePrefix(first?.engineering?.holeCode);
  const n = records?.length ?? 0;
  const parts = [project, prefix].filter(Boolean).join("-");
  return sanitizeFileNamePart(`${parts || "\u5F00\u571F\u8BB0\u5F55"}(${n}\u5B54).xlsx`);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildXlsxFileName,
  buildXlsxGroupFileName,
  groupXlsxRecords,
  mergedSoilNumber,
  parseHolePrefix,
  sanitizeFileNamePart,
  stripSoilNumber
});
