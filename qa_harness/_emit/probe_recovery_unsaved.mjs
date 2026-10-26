/**
 * CDP 探针：验证「未点保存的编辑中记录」在自愈刷新后不丢失
 *
 * 流程：新建记录 → 填写工程编号（不点保存）→ 触发自愈重载 → 检查 localStorage 是否已落盘
 */
const PAGE_URL = process.env.PROBE_URL || 'http://127.0.0.1:4199/';
const CDP = 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MARK = '未保存验证-探针';

const list = await (await fetch(`${CDP}/json/list`)).json();
const target = list.find((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let id = 0;
await new Promise((r) => ws.addEventListener('open', r));
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
});
const send = (method, params = {}) => {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((res, rej) => pending.set(mid, { res, rej }));
};
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

await send('Runtime.enable');
await send('Page.enable');

// 干净起点
await send('Page.navigate', { url: PAGE_URL });
await sleep(2500);
await ev(`localStorage.removeItem('kaitu_records_v1'); sessionStorage.removeItem('kaitu:chunk-reload-at'); 1`);
await send('Page.reload');
await sleep(3000);
console.log('1. 应用挂载:', (await ev(`!!document.querySelector('#root')?.children.length`)) ? 'OK' : 'FAIL');
console.log('   起始记录:', await ev(`localStorage.getItem('kaitu_records_v1') || 'EMPTY'`));

// 新建记录：+ → 普通目力鉴别 → 生成记录
// 每步带重试，避免动画/渲染时序造成误判
async function clickUntil(desc, expr, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const ok = await ev(expr);
    if (ok === 'OK') return true;
    await sleep(400);
  }
  console.log('   ! 点击失败:', desc);
  return false;
}
await clickUntil('打开新建', `(() => { const b = document.querySelector('button.MuiFab-root'); if (!b) return 'NO'; b.click(); return 'OK'; })()`);
await clickUntil('选择普通目力鉴别', `(() => { const el = [...document.querySelectorAll('*')].find(n => n.children.length === 0 && (n.textContent || '').trim() === '普通目力鉴别'); if (!el) return 'NO'; el.click(); return 'OK'; })()`);
await clickUntil('生成记录', `(() => { const b = [...document.querySelectorAll('.MuiDialog-root button')].find(x => /生成记录/.test(x.textContent)); if (!b) return 'NO'; b.click(); return 'OK'; })()`);
await sleep(1500);
console.log('2. 已进入编辑页:', await ev(`/编辑记录/.test(document.body.innerText)`));

// 填写「工程编号」，不点保存
const filled = await ev(`(() => {
  const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent);
  const hit = inputs[1];
  if (!hit) return 'NO_INPUT';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(hit, ${JSON.stringify(MARK)});
  hit.dispatchEvent(new Event('input', { bubbles: true }));
  return hit.value;
})()`);
console.log('3. 填入工程编号:', filled);
await sleep(600);
console.log('   落盘前 localStorage:', await ev(`(localStorage.getItem('kaitu_records_v1')||'EMPTY') === 'EMPTY' ? 'EMPTY（符合预期：尚未保存）' : '已有数据'`));

// 触发自愈
await ev(`window.dispatchEvent(new Event('vite:preloadError'))`);
await sleep(4000);

const after = await ev(`(() => {
  // Capacitor Preferences 在 Web 端会给键加 "CapacitorStorage." 前缀
  const raw = Object.values(localStorage).join(' | ');
  return {
    navType: performance.getEntriesByType('navigation')[0]?.type,
    hasMarker: raw.includes(${JSON.stringify(MARK)}),
    size: raw.length,
    keys: Object.keys(localStorage),
    allValues: Object.values(localStorage).map((v) => String(v).slice(0, 60)),
    mounted: !!document.querySelector('#root')?.children.length,
  };
})()`);
console.log('4. 自愈重载后:', JSON.stringify(after));
console.log(after.hasMarker ? '结论：未点保存的编辑内容已随刷新落盘' : '结论：编辑内容丢失');
process.exit(after.hasMarker && after.navType === 'reload' ? 0 : 1);
