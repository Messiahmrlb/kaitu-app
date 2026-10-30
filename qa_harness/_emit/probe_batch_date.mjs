/**
 * 探针：批量修改开土日期 + 导出 PDF 日期覆盖。
 *
 * 流程：无头 Edge + CDP → 种子 2 条不同 openDate 记录 →
 * ① 批量操作进入选择模式，工具条在 320/360/390/430 宽度无横向溢出
 * ② 全选 → 改日期 → 应用 → localStorage 中两记录 openDate 统一更新 + snack 提示
 * ③ 导入/导出 → 导出 PDF… → 对话框含「开土日期（可选）」字段
 * ④ 无运行时异常。
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DEBUG_PORT = 9447;
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

const mkRecord = (id, hole, openDate) => ({
  id,
  name: `批量日期工程 ${hole}`,
  mode: 'A',
  engineering: { projectCode: 'EX26T2211', holeCode: hole, holeElevation: '', openDate },
  samples: [
    {
      id: `${id}-s1`,
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
      testItems: ['固结'],
      il: '',
      ip: '',
      disturbance: '原状',
      siltySand: 'none',
      otherTestItems: [],
    },
  ],
  customTestItems: [],
  createdAt: 1,
  updatedAt: 1,
});

async function main() {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'edge-bd-'));
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

    // 种子 2 条不同 openDate 的记录并刷新
    const records = [mkRecord('bd-1', 'ZK1', '2026-10-01'), mkRecord('bd-2', 'ZK2', '2026-10-02')];
    const seed = `localStorage.setItem('CapacitorStorage.kaitu_records_v1', ${JSON.stringify(JSON.stringify(records))}); 'seeded'`;
    await cdp.send('Runtime.evaluate', { expression: seed });
    await cdp.send('Page.navigate', { url: APP_URL });
    await sleep(2500);

    const evalJs = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      return r.result?.value;
    };

    const body1 = await evalJs('document.body.innerText');
    check('首页两条记录卡片显示（ZK1/ZK2）', body1.includes('ZK1') && body1.includes('ZK2'));

    // ① 进入选择模式
    await evalJs(`
      (() => {
        const b = [...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\\s/g,'') === '批量操作');
        b?.click();
        return 'ok';
      })()
    `);
    await sleep(800);

    // 320/360/390/430 宽度下工具条无横向溢出、按钮不出屏
    const WIDTHS = [320, 360, 390, 430];
    for (const w of WIDTHS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 2, mobile: true });
      await sleep(400);
      const m = await evalJs(`
        (() => {
          const doc = document.documentElement;
          const bar = [...document.querySelectorAll('body *')].find((e) => e.textContent.startsWith('已选') && e.querySelector('button'));
          if (!bar) return { found: false };
          const btns = [...bar.querySelectorAll('button')];
          const overflowDoc = doc.scrollWidth - doc.clientWidth;
          const maxRight = Math.max(...btns.map((b) => b.getBoundingClientRect().right));
          return { found: true, overflowDoc, maxRight, innerWidth: window.innerWidth, btnCount: btns.length };
        })()
      `);
      check(
        `${w}px 工具条渲染（6 按钮）`,
        m?.found && m.btnCount >= 5,
        JSON.stringify(m),
      );
      check(
        `${w}px 无横向溢出`,
        m?.found && m.overflowDoc <= 1,
        `scrollW-clientW=${m?.overflowDoc}`,
      );
      check(
        `${w}px 按钮不出屏`,
        m?.found && m.maxRight <= m.innerWidth + 1,
        `maxRight=${m?.maxRight} vs ${m?.innerWidth}`,
      );
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true });
    await sleep(400);

    // ② 全选 → 改日期 → 应用
    await evalJs(`
      (() => {
        const bar = [...document.querySelectorAll('body *')].find((e) => e.textContent.startsWith('已选') && e.querySelector('button'));
        const b = [...bar.querySelectorAll('button')].find((x) => x.textContent.trim() === '全选');
        b?.click();
        return 'ok';
      })()
    `);
    await sleep(400);
    await evalJs(`
      (() => {
        const bar = [...document.querySelectorAll('body *')].find((e) => e.textContent.startsWith('已选') && e.querySelector('button'));
        const b = [...bar.querySelectorAll('button')].find((x) => x.textContent.trim() === '改日期');
        b?.click();
        return 'ok';
      })()
    `);
    await sleep(800);
    const dlg1 = await evalJs(`
      (() => {
        const dlgs = [...document.querySelectorAll('.MuiDialog-root')].filter((d) => d.getBoundingClientRect().width > 0);
        return dlgs[dlgs.length - 1]?.innerText ?? '';
      })()
    `);
    check('批量改日期对话框打开', dlg1.includes('批量修改开土日期'), dlg1.slice(0, 30));
    check('对话框提示选中 2 份', dlg1.includes('2'));

    // React 受控 input：原生 setter 赋值
    await evalJs(`
      (() => {
        const input = [...document.querySelectorAll('.MuiDialog-root input[type="date"]')].pop();
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '2026-10-15');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return input?.value ?? 'no-input';
      })()
    `);
    await sleep(300);
    await evalJs(`
      (() => {
        const dlgs = [...document.querySelectorAll('.MuiDialog-root')].filter((d) => d.getBoundingClientRect().width > 0);
        const b = [...dlgs[dlgs.length - 1].querySelectorAll('button')].find((x) => x.textContent.trim() === '应用');
        b?.click();
        return 'applied';
      })()
    `);
    await sleep(1500);

    const stored = await evalJs(`JSON.parse(localStorage.getItem('CapacitorStorage.kaitu_records_v1') || '[]').map((r) => r.engineering.openDate)`);
    check('存储中两条记录 openDate 均改为 2026-10-15', Array.isArray(stored) && stored.length === 2 && stored.every((d) => d === '2026-10-15'), JSON.stringify(stored));
    const bodyAfter = await evalJs('document.body.innerText');
    check('snack 提示「已把 2 份记录的开土日期改为 2026-10-15」', bodyAfter.includes('已把 2 份记录的开土日期改为 2026-10-15'));
    check('应用后自动退出选择模式', !bodyAfter.includes('删除选中'));

    // ③ 导出对话框日期覆盖字段
    await evalJs(`
      (() => {
        const b = [...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\\s/g,'').includes('导入/导出'));
        b?.click();
        return 'ok';
      })()
    `);
    await sleep(800);
    await evalJs(`
      (() => {
        const mi = [...document.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent.includes('导出 PDF'));
        mi?.click();
        return 'ok';
      })()
    `);
    await sleep(1000);
    const dlg2 = await evalJs(`
      (() => {
        const dlgs = [...document.querySelectorAll('.MuiDialog-root')].filter((d) => d.getBoundingClientRect().width > 0);
        return dlgs[dlgs.length - 1]?.innerText ?? '';
      })()
    `);
    check('导出 PDF 对话框打开', dlg2.includes('导出') && dlg2.includes('ZK1'));
    check('PDF 模式含「开土日期（可选）」字段', dlg2.includes('开土日期（可选）'));
    check('字段 helperText 说明留空按各记录日期', dlg2.includes('留空'));

    await cdp.send('Page.captureScreenshot', {}).then(async (r) => {
      await writeFile(path.join(OUT_DIR, 'batch_date_export_dialog.png'), Buffer.from(r.data, 'base64'));
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
