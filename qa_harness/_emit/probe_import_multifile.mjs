// 多文件导入端到端探针（CDP DOM.setFileInputFiles，两轮场景）
// 场景 1（正常合并）：tri-delivery.xlsx（ZK1 土样 1~6）+ tri-delivery-cont.xlsx（ZK1 土样 7~12）
//   预期：跨文件同孔合并 1 孔 12 条土样、汇总含「2 个文件」、无重复提交拒绝、确认导入后存档 1 条 12 样。
// 场景 2（重复提交拒绝）：同一文件选两次（两份都是 ZK1 从 1 号土开始）
//   预期（2026-11-03 用户口径）：该孔拒绝导入——出现「判定为重复提交/拒绝导入」红色错误、
//   无预览列表、确认导入按钮禁用、存档为空。
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

const FIX = 'C:/Users/Dell/WorkBuddy/2026-09-10-09-55-25/kaitu-app/qa_harness/_emit/fixtures';
const F1 = `${FIX}/tri-delivery.xlsx`;
const F2 = `${FIX}/tri-delivery-cont.xlsx`;

async function openDialog() {
  await clickUntil('打开导入/导出菜单', `(() => {
    const b = document.querySelector('button[aria-label="导入或导出"]');
    if (!b) return 'NO'; b.click(); return 'OK';
  })()`);
  await sleep(400);
  await clickUntil('打开导入对话框', `(() => {
    const item = [...document.querySelectorAll('li[role="menuitem"]')].find(x => /导入送样单/.test(x.textContent));
    if (!item) return 'NO'; item.click(); return 'OK';
  })()`);
  await sleep(600);
}
async function setFiles(files) {
  const r = await send('Runtime.evaluate', { expression: `document.querySelector('.MuiDialog-root input[type=file]')` });
  if (!r.result?.objectId) { console.log('FAIL 未找到 file input'); return false; }
  await send('DOM.setFileInputFiles', { files, objectId: r.result.objectId });
  return true;
}
async function dialogText(waitFor) {
  let text = '';
  for (let i = 0; i < 30; i++) {
    text = (await ev(`document.querySelector('.MuiDialog-root')?.innerText || ''`));
    if (text.includes(waitFor)) break;
    await sleep(400);
  }
  return text;
}
const readStorage = () => ev(`(() => {
  const raw = localStorage.getItem('CapacitorStorage.kaitu_records_v1');
  if (!raw) return 'EMPTY';
  return JSON.parse(raw).map(r => ({ hole: r.engineering?.holeCode, n: r.samples?.length }));
})()`);

let fail = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? '  ok  ' : 'FAIL  '}${name}${detail ? '  => ' + detail : ''}`);
  if (!ok) fail++;
};

// ---------- 场景 1：正常跨文件合并 ----------
await send('Page.navigate', { url: 'http://127.0.0.1:4199/' });
await sleep(2500);
await ev(`localStorage.clear()`);
await send('Page.navigate', { url: 'http://127.0.0.1:4199/' });
await sleep(2500);
await openDialog();
if (await setFiles([F1, F2])) {
  const text = await dialogText('条土样');
  const flat = text.replace(/\n+/g, ' | ');
  console.log('场景1 对话框:', flat.slice(0, 700));
  check('场景1 汇总含「2 份送样单、2 个文件」', /来自 2 份送样单、2 个文件/.test(flat));
  check('场景1 合并 1 孔 12 条土样', /识别到 1 个孔.*共 12 条土样/.test(flat.replace(/\n+/g, ' ')));
  check('场景1 无「拒绝导入」错误', !flat.includes('拒绝导入'), flat.slice(0, 200));
  check('场景1 预览含「来源文件：」', flat.includes('来源文件：'));
  check('场景1 已合并 2 张送样单', flat.includes('已合并 2 张送样单'));
  await clickUntil('确认导入', `(() => {
    const b = [...document.querySelectorAll('.MuiDialog-root button')].find(x => /确认导入/.test(x.textContent));
    if (!b || b.disabled) return 'NO'; b.click(); return 'OK';
  })()`);
  await sleep(1800);
  const recs = await readStorage();
  console.log('场景1 存档:', JSON.stringify(recs));
  check('场景1 存档 1 条记录 12 条土样', Array.isArray(recs) && recs.length === 1 && recs[0].n === 12, JSON.stringify(recs));
} else fail++;

// ---------- 场景 2：重复提交拒绝 ----------
await send('Page.navigate', { url: 'http://127.0.0.1:4199/' });
await sleep(2000);
await ev(`localStorage.clear()`);
await send('Page.navigate', { url: 'http://127.0.0.1:4199/' });
await sleep(2500);
await openDialog();
if (await setFiles([F1, F1])) {
  const text = await dialogText('拒绝导入');
  const flat = text.replace(/\n+/g, ' | ');
  console.log('场景2 对话框:', flat.slice(0, 700));
  check('场景2 出现「判定为重复提交」红色错误', flat.includes('判定为重复提交'));
  check('场景2 错误含「拒绝导入」', flat.includes('拒绝导入'));
  check('场景2 无预览列表（不出现「条土样」汇总）', !/识别到 \d+ 个孔/.test(flat), flat.slice(0, 200));
  const btn = await ev(`(() => {
    const b = [...document.querySelectorAll('.MuiDialog-root button')].find(x => /确认导入/.test(x.textContent));
    return b ? String(b.disabled) : 'NOBTN';
  })()`);
  check('场景2 确认导入按钮禁用', btn === 'true', btn);
} else fail++;

console.log(`\n多文件导入探针：${fail === 0 ? '全部通过' : fail + ' 项失败'}`);
process.exit(fail === 0 ? 0 : 1);
