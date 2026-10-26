/**
 * 探针：CMA 页眉设置的完整链路。
 *
 * 1) 320/360/390/430 四宽度下首页 AppBar 是否溢出（CMA 按钮必须在屏内）
 * 2) 打开「CMA 设置」→ 默认值预填正确
 * 3) 修改两项 → 点「保存修改」→ 必须弹出二次确认（含旧→新）
 * 4) 「返回修改」不落盘；再次确认才落盘
 * 5) 刷新页面后设置仍在（持久化记忆）
 * 6) 导出 PDF 时拦截离屏页，核对页眉确实换成了自定义文字
 */
const CDP = 'http://127.0.0.1:9333';
const FIXTURE =
  'C:/Users/Dell/WorkBuddy/2026-09-10-09-55-25/kaitu-app/qa_harness/_emit/fixtures/tri-delivery.xlsx';
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
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails)
    return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const setViewport = (w) =>
  send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

const NEW_VERSION = '第 4 版 第 1 次修改 2027 年 1 月 1 日起实施';
const NEW_CODE = 'SHLY-TR068-2027';

await send('Runtime.enable');
await send('Page.enable');
await setViewport(390);
await send('Page.navigate', { url: 'http://127.0.0.1:4199/' });
await sleep(1800);
await ev(`localStorage.clear()`);
await send('Page.navigate', { url: 'http://127.0.0.1:4199/' });
await sleep(2500);

// ---------------------------------------------------------------- 1) 布局
const layout = {};
for (const w of [320, 360, 390, 430]) {
  await setViewport(w);
  await sleep(500);
  layout[w] = await ev(`(() => {
    const bar = document.querySelector('.MuiAppBar-root .MuiToolbar-root');
    if (!bar) return { err: 'no toolbar' };
    const btns = [...bar.querySelectorAll('button')].map((b) => {
      const r = b.getBoundingClientRect();
      return {
        name: (b.textContent || '').trim() || b.getAttribute('aria-label') || '?',
        left: Math.round(r.left),
        right: Math.round(r.right),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
    const title = bar.querySelector('.MuiTypography-root');
    return {
      vw: window.innerWidth,
      docScrollW: document.documentElement.scrollWidth,
      barScrollW: bar.scrollWidth,
      barClientW: bar.clientWidth,
      btns,
      allButtonsInside: btns.every((b) => b.left >= -1 && b.right <= window.innerWidth + 1),
      titleTruncated: title ? title.scrollWidth > title.clientWidth + 1 : null,
    };
  })()`);
}
console.log('\n[1] 首页 AppBar 布局');
for (const [w, m] of Object.entries(layout)) {
  console.log(
    `  ${w}px: 文档scrollW=${m.docScrollW} toolbar=${m.barScrollW}/${m.barClientW} 按钮全在屏内=${m.allButtonsInside} 标题省略=${m.titleTruncated}`,
  );
  console.log('         ' + m.btns.map((b) => `${b.name}(${b.w}x${b.h},r${b.right})`).join(' | '));
}

await setViewport(390);
await sleep(400);

// -------------------------------------------------------- 2) 打开 CMA 设置
const openCma = async () => {
  await ev(`(() => { const b = document.querySelector('button[aria-label="CMA 设置"]'); if (!b) return 'NO_BTN'; b.click(); return 'OK'; })()`);
  await sleep(700);
};
await openCma();

const initial = await ev(`(() => {
  const ds = [...document.querySelectorAll('.MuiDialog-root')];
  const d = ds[ds.length - 1];
  if (!d) return { err: 'no dialog' };
  const inputs = [...d.querySelectorAll('input.MuiInputBase-input')];
  return {
    title: d.querySelector('.MuiDialogTitle-root')?.innerText,
    values: inputs.map((i) => i.value),
    saveDisabled: [...d.querySelectorAll('button')].find((b) => /保存修改/.test(b.textContent))?.disabled,
  };
})()`);
console.log('\n[2] 打开 CMA 设置:', JSON.stringify(initial));

