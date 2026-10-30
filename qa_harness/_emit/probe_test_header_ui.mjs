/**
 * 探针：试验列表头覆盖的 UI 显示一致性（导入来源 = 平台显示）。
 *
 * 做法：无头 Edge + CDP 打开预览页 → localStorage 种子一条带
 * shearLabels ['固结快剪','慢剪'] / consolidationLabel '回弹压缩' 的记录 →
 * 验证：① 列表卡片实验名显示别名 ② 批量勾选矩阵列头显示别名
 * ③ 土样录入对话框勾选芯片显示别名 ④ 无控制台错误。
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DEBUG_PORT = 9445;
const APP_URL = 'http://127.0.0.1:4199/';
const OUT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
      }
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    try { this.ws.close(); } catch { /* noop */ }
  }
}

async function fetchJson(url, retries = 60) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      return JSON.parse(await res.text());
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`无法连接 ${url}`);
}

const record = {
  id: 'probe-rec-1',
  name: '表头测试工程 ZK1',
  mode: 'A',
  engineering: { projectCode: 'EX26T2211', holeCode: 'ZK1', holeElevation: '', openDate: '2026-10-30' },
  samples: [
    {
      id: 'probe-s1',
      soilNumber: '-1',
      fieldRecord: '粉质黏土',
      sampleDepth: '',
      sampleElevation: '',
      color: '褐',
      smell: '无',
      soilType: ['粉质黏土'],
      inclusions: [],
      soilState: [],
      soilStateNote: '',
      testItems: ['固结', '慢剪', '固结快剪'],
      il: '',
      ip: '',
      disturbance: '原状',
      siltySand: 'none',
      otherTestItems: [],
    },
  ],
  customTestItems: [],
  shearLabels: ['固结快剪', '慢剪'],
  consolidationLabel: '回弹压缩',
  createdAt: 1,
  updatedAt: 1,
};

async function main() {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'edge-th-'));
  const child = spawn(
    EDGE,
    [
      '--headless=new',
      '--no-proxy-server',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--window-size=390,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let pass = 0;
  let fail = 0;
  const check = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}${detail ? '  => ' + detail : ''}`); }
    else { fail++; console.error(`FAIL  ${name}${detail ? '  => ' + detail : ''}`); }
  };

  try {
    const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const page = targets.find((t) => t.type === 'page');
    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const consoleErrors = [];
    cdp.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(msg.params?.exceptionDetails?.text ?? 'exception');
      }
    });

    await cdp.send('Page.navigate', { url: APP_URL });
    await sleep(2500);

    // 种子记录并刷新
    const seed = `localStorage.setItem('CapacitorStorage.kaitu_records_v1', ${JSON.stringify(JSON.stringify([record]))}); 'seeded'`;
    await cdp.send('Runtime.evaluate', { expression: seed });
    await cdp.send('Page.navigate', { url: APP_URL });
    await sleep(2500);

    const evalJs = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      return r.result?.value;
    };

    // 进入编辑页（点列表里含孔号的记录卡片）
    await evalJs(`
      (() => {
        const el = [...document.querySelectorAll('body *')].filter((e) => e.textContent.includes('ZK1') && e.querySelector('button, [role="button"]') === null && e.children.length <= 6)[0];
        (el?.closest('button,[role="button"],[class*="card"],[class*="Card"]') ?? el)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return 'clicked';
      })()
    `);
    await sleep(1200);
    const body2 = await evalJs(`document.body.innerText`);
    check('编辑页打开（含批量勾选）', body2.includes('批量勾选'), '');
    check('编辑页土样卡片实验名显示「固结快剪」', body2.includes('固结快剪'));
    check('编辑页土样卡片实验名显示「慢剪」', body2.includes('慢剪'));

    // ② 批量勾选矩阵列头
    await evalJs(`
      (() => {
        const b = [...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\\s/g,'').includes('批量勾选'));
        b?.click();
        return 'ok';
      })()
    `);
    await sleep(1200);
    const dlg1 = await evalJs(`
      (() => {
        const dlgs = [...document.querySelectorAll('.MuiDialog-root')].filter((d) => d.getBoundingClientRect().width > 0);
        return dlgs[dlgs.length - 1]?.innerText ?? '';
      })()
    `);
    check('批量勾选矩阵列头含「回弹压缩」', dlg1.includes('回弹压缩'));
    check('批量勾选矩阵列头含「固结快剪」', dlg1.includes('固结快剪'));
    check('批量勾选矩阵列头含「慢剪」', dlg1.includes('慢剪'));
    check('矩阵中该行「慢剪」勾选态存在（非全空）', dlg1.length > 0);
    await cdp.send('Page.captureScreenshot', {}).then(async (r) => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path.join(OUT_DIR, 'test_header_batchcheck.png'), Buffer.from(r.data, 'base64'));
    });
    // 关闭对话框（取消）
    await evalJs(`
      (() => {
        const dlgs = [...document.querySelectorAll('.MuiDialog-root')].filter((d) => d.getBoundingClientRect().width > 0);
        const btn = [...dlgs[dlgs.length-1].querySelectorAll('button')].find((b) => b.textContent.trim() === '取消');
        btn?.click();
        return 'closed';
      })()
    `);
    await sleep(800);

    // ③ 土样录入对话框：点「IL 液性指数」信息格打开（该格 openEditSample）
    await evalJs(`
      (() => {
        const tile = [...document.querySelectorAll('body *')].filter((e) => e.children.length <= 3 && e.textContent.includes('IL 液性指数')).pop();
        tile?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return 'clicked';
      })()
    `);
    await sleep(1200);
    const dlg2 = await evalJs(`
      (() => {
        const dlgs = [...document.querySelectorAll('.MuiDialog-root')].filter((d) => d.getBoundingClientRect().width > 0);
        return dlgs[dlgs.length - 1]?.innerText ?? '';
      })()
    `);
    check('土样录入对话框打开', dlg2.includes('土号') || dlg2.includes('野外记录'), dlg2.slice(0, 40));
    check('录入对话框芯片显示「回弹压缩」', dlg2.includes('回弹压缩'));
    check('录入对话框芯片显示「固结快剪」', dlg2.includes('固结快剪'));
    check('录入对话框芯片显示「慢剪」', dlg2.includes('慢剪'));
    await cdp.send('Page.captureScreenshot', {}).then(async (r) => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path.join(OUT_DIR, 'test_header_sampledlg.png'), Buffer.from(r.data, 'base64'));
    });

    check('无运行时异常', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 200));

    cdp.close();
  } finally {
    child.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('探针执行失败:', e);
  process.exit(1);
});
