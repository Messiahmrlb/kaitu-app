/**
 * QA 独立验收脚本：首页「导入 / 导出」下拉菜单 + 勾选式导出 + 多孔导入。
 *
 * 前置：`npx vite preview --port 4299` 已启动（服务 dist），本脚本自行拉起无头 Edge（调试端口 9444）。
 * 运行：node qa_harness/_emit/qa_export_verify.mjs
 * 产出：qa_harness/_emit/qa_export_results.json + 控制台中文报告
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const BASE = 'http://127.0.0.1:4299/';
const DEBUG_PORT = 9444;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const STORAGE_KEY = 'CapacitorStorage.kaitu_records_v1';
const FIXTURES = path.join(__dirname, 'fixtures');

const results = [];
const downloadsLog = [];
function record(id, name, pass, expected, actual, note = '') {
  results.push({ id, name, pass: !!pass, expected, actual, note });
  const flag = pass ? 'PASS' : 'FAIL';
  console.log(`[${flag}] ${id} ${name}`);
  if (!pass) console.log(`        期望：${JSON.stringify(expected)}\n        实际：${JSON.stringify(actual)}`);
  if (note) console.log(`        备注：${note}`);
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
  throw new Error(`waitFor 超时（${timeout}ms）：${String(last)}`);
}

// ---------------------------------------------------------------------------
// 极简 CDP 客户端
// ---------------------------------------------------------------------------
class CDP {
  constructor(wsUrl, label) {
    this.label = label;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws = new WebSocket(wsUrl);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (e) => reject(new Error(`${label} WS 错误 ${e.message ?? ''}`)));
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${this.label} ${msg.error.message}`));
        else resolve(msg.result);
        return;
      }
      if (msg.method && this.handlers.has(msg.method)) {
        for (const h of this.handlers.get(msg.method)) h(msg.params);
      }
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

// ---------------------------------------------------------------------------
// 造数据
// ---------------------------------------------------------------------------
let seq = 0;
function mkSample(i, over = {}) {
  return {
    id: `s-${++seq}`,
    soilNumber: `-${i}`,
    fieldRecord: '粉质黏土',
    sampleDepth: `${i}.0~${i + 1}.0`,
    sampleElevation: `${10 - i}`,
    color: '褐黄',
    smell: '无',
    soilType: ['粉质黏土'],
    inclusions: ['含锈斑'],
    soilState: ['可塑'],
    soilStateNote: '',
    testItems: ['物性', '颗分'],
    il: '0.35',
    ip: '12.4',
    disturbance: '原状',
    siltySand: 'none',
    otherTestItems: [],
    ...over,
  };
}
function mkRecord({ id, hole, date, n, projectCode = 'KC-01', name }) {
  const samples = Array.from({ length: n }, (_, k) => mkSample(k + 1));
  return {
    id,
    name: name ?? `${projectCode} ${hole}`,
    mode: 'A',
    engineering: { projectCode, holeCode: hole, holeElevation: '5.20', openDate: date },
    samples,
    customTestItems: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// PDF 页数解析（统计 /Type /Page 对象数，扣除 /Type /Pages 树节点）
// ---------------------------------------------------------------------------
function pdfPageCount(file) {
  const s = fs.readFileSync(file).toString('latin1');
  // 页对象：`\b` 已排除 `/Type /Pages` 树节点（"Pages" 中 e→s 之间无词边界）
  const pageObjects = (s.match(/\/Type\s*\/Page\b/g) || []).length;
  const treeCount = (s.match(/\/Type\s*\/Pages\b[\s\S]{0,300}?\/Count\s+(\d+)/) || [])[1];
  const images = (s.match(/\/Subtype\s*\/Image\b/g) || []).length;
  return {
    pages: pageObjects,
    countFromTree: treeCount == null ? null : Number(treeCount),
    images,
  };
}

/** 校验页数：页对象数 == Pages.Count，且每页都嵌了 1 张图（空白页不会有图） */
function pageCheck(p, expected) {
  return !!p && p.pages === expected && p.countFromTree === expected && p.images >= expected;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-edge-'));
const dlRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-dl-'));
const createdDirs = [profileDir, dlRoot];
let edgeProc = null;
let browser = null;
let page = null;

function killEdge() {
  try {
    if (edgeProc && !edgeProc.killed) {
      spawnSync('taskkill', ['/PID', String(edgeProc.pid), '/T', '/F'], { stdio: 'ignore' });
    }
  } catch {
    /* ignore */
  }
  // 兜底：清理本 profile 相关的残留 msedge
  try {
    spawnSync('taskkill', ['/F', '/IM', 'msedge.exe', '/FI', `WINDOWTITLE eq qa-*`], { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
  try {
    browser?.ws?.close();
    page?.ws?.close();
  } catch {
    /* ignore */
  }
}

async function main() {
  // 0) 预览服务健康检查
  const head = await fetch(BASE).then((r) => r.text());
  const mainHash = (head.match(/assets\/(index-[\w-]+\.js)/) || [])[1] ?? '(未识别)';
  console.log(`预览服务 OK，主包：${mainHash}`);

  // 1) 启动无头 Edge
  edgeProc = spawn(
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

  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const pageTarget = targets.find((t) => t.type === 'page');
  const ver = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();

  browser = new CDP(ver.webSocketDebuggerUrl, 'browser');
  await browser.ready;
  page = new CDP(pageTarget.webSocketDebuggerUrl, 'page');
  await page.ready;

  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('DOM.enable');
  await browser.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: dlRoot,
    eventsEnabled: true,
  });

  // 下载事件登记
  const downloadEvents = [];
  browser.on('Browser.downloadWillBegin', (p) => downloadEvents.push({ kind: 'begin', ...p }));
  browser.on('Browser.downloadProgress', (p) => {
    if (p.state !== 'inProgress') downloadEvents.push({ kind: p.state, ...p });
  });

  const evalJS = async (expr) => {
    const r = await page.send('Runtime.evaluate', {
      expression: `(async () => { ${expr} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result.value;
  };
  const clickByText = async (selector, text) =>
    evalJS(`
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els.find(e => (e.textContent || '').trim() === ${JSON.stringify(text)});
      if (!el) return false;
      el.click();
      return true;
    `);
  const waitSel = (sel, timeout = 15000) =>
    waitFor(() => evalJS(`return !!document.querySelector(${JSON.stringify(sel)});`), timeout);

  // 先导航到应用（about:blank 是不透明源，localStorage 不可用）
  await page.send('Page.navigate', { url: BASE });
  await waitSel('[aria-label="导入或导出"]', 60000);
  // 清掉 Service Worker 与离线缓存，避免旧构建产物干扰（构建已更新，缓存应与之一致）
  await evalJS(`
    try { if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); } } catch (e) {}
    try { if ('caches' in window) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch (e) {}
    return true;
  `);
  await page.send('Page.reload', { ignoreCache: true });
  await waitSel('[aria-label="导入或导出"]', 60000);
  await sleep(400);

  const seeds = async (records) => {
    await evalJS(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(records))}); return true;`);
    await page.send('Page.reload', { ignoreCache: true });
    await waitSel('[aria-label="导入或导出"]', 30000);
    await sleep(400);
  };

  const openMenu = async () => {
    await evalJS(`document.querySelector('[aria-label="导入或导出"]').click(); return true;`);
    await waitSel('.MuiMenu-list', 8000);
    await sleep(150);
  };
  const openMenuDialog = async (itemText) => {
    await openMenu();
    const ok = await clickByText('.MuiMenuItem-root', itemText);
    if (!ok) throw new Error('菜单项未找到：' + itemText);
    await waitSel('.MuiDialog-root', 8000);
    await sleep(250);
  };
  const dialogSnapshot = () =>
    evalJS(`
      const dlg = document.querySelector('.MuiDialog-root');
      if (!dlg) return null;
      const title = (dlg.querySelector('.MuiDialogTitle-root')?.textContent || '').trim();
      const bodyText = (dlg.querySelector('.MuiDialogContent-root')?.textContent || '').trim();
      const rows = [...dlg.querySelectorAll('.MuiListItemButton-root')];
      const counters = [...dlg.querySelectorAll('*')].filter(e => e.children.length === 0 && /已选\\s*\\d+\\s*\\/\\s*共\\s*\\d+\\s*个孔/.test(e.textContent || ''));
      const actionBtns = [...dlg.querySelectorAll('.MuiDialogActions-root button')].map(b => ({ text: (b.textContent||'').trim(), disabled: b.disabled }));
      const boxes = [...dlg.querySelectorAll('.MuiCheckbox-root input')].map(i => ({ checked: i.checked, dataIndeterminate: i.getAttribute('data-indeterminate'), rootIndeterminate: !!i.closest('.MuiCheckbox-root')?.classList.contains('MuiCheckbox-indeterminate') }));
      return { title, bodyText, rowCount: rows.length, counterText: counters[0]?.textContent.trim() ?? '', actionBtns, boxes };
    `);

  const beginDownloadBatch = async (dirName) => {
    const dir = path.join(dlRoot, dirName);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: true });
    return dir;
  };
  const waitDownloads = async (dir, timeout = 150000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const files = fs.readdirSync(dir).filter((f) => !f.endsWith('.crdownload'));
      const pending = fs.readdirSync(dir).filter((f) => f.endsWith('.crdownload'));
      if (files.length > 0 && pending.length === 0) {
        // 确认大小稳定
        const s1 = files.map((f) => fs.statSync(path.join(dir, f)).size).join(',');
        await sleep(500);
        const now = fs.readdirSync(dir).filter((f) => !f.endsWith('.crdownload'));
        const s2 = now.map((f) => fs.statSync(path.join(dir, f)).size).join(',');
        if (files.length === now.length && s1 === s2) return now;
      }
      await sleep(300);
    }
    throw new Error('下载等待超时：' + dir);
  };

  // ========== 阶段 1：3 条记录（ZK1/ZK2/ZK3） ==========
  const R1 = [
    mkRecord({ id: 'r1', hole: 'ZK1', date: '2026-10-26', n: 2 }),
    mkRecord({ id: 'r2', hole: 'ZK2', date: '2026-10-27', n: 1 }),
    mkRecord({ id: 'r3', hole: 'ZK3', date: '2026-10-28', n: 2 }),
  ];
  await seeds(R1);

  // --- C1 入口与菜单 ---
  const legacyBtns = await evalJS(`
    return {
      xlsx: document.querySelectorAll('[aria-label="导出xlsx"]').length,
      pdf: document.querySelectorAll('[aria-label="导出pdf"]').length,
      total: document.querySelectorAll('[aria-label="导出xlsx"],[aria-label="导出pdf"]').length,
      cards: document.querySelectorAll('.MuiCard-root').length,
    };
  `);
  record('C1.1', '列表卡片无分散导出图标按钮', legacyBtns.total === 0 && legacyBtns.cards === 3, 0, legacyBtns);

  const trigger = await evalJS(`
    const b = document.querySelector('[aria-label="导入或导出"]');
    const r = b.getBoundingClientRect();
    return { haspopup: b.getAttribute('aria-haspopup'), text: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) };
  `);
  record(
    'C1.2',
    '「导入 / 导出」按钮存在且 aria-haspopup=menu',
    trigger.haspopup === 'menu' && trigger.text.replace(/\s/g, '') === '导入/导出',
    { haspopup: 'menu', text: '导入 / 导出' },
    trigger,
  );

  await openMenu();
  const menu = await evalJS(`
    const items = [...document.querySelectorAll('.MuiMenu-list .MuiMenuItem-root')].map(e => (e.textContent||'').trim());
    const aria = document.querySelector('[aria-label="导入或导出"]').getAttribute('aria-expanded');
    return { items, ariaExpanded: aria };
  `);
  record(
    'C1.3',
    '菜单三项文案与顺序正确',
    JSON.stringify(menu.items) === JSON.stringify(['导入送样单', '导出 PDF…', '导出电子表格…']),
    ['导入送样单', '导出 PDF…', '导出电子表格…'],
    menu.items,
  );
  record('C1.4', '菜单展开时 aria-expanded=true', menu.ariaExpanded === 'true', 'true', menu.ariaExpanded);

  // 真实鼠标点空白关闭
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 8, y: 700, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 8, y: 700, button: 'left', clickCount: 1 });
  const menuClosed = await waitFor(() => evalJS(`return !document.querySelector('.MuiMenu-list');`), 5000).then(() => true).catch(() => false);
  record('C1.5', '点击空白处菜单关闭', menuClosed, true, menuClosed);

  // --- C2 编辑页无导出按钮 ---
  await evalJS(`document.querySelector('.MuiCard-root').click(); return true;`);
  await waitFor(() => evalJS(`return (document.body.textContent||'').includes('编辑记录');`), 8000);
  await sleep(300);
  const editor = await evalJS(`
    const bars = [...document.querySelectorAll('.MuiAppBar-root')];
    const bar = bars[bars.length - 1];
    const btns = [...bar.querySelectorAll('button')].map(b => ({
      text: (b.textContent||'').trim(),
      aria: b.getAttribute('aria-label'),
    }));
    return { btns, hasExportXlsx: (document.body.textContent||'').includes('导出xlsx'), hasExportPdf: (document.body.textContent||'').includes('导出PDF') };
  `);
  record(
    'C2.1',
    '编辑页顶部无「导出xlsx」「导出PDF」按钮',
    !editor.hasExportXlsx && !editor.hasExportPdf && editor.btns.length === 1 && editor.btns[0].aria === '返回（自动保存）',
    { buttons: '仅返回箭头' },
    editor,
  );
  await evalJS(`document.querySelector('[aria-label="返回（自动保存）"]').click(); return true;`);
  await waitFor(() => evalJS(`return !!document.querySelector('[aria-label="导入或导出"]');`), 8000);
  await sleep(500);

  // --- C3 勾选对话框（PDF） ---
  await openMenuDialog('导出 PDF…');
  const d1 = await dialogSnapshot();
  record('C3.1', 'PDF 模式对话框标题', d1.title === '导出 PDF', '导出 PDF', d1.title);
  record('C3.2', '默认全选：已选 3 / 共 3 个孔', d1.counterText === '已选 3 / 共 3 个孔', '已选 3 / 共 3 个孔', d1.counterText);
  record('C3.3', '默认全选：按钮「导出 3 个孔」', d1.actionBtns.some((b) => b.text === '导出 3 个孔' && !b.disabled), '导出 3 个孔（可点）', d1.actionBtns);
  record('C3.4', '默认全选：3 个 checkbox 全部 checked', d1.boxes.length === 4 && d1.boxes.every((b) => b.checked === true), '全选行+3 行均 checked', d1.boxes);
  record('C3.5', '默认全选：全选框 non-indeterminate', d1.boxes[0].dataIndeterminate === 'false' && d1.boxes[0].rootIndeterminate === false, { dataIndeterminate: 'false', classIndeterminate: false }, d1.boxes[0]);

  // 取消一个（点第 2 行整行 = ZK2）
  await evalJS(`document.querySelectorAll('.MuiDialog-root .MuiListItemButton-root')[2].click(); return true;`);
  await sleep(300);
  const d2 = await dialogSnapshot();
  record('C3.6', '取消 1 个孔后计数同步', d2.counterText === '已选 2 / 共 3 个孔', '已选 2 / 共 3 个孔', d2.counterText);
  record('C3.7', '取消 1 个孔后按钮同步', d2.actionBtns.some((b) => b.text === '导出 2 个孔'), '导出 2 个孔', d2.actionBtns);
  record('C3.8', '半选状态：全选框 indeterminate 且 checked=false', d2.boxes[0].dataIndeterminate === 'true' && d2.boxes[0].rootIndeterminate === true && d2.boxes[0].checked === false, { dataIndeterminate: 'true', checked: false }, d2.boxes[0]);

  // 全不选（点全选行）
  await evalJS(`document.querySelectorAll('.MuiDialog-root .MuiListItemButton-root')[0].click(); return true;`);
  await sleep(250);
  const d3 = await dialogSnapshot();
  // 此时是半选 → 点全选行应变成全选（toggleAll 逻辑：allSelected=false → 全选）
  record('C3.9', '半选时点全选行 → 恢复全选', d3.counterText === '已选 3 / 共 3 个孔', '已选 3 / 共 3 个孔', d3.counterText);
  // 再点一次 → 全不选
  await evalJS(`document.querySelectorAll('.MuiDialog-root .MuiListItemButton-root')[0].click(); return true;`);
  await sleep(250);
  const d4 = await dialogSnapshot();
  record('C3.10', '全选时点全选行 → 全不选（已选 0）', d4.counterText === '已选 0 / 共 3 个孔', '已选 0 / 共 3 个孔', d4.counterText);
  record('C3.11', '全不选后导出按钮禁用', d4.actionBtns.some((b) => b.text === '导出 0 个孔' && b.disabled === true), '导出 0 个孔（disabled）', d4.actionBtns);
  record('C3.12', '全不选后 4 个 checkbox 均 unchecked', d4.boxes.every((b) => !b.checked && b.dataIndeterminate !== 'true'), '全部 unchecked', d4.boxes);

  // 再全选恢复
  await evalJS(`document.querySelectorAll('.MuiDialog-root .MuiListItemButton-root')[0].click(); return true;`);
  await sleep(250);
  const d5 = await dialogSnapshot();
  record('C3.13', '全选行再次点击 → 恢复全选', d5.counterText === '已选 3 / 共 3 个孔' && d5.actionBtns.some((b) => b.text === '导出 3 个孔'), '已选 3 / 共 3 个孔', d5.counterText);

  // 关闭（取消）
  await clickByText('.MuiDialog-root .MuiDialogActions-root button', '取消');
  await waitFor(() => evalJS(`return !document.querySelector('.MuiDialog-root');`), 5000);

  // --- C3.x xlsx 模式文案 ---
  await openMenuDialog('导出电子表格…');
  const dx = await dialogSnapshot();
  record('C3.14', 'xlsx 模式标题切换', dx.title === '导出电子表格', '导出电子表格', dx.title);
  record(
    'C3.15',
    'xlsx 模式说明文案切换（每孔一个独立文件）',
    dx.bodyText.includes('每个孔生成一个独立文件'),
    '包含「每个孔生成一个独立文件」',
    dx.bodyText.slice(-80),
  );
  record('C3.16', 'xlsx 模式默认全选', dx.counterText === '已选 3 / 共 3 个孔', '已选 3 / 共 3 个孔', dx.counterText);
  await clickByText('.MuiDialog-root .MuiDialogActions-root button', '取消');
  await waitFor(() => evalJS(`return !document.querySelector('.MuiDialog-root');`), 5000);

  // --- C4 单孔 PDF 文件名与页数 ---
  let dir = await beginDownloadBatch('single-pdf');
  await openMenuDialog('导出 PDF…');
  await evalJS(`document.querySelectorAll('.MuiDialog-root .MuiListItemButton-root')[2].click(); return true;`); // 取消 ZK2
  await sleep(200);
  await evalJS(`document.querySelectorAll('.MuiDialog-root .MuiListItemButton-root')[3].click(); return true;`); // 取消 ZK3
  await sleep(200);
  const singleSel = await dialogSnapshot();
  record('C4.0', '仅选 ZK1（已选 1 / 共 3）', singleSel.counterText === '已选 1 / 共 3 个孔', '已选 1 / 共 3 个孔', singleSel.counterText);
  await evalJS(`
    const btns = [...document.querySelectorAll('.MuiDialog-root .MuiDialogActions-root button')];
    btns.find(b => /^导出 \\d+ 个孔$/.test((b.textContent||'').trim())).click();
    return true;
  `);
  let files = await waitDownloads(dir);
  const singleInfo = files.map((f) => {
    const p = path.join(dir, f);
    const isPdf = f.toLowerCase().endsWith('.pdf');
    return { name: f, size: fs.statSync(p).size, pages: isPdf ? pdfPageCount(p) : null };
  });
  downloadsLog.push({ batch: 'single-pdf', files: singleInfo });
  record('C4.1', '单孔 PDF 文件名 = <开土日期>_<孔号>.pdf', singleInfo.length === 1 && singleInfo[0].name === '2026-10-26_ZK1.pdf', '2026-10-26_ZK1.pdf', singleInfo.map((f) => f.name));
  record('C4.2', '单孔 PDF 页数 = 1', pageCheck(singleInfo[0]?.pages, 1), 1, singleInfo[0]?.pages);

  // --- C5 3 孔合并导出 ---
  dir = await beginDownloadBatch('merged-3');
  await openMenuDialog('导出 PDF…');
  const d3all = await dialogSnapshot();
  await evalJS(`
    const btns = [...document.querySelectorAll('.MuiDialog-root .MuiDialogActions-root button')];
    btns.find(b => /^导出 \\d+ 个孔$/.test((b.textContent||'').trim())).click();
    return true;
  `);
  files = await waitDownloads(dir);
  const mergedInfo = files.map((f) => {
    const p = path.join(dir, f);
    return { name: f, size: fs.statSync(p).size, pages: f.toLowerCase().endsWith('.pdf') ? pdfPageCount(p) : null };
  });
  downloadsLog.push({ batch: 'merged-3', files: mergedInfo });
  const today = new Date().toLocaleDateString('sv-SE');
  const expectMerged = `开土记录_3孔_${today}.pdf`;
  record('C5.1', '3 孔导出只产生 1 个文件', mergedInfo.length === 1, 1, mergedInfo.map((f) => f.name));
  record('C5.2', '3 孔合并文件名 = 开土记录_3孔_<当天>.pdf', mergedInfo[0]?.name === expectMerged, expectMerged, mergedInfo[0]?.name);
  record('C5.3', '3 孔合并页数 = 3', pageCheck(mergedInfo[0]?.pages, 3), 3, mergedInfo[0]?.pages);

  // ========== 阶段 2：25 条 + 1 条 → 3 页 ==========
  await seeds([
    mkRecord({ id: 'r4', hole: 'ZK4', date: '2026-10-29', n: 25 }),
    mkRecord({ id: 'r5', hole: 'ZK5', date: '2026-10-30', n: 1 }),
  ]);
  dir = await beginDownloadBatch('paged-2');
  await openMenuDialog('导出 PDF…');
  const dpage = await dialogSnapshot();
  await evalJS(`
    const btns = [...document.querySelectorAll('.MuiDialog-root .MuiDialogActions-root button')];
    btns.find(b => /^导出 \\d+ 个孔$/.test((b.textContent||'').trim())).click();
    return true;
  `);
  files = await waitDownloads(dir);
  const pagedInfo = files.map((f) => {
    const p = path.join(dir, f);
    return { name: f, size: fs.statSync(p).size, pages: pdfPageCount(p) };
  });
  downloadsLog.push({ batch: 'paged-2', files: pagedInfo, dialogCounter: dpage.counterText });
  const expectPaged = `开土记录_2孔_${new Date().toLocaleDateString('sv-SE')}.pdf`;
  record('C5.4', '25 条 + 1 条合并文件名正确', pagedInfo[0]?.name === expectPaged, expectPaged, pagedInfo[0]?.name);
  record('C5.5', '25 条（2 页）+ 1 条（1 页）合并页数 = 3（不丢页/无空白页）', pageCheck(pagedInfo[0]?.pages, 3), 3, pagedInfo[0]?.pages);

  // ========== 阶段 3：xlsx 选 2 孔 ==========
  await seeds([
    mkRecord({ id: 'x1', hole: 'ZK1', date: '2026-10-26', n: 2 }),
    mkRecord({ id: 'x2', hole: 'ZK2', date: '2026-10-27', n: 1 }),
    mkRecord({ id: 'x3', hole: 'ZK3', date: '2026-10-28', n: 2 }),
  ]);
  dir = await beginDownloadBatch('xlsx-2');
  await openMenuDialog('导出电子表格…');
  await evalJS(`document.querySelectorAll('.MuiDialog-root .MuiListItemButton-root')[3].click(); return true;`); // 取消 ZK3
  await sleep(250);
  const xsel = await dialogSnapshot();
  record('C6.0', 'xlsx 取消 ZK3 后已选 2 / 共 3', xsel.counterText === '已选 2 / 共 3 个孔', '已选 2 / 共 3 个孔', xsel.counterText);
  await evalJS(`
    const btns = [...document.querySelectorAll('.MuiDialog-root .MuiDialogActions-root button')];
    btns.find(b => /^导出 \\d+ 个孔$/.test((b.textContent||'').trim())).click();
    return true;
  `);
  files = await waitDownloads(dir, 120000);
  await sleep(1200);
  files = fs.readdirSync(dir).filter((f) => !f.endsWith('.crdownload'));
  const xlsxInfo = files.map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size }));
  downloadsLog.push({ batch: 'xlsx-2', files: xlsxInfo });
  record('C6.1', '选 2 孔导出产生 2 个独立 xlsx', xlsxInfo.length === 2 && xlsxInfo.every((f) => f.name.endsWith('.xlsx')), 2, xlsxInfo);
  record(
    'C6.2',
    '两个 xlsx 文件名分别含各自孔号',
    xlsxInfo.some((f) => f.name.includes('ZK1')) && xlsxInfo.some((f) => f.name.includes('ZK2')) && !xlsxInfo.some((f) => f.name.includes('ZK3')),
    ['…ZK1…xlsx', '…ZK2…xlsx'],
    xlsxInfo.map((f) => f.name),
  );

  // ========== 阶段 4：多孔导入 ==========
  await seeds([]);
  await openMenuDialog('导入送样单');
  const setFile = async (abs) => {
    const { root } = await page.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
    await page.send('DOM.setFileInputFiles', { files: [abs], nodeId });
  };
  await setFile(path.join(FIXTURES, 'qa_multi-sheet.xlsx'));
  await waitFor(() => evalJS(`return (document.querySelector('.MuiDialogContent-root')?.textContent||'').includes('识别到');`), 30000);
  await sleep(300);
  const imp1 = await evalJS(`
    const c = document.querySelector('.MuiDialogContent-root');
    const t = (c?.textContent || '');
    const m = t.match(/识别到\\s*(\\d+)\\s*份送样单，共\\s*(\\d+)\\s*条土样/);
    const holes = [...c.querySelectorAll('.MuiListItemText-primary')].map(e => (e.textContent||'').trim());
    return { text: t, count: m ? Number(m[1]) : null, samples: m ? Number(m[2]) : null, items: holes };
  `);
  record('D1.1', '多工作表预览：识别到 3 份送样单', imp1.count === 3, 3, imp1.count);
  record(
    'D1.2',
    '多工作表预览：3 个孔号 ZK1/ZK2/ZK3',
    imp1.items.length === 3 && ['ZK1', 'ZK2', 'ZK3'].every((h) => imp1.items.some((t) => t.includes(h))),
    ['ZK1', 'ZK2', 'ZK3'],
    imp1.items,
  );
  record('D1.3', '多工作表未出现重复孔号告警', !imp1.text.includes('发现重复孔号'), '无告警', imp1.text.includes('发现重复孔号'));

  await clickByText('.MuiDialog-root .MuiDialogActions-root button', '确认导入');
  await waitFor(() => evalJS(`return !document.querySelector('.MuiDialog-root');`), 8000);
  await sleep(800);
  const after1 = await evalJS(`
    const raw = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    const arr = JSON.parse(raw || '[]');
    return { n: arr.length, holes: arr.map(r => r.engineering.holeCode), samples: arr.map(r => (r.samples||[]).length) };
  `);
  record('D1.4', '导入后本地记录数 = 3', after1.n === 3, 3, after1);
  record(
    'D1.5',
    '导入后孔号分别为 ZK1/ZK2/ZK3 且土样数 2/1/2',
    JSON.stringify(after1.holes) === JSON.stringify(['ZK1', 'ZK2', 'ZK3']) && JSON.stringify(after1.samples) === JSON.stringify([2, 1, 2]),
    { holes: ['ZK1', 'ZK2', 'ZK3'], samples: [2, 1, 2] },
    after1,
  );

  // 重复孔号
  await seeds([]);
  await openMenuDialog('导入送样单');
  await setFile(path.join(FIXTURES, 'qa_dup-hole.xlsx'));
  await waitFor(() => evalJS(`return (document.querySelector('.MuiDialogContent-root')?.textContent||'').includes('识别到');`), 30000);
  await sleep(300);
  const imp2 = await evalJS(`
    const c = document.querySelector('.MuiDialogContent-root');
    const t = (c?.textContent || '');
    const m = t.match(/识别到\\s*(\\d+)\\s*份送样单，共\\s*(\\d+)\\s*条土样/);
    const warn = [...c.querySelectorAll('.MuiAlert-root li')].map(e => (e.textContent||'').trim());
    return { count: m ? Number(m[1]) : null, warnings: warn };
  `);
  const dupWarn = imp2.warnings.find((w) => w.includes('发现重复孔号')) ?? '';
  record(
    'D2.1',
    '重复孔号预览出现 warning',
    !!dupWarn,
    '包含「发现重复孔号」的告警',
    imp2.warnings,
  );
  record(
    'D2.2',
    'warning 文案包含 ZK2 与「2 份送样单」',
    dupWarn.includes('ZK2') && dupWarn.includes('2 份送样单') && dupWarn.includes('Sheet1') && dupWarn.includes('Sheet3'),
    '发现重复孔号「ZK2」共 2 份送样单（工作表：Sheet1、Sheet3），导入后会生成 2 条独立记录。',
    dupWarn,
  );
  await clickByText('.MuiDialog-root .MuiDialogActions-root button', '确认导入');
  await waitFor(() => evalJS(`return !document.querySelector('.MuiDialog-root');`), 8000);
  await sleep(800);
  const after2 = await evalJS(`
    const arr = JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || '[]');
    return { n: arr.length, holes: arr.map(r => r.engineering.holeCode) };
  `);
  record(
    'D2.3',
    '导入后生成 2 条 ZK2 记录（共 3 条）',
    after2.n === 3 && after2.holes.filter((h) => h === 'ZK2').length === 2,
    { n: 3, ZK2: 2 },
    after2,
  );

  // ========== 阶段 5：窄屏 ==========
  await seeds(R1);
  const widths = [320, 360, 390, 430];
  const narrowRows = [];
  for (const w of widths) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: 800,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await sleep(600);
    const m = await evalJS(`
      const iw = window.innerWidth;
      const btns = [...document.querySelectorAll('.MuiAppBar-root button, .MuiAppBar-root .MuiButtonBase-root')]
        .filter((b, i, a) => a.indexOf(b) === i)
        .map(b => {
          const r = b.getBoundingClientRect();
          const label = b.getAttribute('aria-label') || (b.textContent||'').trim();
          return { label, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
        });
      const trig = document.querySelector('[aria-label="导入或导出"]').getBoundingClientRect();
      return {
        innerWidth: iw,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        buttons: btns,
        trigger: { w: Math.round(trig.width), h: Math.round(trig.height), right: Math.round(trig.right), left: Math.round(trig.left) },
      };
    `);
    const noOverflow = m.scrollWidth === m.innerWidth;
    const allInside = m.buttons.every((b) => b.right <= m.innerWidth && b.left >= 0);
    const trigOk = m.trigger.right <= m.innerWidth && m.trigger.left >= 0 && m.trigger.w > m.trigger.h * 1.5;
    narrowRows.push({ ...m, noOverflow, allInside, trigOk });
    record(
      `C7.${widths.indexOf(w) + 1}`,
      `${w}px 无横向溢出且 AppBar 按钮均在视口内`,
      noOverflow && allInside && trigOk,
      { scrollWidth: w, allInside: true, triggerRatio: '宽>1.5×高' },
      {
        scrollWidth: m.scrollWidth,
        bodyScrollWidth: m.bodyScrollWidth,
        overflowBtns: m.buttons.filter((b) => b.right > m.innerWidth || b.left < 0),
        trigger: m.trigger,
      },
    );
  }
  await page.send('Emulation.clearDeviceMetricsOverride');

  // ========== 汇总 ==========
  if (process.env.QA_KEEP === '1') {
    const keepDir = path.join(__dirname, 'qa_downloads');
    fs.rmSync(keepDir, { recursive: true, force: true });
    fs.cpSync(dlRoot, keepDir, { recursive: true });
    console.log(`已保留下载样本：${keepDir}`);
  }
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  const out = {
    generatedAt: new Date().toISOString(),
    previewBase: BASE,
    mainBundle: mainHash,
    total: results.length,
    passed,
    failed: failed.length,
    isPass: failed.length === 0,
    narrowScreen: narrowRows.map((r) => ({
      width: r.innerWidth,
      scrollWidth: r.scrollWidth,
      bodyScrollWidth: r.bodyScrollWidth,
      noOverflow: r.noOverflow,
      allInside: r.allInside,
      trigger: r.trigger,
      buttons: r.buttons,
    })),
    downloads: downloadsLog,
    results,
    downloadDir: dlRoot,
  };
  fs.writeFileSync(path.join(__dirname, 'qa_export_results.json'), JSON.stringify(out, null, 2), 'utf8');

  console.log('\n================ 汇总 ================');
  console.log(`断言：${passed} / ${results.length} 通过，${failed.length} 失败`);
  for (const f of failed) console.log(`  FAIL ${f.id} ${f.name} | 期望 ${JSON.stringify(f.expected)} | 实际 ${JSON.stringify(f.actual)}`);
  console.log('\n窄屏数据：');
  for (const r of out.narrowScreen) {
    console.log(
      `  ${String(r.width).padStart(4)}px scrollWidth=${r.scrollWidth} body=${r.bodyScrollWidth} 按钮=${JSON.stringify(r.trigger)} 越界=${JSON.stringify(r.buttons.filter((b) => b.right > r.width || b.left < 0))}`,
    );
  }
  console.log('\n下载清单：');
  for (const b of downloadsLog) {
    for (const f of b.files) console.log(`  [${b.batch}] ${f.name} ${f.size}B ${f.pages ? '页数=' + f.pages.pages + ' (tree=' + f.pages.countFromTree + ', images=' + f.pages.images + ')' : ''}`);
  }
  console.log(`\nIS_PASS: ${failed.length === 0 ? 'YES' : 'NO'}`);
  console.log(`结果文件：${path.join(__dirname, 'qa_export_results.json')}`);
}

main()
  .catch((e) => {
    console.error('脚本异常：', e);
    record('SYS.1', '脚本整体执行完成', false, '正常执行', String(e?.message ?? e));
    const passed = results.filter((r) => r.pass).length;
    fs.writeFileSync(
      path.join(__dirname, 'qa_export_results.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), isPass: false, error: String(e?.stack ?? e), results, passed, total: results.length }, null, 2),
      'utf8',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await sleep(200);
    killEdge();
    for (const d of createdDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
