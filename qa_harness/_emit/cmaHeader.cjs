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

// src/cmaHeader.ts
var cmaHeader_exports = {};
__export(cmaHeader_exports, {
  CMA_DEFAULT: () => CMA_DEFAULT,
  CMA_LIMITS: () => CMA_LIMITS,
  describeCmaChanges: () => describeCmaChanges,
  fitHeaderFontSize: () => fitHeaderFontSize,
  isCmaHeaderDefault: () => isCmaHeaderDefault,
  normalizeCmaHeader: () => normalizeCmaHeader
});
module.exports = __toCommonJS(cmaHeader_exports);
var CMA_DEFAULT = {
  versionLine: "\u7B2C 3 \u7248 \u7B2C 0 \u6B21\u4FEE\u6539 2024 \u5E74 12 \u6708 1 \u65E5\u8D77\u5B9E\u65BD",
  docCode: "SHLY-TR068-2024"
};
var CMA_LIMITS = {
  versionLine: 40,
  docCode: 24
};
function normalizeCmaHeader(input) {
  const src = input && typeof input === "object" ? input : {};
  const pick = (v, fallback) => {
    const s = typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").trim() : "";
    return s || fallback;
  };
  return {
    versionLine: pick(src.versionLine, CMA_DEFAULT.versionLine),
    docCode: pick(src.docCode, CMA_DEFAULT.docCode)
  };
}
function describeCmaChanges(before, after) {
  const a = normalizeCmaHeader(before);
  const b = normalizeCmaHeader(after);
  const out = [];
  if (a.versionLine !== b.versionLine) {
    out.push({ key: "versionLine", label: "\u7248\u672C\u884C", from: a.versionLine, to: b.versionLine });
  }
  if (a.docCode !== b.docCode) {
    out.push({ key: "docCode", label: "\u6587\u4EF6\u7F16\u53F7", from: a.docCode, to: b.docCode });
  }
  return out;
}
function isCmaHeaderDefault(s) {
  const v = normalizeCmaHeader(s);
  return v.versionLine === CMA_DEFAULT.versionLine && v.docCode === CMA_DEFAULT.docCode;
}
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CMA_DEFAULT,
  CMA_LIMITS,
  describeCmaChanges,
  fitHeaderFontSize,
  isCmaHeaderDefault,
  normalizeCmaHeader
});
