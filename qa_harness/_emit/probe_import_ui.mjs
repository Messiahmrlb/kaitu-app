/**
 * 端到端探针：真实浏览器里导入三角坐标送样单
 *  1) 打开导入对话框，选文件（CDP DOM.setFileInputFiles）
 *  2) 核对预览里「鉴别格式」默认选中三角坐标定名
 *  3) 确认导入后读本地存储，核对 record.mode
 *  4) 再导一次并手动切成普通目力鉴别，核对切换生效
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
async function clickUntil(desc, expr, tries = 15) {
  for (let i = 0; i < tries; i++) {
    if ((await ev(expr)) === 'OK') return true;
    await sleep(400);
  }
  console.log('   ! 点击失败:', desc);
  return false;
}

await send('Runtime.enable');
await send('DOM.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
});
await send('Page.navigate', { url: 'http://127.0.0.1:4199/' });
await sleep(2500);
await ev(`localStorage.clear()`);
await send('Page.navigate', { url: 'http://127.0.0.1:4199/' });
await sleep(2500);

const FIXTURE = 'C:/Users/Dell/WorkBuddy/2026-09-10-09-55-25/kaitu-app/qa_harness/_emit/fixtures/tri-delivery.xlsx';

async function openAndPick() {
  await clickUntil('打开导入对话框', `(() => {
    const b = [...document.querySelectorAll('button')].find(x => /导入送样单/.test(x.textContent));
    if (!b) return 'NO'; b.click(); return 'OK';
  })()`);
  await sleep(600);
  const r = await send('Runtime.evaluate', { expression: `document.querySelector('input[type=file]')` });
  if (!r.result?.objectId) {
    console.log('   ! 未找到 file input');
    return false;
  }
  await send('DOM.setFileInputFiles', { files: [FIXTURE], objectId: r.result.objectId });
  for (let i = 0; i < 25; i++) {
    const t = await ev(`document.querySelector('.MuiDialog-root')?.innerText || ''`);
    if (t.includes('条土样')) return true;
    await sleep(400);
  }
  console.log('   ! 解析超时，对话框内容：', await ev(`document.querySelector('.MuiDialog-root')?.innerText || ''`));
  return false;
}

function readDialog() {
  return ev(`(() => {
    const d = document.querySelector('.MuiDialog-root');
    if (!d) return { err: 'no dialog' };
    const pressed = [...d.querySelectorAll('button[aria-pressed="true"]')].map(b => b.textContent.trim());
    return {
      text: d.innerText.replace(/\\n+/g, ' | ').slice(0, 400),
      pressed,
      hasToggleB: [...d.querySelectorAll('button')].some(b => b.textContent.trim() === '三角坐标定名'),
    };
  })()`);
}

console.log('═══ 第 1 次：默认（自动识别）═══');
console.log('选文件成功:', await openAndPick());
console.log('预览内容:', JSON.stringify(await readDialog(), null, 0));

const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync('qa_harness/_emit/import_mode_preview.png', Buffer.from(shot.data, 'base64'));

await clickUntil('确认导入', `(() => {
  const b = [...document.querySelectorAll('.MuiDialog-root button')].find(x => /确认导入/.test(x.textContent));
  if (!b || b.disabled) return 'NO'; b.click(); return 'OK';
})()`);
await sleep(1800);

const readRecords = () =>
  ev(`(() => {
    const raw = localStorage.getItem('CapacitorStorage.kaitu_records_v1');
    if (!raw) return 'EMPTY';
    try { return JSON.parse(raw).map(r => ({ hole: r.engineering?.holeCode, mode: r.mode, n: r.samples?.length })); }
    catch (e) { return 'PARSE_ERR:' + e.message; }
  })()`);

console.log('导入后存档:', JSON.stringify(await readRecords()));

console.log('\n═══ 第 2 次：手动切成普通目力鉴别 ═══');
console.log('选文件成功:', await openAndPick());
const before = await readDialog();
console.log('切换前选中:', JSON.stringify(before.pressed));
console.log(
  '点「普通目力鉴别」:',
  await ev(`(() => {
    const d = document.querySelector('.MuiDialog-root');
    const b = [...d.querySelectorAll('button')].find(x => x.textContent.trim() === '普通目力鉴别');
    if (!b) return 'NO'; b.click(); return 'OK';
  })()`),
);
await sleep(500);
const after = await readDialog();
console.log('切换后选中:', JSON.stringify(after.pressed));

await clickUntil('确认导入', `(() => {
  const b = [...document.querySelectorAll('.MuiDialog-root button')].find(x => /确认导入/.test(x.textContent));
  if (!b || b.disabled) return 'NO'; b.click(); return 'OK';
})()`);
await sleep(1800);
console.log('两次导入后存档:', JSON.stringify(await readRecords()));

process.exit(0);
