/**
 * 探针：真实导出 PDF 时，表格表头究竟是哪一套土类。
 * 做法：导入三角坐标送样单 → 打开记录 → 拦下 html2canvas 渲染用的离屏页 DOM
 *      → 读取 .pdf-subrow 的表头文字 + 截图（即 PDF 里会印出来的内容）。
 */
const CDP = 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await (await fetch(`${CDP}/json/list`)).json();
const target = list.find((x) => x.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
await new Promise((r) => ws.addEventListener('open', r));
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    const { res, rej } = pend.get(m.id);
    pend.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
});
const send = (method, params = {}) => {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((res, rej) => pend.set(mid, { res, rej }));
};
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const FIXTURE = 'C:/Users/Dell/WorkBuddy/2026-09-10-09-55-25/kaitu-app/qa_harness/_emit/fixtures/tri-delivery.xlsx';

await send('Runtime.enable');
await send('DOM.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: 'http://127.0.0.1:4199/' });
await sleep(2000);
await ev(`localStorage.clear()`);
await send('Page.navigate', { url: 'http://127.0.0.1:4199/' });
await sleep(2500);

// 导入三角坐标送样单
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/导入送样单/.test(x.textContent)); b&&b.click(); })()`);
await sleep(600);
const fi = await send('Runtime.evaluate', { expression: `document.querySelector('input[type=file]')` });
await send('DOM.setFileInputFiles', { files: [FIXTURE], objectId: fi.result.objectId });
for (let i = 0; i < 25; i++) {
  if ((await ev(`document.querySelector('.MuiDialog-root')?.innerText || ''`)).includes('条土样')) break;
  await sleep(400);
}
await ev(`(() => { const b=[...document.querySelectorAll('.MuiDialog-root button')].find(x=>/确认导入/.test(x.textContent)); b&&b.click(); })()`);
await sleep(1800);
console.log('存档模式:', JSON.stringify(await ev(`(() => {
  const raw = localStorage.getItem('CapacitorStorage.kaitu_records_v1');
  return JSON.parse(raw).map(r => ({ hole: r.engineering.holeCode, mode: r.mode }));
})()`)));

// 打开该记录
await ev(`(() => { const c=[...document.querySelectorAll('.MuiCard-root')].find(x=>/ZK1/.test(x.innerText)); c&&c.click(); })()`);
await sleep(1500);
console.log('当前页有导出按钮:', await ev(`[...document.querySelectorAll('button')].some(b=>/导出PDF/.test(b.textContent))`));

// 拦下 html2canvas 用的离屏页 DOM（正常流程会 removeChild 掉）
await ev(`(() => {
  window.__pdfPages = [];
  const orig = document.body.removeChild.bind(document.body);
  document.body.removeChild = (el) => {
    if (el && el.classList && el.classList.contains('pdf-page')) { window.__pdfPages.push(el); return el; }
    return orig(el);
  };
  return 'patched';
})()`);

await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/导出PDF/.test(x.textContent)); b&&b.click(); })()`);

let ok = false;
for (let i = 0; i < 40; i++) {
  const n = await ev(`(window.__pdfPages || []).length`);
  if (n > 0) {
    ok = true;
    break;
  }
  await sleep(500);
}
console.log('捕获到 PDF 页 DOM:', ok);

if (ok) {
  const headers = await ev(`(() => {
    const p = window.__pdfPages[0];
    const group = [...p.querySelectorAll('.pdf-grouprow th')].map(t => t.innerText.replace(/\\n/g,''));
    const sub = [...p.querySelectorAll('.pdf-subrow th')].map(t => t.innerText.replace(/\\n/g,''));
    return { group, sub };
  })()`);
  console.log('PDF 组标题:', JSON.stringify(headers.group));
  console.log('PDF 子表头:', JSON.stringify(headers.sub));

  // 移到可见位置后截图
  await ev(`(() => {
    const p = window.__pdfPages[0];
    p.style.left = '0px'; p.style.top = '0px'; p.style.zIndex = '99999';
    return 'ok';
  })()`);
  await sleep(500);
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 1587, height: 760, scale: 0.6 },
    captureBeyondViewport: true,
  });
  const { writeFileSync } = await import('node:fs');
  writeFileSync('qa_harness/_emit/pdf_header_b.png', Buffer.from(shot.data, 'base64'));
  console.log('截图已保存: qa_harness/_emit/pdf_header_b.png');
}

process.exit(0);
