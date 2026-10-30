/**
 * 端到端探针：导出/导入交互改造（真实浏览器 CDP）
 *
 * 覆盖：
 *  1) 首页「导入 / 导出」下拉菜单三项文案
 *  2) 勾选式导出对话框：默认全选、半选、全选/全不选、按钮数字联动
 *  3) 单孔 PDF 下载文件名 = 日期_孔号.pdf
 *  4) 多孔合并 PDF：只下载 1 个文件、文件名 = 开土记录_N孔_日期.pdf、页数 = 各记录页数之和
 *  5) 批量 xlsx：每孔一个文件
 *  6) 列表卡片/编辑页不再有分散导出入口
 *  7) 320/360/390/430 AppBar 无横向溢出
 *  8) 多工作表导入拆成多条记录；同孔多表合并；续页来源错误红色区块
 *
 * 前置：
 *   npx vite --port 4199 --strictPort
 *   msedge --headless=new --remote-debugging-port=9333 --user-data-dir=... about:blank
 * 运行：
 *   node qa_harness/_emit/probe_export_menu.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const CDP = 'http://127.0.0.1:9333';
const APP = 'http://127.0.0.1:4199/';
const ROOT = 'C:/Users/Dell/WorkBuddy/2026-09-10-09-55-25/kaitu-app';
const DL = path.join(ROOT, 'qa_harness/_emit/downloads');
const FIX_MULTI = path.join(ROOT, 'qa_harness/_emit/fixtures/multi-sheet-delivery.xlsx');
const FIX_DUP = path.join(ROOT, 'qa_harness/_emit/fixtures/dup-hole-delivery.xlsx');
const FIX_SAME_HOLE = path.join(ROOT, 'qa_harness/_emit/fixtures/same-hole-2-sheets.xlsx');
const FIX_RESTART = path.join(ROOT, 'qa_harness/_emit/fixtures/page2-no-hole-restart.xlsx');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- CDP 连接 ----------
const list = await (await fetch(`${CDP}/json/list`)).json();
// Edge 下载完成后可能自动打开 edge://downloads-hub/，必须挑应用页面，保证可重复运行
const target =
  list.find((x) => x.type === 'page' && x.url.startsWith(APP)) ||
  list.find((x) => x.type === 'page' && !x.url.startsWith('edge://')) ||
  list.find((x) => x.type === 'page');
if (!target) {
  console.error('未找到可调试页面，请先启动无头 Edge（--remote-debugging-port=9333）');
  process.exit(1);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const events = [];
await new Promise((resolve) => ws.addEventListener('open', resolve));
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  } else if (m.method) {
    events.push(m);
  }
});
const send = (method, params = {}) => {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
};
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
};
const waitFor = async (expr, timeout = 8000, step = 200) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await ev(expr)) return true;
    await sleep(step);
  }
  return false;
};
const clickText = async (selector, text) => {
  const expr = `(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find(x => (x.textContent || '').replace(/\\s+/g, '').includes(${JSON.stringify(
        text.replace(/\s+/g, ''),
      )}));
    if (!el || el.disabled) return 'NO';
    el.click(); return 'OK';
  })()`;
  return ev(expr);
};
const clearDownloads = () => {
  if (!fs.existsSync(DL)) fs.mkdirSync(DL, { recursive: true });
  for (const f of fs.readdirSync(DL)) fs.rmSync(path.join(DL, f), { force: true, recursive: true });
};
const downloads = () =>
  fs.existsSync(DL)
    ? fs
        .readdirSync(DL)
        .filter((f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp'))
        .map((f) => ({ name: f, size: fs.statSync(path.join(DL, f)).size }))
    : [];
const waitDownloads = async (predicate, timeout = 90000, step = 300) => {
  const end = Date.now() + timeout;
  let last = '';
  while (Date.now() < end) {
    const files = downloads();
    const sig = files.map((f) => `${f.name}:${f.size}`).join('|');
    if (files.length && sig === last && predicate(files)) return files;
    last = sig;
    await sleep(step);
  }
  throw new Error('等待下载超时，当前：' + JSON.stringify(downloads()));
};

// ---------- 结果收集 ----------
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ok ' : 'FAIL '} ${name}${detail !== undefined ? '  => ' + detail : ''}`);
};

// ---------- 初始化 ----------
await send('Runtime.enable');
await send('Page.enable');
await send('DOM.enable');
try {
  await send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DL,
    eventsEnabled: true,
  });
} catch {
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
}
clearDownloads();

await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await send('Page.navigate', { url: APP });
await sleep(2800);

const sample = (n, testItems = ['物性']) => ({
  id: `s${n}`,
  soilNumber: `-${n}`,
  fieldRecord: '粉质黏土',
  sampleDepth: '1.0~1.5',
  sampleElevation: '',
  color: '褐',
  smell: '无',
  soilType: ['粉质黏土'],
  inclusions: [],
  soilState: ['可塑'],
  soilStateNote: '',
  testItems,
  il: '',
  ip: '',
  disturbance: '原状',
  siltySand: 'none',
  otherTestItems: [],
});
const mkRecord = (id, hole, date, sampleCount) => ({
  id,
  name: `${hole} 记录`,
  mode: 'A',
  engineering: { projectCode: 'P1', holeCode: hole, holeElevation: '5.2', openDate: date },
  samples: Array.from({ length: sampleCount }, (_, i) => sample(i + 1)),
  customTestItems: [],
  createdAt: 1,
  updatedAt: 1,
});
const RECORDS = [
  mkRecord('r1', 'ZK1', '2026-10-26', 2),
  mkRecord('r2', 'ZK2', '2026-10-27', 1),
  mkRecord('r3', 'ZK3', '', 1),
];
const STORAGE_KEY = 'CapacitorStorage.kaitu_records_v1';

const seedRecords = async (records) => {
  await ev(`(() => {
    localStorage.clear();
    localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(records))});
    location.reload();
    return 'OK';
  })()`);
  await sleep(2600);
};

// ---------- 1. 菜单 ----------
await seedRecords(RECORDS);
const hasBtn = await waitFor(`!!document.querySelector('button[aria-label="导入或导出"]')`, 10000);
check('首页存在「导入 / 导出」下拉按钮', hasBtn);

await ev(`document.querySelector('button[aria-label="导入或导出"]').click()`);
await sleep(500);
const menuText = await ev(`document.querySelector('.MuiMenu-root')?.innerText || ''`);
const menuOk =
  menuText.includes('导入送样单') &&
  menuText.includes('导出 PDF') &&
  menuText.includes('导出电子表格');
check(
  '下拉菜单三项文案正确',
  menuOk,
  menuText.replace(/\n+/g, ' | '),
);

// ---------- 2. 导出对话框勾选逻辑 ----------
await clickText('.MuiMenuItem-root', '导出 PDF');
await waitFor(`!!document.querySelector('.MuiDialog-root')`);
await sleep(400);
const dialogText = () =>
  ev(`document.querySelector('.MuiDialog-root')?.innerText || ''`);
const dialogState = () =>
  ev(`(() => {
    const d = document.querySelector('.MuiDialog-root');
    if (!d) return null;
    return {
      text: d.innerText.replace(/\\n+/g, ' | '),
      buttons: [...d.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), disabled: b.disabled })),
      checks: [...d.querySelectorAll('input[type=checkbox]')].map(i => ({ label: i.getAttribute('aria-label'), checked: i.checked, indeterminate: i.indeterminate })),
    };
  })()`);

let st = await dialogState();
check(
  'PDF 对话框标题与默认全选',
  st?.text.includes('导出 PDF') &&
    st?.text.includes('已选 3 / 共 3 个孔') &&
    st?.buttons.some((b) => b.text === '导出 3 个孔' && !b.disabled),
  st?.text.slice(0, 160),
);
check(
  '对话框提示「多个孔会合并为一个 PDF」',
  st?.text.includes('多个孔会合并为一个 PDF') && st?.text.includes('日期_孔号.pdf'),
);
try {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, 'qa_harness/_emit/export_dialog_390.png'), Buffer.from(shot.data, 'base64'));
} catch {}

// 取消单个孔
await ev(`document.querySelector('.MuiDialog-root input[aria-label="选择孔号 ZK2"]').click()`);
await sleep(350);
st = await dialogState();
check(
  '取消单个孔后计数与按钮联动（3 → 2）',
  st?.text.includes('已选 2 / 共 3 个孔') && st?.buttons.some((b) => b.text === '导出 2 个孔'),
  st?.text.match(/已选[^|]+/)?.[0],
);

// 半选状态下点全选行 → 全选
await ev(`document.querySelector('.MuiDialog-root input[aria-label="全选所有孔"]').click()`);
await sleep(350);
st = await dialogState();
const master = st?.checks.find((c) => c.label === '全选所有孔');
check(
  '半选 → 点全选行 → 全选 3 个',
  st?.text.includes('已选 3 / 共 3 个孔') && master?.checked === true && master?.indeterminate === false,
  master,
);

// 全选 → 再点 → 全不选
await ev(`document.querySelector('.MuiDialog-root input[aria-label="全选所有孔"]').click()`);
await sleep(350);
st = await dialogState();
check(
  '全选 → 再点 → 全不选且导出按钮禁用',
  st?.text.includes('已选 0 / 共 3 个孔') &&
    st?.buttons.some((b) => b.text === '导出 0 个孔' && b.disabled === true),
  st?.text.match(/已选[^|]+/)?.[0],
);
// 再点改回全选
await ev(`document.querySelector('.MuiDialog-root input[aria-label="全选所有孔"]').click()`);
await sleep(300);

// ---------- 3. 单孔 PDF ----------
await ev(`document.querySelector('.MuiDialog-root input[aria-label="选择孔号 ZK2"]').click()`);
await sleep(200);
await ev(`document.querySelector('.MuiDialog-root input[aria-label="选择孔号 ZK3"]').click()`);
await sleep(350);
st = await dialogState();
check('筛选到只选中 1 个孔', st?.text.includes('已选 1 / 共 3 个孔'), st?.text.match(/已选[^|]+/)?.[0]);

clearDownloads();
await clickText('.MuiDialog-root button', '导出 1 个孔');
const singleFiles = await waitDownloads((f) => f.length >= 1, 90000);
const singleName = singleFiles[0]?.name;
check(
  '单孔 PDF 文件名 = 日期_孔号.pdf',
  singleName === '2026-10-26_ZK1.pdf',
  JSON.stringify(singleFiles),
);
check('单孔导出后对话框关闭', !(await ev(`!!document.querySelector('.MuiDialog-root')`)));

// ---------- 4. 多孔合并 PDF ----------
await ev(`document.querySelector('button[aria-label="导入或导出"]').click()`);
await sleep(400);
await clickText('.MuiMenuItem-root', '导出 PDF');
await waitFor(`!!document.querySelector('.MuiDialog-root')`);
await sleep(400);
st = await dialogState();
check('再次打开对话框恢复默认全选', st?.text.includes('已选 3 / 共 3 个孔'));

clearDownloads();
await clickText('.MuiDialog-root button', '导出 3 个孔');
const mergedFiles = await waitDownloads((f) => f.length >= 1, 120000);
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const expectMerged = `开土记录_3孔_${today}.pdf`;
const mergedName = mergedFiles[0]?.name;
check(
  '多孔 PDF 只下载 1 个文件',
  mergedFiles.length === 1,
  JSON.stringify(mergedFiles),
);
check('多孔 PDF 文件名 = 开土记录_3孔_当天日期.pdf', mergedName === expectMerged, mergedName);

// 页数：3 条记录各 1 页（ZK1 2 条土样、ZK2/ZK3 各 1 条，均未超过 23 行）→ 3 页
let pageCount = -1;
try {
  const buf = fs.readFileSync(path.join(DL, mergedName)).toString('latin1');
  pageCount = (buf.match(/\/Type\s*\/Page(?![s])/g) || []).length;
} catch (e) {
  pageCount = -1;
}
check('合并 PDF 页数 = 3（记录顺序接续，无多余空白页）', pageCount === 3, `pages=${pageCount}`);

// ---------- 5. 批量 xlsx ----------
await ev(`document.querySelector('button[aria-label="导入或导出"]').click()`);
await sleep(400);
await clickText('.MuiMenuItem-root', '导出电子表格');
await waitFor(`!!document.querySelector('.MuiDialog-root')`);
await sleep(350);
st = await dialogState();
check(
  'xlsx 对话框提示每孔一个文件',
  st?.text.includes('每个孔生成一个独立文件') && st?.text.includes('导出 3 个孔'),
  st?.text.slice(0, 160),
);
clearDownloads();
await clickText('.MuiDialog-root button', '导出 3 个孔');
const xlsxFiles = await waitDownloads((f) => f.length >= 3, 120000);
check('批量 xlsx 下载 3 个文件（每孔一个）', xlsxFiles.length === 3, JSON.stringify(xlsxFiles.map((f) => f.name)));
check(
  'xlsx 文件名按孔区分',
  ['P1_ZK1_开土记录表.xlsx', 'P1_ZK2_开土记录表.xlsx', 'P1_ZK3_开土记录表.xlsx'].every((n) =>
    xlsxFiles.some((f) => f.name === n),
  ),
  xlsxFiles.map((f) => f.name).join(', '),
);

// ---------- 6. 分散入口已移除 ----------
const scattered = await ev(`(() => ({
  listIcons: document.querySelectorAll('[aria-label="导出xlsx"], [aria-label="导出pdf"]').length,
  exportButtons: [...document.querySelectorAll('button')].filter(b => /导出\\s*(xlsx|PDF|pdf)/.test(b.textContent || '')).length,
}))()`);
check('列表卡片无导出图标按钮', scattered.listIcons === 0, scattered);

// 进入编辑页
await ev(`document.querySelector('.MuiCard-root')?.click()`);
await waitFor(`document.body.innerText.includes('编辑记录')`, 6000);
await sleep(600);
const editor = await ev(`(() => ({
  title: document.querySelector('.MuiAppBar-root')?.innerText || '',
  exportButtons: [...document.querySelectorAll('button')].filter(b => /导出\\s*(xlsx|PDF|pdf)/.test(b.textContent || '')).length,
  hasBack: !!document.querySelector('button[aria-label="返回（自动保存）"]'),
}))()`);
check(
  '编辑页 AppBar 仅返回箭头 + 「编辑记录」，无导出按钮',
  editor.hasBack && editor.title.trim() === '编辑记录' && editor.exportButtons === 0,
  editor,
);
await ev(`document.querySelector('button[aria-label="返回（自动保存）"]')?.click()`);
await waitFor(`!!document.querySelector('button[aria-label="导入或导出"]')`, 6000);
await sleep(500);

// ---------- 7. 窄屏无横向溢出 ----------
const widthRows = [];
for (const width of [320, 360, 390, 430]) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(400);
  const row = await ev(`(() => {
    const w = window.innerWidth;
    const buttons = [...document.querySelectorAll('button')]
      .filter(b => b.getBoundingClientRect().width > 0)
      .map(b => ({ label: b.getAttribute('aria-label') || b.textContent.trim(), right: Math.round(b.getBoundingClientRect().right) }));
    return {
      width: w,
      innerWidth: w,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      overflowButtons: buttons.filter(b => b.right > w + 0.5),
      toolbar: document.querySelector('.MuiToolbar-root')?.innerText.replace(/\\n+/g, '|') || '',
    };
  })()`);
  widthRows.push(row);
  check(
    `${width}px 无横向滚动`,
    row.scrollWidth === row.innerWidth && row.overflowButtons.length === 0,
    `scrollWidth=${row.scrollWidth}, innerWidth=${row.innerWidth}, overflow=${JSON.stringify(row.overflowButtons)}`,
  );
}

// 恢复到 390
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await sleep(300);

// ---------- 8. 多工作表导入 ----------
await seedRecords([]);
await ev(`document.querySelector('button[aria-label="导入或导出"]').click()`);
await sleep(400);
await clickText('.MuiMenuItem-root', '导入送样单');
await waitFor(`!!document.querySelector('.MuiDialog-root')`);
await sleep(400);
const fileInput = await send('Runtime.evaluate', {
  expression: `document.querySelector('.MuiDialog-root input[type=file]')`,
});
await send('DOM.setFileInputFiles', { files: [FIX_MULTI], objectId: fileInput.result.objectId });
const multiOk = await waitFor(
  `(document.querySelector('.MuiDialog-root')?.innerText || '').includes('识别到 3 个孔（来自 3 份送样单）')`,
  30000,
  400,
);
const multiText = await dialogText();
check(
  '3 个工作表 → 识别到 3 个孔（来自 3 份送样单）',
  multiOk && /孔号 ZK1/.test(multiText) && /孔号 ZK2/.test(multiText) && /孔号 ZK3/.test(multiText),
  multiText.slice(0, 260),
);
await clickText('.MuiDialog-root button', '确认导入');
await sleep(2000);
const imported = await ev(`(() => {
  const raw = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
  if (!raw) return [];
  return JSON.parse(raw).map(r => ({ hole: r.engineering?.holeCode, n: r.samples?.length, sheet: r.name }));
})()`);
check(
  '导入后本地存 3 条独立记录（每表一个孔）',
  Array.isArray(imported) &&
    imported.length === 3 &&
    ['ZK1', 'ZK2', 'ZK3'].every((h) => imported.some((r) => r.hole === h)),
  JSON.stringify(imported),
);

// 打开「导入送样单」并选择指定文件（每次先清空存档，避免旧记录干扰）
async function openImportPreview(file) {
  await seedRecords([]);
  await ev(`document.querySelector('button[aria-label="导入或导出"]').click()`);
  await sleep(400);
  await clickText('.MuiMenuItem-root', '导入送样单');
  await waitFor(`!!document.querySelector('.MuiDialog-root')`);
  await sleep(400);
  const fi = await send('Runtime.evaluate', {
    expression: `document.querySelector('.MuiDialog-root input[type=file]')`,
  });
  await send('DOM.setFileInputFiles', { files: [file], objectId: fi.result.objectId });
}

// ---------- 9a. 同孔两工作表 → 合并为 1 条记录 ----------
await openImportPreview(FIX_SAME_HOLE);
const sameOk = await waitFor(
  `(document.querySelector('.MuiDialog-root')?.innerText || '').includes('识别到 1 个孔（来自 2 份送样单）')`,
  30000,
  400,
);
const sameText = await dialogText();
check(
  '同孔两表 → 1 个孔（来自 2 份送样单）、共 4 条土样',
  sameOk && sameText.includes('共 4 条土样'),
  (sameText.match(/识别到[^|]+/) || ['(未找到)'])[0],
);
check(
  '同孔两表 → 显示「已合并 2 张送样单」与合并说明',
  sameText.includes('已合并 2 张送样单') &&
    sameText.includes('孔号 ZK1-1 的 2 份送样单已合并为 1 条记录'),
  sameText.slice(0, 220),
);
try {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(
    path.join(ROOT, 'qa_harness/_emit/import_same_hole_merged_390.png'),
    Buffer.from(shot.data, 'base64'),
  );
} catch {}

await clickText('.MuiDialog-root button', '确认导入');
await sleep(2000);
const sameImported = await ev(`(() => {
  const raw = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
  if (!raw) return [];
  return JSON.parse(raw).map(r => ({
    hole: r.engineering?.holeCode,
    n: r.samples?.length,
    soils: (r.samples || []).map(s => s.soilNumber),
  }));
})()`);
check(
  '同孔两表导入后：1 条记录、4 条土样、土号顺序连续',
  Array.isArray(sameImported) &&
    sameImported.length === 1 &&
    sameImported[0].hole === 'ZK1-1' &&
    sameImported[0].n === 4 &&
    sameImported[0].soils.join(',') === 'ZK1-1-01,ZK1-1-02,ZK1-1-03,ZK1-1-04',
  JSON.stringify(sameImported),
);

// ---------- 9b. 续页无孔号且土号从 1 重开 → 红色来源错误 ----------
await openImportPreview(FIX_RESTART);
const restartOk = await waitFor(
  `(document.querySelector('.MuiDialog-root')?.innerText || '').includes('疑似送样单来源有误')`,
  30000,
  400,
);
const restartText = await dialogText();
const restartRed = await ev(
  `!!document.querySelector('.MuiDialog-root .MuiAlert-standardError')`,
);
check(
  '续页无孔号 → 沿用上一孔并合并为 1 条 4 条土样',
  restartText.includes('识别到 1 个孔（来自 2 份送样单），共 4 条土样') &&
    restartText.includes('已合并 2 张送样单') &&
    restartText.includes('孔号 ZK2-1 的 2 份送样单已合并为 1 条记录'),
  (restartText.match(/识别到[^|]+/) || ['(未找到)'])[0],
);
check(
  '续页土号重开 → 红色来源错误区块可见',
  restartOk && restartRed && restartText.includes('疑似送样单来源有误'),
  restartText.slice(0, 220),
);
check(
  '错误文案含具体工作表、土号与「已按沿用「ZK2-1」合并」',
  restartText.includes('未写孔号、土号又从 ZK2-1-01 重新开始') &&
    restartText.includes('已按沿用「ZK2-1」合并'),
  (restartText.match(/工作表「[^」]+」[\s\S]*?请核对该表是否属于本孔。/) || ['(未找到)'])[0],
);
try {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(
    path.join(ROOT, 'qa_harness/_emit/import_page2_error_390.png'),
    Buffer.from(shot.data, 'base64'),
  );
} catch {}

// ---------- 9c. 旧的「重复孔号」文件现在合并，不再提示独立记录 ----------
await openImportPreview(FIX_DUP);
const dupOk = await waitFor(
  `(document.querySelector('.MuiDialog-root')?.innerText || '').includes('识别到 1 个孔（来自 2 份送样单）')`,
  30000,
  400,
);
const dupText = await dialogText();
check(
  '重复孔号文件 → 合并为 1 个孔，旧 warning 不再出现',
  dupOk && dupText.includes('已合并 2 张送样单') && !dupText.includes('发现重复孔号'),
  (dupText.match(/识别到[^|]+/) || ['(未找到)'])[0],
);

// ---------- 10. 合并 PDF 跨页续排（>23 行记录） ----------
// ZK9 有 25 条土样 → 2 页；ZK10 有 1 条 → 1 页；合并后应为 3 页，验证
// 「记录内分页 + 记录间直接接续」不会丢页/多插空白页。
await seedRecords([mkRecord('r9', 'ZK9', '2026-10-28', 25), mkRecord('r10', 'ZK10', '2026-10-29', 1)]);
await ev(`document.querySelector('button[aria-label="导入或导出"]').click()`);
await sleep(400);
await clickText('.MuiMenuItem-root', '导出 PDF');
await waitFor(`!!document.querySelector('.MuiDialog-root')`);
await sleep(350);
st = await dialogState();
check('跨页用例：2 条记录默认全选', st?.text.includes('已选 2 / 共 2 个孔'), st?.text.match(/已选[^|]+/)?.[0]);
clearDownloads();
await clickText('.MuiDialog-root button', '导出 2 个孔');
const crossFiles = await waitDownloads((f) => f.length >= 1, 180000);
const crossName = crossFiles[0]?.name;
let crossPages = -1;
try {
  const buf = fs.readFileSync(path.join(DL, crossName)).toString('latin1');
  crossPages = (buf.match(/\/Type\s*\/Page(?![s])/g) || []).length;
} catch {}
check(
  '合并文件名 = 开土记录_2孔_日期.pdf',
  crossName === `开土记录_2孔_${today}.pdf`,
  crossName,
);
check(
  '合并页数 = 2（25 条土样）+ 1（1 条土样）= 3 页',
  crossPages === 3,
  `pages=${crossPages}`,
);

// ---------- 汇总 ----------
const failed = results.filter((r) => !r.pass);
console.log('\n════════ 汇总 ════════');
console.log(`共 ${results.length} 项断言，通过 ${results.length - failed.length}，失败 ${failed.length}`);
for (const f of failed) console.error('FAIL:', f.name, '=>', f.detail);
console.log('\n窗口宽度实测：');
for (const r of widthRows) {
  console.log(
    `  ${r.width}px  scrollWidth=${r.scrollWidth}  innerWidth=${r.innerWidth}  overflow=${JSON.stringify(
      r.overflowButtons,
    )}  toolbar=${r.toolbar}`,
  );
}
console.log('\n下载文件：');
console.log('  单孔 PDF :', singleFiles.map((f) => f.name).join(', '));
console.log('  合并 PDF :', mergedFiles.map((f) => `${f.name} (${f.size} B, pages=${pageCount})`).join(', '));
console.log('  批量 xlsx:', xlsxFiles.map((f) => f.name).join(', '));
console.log('  跨页合并 :', crossFiles.map((f) => `${f.name} (pages=${crossPages})`).join(', '));

fs.writeFileSync(
  path.join(ROOT, 'qa_harness/_emit/probe_export_menu_result.json'),
  JSON.stringify({ results, widthRows, singleFiles, mergedFiles, xlsxFiles, pageCount, crossFiles, crossPages }, null, 2),
);

process.exit(failed.length === 0 ? 0 : 1);
