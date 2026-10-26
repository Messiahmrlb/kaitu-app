/**
 * CDP 探针：验证「分块加载失败自愈」在真实浏览器中的行为
 *   1) 造一个离线缓存与一个假的旧版本标记
 *   2) 触发 vite:preloadError（模拟旧 index.js 引用的分块已 404）
 *   3) 断言：页面自动重载、缓存被清空、重载闸门已写入
 */
const PAGE_URL = process.env.PROBE_URL || 'http://127.0.0.1:4199/';
const CDP = 'http://127.0.0.1:9333';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  const list = await (await fetch(`${CDP}/json/list`)).json();
  return list.find((t) => t.type === 'page');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener('open', () =>
      resolve({
        ws,
        send(method, params = {}) {
          const mid = ++id;
          ws.send(JSON.stringify({ id: mid, method, params }));
          return new Promise((res, rej) => pending.set(mid, { res, rej }));
        },
      }),
    );
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      }
    });
    ws.addEventListener('error', reject);
  });
}

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

(async () => {
  const target = await findTarget();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  await cdp.send('Page.navigate', { url: PAGE_URL });
  // 等待应用挂载（最多 15s）
  let mounted = false;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      mounted = await evaluate(cdp, `!!document.querySelector('#root')?.children.length`);
      if (mounted) break;
    } catch {
      /* 上下文切换中，重试 */
    }
  }
  console.log('1. 应用挂载:', mounted ? 'OK' : 'FAIL');

  // 造缓存 + 清理残留闸门
  const prep = await evaluate(
    cdp,
    `(async () => {
      sessionStorage.removeItem('kaitu:chunk-reload-at');
      const c = await caches.open('kaitu-probe-cache');
      await c.put('/kaitu-app/probe', new Response('stale'));
      return { cacheKeys: (await caches.keys()).length, mark: !!sessionStorage.getItem('kaitu:chunk-reload-at') };
    })()`,
  );
  console.log('2. 预置旧缓存:', JSON.stringify(prep));

  // 触发自愈（模拟旧页面动态 import 分块 404）
  await evaluate(cdp, `window.dispatchEvent(new Event('vite:preloadError'))`);

  // 等重载完成
  await sleep(3500);
  let after;
  for (let i = 0; i < 20; i++) {
    try {
      after = await evaluate(
        cdp,
        `(async () => ({
          navType: performance.getEntriesByType('navigation')[0]?.type,
          cacheKeys: (await caches.keys()).length,
          reloadMarked: !!sessionStorage.getItem('kaitu:chunk-reload-at'),
          mounted: !!document.querySelector('#root')?.children.length
        }))()`,
      );
      if (after?.mounted) break;
    } catch {
      /* 重载中 */
    }
    await sleep(500);
  }
  console.log('3. 自愈后状态:', JSON.stringify(after));

  // 闸门测试：短时间内再次触发不应再次重载
  const before = after?.navType;
  await evaluate(cdp, `window.dispatchEvent(new Event('vite:preloadError'))`);
  await sleep(2000);
  const again = await evaluate(
    cdp,
    `(async () => ({ navType: performance.getEntriesByType('navigation')[0]?.type, mounted: !!document.querySelector('#root')?.children.length }))()`,
  );
  console.log('4. 闸门拦截重复重载:', JSON.stringify(again), `(之前 navType=${before})`);

  const pass =
    mounted &&
    prep.cacheKeys >= 1 &&
    after &&
    after.navType === 'reload' &&
    after.cacheKeys === 0 &&
    after.reloadMarked === true &&
    after.mounted === true &&
    again.mounted === true;
  console.log(pass ? '\n结论：自愈链路通过' : '\n结论：自愈链路未达预期');
  process.exit(pass ? 0 : 1);
})();
