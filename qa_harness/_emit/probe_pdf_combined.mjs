/**
 * 探针：PDF 导出「多孔合并同页」端到端（真实 DOM + html2canvas 渲染路径）。
 *
 * 流程：无头 Edge + CDP → 种子 2 条 A 模式记录（ZK1 3 样 / ZK2 2 样，同日期）→
 * ① 打开导出 PDF 对话框：合并开关存在、默认不勾选
 * ② 勾选「多孔合并同页」→ 导出 → 拦下离屏 pdf-page DOM
 * ③ 断言：只捕获 1 页；同一页表格内两孔之间有 1 个空白分隔行（行3）；
 *    土号新规则（2026-11-03）：孔首样带孔号 ZK1-1/ZK2-1，其余短编号 -2/-3/-R1；
 *    信息行开土日期为覆盖日期
 * ④ 无运行时异常。
 *
 * 运行：先起 preview（npx vite preview --port 4199），再 node qa_harness/_emit/probe_pdf_combined.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DEBUG_PORT = 9453;
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

const mkSample = (id, no) => ({
  id,
  soilNumber: no,
  fieldRecord: '粉质黏土',
  sampleDepth: '',
  sampleElevation: '',
  color: '褐',
  smell: '无',
  soilType: ['粉质黏土'],
  inclusions: [],
  soilState: [],
  soilStateNote: '',
  testItems: ['固结'],
  il: '',
  ip: '',
  disturbance: no === '扰1' ? '扰动' : '原状',
  siltySand: 'none',
  otherTestItems: [],
});

const mkRecord = (id, hole, samples) => ({
  id,
  name: `合并探针 ${hole}`,
  mode: 'A',
  engineering: { projectCode: 'EX26T2211', holeCode: hole, holeElevation: '', openDate: '2026-10-15' },
  samples,
  customTestItems: [],
  createdAt: 1,
  updatedAt: 1,
});

async function main() {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'edge-cb-'));
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
    await cdp.send('Runtime.evaluate', { expression: `localStorage.clear(); 'cleared'` });
    // 种子 2 条 A 模式记录：ZK1 样 -1/原2/空（3 条）+ ZK2 样 1/扰1（2 条）——同段同页拼表
    const records = [
      mkRecord('cb-1', 'ZK1', [mkSample('s1', '-1'), mkSample('s2', '原2'), mkSample('s3', '')]),
      mkRecord('cb-2', 'ZK2', [mkSample('s4', '1'), mkSample('s5', '扰1')]),
    ];
    const seed = `localStorage.setItem('CapacitorStorage.kaitu_records_v1', ${JSON.stringify(JSON.stringify(records))}); 'seeded'`;
    await cdp.send('Runtime.evaluate', { expression: seed });
    await cdp.send('Page.navigate', { url: APP_URL });
    await sleep(2500);

    const evalJs = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      return r.result?.value;
    };

    // 拦下 html2canvas 用的离屏页 DOM（正常流程会 removeChild 掉）
    await evalJs(`
      (() => {
        window.__pdfPages = [];
        const orig = document.body.removeChild.bind(document.body);
        document.body.removeChild = (el) => {
          if (el && el.classList && el.classList.contains('pdf-page')) { window.__pdfPages.push(el); return el; }
          return orig(el);
        };
        return 'patched';
      })()
    `);

    // ① 打开导出 PDF 对话框
    await evalJs(`[...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\\s/g,'').includes('导入/导出'))?.click(); 'ok'`);
    await sleep(800);
    await evalJs(`[...document.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent.includes('导出 PDF'))?.click(); 'ok'`);
    await sleep(1000);
    const dlg = await evalJs(`
      (() => {
        const dlgs = [...document.querySelectorAll('.MuiDialog-root')].filter((d) => d.getBoundingClientRect().width > 0);
        return dlgs[dlgs.length - 1]?.innerText ?? '';
      })()
    `);
    check('导出 PDF 对话框打开', dlg.includes('导出') && dlg.includes('ZK1'));
    check('PDF 对话框含合并开关文案「多孔合并同页（小孔拼表省纸）」', dlg.includes('多孔合并同页（小孔拼表省纸）'));
    check('PDF 对话框含 helperText「孔不拆页」', dlg.includes('孔不拆页'));

    const checked0 = await evalJs(
      `[...document.querySelectorAll('.MuiDialog-root input[aria-label="多孔合并同页"]')][0]?.checked ?? 'no-input'`,
    );
    check('合并开关默认不勾选（现状导出行为不变）', checked0 === false, String(checked0));

    // ② 勾选合并开关 → 导出
    await evalJs(`
      (() => {
        const input = [...document.querySelectorAll('.MuiDialog-root input[aria-label="多孔合并同页"]')][0];
        input?.click();
        return input ? String(input.checked) : 'no-input';
      })()
    `);
    await sleep(400);
    const checked1 = await evalJs(
      `[...document.querySelectorAll('.MuiDialog-root input[aria-label="多孔合并同页"]')][0]?.checked ?? 'no-input'`,
    );
    check('点击后开关变为勾选', checked1 === true, String(checked1));

    await evalJs(`
      (() => {
        const dlgs = [...document.querySelectorAll('.MuiDialog-root')].filter((d) => d.getBoundingClientRect().width > 0);
        const b = [...dlgs[dlgs.length - 1].querySelectorAll('button')].find((x) => /导出 \\d+ 个孔/.test(x.textContent));
        b?.click();
        return b ? 'clicked' : 'not-found';
      })()
    `);

    let ok = false;
    for (let i = 0; i < 60; i++) {
      const n = await evalJs(`(window.__pdfPages || []).length`);
      if (n > 0) { ok = true; break; }
      await sleep(500);
    }
    check('捕获到 PDF 页 DOM（合并导出真实渲染）', ok);

    if (ok) {
      const n = await evalJs(`(window.__pdfPages || []).length`);
      check('两孔拼入同一页：共捕获 1 页（3+2=5 行 + 1 分隔行装得下）', n === 1, String(n));

      const cellsText = await evalJs(`
        (() => {
          const p = window.__pdfPages[0];
          const tds = [...p.querySelectorAll('.pdf-td')].map((t) => t.innerText.replace(/\\n/g, ''));
          return JSON.stringify(tds);
        })()
      `);
      const tds = JSON.parse(cellsText);
      // 土号列是每行第 1 格：行内 39 格一组，土号在索引 0, 39, 78, ...
      // （23 行固定渲染，未填行本来就是空 td；行3 为孔间空白分隔行）
      const soilNums = tds.filter((_, i) => i % 39 === 0);
      // 新土号规则：每孔首样带孔号前缀，其余短编号（-2/-3/-R1）
      check('页内前 6 行土号 = ZK1-1,-2,-3,空,ZK2-1,-R1（行3 为孔间分隔行）', JSON.stringify(soilNums.slice(0, 6)) === JSON.stringify(['ZK1-1', '-2', '-3', '', 'ZK2-1', '-R1']), JSON.stringify(soilNums.slice(0, 6)));
      check('行3 恰为孔间空白分隔行（两孔之间空一行）', soilNums[3] === '', soilNums[3]);
      check('第 7 行起留空（两孔拼表后其余为空行）', soilNums.slice(6).every((v) => v === ''), JSON.stringify(soilNums.slice(6)));
      check('空土号回退 -3（孔内序号，非首样短编号）', soilNums.includes('-3'));
      check('扰1 → -R1（非首样短编号：R 前缀，不带孔号）', soilNums.includes('-R1'));

      const infoText = await evalJs(`
        (() => {
          const p = window.__pdfPages[0];
          return JSON.stringify([...p.querySelectorAll('.pdf-txt')].map((t) => t.innerText.replace(/\\n/g, '')));
        })()
      `);
      const txts = JSON.parse(infoText);
      console.log('  [dbg] pdf-txt 文本:', JSON.stringify(txts));
      // 对话框日期覆盖默认填当天（现状行为）：信息行日期应为「今天」而非种子记录的 10-15
      const pad = (n) => String(n).padStart(2, '0');
      const now = new Date();
      const today = { y: String(now.getFullYear()), m: pad(now.getMonth() + 1), d: pad(now.getDate()) };
      check('信息行开土日期 = 对话框覆盖日期（默认当天年份）', txts.some((t) => t === `开土日期${today.y}`), txts.filter((t) => t.includes('开土日期')).join('|'));
      check('信息行月份/日为覆盖日期（月+日各一格）', txts.includes(today.m) && txts.includes(today.d), `${today.m}/${today.d}`);
      check('页脚「共 1 页」', txts.includes('1') && txts.some((t) => /共/.test(t)) === true && txts.includes('页'));

      // 截图留证
      await evalJs(`
        (() => {
          const p = window.__pdfPages[0];
          p.style.left = '0px'; p.style.top = '0px'; p.style.zIndex = '99999';
          return 'ok';
        })()
      `);
      await sleep(500);
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: 1587, height: 760, scale: 0.6 },
        captureBeyondViewport: true,
      });
      await writeFileSync(path.join(OUT_DIR, 'pdf_combined_probe.png'), Buffer.from(shot.data, 'base64'));
      console.log('截图已保存: qa_harness/_emit/pdf_combined_probe.png');
    }

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