// --------------------------------------------------- 3) 修改 → 二次确认
const setInput = (idx, value) => `(() => {
  const ds = [...document.querySelectorAll('.MuiDialog-root')];
  const d = ds[ds.length - 1];
  const el = d.querySelectorAll('input.MuiInputBase-input')[${idx}];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return el.value;
})()`;
await ev(setInput(0, NEW_VERSION));
await sleep(300);
await ev(setInput(1, NEW_CODE));
await sleep(400);

const afterEdit = await ev(`(() => {
  const ds = [...document.querySelectorAll('.MuiDialog-root')];
  const d = ds[ds.length - 1];
  const btn = [...d.querySelectorAll('button')].find((b) => /保存修改/.test(b.textContent));
  return { saveDisabled: btn?.disabled, preview: d.innerText.split('\\n').slice(-6).join(' | ') };
})()`);
console.log('[3] 修改后:', JSON.stringify(afterEdit));

await ev(`(() => { const ds=[...document.querySelectorAll('.MuiDialog-root')]; const d=ds[ds.length-1]; [...d.querySelectorAll('button')].find(b=>/保存修改/.test(b.textContent)).click(); })()`);
await sleep(600);

const confirmInfo = await ev(`(() => {
  const ds = [...document.querySelectorAll('.MuiDialog-root')];
  const d = ds[ds.length - 1];
  const title = d.querySelector('.MuiDialogTitle-root')?.innerText || '';
  if (!/确认修改/.test(title)) return { confirmShown: false, title };
  return {
    confirmShown: true,
    title,
    body: d.querySelector('.MuiDialogContent-root')?.innerText,
    hasNewVersion: d.innerText.includes(${JSON.stringify(NEW_VERSION)}),
    hasNewCode: d.innerText.includes(${JSON.stringify(NEW_CODE)}),
    buttons: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()),
  };
})()`);
console.log('[3b] 二次确认弹窗:', JSON.stringify(confirmInfo, null, 1));

// -------------------------------------- 4) 先返回修改：不应落盘
await ev(`(() => { const ds=[...document.querySelectorAll('.MuiDialog-root')]; const d=ds[ds.length-1]; const b=[...d.querySelectorAll('button')].find(x=>/返回修改/.test(x.textContent)); b&&b.click(); return 'OK'; })()`);
await sleep(500);
const afterBack = await ev(`(() => ({
  dialogs: document.querySelectorAll('.MuiDialog-root').length,
  stored: localStorage.getItem('CapacitorStorage.kaitu_cma_header_v1'),
  stillEditing: [...document.querySelectorAll('.MuiDialog-root')].some((d) => /CMA 设置/.test(d.querySelector('.MuiDialogTitle-root')?.innerText || '')),
}))()`);
console.log('[4] 返回修改后（应未落盘）:', JSON.stringify(afterBack));

// -------------------------------------- 4b) 再次保存并确认
await ev(`(() => { const ds=[...document.querySelectorAll('.MuiDialog-root')]; const d=ds[ds.length-1]; [...d.querySelectorAll('button')].find(b=>/保存修改/.test(b.textContent)).click(); })()`);
await sleep(600);
await ev(`(() => { const ds=[...document.querySelectorAll('.MuiDialog-root')]; const d=ds[ds.length-1]; const b=[...d.querySelectorAll('button')].find(x=>/确认修改/.test(x.textContent)); b&&b.click(); return 'OK'; })()`);
await sleep(1200);
const afterSave = await ev(`(() => ({
  dialogs: document.querySelectorAll('.MuiDialog-root').length,
  stored: localStorage.getItem('CapacitorStorage.kaitu_cma_header_v1'),
  snack: document.querySelector('.MuiSnackbar-root')?.innerText || '',
}))()`);
console.log('[4b] 确认保存后:', JSON.stringify(afterSave));

