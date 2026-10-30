/**
 * QA 第 3 轮验证：同孔多表合并 / 续页沿用 / 来源疑似有误 + 导出抽样回归。
 *
 * 用法：
 *   node qa_harness/_emit/qa_import_merge_verify.mjs            # 纯函数 + node 解析 + 浏览器 E2E + 导出抽样
 *   node qa_harness/_emit/qa_import_merge_verify.mjs --node-only # 只跑纯函数与 node 解析（不起浏览器）
 *
 * 前置（浏览器部分）：`npx vite preview --port 4399` 已启动。本脚本自行拉起无头 Edge(9555) 并清理。
 * 产出：qa_harness/_emit/qa_import_merge_results.json + 截图 qa_import_*.png
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, 'fixtures');
const BASE = 'http://127.0.0.1:4399/';
const DEBUG_PORT = 9555;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const STORAGE_KEY = 'CapacitorStorage.kaitu_records_v1';
const NODE_ONLY = process.argv.includes('--node-only');

const idl = require('./importDelivery.cjs');
const results = [];
const parsed = {}; // 文件名 -> 解析结果快照
const downloads = [];

function rec(id, group, name, pass, expected, actual) {
  results.push({ id, group, name, pass: !!pass, expected, actual });
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

// ===========================================================================
// 造一个最小的 ImportedRecord（给自己做纯函数测试用，不引用工程师的测试）
// ===========================================================================
let sid = 0;
function mkSample(soilNumber, over = {}) {
  return {
    id: `s${++sid}`,
    soilNumber,
    fieldRecord: '粉质黏土',
    sampleDepth: '1.0~2.0',
    sampleElevation: '',
    color: '',
    smell: '',
    soilType: [],
    inclusions: [],
    soilState: [],
    soilStateNote: '',
    testItems: [],
    il: '',
    ip: '',
    disturbance: '原状',
    siltySand: 'none',
    otherTestItems: [],
    ...over,
  };
}
function mkItem({ hole, samples, sheet, warnings = [], errors = [] }) {
  const nums = samples.map((s) => (typeof s === 'string' ? s : s.soilNumber));
  return {
    record: {
      id: `r${++sid}`,
      name: `测试 ${hole}`,
      mode: 'A',
      engineering: { projectCode: '', holeCode: hole, holeElevation: '', openDate: '2026-01-01' },
      samples: nums.map((n) => mkSample(n)),
      customTestItems: [],
      createdAt: 0,
      updatedAt: 0,
    },
    sheetName: sheet,
    sampleCount: nums.length,
    holeCode: hole,
    warnings,
    errors,
  };
}
const soilNums = (r) => r.record.samples.map((s) => s.soilNumber);

// ===========================================================================
// B. 纯函数独立校验
// ===========================================================================
function partB() {
  console.log('\n===== B. 纯函数独立校验 =====');

  // --- soilSeqOf ---
  const seqCases = [
    ['ZK1-1-01', 1],
    ['ZK1-R1', 1],
    ['ZK1-1-21', 21],
    ['ZK1-1', null],
    ['', null],
    ['ZK1-1-100', 100],
    [' ZK1-1-07 ', 7],
    ['01', 1],
    ['abc', null],
    [null, null],
  ];
  const seqGot = seqCases.map(([v]) => idl.soilSeqOf(v));
  rec('B1.1', 'B', 'soilSeqOf 10 例（含规格 5 例 + 100/空格/纯数字/无数字/null）', JSON.stringify(seqGot) === JSON.stringify(seqCases.map((c) => c[1])), seqCases.map((c) => c[1]), seqGot);

  // --- mergeImportedByHole ---
  // 1) 同孔 3 块
  const three = idl.mergeImportedByHole([
    mkItem({ hole: 'ZK1-1', sheet: 'Sheet1', samples: ['ZK1-1-01', 'ZK1-1-02'], warnings: ['同名告警'] }),
    mkItem({ hole: 'ZK1-1', sheet: 'Sheet1', samples: ['ZK1-1-03'], warnings: ['同名告警'] }),
    mkItem({ hole: 'ZK1-1', sheet: 'Sheet2', samples: ['ZK1-1-04'] }),
  ]);
  rec('B2.1', 'B', '同孔 3 块 → 1 条记录', three.records.length === 1, 1, three.records.length);
  rec('B2.2', 'B', 'mergedFrom = 3', three.records[0]?.mergedFrom === 3, 3, three.records[0]?.mergedFrom);
  rec(
    'B2.3',
    'B',
    '土样按块顺序拼接且序号连续 1..N',
    JSON.stringify(soilNums(three.records[0])) === JSON.stringify(['ZK1-1-01', 'ZK1-1-02', 'ZK1-1-03', 'ZK1-1-04']),
    ['ZK1-1-01', 'ZK1-1-02', 'ZK1-1-03', 'ZK1-1-04'],
    soilNums(three.records[0]),
  );
  rec('B2.4', 'B', 'sampleCount = 4', three.records[0]?.sampleCount === 4, 4, three.records[0]?.sampleCount);
  rec(
    'B2.5',
    'B',
    'mergedNotes 文案「孔号 X 的 3 份送样单已合并为 1 条记录」',
    three.mergedNotes.includes('孔号 ZK1-1 的 3 份送样单已合并为 1 条记录'),
    '孔号 ZK1-1 的 3 份送样单已合并为 1 条记录',
    three.mergedNotes,
  );
  rec('B2.6', 'B', '同一工作表名去重后「、」连接', three.records[0]?.sheetName === 'Sheet1、Sheet2', 'Sheet1、Sheet2', three.records[0]?.sheetName);
  rec('B2.7', 'B', 'warnings 去重（同名告警只留 1 条）', JSON.stringify(three.records[0]?.warnings) === JSON.stringify(['同名告警']), ['同名告警'], three.records[0]?.warnings);

  // 2) ZK1 与 ZK1-1 不合并
  const diff = idl.mergeImportedByHole([
    mkItem({ hole: 'ZK1', sheet: 'S1', samples: ['ZK1-01'] }),
    mkItem({ hole: 'ZK1-1', sheet: 'S2', samples: ['ZK1-1-01'] }),
  ]);
  rec('B3.1', 'B', 'ZK1 与 ZK1-1 精确匹配 → 2 条记录', diff.records.length === 2, 2, diff.records.map((r) => r.holeCode));
  rec('B3.2', 'B', '两者 mergedFrom 均为 1', diff.records.every((r) => r.mergedFrom === 1), [1, 1], diff.records.map((r) => r.mergedFrom));
  rec('B3.3', 'B', '未合并时不产生 mergedNotes', diff.mergedNotes.length === 0, 0, diff.mergedNotes);

  // 3) 两个空孔号不合并
  const empties = idl.mergeImportedByHole([
    mkItem({ hole: '', sheet: 'S1', samples: ['01'] }),
    mkItem({ hole: '   ', sheet: 'S2', samples: ['02'] }),
  ]);
  rec('B4.1', 'B', '两个空孔号块 → 2 条记录（不合并）', empties.records.length === 2, 2, empties.records.length);
  rec('B4.2', 'B', '空孔号块 mergedFrom 均为 1', empties.records.every((r) => r.mergedFrom === 1), [1, 1], empties.records.map((r) => r.mergedFrom));

  // 4) 补零宽度保持
  const pad = idl.mergeImportedByHole([
    mkItem({ hole: 'ZK1-1', sheet: 'S1', samples: ['ZK1-1-01'] }),
    mkItem({ hole: 'ZK1-1', sheet: 'S2', samples: ['ZK1-1-02'] }),
  ]);
  rec('B5.1', 'B', '补零宽度保持（01/02 而非 1/2）', JSON.stringify(soilNums(pad.records[0])) === JSON.stringify(['ZK1-1-01', 'ZK1-1-02']), ['ZK1-1-01', 'ZK1-1-02'], soilNums(pad.records[0]));

  // 5) 非数字土号原样保留（ZK1-R1 等）
  const mixed = idl.mergeImportedByHole([
    mkItem({ hole: 'ZK1-1', sheet: 'S1', samples: ['ZK1-1-01', 'ZK1-R1'] }),
    mkItem({ hole: 'ZK1-1', sheet: 'S2', samples: ['ZK1-1-03'] }),
  ]);
  rec(
    'B5.2',
    'B',
    '非数字土号（ZK1-R1）原样保留，数字号仍连续',
    JSON.stringify(soilNums(mixed.records[0])) === JSON.stringify(['ZK1-1-01', 'ZK1-R1', 'ZK1-1-02']),
    ['ZK1-1-01', 'ZK1-R1', 'ZK1-1-02'],
    soilNums(mixed.records[0]),
  );

  // 6) errors 去重并汇总
  const errs = idl.mergeImportedByHole([
    mkItem({ hole: 'ZK2-1', sheet: 'S1', samples: ['ZK2-1-01'], errors: ['E1'] }),
    mkItem({ hole: 'ZK2-1', sheet: 'S2', samples: ['ZK2-1-01'], errors: ['E1'] }),
  ]);
  rec('B6.1', 'B', 'errors 去重汇总到结果级', JSON.stringify(errs.errors) === JSON.stringify(['E1']), ['E1'], errs.errors);
  rec('B6.2', 'B', 'errors 同时挂在合并后的记录上', JSON.stringify(errs.records[0]?.errors) === JSON.stringify(['E1']), ['E1'], errs.records[0]?.errors);

  // 7) 空输入不抛错
  const empty = idl.mergeImportedByHole([]);
  rec('B7.1', 'B', '空数组不抛错', empty.records.length === 0 && empty.mergedNotes.length === 0, { records: 0 }, empty);
}

// ===========================================================================
// C. node 端解析自造 xlsx
// ===========================================================================
const loadFixture = (f) => {
  const b = fs.readFileSync(path.join(FIX, f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const snap = (r) => ({
  records: r.records.map((x) => ({
    holeCode: x.holeCode,
    sampleCount: x.sampleCount,
    mergedFrom: x.mergedFrom,
    sheetName: x.sheetName,
    soilNumbers: x.record.samples.map((s) => s.soilNumber),
    mode: x.record.mode,
    warnings: x.warnings,
    errors: x.errors,
  })),
  errors: r.errors,
  warnings: r.warnings,
  mergedNotes: r.mergedNotes,
});

async function partC() {
  console.log('\n===== C. node 端解析自造 xlsx =====');
  const files = [
    'qa_m1_same_hole.xlsx',
    'qa_m2_continue.xlsx',
    'qa_m3_restart.xlsx',
    'qa_m4_multi_hole.xlsx',
    'qa_e1_first_no_hole.xlsx',
    'qa_e2_same_sheet_two_blocks.xlsx',
    'qa_e3_case_space.xlsx',
    'qa_e4_mode_conflict.xlsx',
    'qa_e5_label_a_empty.xlsx',
    'qa_e6_label_b_empty.xlsx',
  ];
  for (const f of files) parsed[f] = snap(await idl.parseDeliveryFile(loadFixture(f)));

  const m1 = parsed['qa_m1_same_hole.xlsx'];
  rec('C1.1', 'C', 'm1 同孔两表 → 1 条记录', m1.records.length === 1, 1, m1.records.length);
  rec('C1.2', 'C', 'm1 4 条土样、mergedFrom=2', m1.records[0]?.sampleCount === 4 && m1.records[0]?.mergedFrom === 2, { sampleCount: 4, mergedFrom: 2 }, m1.records[0]);
  rec(
    'C1.3',
    'C',
    'm1 土号顺序 01,02,03,04',
    JSON.stringify(m1.records[0]?.soilNumbers) === JSON.stringify(['ZK1-1-01', 'ZK1-1-02', 'ZK1-1-03', 'ZK1-1-04']),
    ['ZK1-1-01', 'ZK1-1-02', 'ZK1-1-03', 'ZK1-1-04'],
    m1.records[0]?.soilNumbers,
  );
  rec('C1.4', 'C', 'm1 无错误', m1.errors.length === 0, [], m1.errors);

  const m2 = parsed['qa_m2_continue.xlsx'];
  rec('C2.1', 'C', 'm2 续页接续 → 1 条记录 3 条土样', m2.records.length === 1 && m2.records[0]?.sampleCount === 3, { records: 1, samples: 3 }, m2.records[0]);
  rec('C2.2', 'C', 'm2 errors 为空', m2.errors.length === 0, [], m2.errors);
  rec(
    'C2.3',
    'C',
    'm2 有 info「已沿用上一张的 ZK2-1」',
    m2.records[0]?.warnings?.some((w) => w.includes('已沿用上一张的 ZK2-1')),
    '包含「已沿用上一张的 ZK2-1」',
    m2.records[0]?.warnings,
  );

  const m3 = parsed['qa_m3_restart.xlsx'];
  rec('C3.1', 'C', 'm3 从 1 重开仍合并为 1 条 4 条土样', m3.records.length === 1 && m3.records[0]?.sampleCount === 4, { records: 1, samples: 4 }, m3.records[0]);
  rec('C3.2', 'C', 'm3 恰好 1 条错误级提示', m3.errors.length === 1, 1, m3.errors);
  rec(
    'C3.3',
    'C',
    'm3 错误文案含「疑似送样单来源有误」「已按沿用「ZK3-1」合并」',
    !!m3.errors[0] && m3.errors[0].includes('疑似送样单来源有误') && m3.errors[0].includes('已按沿用「ZK3-1」合并'),
    '包含两段关键文案',
    m3.errors[0],
  );

  const m4 = parsed['qa_m4_multi_hole.xlsx'];
  rec('C4.1', 'C', 'm4 多孔 → 2 条记录', m4.records.length === 2, 2, m4.records.map((r) => r.holeCode));
  rec(
    'C4.2',
    'C',
    'm4 ZK4=1 条 / ZK5=2 条土样',
    m4.records[0]?.holeCode === 'ZK4' && m4.records[0]?.sampleCount === 1 && m4.records[1]?.holeCode === 'ZK5' && m4.records[1]?.sampleCount === 2,
    { ZK4: 1, ZK5: 2 },
    m4.records.map((r) => ({ hole: r.holeCode, n: r.sampleCount })),
  );
  rec('C4.3', 'C', 'm4 无错误', m4.errors.length === 0, [], m4.errors);
  rec('C4.4', 'C', 'm4 ZK5 mergedFrom=2', m4.records[1]?.mergedFrom === 2, 2, m4.records[1]?.mergedFrom);
}

// ===========================================================================
// D/E. 浏览器部分
// ===========================================================================
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

function pdfPageCount(file) {
  const s = fs.readFileSync(file).toString('latin1');
  const pages = (s.match(/\/Type\s*\/Page\b/g) || []).length;
  const tree = (s.match(/\/Type\s*\/Pages\b[\s\S]{0,300}?\/Count\s+(\d+)/) || [])[1];
  const images = (s.match(/\/Subtype\s*\/Image\b/g) || []).length;
  return { pages, countFromTree: tree == null ? null : Number(tree), images };
}

async function partDE() {
  console.log('\n===== D/E. 浏览器端到端 =====');
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa3-edge-'));
  const dlRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa3-dl-'));
  let edge = null;
  let browser = null;
  let page = null;

  try {
    const html = await fetch(BASE).then((r) => r.text());
    const hash = (html.match(/assets\/(index-[\w-]+\.js)/) || [])[1];
    console.log(`预览服务 OK，主包：${hash}`);
    parsed.__mainBundle = hash;

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
    await page.send('DOM.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
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
    const screenshot = async (name) => {
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      const f = path.join(__dirname, name);
      fs.writeFileSync(f, Buffer.from(data, 'base64'));
      console.log('  screenshot ->', path.basename(f));
      return f;
    };
    const setFile = async (abs) => {
      const { root } = await page.send('DOM.getDocument', { depth: -1 });
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
      await page.send('DOM.setFileInputFiles', { files: [abs], nodeId });
    };
    const openImport = async () => {
      await evalJS(`document.querySelector('[aria-label="导入或导出"]').click(); return true;`);
      await waitSel('.MuiMenu-list', 8000);
      await evalJS(`[...document.querySelectorAll('.MuiMenuItem-root')].find(e => (e.textContent||'').trim() === '导入送样单').click(); return true;`);
      await waitSel('.MuiDialog-root', 8000);
      await sleep(250);
    };
    const dialogSnap = () =>
      evalJS(`
        const c = document.querySelector('.MuiDialogContent-root');
        if (!c) return null;
        const alerts = [...c.querySelectorAll('.MuiAlert-root')].map(a => ({
          severity: (a.className.match(/MuiAlert-(?:standard|filled|outlined)(Error|Warning|Info|Success)/) || [])[1] ?? 'unknown',
          title: (a.querySelector('.MuiTypography-subtitle2')?.textContent || '').trim(),
          items: [...a.querySelectorAll('li')].map(li => (li.textContent || '').trim()),
        }));
        return {
          text: (c.textContent || '').replace(/\\s+/g, ' ').trim(),
          stat: ((c.textContent||'').match(/识别到\\s*\\d+\\s*个孔（来自\\s*\\d+\\s*份送样单），共\\s*\\d+\\s*条土样/) || [''])[0],
          alerts,
          items: [...c.querySelectorAll('.MuiListItemText-root')].map(e => (e.textContent||'').replace(/\\s+/g,' ').trim()),
        };
      `);
    const importFile = async (file, shotName) => {
      await openImport();
      await setFile(path.join(FIX, file));
      await waitFor(() => evalJS(`return (document.querySelector('.MuiDialogContent-root')?.textContent||'').includes('识别到');`), 30000);
      await sleep(400);
      const snap = await dialogSnap();
      const shot = shotName ? await screenshot(shotName) : null;
      return { snap, shot };
    };
    const confirmImport = async () => {
      await evalJS(`[...document.querySelectorAll('.MuiDialog-root .MuiDialogActions-root button')].find(b => (b.textContent||'').trim() === '确认导入').click(); return true;`);
      await waitFor(() => evalJS(`return !document.querySelector('.MuiDialog-root');`), 10000);
      await sleep(700);
      return evalJS(`
        const arr = JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || '[]');
        return {
          n: arr.length,
          records: arr.map(r => ({
            hole: r.engineering.holeCode,
            n: (r.samples||[]).length,
            soil: (r.samples||[]).map(s => s.soilNumber),
            mode: r.mode,
          })),
        };
      `);
    };
    const seed = async (records) => {
      await evalJS(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(records))}); return true;`);
      await page.send('Page.reload', { ignoreCache: true });
      await waitSel('[aria-label="导入或导出"]', 60000);
      await sleep(400);
    };

    await page.send('Page.navigate', { url: BASE });
    await waitSel('[aria-label="导入或导出"]', 60000);
    await evalJS(`try { if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); } } catch(e) {}
                  try { if ('caches' in window) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch(e) {}
                  return true;`);
    await page.send('Page.reload', { ignoreCache: true });
    await waitSel('[aria-label="导入或导出"]', 60000);
    await sleep(400);

    // ---------- D1: m1 同孔两表 ----------
    await seed([]);
    let r1 = await importFile('qa_m1_same_hole.xlsx', 'qa_import_m1.png');
    parsed.__ui_m1 = r1.snap;
    rec('D1.1', 'D', 'm1 UI 统计文案「识别到 1 个孔（来自 2 份送样单），共 4 条土样」', r1.snap.stat === '识别到 1 个孔（来自 2 份送样单），共 4 条土样', '识别到 1 个孔（来自 2 份送样单），共 4 条土样', r1.snap.stat);
    rec('D1.2', 'D', 'm1 UI 无红色 error 区块', !r1.snap.alerts.some((a) => a.severity === 'Error'), '无 Error', r1.snap.alerts.map((a) => a.severity));
    rec('D1.3', 'D', 'm1 UI 有 info 合并提示', r1.snap.alerts.some((a) => a.severity === 'Info' && a.title.includes('同孔送样单已合并')), 'Info「同孔送样单已合并（1 条）」', r1.snap.alerts);
    rec('D1.4', 'D', 'm1 UI 列表显示「已合并 2 张送样单」与来源工作表', r1.snap.items.some((x) => x.includes('已合并 2 张送样单') && x.includes('Sheet1、Sheet2')), '含「来源工作表：Sheet1、Sheet2 ｜ 已合并 2 张送样单」', r1.snap.items);
    r1 = await confirmImport();
    rec('D1.5', 'D', 'm1 导入后 1 条记录 4 条土样', r1.n === 1 && r1.records[0]?.n === 4, { records: 1, samples: 4 }, r1);
    rec('D1.6', 'D', 'm1 导入后土号顺序 01,02,03,04', JSON.stringify(r1.records[0]?.soil) === JSON.stringify(['ZK1-1-01', 'ZK1-1-02', 'ZK1-1-03', 'ZK1-1-04']), ['ZK1-1-01', 'ZK1-1-02', 'ZK1-1-03', 'ZK1-1-04'], r1.records[0]?.soil);

    // ---------- D2: m2 跨表无孔号 + 接续 ----------
    await seed([]);
    let r2 = await importFile('qa_m2_continue.xlsx', 'qa_import_m2.png');
    parsed.__ui_m2 = r2.snap;
    rec('D2.1', 'D', 'm2 UI 统计文案 1 孔/2 份/3 条', r2.snap.stat === '识别到 1 个孔（来自 2 份送样单），共 3 条土样', '识别到 1 个孔（来自 2 份送样单），共 3 条土样', r2.snap.stat);
    rec('D2.2', 'D', 'm2 UI 无红色 error', !r2.snap.alerts.some((a) => a.severity === 'Error'), '无 Error', r2.snap.alerts.map((a) => a.severity));
    rec(
      'D2.3',
      'D',
      'm2 UI 出现 info「已沿用上一张的 ZK2-1」',
      r2.snap.text.includes('已沿用上一张的 ZK2-1'),
      '包含「已沿用上一张的 ZK2-1」',
      r2.snap.alerts,
    );
    r2 = await confirmImport();
    rec('D2.4', 'D', 'm2 导入后 1 条记录 3 条土样', r2.n === 1 && r2.records[0]?.n === 3, { records: 1, samples: 3 }, r2);

    // ---------- D3: m3 跨表无孔号 + 从 1 重开 ----------
    await seed([]);
    let r3 = await importFile('qa_m3_restart.xlsx', 'qa_import_m3.png');
    parsed.__ui_m3 = r3.snap;
    rec('D3.1', 'D', 'm3 UI 统计文案 1 孔/2 份/4 条', r3.snap.stat === '识别到 1 个孔（来自 2 份送样单），共 4 条土样', '识别到 1 个孔（来自 2 份送样单），共 4 条土样', r3.snap.stat);
    const errAlerts = r3.snap.alerts.filter((a) => a.severity === 'Error');
    rec('D3.2', 'D', 'm3 UI 恰好 1 个红色 error 区块', errAlerts.length === 1, 1, r3.snap.alerts.map((a) => a.severity));
    rec(
      'D3.3',
      'D',
      'm3 红色区块文案含「疑似送样单来源有误」「已按沿用「ZK3-1」合并」',
      !!errAlerts[0] && errAlerts[0].items.join(' ').includes('疑似送样单来源有误') && errAlerts[0].items.join(' ').includes('已按沿用「ZK3-1」合并'),
      '含两段关键文案',
      errAlerts[0]?.items,
    );
    const errIdx = r3.snap.alerts.findIndex((a) => a.severity === 'Error');
    const warnIdx = r3.snap.alerts.findIndex((a) => a.severity === 'Warning');
    const infoIdx = r3.snap.alerts.findIndex((a) => a.severity === 'Info');
    rec('D3.4', 'D', 'm3 DOM 顺序 error 在 warning 之上（且 info 在两者之间）', errIdx === 0 && (warnIdx === -1 || warnIdx > errIdx) && infoIdx > errIdx, { error: 0, info: 1, warning: '>0 或不存在' }, { error: errIdx, info: infoIdx, warning: warnIdx });
    r3 = await confirmImport();
    rec('D3.5', 'D', 'm3 导入后 1 条记录 4 条土样', r3.n === 1 && r3.records[0]?.n === 4, { records: 1, samples: 4 }, r3);

    // ---------- D4: m4 多孔 + 一孔多表 ----------
    await seed([]);
    let r4 = await importFile('qa_m4_multi_hole.xlsx', 'qa_import_m4.png');
    parsed.__ui_m4 = r4.snap;
    rec('D4.1', 'D', 'm4 UI 统计文案「2 个孔（来自 3 份送样单），共 3 条土样」', r4.snap.stat === '识别到 2 个孔（来自 3 份送样单），共 3 条土样', '识别到 2 个孔（来自 3 份送样单），共 3 条土样', r4.snap.stat);
    rec('D4.2', 'D', 'm4 UI 无 error', !r4.snap.alerts.some((a) => a.severity === 'Error'), '无 Error', r4.snap.alerts.map((a) => a.severity));
    rec(
      'D4.3',
      'D',
      'm4 UI ZK5 行显示「已合并 2 张送样单」，ZK4 行不显示',
      r4.snap.items.filter((x) => x.includes('已合并 2 张送样单')).length === 1 &&
        r4.snap.items.some((x) => x.includes('ZK5') && x.includes('已合并 2 张送样单')) &&
        r4.snap.items.some((x) => x.includes('ZK4') && !x.includes('已合并')),
      '仅 ZK5 显示已合并 2 张',
      r4.snap.items,
    );
    r4 = await confirmImport();
    rec('D4.4', 'D', 'm4 导入后 2 条记录（ZK4 1 条 / ZK5 2 条）', r4.n === 2 && r4.records[0]?.hole === 'ZK4' && r4.records[0]?.n === 1 && r4.records[1]?.hole === 'ZK5' && r4.records[1]?.n === 2, { ZK4: 1, ZK5: 2 }, r4);

    // ---------- D5: 导出侧抽样回归（用 m4 导入后的 2 条记录）----------
    const today = new Date().toLocaleDateString('sv-SE');
    // 列表卡片无导出图标
    const cards = await evalJS(`
      return {
        cards: document.querySelectorAll('.MuiCard-root').length,
        legacy: document.querySelectorAll('[aria-label="导出xlsx"],[aria-label="导出pdf"]').length,
      };
    `);
    rec('D5.1', 'D', '列表卡片仍无导出图标按钮', cards.cards === 2 && cards.legacy === 0, { cards: 2, legacy: 0 }, cards);

    // 编辑页无导出按钮
    await evalJS(`document.querySelector('.MuiCard-root').click(); return true;`);
    await waitFor(() => evalJS(`return (document.body.textContent||'').includes('编辑记录');`), 8000);
    await sleep(300);
    const editor = await evalJS(`
      const bars = [...document.querySelectorAll('.MuiAppBar-root')];
      const bar = bars[bars.length - 1];
      return {
        btns: [...bar.querySelectorAll('button')].map(b => ({ text: (b.textContent||'').trim(), aria: b.getAttribute('aria-label') })),
        hasText: (document.body.textContent||'').includes('导出xlsx') || (document.body.textContent||'').includes('导出PDF'),
      };
    `);
    rec('D5.2', 'D', '编辑页仍无导出按钮（只剩返回）', editor.btns.length === 1 && editor.btns[0].aria === '返回（自动保存）' && !editor.hasText, { buttons: 1, text: '仅返回' }, editor);
    await evalJS(`document.querySelector('[aria-label="返回（自动保存）"]').click(); return true;`);
    await waitFor(() => evalJS(`return !!document.querySelector('[aria-label="导入或导出"]');`), 8000);
    await sleep(500);

    const newDir = async (name) => {
      const d = path.join(dlRoot, name);
      fs.rmSync(d, { recursive: true, force: true });
      fs.mkdirSync(d, { recursive: true });
      await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: d, eventsEnabled: true });
      return d;
    };
    const waitFiles = async (dir, timeout = 180000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        const pending = fs.readdirSync(dir).filter((f) => f.endsWith('.crdownload'));
        const done = fs.readdirSync(dir).filter((f) => !f.endsWith('.crdownload'));
        if (done.length && !pending.length) {
          const a = done.map((f) => fs.statSync(path.join(dir, f)).size).join(',');
          await sleep(600);
          const b = fs.readdirSync(dir).filter((f) => !f.endsWith('.crdownload'));
          if (a === b.map((f) => fs.statSync(path.join(dir, f)).size).join(',')) return b;
        }
        await sleep(300);
      }
      throw new Error('等待下载超时');
    };
    const openExport = async (item) => {
      await evalJS(`document.querySelector('[aria-label="导入或导出"]').click(); return true;`);
      await waitSel('.MuiMenu-list', 8000);
      await evalJS(`[...document.querySelectorAll('.MuiMenuItem-root')].find(e => (e.textContent||'').trim() === ${JSON.stringify(item)}).click(); return true;`);
      await waitSel('.MuiDialog-root', 8000);
      await sleep(250);
    };
    const clickExportBtn = () =>
      evalJS(`[...document.querySelectorAll('.MuiDialog-root .MuiDialogActions-root button')].find(b => /^导出 \\d+ 个孔$/.test((b.textContent||'').trim())).click(); return true;`);

    // 2 孔合并 PDF
    let dir = await newDir('pdf2');
    await openExport('导出 PDF…');
    await clickExportBtn();
    let files = await waitFiles(dir);
    let info = files.map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size, pages: f.endsWith('.pdf') ? pdfPageCount(path.join(dir, f)) : null }));
    downloads.push({ batch: 'pdf-2孔', files: info });
    record_dl('D5.3', '2 条记录导出 PDF 文件名 开土记录_2孔_<当天>.pdf', info.length === 1 && info[0].name === `开土记录_2孔_${today}.pdf`, `开土记录_2孔_${today}.pdf`, info.map((f) => f.name));
    record_dl('D5.4', '2 孔合并 PDF 页数 = 2', info[0]?.pages?.pages === 2 && info[0]?.pages?.countFromTree === 2, 2, info[0]?.pages);

    // 单孔 PDF（取消 ZK5，只留 ZK4）
    dir = await newDir('pdf1');
    await openExport('导出 PDF…');
    await evalJS(`document.querySelectorAll('.MuiDialog-root .MuiListItemButton-root')[2].click(); return true;`);
    await sleep(250);
    await clickExportBtn();
    files = await waitFiles(dir);
    info = files.map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size, pages: pdfPageCount(path.join(dir, f)) }));
    downloads.push({ batch: 'pdf-1孔', files: info });
    record_dl('D5.5', '单孔 PDF 文件名 = <开土日期>_<孔号>.pdf', info.length === 1 && info[0].name === `${today}_ZK4.pdf`, `${today}_ZK4.pdf`, info.map((f) => f.name));
    record_dl('D5.6', '单孔 PDF 页数 = 1', info[0]?.pages?.pages === 1, 1, info[0]?.pages);

    // ---------- E. 边界风险（UI 侧证据）----------
    await seed([]);
    const e1 = await importFile('qa_e1_first_no_hole.xlsx', 'qa_import_e1.png');
    parsed.__ui_e1 = e1.snap;
    rec('E1.1', 'E', '首块无孔号：UI 可正常预览（不抛错）', !!e1.snap && e1.snap.stat.includes('识别到 1 个孔'), '识别到 1 个孔', e1.snap?.stat);
    rec('E1.2', 'E', '首块无孔号：UI 显示「孔号（空）」', e1.snap.items.some((x) => x.includes('孔号 （空）') || x.includes('孔号（空）')), '列表显示「孔号 （空）」', e1.snap.items);
    rec(
      'E1.3',
      'E',
      '首块无孔号：有提示（warning「未在工作表中找到“孔号”」）',
      e1.snap.alerts.some((a) => a.severity === 'Warning' && a.items.join(' ').includes('未在工作表中找到')),
      'Warning 含「未在工作表中找到“孔号”」',
      e1.snap.alerts,
    );
    const e1imp = await confirmImport();
    rec('E1.4', 'E', '首块无孔号：导入后 1 条空孔号记录 2 条土样', e1imp.n === 1 && e1imp.records[0]?.hole === '' && e1imp.records[0]?.n === 2, { n: 1, hole: '', samples: 2 }, e1imp);

    // e5/e6：孔号标签存在但值留空（A 列 / B 列）
    await seed([]);
    const e5 = await importFile('qa_e5_label_a_empty.xlsx', 'qa_import_e5.png');
    parsed.__ui_e5 = e5.snap;
    rec(
      'E5.1',
      'E',
      '「孔号」标签在 A 列且值留空：UI 报出该块解析失败（warning）',
      e5.snap.alerts.some((a) => a.severity === 'Warning' && a.items.join(' ').includes('解析失败')),
      'Warning 含「解析失败」',
      e5.snap.alerts,
    );
    await confirmImport();

    await seed([]);
    const e6 = await importFile('qa_e6_label_b_empty.xlsx', 'qa_import_e6.png');
    parsed.__ui_e6 = e6.snap;
    rec('E6.1', 'E', '「孔号」标签在 B 列且值留空：正常沿用并合并（对照 e5）', e6.snap.stat === '识别到 1 个孔（来自 2 份送样单），共 2 条土样', '识别到 1 个孔（来自 2 份送样单），共 2 条土样', e6.snap.stat);
    const e6imp = await confirmImport();
    rec('E6.2', 'E', 'e6 导入后 1 条记录 2 条土样', e6imp.n === 1 && e6imp.records[0]?.n === 2, { records: 1, samples: 2 }, e6imp);
  } finally {
    await sleep(200);
    try {
      if (edge && !edge.killed) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {}
    try {
      browser?.ws?.close();
      page?.ws?.close();
    } catch {}
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
      fs.rmSync(dlRoot, { recursive: true, force: true });
    } catch {}
  }
}

/** 下载类断言用独立 id 段，便于报告分组 */
function record_dl(id, name, pass, expected, actual) {
  rec(id, 'D', name, pass, expected, actual);
}

