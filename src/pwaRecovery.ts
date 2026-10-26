/**
 * 分块加载失败自愈（懒加载 chunk 404）
 *
 * 背景：
 *   构建产物里的文件名带内容哈希（如 exceljs.min-DEP7PY6C.js）。用户手机若
 *   停留在旧版本页面（PWA 离线缓存 / HTTP 缓存），旧 index.js 里写死的分块地址
 *   在重新部署后已被 GitHub Pages 删除 → 动态 import 报
 *   "Failed to fetch dynamically imported module" 而 404。
 *
 * 处理：
 *   识别到这类错误 → 注销 Service Worker、清空所有 Cache Storage，
 *   然后整页重载，让浏览器重新取 index.html 与新的 index-*.js。
 *   设一次性闸门，避免网络真故障时无限重载。
 */

const RELOAD_TS_KEY = 'kaitu:chunk-reload-at';
/** 两次自愈重载的最小间隔：小于该值说明重载后仍失败，不再重试 */
const RELOAD_GUARD_MS = 30_000;

/** 判断是否为「构建分块加载失败」，而非接口/解析等业务错误 */
export function isChunkLoadError(err: unknown): boolean {
  const msg =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? `${err.name} ${err.message}`
        : String((err as { message?: unknown })?.message ?? err ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk [\w.-]+ failed|dynamically imported module/i.test(
    msg,
  );
}

/** 清掉 Service Worker 与离线缓存，保证重载后拿到最新构建 */
async function purgeOfflineCache(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* 忽略：注销失败也要继续清缓存 */
  }
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* 忽略 */
  }
}

/**
 * 触发自愈：清缓存 + 重载。
 * @returns true 表示已开始重载（调用方应挂起流程）；false 表示闸门拦截（近期已重载过）
 */
export function recoverFromChunkLoadError(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) ?? 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
  } catch {
    /* 隐私模式下 sessionStorage 可能不可用，此时不设闸门 */
  }
  void purgeOfflineCache().finally(() => {
    // reload 会中断当前所有 Promise，调用方无需再处理结果
    window.location.reload();
  });
  return true;
}

/**
 * 带自愈的动态 import。分块 404 时页面将自动重载，
 * 返回一个永不 resolve 的 Promise，让调用方停在 loading 状态直到刷新完成。
 */
export async function importWithRecovery<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (e) {
    if (isChunkLoadError(e) && recoverFromChunkLoadError()) {
      return new Promise<T>(() => {
        /* 等待页面重载 */
      });
    }
    throw e;
  }
}

/** 安装全局兜底：捕获未被 try/catch 拦住的分块加载失败 */
export function installChunkLoadRecovery(): void {
  window.addEventListener('vite:preloadError', (e) => {
    // Vite 对 modulepreload / 动态 import 依赖失败会抛该事件
    e.preventDefault();
    recoverFromChunkLoadError();
  });

  window.addEventListener('unhandledrejection', (e) => {
    if (isChunkLoadError(e.reason)) recoverFromChunkLoadError();
  });

  // 部分浏览器把动态 import 失败报成 script error 而非 rejection
  window.addEventListener('error', (e) => {
    const target = e.target as HTMLScriptElement | null;
    if (target?.tagName === 'SCRIPT' && target.src) recoverFromChunkLoadError();
    else if (isChunkLoadError(e.message)) recoverFromChunkLoadError();
  });

  // 页面回到前台时主动检查 SW 更新，缩短「停在旧版本」的时间窗
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.update())
      .catch(() => undefined);
  });
}
