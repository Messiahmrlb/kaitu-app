/**
 * QA 第 2 轮轻量浏览器回归（只 3 个点）：菜单可用 / PDF 单孔文件名 / xlsx 文件名清洗。
 *
 * 前置：`npx vite preview --port 4299` 已启动。本脚本自行拉起无头 Edge(9444)、捕获真实下载、结束后清理。
 * 运行：node qa_harness/_emit/qa_round2_browser.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:4299/';
const DEBUG_PORT = 9444;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const STORAGE_KEY = 'CapacitorStorage.kaitu_records_v1';
const ILLEGAL = /[\\/:*?"<>|]/;

const results = [];
const downloads = [];
function record(id, name, pass, expected, actual) {
  results.push({ id, name, pass: !!pass, expected, actual });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id} ${name}`);
  if (!pass) console.log(`        期望：${JSON.stringify(expected)}\n        实际：${JSON.stringify(actual)}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 20000, interval = 150) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await sleep(interval);
  }
  throw new Error(`waitFor 超时(${timeout}ms): ${String(last)}`);
}

class CDP {
  constructor(url, label) {
    this.label = label;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws = new WebSocket(url);
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res());
      this.ws.addEventListener('error', () => rej(new Error(`${label} WS error`)));
    });
    this.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(`${label} ${m.error.message}`)) : resolve(m.result);
      } else if (m.method && this.handlers.has(m.method)) {
        for (const h of this.handlers.get(m.method)) h(m.params);
      }
    });
  }
  on(m, f) {
    if (!this.handlers.has(m)) this.handlers.set(m, []);
    this.handlers.get(m).push(f);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

let seq = 0;
const mkSample = (i) => ({
  id: `s${++seq}`,
  soilNumber: `-${i}`,
  fieldRecord: '粉质黏土',
  sampleDepth: `${i}.0~${i + 1}.0`,
  sampleElevation: '9.0',
  color: '褐黄',
  smell: '无',
  soilType: ['粉质黏土'],
  inclusions: [],
  soilState: ['可塑'],
  soilStateNote: '',
  testItems: ['物性'],
  il: '',
  ip: '',
  disturbance: '原状',
  siltySand: 'none',
  otherTestItems: [],
});
const mkRecord = (id, projectCode, holeCode, openDate, n) => ({
  id,
  name: `${projectCode} ${holeCode}`,
  mode: 'A',
  engineering: { projectCode, holeCode, holeElevation: '5.20', openDate },
  samples: Array.from({ length: n }, (_, k) => mkSample(k + 1)),
  customTestItems: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa2-edge-'));
const dlRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa2-dl-'));
let edge = null;
let browser = null;
let page = null;

function cleanup() {
  try {
    if (edge && !edge.killed) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {}
  try {
    browser?.ws?.close();
    page?.ws?.close();
  } catch {}
}

async function main() {
  const html = await fetch(BASE).then((r) => r.text());
  const hash = (html.match(/assets\/(index-[\w-]+\.js)/) || [])[1];
  console.log(`预览服务 OK，主包：${hash}`);

  edge = spawn(
    EDGE,
    [
      '--headless=new',
      '--no-proxy-server',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profileDir}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-popup-blocking',
      '--window-size=1280,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  await waitFor(async () => (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok, 30000);
  const ver = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const t = list.find((x) => x.type === 'page');

  browser = new CDP(ver.webSocketDebuggerUrl, 'browser');
  await browser.ready;
  page = new CDP(t.webSocketDebuggerUrl, 'page');
  await page.ready;
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlRoot, eventsEnabled: true });

  const evalJS = async (body) => {
    const r = await page.send('Runtime.evaluate', {
      expression: `(async () => { ${body} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitSel = (sel, timeout = 30000) =>
    waitFor(() => evalJS(`return !!document.querySelector(${JSON.stringify(sel)});`), timeout);
  const clickText = (sel, text) =>
    evalJS(`
      const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => (e.textContent||'').trim() === ${JSON.stringify(text)});
      if (!el) return false; el.click(); return true;
    `);

  await page.send('Page.navigate', { url: BASE });
  await waitSel('[aria-label="导入或导出"]', 60000);
  await evalJS(`try { if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); } } catch(e) {}
                try { if ('caches' in window) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch(e) {}
                return true;`);
  await page.send('Page.reload', { ignoreCache: true });
  await waitSel('[aria-label="导入或导出"]', 60000);
  await sleep(400);

  // 造 3 条记录（含非法字符的工程编号 / 孔号）
  const seeds = [
    mkRecord('r1', 'KC-01', 'ZK1', '2026-10-26', 2), // 纯回归基线
    mkRecord('r2', 'KC-01', 'ZK/1', '2026-10-27', 2), // 孔号含斜杠
    mkRecord('r3', 'A:B', 'ZK2', '2026-10-28', 1), // 工程编号含冒号
  ];
  await evalJS(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(seeds))}); return true;`);
  await page.send('Page.reload', { ignoreCache: true });
  await waitSel('[aria-label="导入或导出"]', 60000);
  await waitFor(() => evalJS(`return document.querySelectorAll('.MuiCard-root').length === 3;`), 15000);
  await sleep(300);

  const openMenu = async () => {
    await evalJS(`document.querySelector('[aria-label="导入或导出"]').click(); return true;`);
    await waitSel('.MuiMenu-list', 8000);
    await sleep(150);
  };
  const openMenuDialog = async (item) => {
    await openMenu();
    const ok = await clickText('.MuiMenuItem-root', item);
    if (!ok) throw new Error('菜单项未找到：' + item);
    await waitSel('.MuiDialog-root', 8000);
    await sleep(250);
  };
  const newDir = async (name) => {
    const d = path.join(dlRoot, name);
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: d, eventsEnabled: true });
    return d;
  };
  const waitFiles = async (dir, timeout = 150000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const pending = fs.readdirSync(dir).filter((f) => f.endsWith('.crdownload'));
      const done = fs.readdirSync(dir).filter((f) => !f.endsWith('.crdownload'));
      if (done.length && !pending.length) {
        const a = done.map((f) => fs.statSync(path.join(dir, f)).size).join(',');
        await sleep(600);
        const b = fs.readdirSync(dir).filter((f) => !f.endsWith('.crdownload'));
        const a2 = b.map((f) => fs.statSync(path.join(dir, f)).size).join(',');
        if (a === a2) return b;
      }
      await sleep(300);
    }
    throw new Error('等待下载超时：' + dir);
  };
  const rowTexts = () =>
    evalJS(`return [...document.querySelectorAll('.MuiDialog-root .MuiListItemButton-root')].map(e => (e.textContent||'').trim());`);

  // ---------- D3: 菜单仍可打开、三项文案不变 ----------
  await openMenu();
  const menu = await evalJS(`
    return {
      items: [...document.querySelectorAll('.MuiMenu-list .MuiMenuItem-root')].map(e => (e.textContent||'').trim()),
      expanded: document.querySelector('[aria-label="导入或导出"]').getAttribute('aria-expanded'),
    };
  `);
  record('D3.1', 'AppBar「导入 / 导出」菜单可打开', menu.expanded === 'true' && menu.items.length === 3, { expanded: 'true', items: 3 }, menu);
  record(
    'D3.2',
    '菜单三项文案与顺序不变',
    JSON.stringify(menu.items) === JSON.stringify(['导入送样单', '导出 PDF…', '导出电子表格…']),
    ['导入送样单', '导出 PDF…', '导出电子表格…'],
    menu.items,
  );
  // 关掉菜单
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 8, y: 700, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 8, y: 700, button: 'left', clickCount: 1 });
  await waitFor(() => evalJS(`return !document.querySelector('.MuiMenu-list');`), 5000);

  // ---------- D2a: 单孔 PDF（纯回归 r1）----------
  let dir = await newDir('pdf-regress');
  await openMenuDialog('导出 PDF…');
  // 取消第 3、2 行（保留第 1 行 r1）
  await evalJS(`document.querySelectorAll('.MuiDialog-root .MuiListItemButton-root')[3].click(); return true;`);
  await sleep(180);
  await evalJS(`document.querySelectorAll('.MuiDialog-root .MuiListItemButton-root')[2].click(); return true;`);
  await sleep(220);
  const onlyR1 = await rowTexts();
  await evalJS(`[...document.querySelectorAll('.MuiDialog-root .MuiDialogActions-root button')].find(b => /^导出 \\d+ 个孔$/.test((b.textContent||'').trim())).click(); return true;`);
  let files = await waitFiles(dir);
  let info = files.map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size }));
  downloads.push({ batch: 'pdf-regress', selection: onlyR1, files: info });
  record('D2.1', '单孔 PDF 文件名仍为 <日期>_<孔号>.pdf', info.length === 1 && info[0].name === '2026-10-26_ZK1.pdf', '2026-10-26_ZK1.pdf', info.map((f) => f.name));

  // ---------- D2b: 单孔 PDF（含斜杠孔号）----------
  dir = await newDir('pdf-slash');
  await openMenuDialog('导出 PDF…');
  // 全选状态下取消第 1、3 行 → 只留 r2
  await evalJS(`document.querySelectorAll('.MuiDialog-root .MuiListItemButton-root')[1].click(); return true;`);
  await sleep(180);
  await evalJS(`document.querySelectorAll('.MuiDialog-root .MuiListItemButton-root')[3].click(); return true;`);
  await sleep(220);
  await evalJS(`[...document.querySelectorAll('.MuiDialog-root .MuiDialogActions-root button')].find(b => /^导出 \\d+ 个孔$/.test((b.textContent||'').trim())).click(); return true;`);
  files = await waitFiles(dir);
  info = files.map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size }));
  downloads.push({ batch: 'pdf-slash', files: info });
  record(
    'D2.2',
    '孔号含 "/" 的单孔 PDF 文件名为 2026-10-27_ZK-1.pdf',
    info.length === 1 && info[0].name === '2026-10-27_ZK-1.pdf',
    '2026-10-27_ZK-1.pdf',
    info.map((f) => f.name),
  );

  // ---------- D1: 选 3 孔导出 Excel ----------
  dir = await newDir('xlsx-3');
  await openMenuDialog('导出电子表格…');
  const counter = await evalJS(`return (document.querySelector('.MuiDialog-root').textContent||'').match(/已选\\s*\\d+\\s*\\/\\s*共\\s*\\d+\\s*个孔/)?.[0] ?? '';`);
  await evalJS(`[...document.querySelectorAll('.MuiDialog-root .MuiDialogActions-root button')].find(b => /^导出 \\d+ 个孔$/.test((b.textContent||'').trim())).click(); return true;`);
  files = await waitFiles(dir, 120000);
  await sleep(1200);
  files = fs.readdirSync(dir).filter((f) => !f.endsWith('.crdownload'));
  info = files.map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size }));
  downloads.push({ batch: 'xlsx-3', dialogCounter: counter, files: info });
  const names = info.map((f) => f.name);
  record('D1.1', '选 3 孔导出 3 个独立 xlsx', info.length === 3, 3, names);
  record(
    'D1.2',
    'xlsx 文件名含各自孔号',
    names.some((n) => n.includes('ZK1')) && names.some((n) => n.includes('ZK-1')) && names.some((n) => n.includes('ZK2')),
    ['…ZK1…', '…ZK-1…', '…ZK2…'],
    names,
  );
  record(
    'D1.3',
    'xlsx 文件名不含任何非法字符 / \\ : * ? " < > |',
    names.every((n) => !ILLEGAL.test(n)),
    '全部不含非法字符',
    names.map((n) => ({ name: n, illegal: n.match(ILLEGAL)?.[0] ?? null })),
  );
  record(
    'D1.4',
    '清洗结果精确匹配（孔号 ZK/1 → ZK-1、工程编号 A:B → A-B）',
    names.includes('KC-01_ZK-1_开土记录表.xlsx') && names.includes('A-B_ZK2_开土记录表.xlsx') && names.includes('KC-01_ZK1_开土记录表.xlsx'),
    ['KC-01_ZK1_开土记录表.xlsx', 'KC-01_ZK-1_开土记录表.xlsx', 'A-B_ZK2_开土记录表.xlsx'],
    names,
  );

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  const out = {
    generatedAt: new Date().toISOString(),
    mainBundle: hash,
    total: results.length,
    passed,
    failed: failed.length,
    isPass: failed.length === 0,
    downloads,
    results,
  };
  fs.writeFileSync(path.join(__dirname, 'qa_round2_results.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log('\n============ 汇总 ============');
  console.log(`断言：${passed} / ${results.length} 通过，${failed.length} 失败`);
  console.log('下载清单：');
  for (const b of downloads) for (const f of b.files) console.log(`  [${b.batch}] ${f.name} ${f.size}B`);
  console.log(`\nIS_PASS: ${failed.length === 0 ? 'YES' : 'NO'}`);
}

main()
  .catch((e) => {
    console.error('脚本异常：', e);
    record('SYS.1', '脚本整体执行完成', false, '正常执行', String(e?.message ?? e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await sleep(200);
    cleanup();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
      fs.rmSync(dlRoot, { recursive: true, force: true });
    } catch {}
  });