// ===========================================================================
// 主流程
// ===========================================================================
(async () => {
  console.log('=========== QA 第 3 轮：同孔合并 / 续页沿用 / 来源有误 ===========');
  partB();
  await partC();
  if (!NODE_ONLY) await partDE();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  const groups = {};
  for (const r of results) {
    groups[r.group] = groups[r.group] || { total: 0, passed: 0 };
    groups[r.group].total += 1;
    if (r.pass) groups[r.group].passed += 1;
  }
  const out = {
    generatedAt: new Date().toISOString(),
    previewBase: BASE,
    mainBundle: parsed.__mainBundle ?? null,
    nodeOnly: NODE_ONLY,
    total: results.length,
    passed,
    failed: failed.length,
    isPass: failed.length === 0,
    groups,
    parsedFixtures: Object.fromEntries(Object.entries(parsed).filter(([k]) => !k.startsWith('__'))),
    uiSnapshots: Object.fromEntries(Object.entries(parsed).filter(([k]) => k.startsWith('__ui_'))),
    downloads,
    results,
  };
  fs.writeFileSync(path.join(__dirname, 'qa_import_merge_results.json'), JSON.stringify(out, null, 2), 'utf8');

  console.log('\n================ 汇总 ================');
  for (const [g, v] of Object.entries(groups)) console.log(`  ${g}: ${v.passed}/${v.total}`);
  console.log(`总计：${passed} / ${results.length} 通过，${failed.length} 失败`);
  for (const f of failed) console.log(`  FAIL ${f.id} ${f.name} | 期望 ${JSON.stringify(f.expected)} | 实际 ${JSON.stringify(f.actual)}`);
  if (downloads.length) {
    console.log('\n下载清单：');
    for (const b of downloads) for (const f of b.files) console.log(`  [${b.batch}] ${f.name} ${f.size}B 页数=${f.pages?.pages}`);
  }
  console.log(`\nIS_PASS: ${failed.length === 0 ? 'YES' : 'NO'}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
})().catch((e) => {
  console.error('脚本异常：', e);
  process.exitCode = 1;
});
