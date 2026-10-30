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

// src/constants.ts
var constants_exports = {};
__export(constants_exports, {
  DEFAULT_SHEAR_LABELS: () => DEFAULT_SHEAR_LABELS,
  DISTURBANCE: () => DISTURBANCE,
  DISTURBED_APPLICABLE_TESTS: () => DISTURBED_APPLICABLE_TESTS,
  DISTURBED_INCOMPATIBLE_TESTS: () => DISTURBED_INCOMPATIBLE_TESTS,
  INCLUSIONS: () => INCLUSIONS,
  MODE_LABELS: () => MODE_LABELS,
  SHEAR_TEST_KEYS: () => SHEAR_TEST_KEYS,
  SILTY_SAND: () => SILTY_SAND,
  SOIL_STATES: () => SOIL_STATES,
  SOIL_TYPE_A: () => SOIL_TYPE_A,
  SOIL_TYPE_B: () => SOIL_TYPE_B,
  TEST_ITEMS: () => TEST_ITEMS,
  recordTestColumns: () => recordTestColumns,
  siltySandSymbol: () => siltySandSymbol,
  soilTypeOptions: () => soilTypeOptions
});
module.exports = __toCommonJS(constants_exports);
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
var SHEAR_TEST_KEYS = ["\u9971\u56FA\u5FEB\u526A", "\u56FA\u7ED3\u5FEB\u526A", "\u81EA\u7136\u5FEB\u526A", "\u6162\u526A"];
var DEFAULT_SHEAR_LABELS = ["\u9971\u56FA\u5FEB\u526A", "\u81EA\u7136\u5FEB\u526A"];
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
var MODE_LABELS = {
  A: "\u666E\u901A\u76EE\u529B\u9274\u522B",
  B: "\u4E09\u89D2\u5750\u6807\u5B9A\u540D"
};
function soilTypeOptions(mode) {
  return mode === "A" ? SOIL_TYPE_A : SOIL_TYPE_B;
}
var DISTURBANCE = ["\u539F\u72B6", "\u6270\u52A8"];
var SILTY_SAND = [
  { value: "triangle", label: "\u4E09\u89D2\u5F62" },
  { value: "circle", label: "\u7A7A\u5FC3\u5706" },
  { value: "none", label: "\u7A7A" }
];
function siltySandSymbol(v) {
  if (v === "triangle") return "\u25B3";
  if (v === "circle") return "\u25CB";
  return "";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_SHEAR_LABELS,
  DISTURBANCE,
  DISTURBED_APPLICABLE_TESTS,
  DISTURBED_INCOMPATIBLE_TESTS,
  INCLUSIONS,
  MODE_LABELS,
  SHEAR_TEST_KEYS,
  SILTY_SAND,
  SOIL_STATES,
  SOIL_TYPE_A,
  SOIL_TYPE_B,
  TEST_ITEMS,
  recordTestColumns,
  siltySandSymbol,
  soilTypeOptions
});
