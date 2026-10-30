const CDP = 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await (await fetch(`${CDP}/json/list`)).json();
const t = list.find((x) => x.type === 'page' && x.url.startsWith('http')) || list.find((x) => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((r) => ws.addEventListener('open', r));
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } });
const send = (method, params = {}) => { const mid = ++id; ws.send(JSON.stringify({ id: mid, method, params })); return new Promise((res, rej) => pend.set(mid, { res, rej })); };
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || ''); return r.result.value; };
const setViewport = (w) => send('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 2, mobile: true });

await send('Runtime.enable');
await send('Page.enable');
await setViewport(390);
await send('Page.navigate', { url: 'http://127.0.0.1:4199/' });
await sleep(2500);

// 1) 四宽度 AppBar 溢出检查（按钮字号改动后）
console.log('[1] AppBar 布局');
for (const w of [320, 360, 390, 430]) {
  await setViewport(w); await sleep(400);
  const m = await ev(`(() => {
    const bar = document.querySelector('.MuiAppBar-root .MuiToolbar-root');
    const btns = [...bar.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return { name: (b.textContent||'').trim()||b.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; });
    return { vw: innerWidth, doc: document.documentElement.scrollWidth, btns, ok: btns.every(b => b.right <= innerWidth+1) && document.documentElement.scrollWidth === innerWidth };
  })()`);
  console.log(`  ${w}px: 溢出=${!m.ok} 按钮=` + m.btns.map(b => `${b.name}(${b.w}x${b.h},r${b.right})`).join(' | '));
}
await setViewport(390); await sleep(300);

// 2) 菜单三项
await ev(`document.querySelector('button[aria-label="导入或导出"]').click()`);
await sleep(600);
console.log('[2] 菜单:', JSON.stringify(await ev(`[...document.querySelectorAll('.MuiMenuItem-root')].map(x=>x.innerText.trim())`)));
await ev(`(() => { document.body.click(); return 1; })()`);
await sleep(400);

// 3) info 提示色（CMA 确认弹窗里的 info Alert）
await ev(`document.querySelector('button[aria-label="CMA 设置"]').click()`);
await sleep(700);
await ev(`(() => { const d=[...document.querySelectorAll('.MuiDialog-root')].pop(); const el=d.querySelectorAll('input.MuiInputBase-input')[1]; const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(el,'SHLY-TR068-2027'); el.dispatchEvent(new Event('input',{bubbles:true})); return el.value; })()`);
await sleep(400);
await ev(`(() => { const d=[...document.querySelectorAll('.MuiDialog-root')].pop(); [...d.querySelectorAll('button')].find(b=>/保存修改/.test(b.textContent)).click(); })()`);
await sleep(800);
const infoColor = await ev(`(() => {
  const a = [...document.querySelectorAll('.MuiDialog-root .MuiAlert-standardInfo')].pop();
  if (!a) return 'NO_INFO_ALERT';
  const cs = getComputedStyle(a);
  return { color: cs.color, border: cs.borderColor, bg: cs.backgroundColor, text: a.innerText.slice(0,20) };
})()`);
console.log('[3] info Alert 实际颜色:', JSON.stringify(infoColor));
// 截图确认
const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync('qa_harness/_emit/ui_info_color_390.png', Buffer.from(shot.data, 'base64'));
console.log('shot saved');
process.exit(0);
