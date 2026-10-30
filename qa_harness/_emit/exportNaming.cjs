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
  sanitizeFileNamePart: () => sanitizeFileNamePart
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildXlsxFileName,
  sanitizeFileNamePart
});