// ------------------------------------------ 5) 刷新后记忆是否保持
await send('Page.navigate', { url: 'http://127.0.0.1:4199/' });
await sleep(2500);
await openCma();
const afterReload = await ev(`(() => {
  const ds = [...document.querySelectorAll('.MuiDialog-root')];
  const d = ds[ds.length - 1];
  const inputs = [...d.querySelectorAll('input.MuiInputBase-input')];
  return {
    values: inputs.map((i) => i.value),
    saveDisabled: [...d.querySelectorAll('button')].find((b) => /保存修改/.test(b.textContent))?.disabled,
  };
})()`);
console.log('[5] 刷新后重新打开:', JSON.stringify(afterReload));
// 关闭对话框
await ev(`(() => { const ds=[...document.querySelectorAll('.MuiDialog-root')]; const d=ds[ds.length-1]; const b=[...d.querySelectorAll('button')].find(x=>/^取消$/.test(x.textContent)); b&&b.click(); return 'OK'; })()`);
await sleep(600);

// ------------------------------------------ 6) 导出 PDF 核对页眉
// 导入三角坐标送样单，得到一条记录
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/导入送样单/.test(x.textContent)); b&&b.click(); })()`);
await sleep(700);
const fi = await send('Runtime.evaluate', { expression: `document.querySelector('input[type=file]')` });
await send('DOM.setFileInputFiles', { files: [FIXTURE], objectId: fi.result.objectId });
for (let i = 0; i < 25; i++) {
  if ((await ev(`document.querySelector('.MuiDialog-root')?.innerText || ''`)).includes('条土样')) break;
  await sleep(400);
}
await ev(`(() => { const b=[...document.querySelectorAll('.MuiDialog-root button')].find(x=>/确认导入/.test(x.textContent)); b&&b.click(); })()`);
await sleep(1800);

await ev(`(() => { const c=[...document.querySelectorAll('.MuiCard-root')].find(x=>/ZK1/.test(x.innerText)); c&&c.click(); })()`);
await sleep(1500);
console.log('\n[6] 进入记录页, 有导出PDF:', await ev(`[...document.querySelectorAll('button')].some(b=>/导出PDF/.test(b.textContent))`));

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

let pageCount = 0;
for (let i = 0; i < 50; i++) {
  pageCount = await ev(`(window.__pdfPages || []).length`);
  if (pageCount > 0) break;
  await sleep(500);
}
await sleep(500);

const pdfHeader = await ev(`(() => {
  const p = (window.__pdfPages || [])[0];
  if (!p) return { err: 'no page captured' };
  const txts = [...p.querySelectorAll('.pdf-txt')].map((e) => ({
    t: e.innerText,
    fs: e.style.fontSize,
    left: e.style.left,
  }));
  return {
    pages: (window.__pdfPages || []).length,
    texts: txts.slice(0, 8),
    htmlHasNewVersion: p.innerHTML.includes(${JSON.stringify(NEW_VERSION)}),
    htmlHasNewCode: p.innerHTML.includes(${JSON.stringify(NEW_CODE)}),
    htmlHasOldVersion: p.innerHTML.includes('第 3 版 第 0 次修改'),
    htmlHasOldCode: p.innerHTML.includes('SHLY-TR068-2024'),
  };
})()`);
console.log('[6b] PDF 离屏页页眉:', JSON.stringify(pdfHeader, null, 1));

// 截图 PDF 页眉区域
const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync(
  'qa_harness/_emit/cma_pdf_header.png',
  Buffer.from(shot.data, 'base64'),
);

// 汇总判定
const layoutOk = [320, 360, 390, 430].every(
  (w) => layout[w] && layout[w].allButtonsInside && layout[w].docScrollW === w,
);
const ok =
  layoutOk &&
  initial.values?.[0] === '第 3 版 第 0 次修改 2024 年 12 月 1 日起实施' &&
  initial.values?.[1] === 'SHLY-TR068-2024' &&
  confirmInfo.confirmShown === true &&
  confirmInfo.hasNewVersion === true &&
  confirmInfo.hasNewCode === true &&
  afterBack.stored === null &&
  afterBack.stillEditing === true &&
  afterReload.values?.[0] === NEW_VERSION &&
  afterReload.values?.[1] === NEW_CODE &&
  pdfHeader.htmlHasNewVersion === true &&
  pdfHeader.htmlHasNewCode === true &&
  pdfHeader.htmlHasOldVersion === false &&
  pdfHeader.htmlHasOldCode === false;

console.log('\nIS_PASS:', ok ? 'YES' : 'NO');
process.exit(0);
