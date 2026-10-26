/**
 * CDP 探针：验证「自愈清缓存」不会碰到用户数据
 *
 * 关注点：
 *   - 记录存于 localStorage（Capacitor Preferences 的 Web 实现），
 *     自愈只删 Cache Storage，两者互不相干；
 *   - 页面重载前会触发 beforeunload，App 的兜底保存逻辑会把正在编辑的记录落盘。
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
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

(async () => {
  const target = await findTarget();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: PAGE_URL });

  let mounted = false;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      mounted = await evaluate(cdp, `!!document.querySelector('#root')?.children.length`);
      if (mounted) break;
    } catch {}
  }
  console.log('1. 应用挂载:', mounted ? 'OK' : 'FAIL');

  // 预置：一条“已保存记录” + 一个标记键 + 一个待清缓存
  const before = await evaluate(
    cdp,
    `(async () => {
      sessionStorage.removeItem('kaitu:chunk-reload-at');
      const rec = [{ id: 'probe-rec-1', engineering: { name: '自愈安全性验证' }, samples: [], mode: 'A' }];
      localStorage.setItem('kaitu_records_v1', JSON.stringify(rec));
      localStorage.setItem('probe_marker', 'keep-me');
      await (await caches.open('kaitu-probe-cache')).put('/probe', new Response('stale'));
      return {
        keys: Object.keys(localStorage).sort(),
        records: localStorage.getItem('kaitu_records_v1'),
        marker: localStorage.getItem('probe_marker'),
        cacheKeys: (await caches.keys()).length,
      };
    })()`,
  );
  console.log('2. 预置完成: cacheKeys=' + before.cacheKeys + ' localStorage 键=' + JSON.stringify(before.keys));

  // 触发自愈
  await evaluate(cdp, `window.dispatchEvent(new Event('vite:preloadError'))`);
  await sleep(3500);

  let after;
  for (let i = 0; i < 20; i++) {
    try {
      after = await evaluate(
        cdp,
        `(async () => ({
          navType: performance.getEntriesByType('navigation')[0]?.type,
          keys: Object.keys(localStorage).sort(),
          records: localStorage.getItem('kaitu_records_v1'),
          marker: localStorage.getItem('probe_marker'),
          cacheKeys: (await caches.keys()).length,
          probeCacheGone: !(await caches.keys()).includes('kaitu-probe-cache'),
          mounted: !!document.querySelector('#root')?.children.length,
        }))()`,
      );
      if (after?.mounted) break;
    } catch {}
    await sleep(500);
  }
  console.log('3. 自愈后: navType=' + after?.navType + ' 旧探针缓存已清除=' + after?.probeCacheGone);
  console.log('   localStorage 键:', JSON.stringify(after?.keys));
  console.log('   记录键值保留:', after?.records === before.records);
  console.log('   标记键值保留:', after?.marker === before.marker);

  const pass =
    mounted &&
    after?.navType === 'reload' &&
    after?.probeCacheGone === true &&
    after?.records === before.records &&
    after?.marker === before.marker &&
    JSON.stringify(after?.keys) === JSON.stringify(before.keys) &&
    after?.mounted === true;
  console.log(pass ? '\n结论：清缓存不影响本地记录数据' : '\n结论：数据受影响，需要修复');
  process.exit(pass ? 0 : 1);
})();
