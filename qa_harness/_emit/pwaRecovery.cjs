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

// src/pwaRecovery.ts
var pwaRecovery_exports = {};
__export(pwaRecovery_exports, {
  importWithRecovery: () => importWithRecovery,
  installChunkLoadRecovery: () => installChunkLoadRecovery,
  isChunkLoadError: () => isChunkLoadError,
  recoverFromChunkLoadError: () => recoverFromChunkLoadError
});
module.exports = __toCommonJS(pwaRecovery_exports);
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
function installChunkLoadRecovery() {
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    recoverFromChunkLoadError();
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (isChunkLoadError(e.reason)) recoverFromChunkLoadError();
  });
  window.addEventListener("error", (e) => {
    const target = e.target;
    if (target?.tagName === "SCRIPT" && target.src) recoverFromChunkLoadError();
    else if (isChunkLoadError(e.message)) recoverFromChunkLoadError();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => void 0);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  importWithRecovery,
  installChunkLoadRecovery,
  isChunkLoadError,
  recoverFromChunkLoadError
});
