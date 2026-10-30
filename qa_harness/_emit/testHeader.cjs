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

// src/testHeader.ts
var testHeader_exports = {};
__export(testHeader_exports, {
  classifyConsolidationAlias: () => classifyConsolidationAlias,
  classifyShearLabel: () => classifyShearLabel,
  isNonDefaultShearKind: () => isNonDefaultShearKind
});
module.exports = __toCommonJS(testHeader_exports);
var NON_DEFAULT_SHEAR = ["\u56FA\u7ED3\u5FEB\u526A", "\u6162\u526A"];
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
function isNonDefaultShearKind(kind) {
  return NON_DEFAULT_SHEAR.includes(kind);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  classifyConsolidationAlias,
  classifyShearLabel,
  isNonDefaultShearKind
});
