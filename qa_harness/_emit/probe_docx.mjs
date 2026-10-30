/**
 * 探针：导出 Word（docx）端到端。
 *
 * 流程：无头 Edge + CDP → 种子 1 条记录（土号 1 / R1）→
 * ① 「导入 / 导出」菜单含「导出 Word…」项（PDF / Word / 电子表格 三项）
 * ② 点「导出 Word…」→ 对话框标题「导出 Word」、提示可在 Word/WPS 编辑、
 *    统一开土日期默认当天
 * ③ 设下载目录 → 点「导出 1 个孔」→ 轮询下载到 `<日期>_ZK1.docx` →
 *    fflate 解包验证 document.xml：工程编号 / 孔号 / -R1 / A3 页面 / 分页符
 * ④ 无运行时异常。
 *
 * 运行前置：npx vite preview --port 4201（后台）
 * 启动：node qa_harness/_emit/probe_docx.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DEBUG_PORT = 9449;
const APP_URL = 'http://127.0.0.1:4201/';

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
  name: `Word探针 ${hole}`,
  mode: 'A',
  engineering: { projectCode: 'EX26T2211', holeCode: hole, holeElevation: '12.5', openDate },
  samples: [
    {
      id: `${id}-s1`,
      soilNumber: '1',
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
    {
      id: `${id}-s2`,
      soilNumber: 'R1',
      fieldRecord: '扰动样',
      sampleDepth: '',
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
      disturbance: '扰动',
      siltySand: 'none',
      otherTestItems: [],
    },
  ],
  customTestItems: [],
  createdAt: 1,
  updatedAt: 1,
});

async function main() {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'edge-docx-'));
  const dlDir = await mkdtemp(path.join(os.tmpdir(), 'dl-docx-'));
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

    const records = [mkRecord('dx-1', 'ZK1', '2026-10-30')];
    const seed = `localStorage.setItem('CapacitorStorage.kaitu_records_v1', ${JSON.stringify(JSON.stringify(records))}); 'seeded'`;
    await cdp.send('Runtime.evaluate', { expression: seed });
    await cdp.send('Page.navigate', { url: APP_URL });
    await sleep(2500);

    const evalJs = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      return r.result?.value;
    };

    // ① 导入/导出菜单
    await evalJs(`
      (() => {
        const b = document.querySelector('button[aria-label="导入或导出"]');
        b?.click();
        return 'ok';
      })()
    `);
    await sleep(600);
    const menuText = await evalJs(
      `[...document.querySelectorAll('.MuiMenu-root')].filter((m) => m.getBoundingClientRect().width > 0).pop()?.innerText ?? ''`,
    );
    check('菜单含「导出 Word…」', menuText.includes('导出 Word…'), menuText.replace(/\n/g, '|'));
    check('菜单仍含「导出 PDF…」', menuText.includes('导出 PDF…'));
    check('菜单仍含「导出电子表格…」', menuText.includes('导出电子表格…'));

    // ② 打开 Word 导出对话框
    await evalJs(`
      (() => {
        const items = [...document.querySelectorAll('.MuiMenu-root li')].filter((m) => m.getBoundingClientRect().width > 0);
        const item = items.find((x) => x.textContent.includes('导出 Word'));
        item?.click();
        return 'ok';
      })()
    `);
    await sleep(800);
    const dlg = await evalJs(`
      (() => {
        const dlgs = [...document.querySelectorAll('.MuiDialog-root')].filter((d) => d.getBoundingClientRect().width > 0);
        return dlgs[dlgs.length - 1]?.innerText ?? '';
      })()
    `);
    check('对话框标题「导出 Word」', dlg.includes('导出 Word'), dlg.slice(0, 40));
    check('提示可在 Word/WPS 编辑', dlg.includes('Word/WPS'), '');
    check('勾选 1/1 孔', dlg.includes('已选 1'), '');
    const today = await evalJs(
      `(() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })()`,
    );
    const dateVal = await evalJs(
      `[...document.querySelectorAll('.MuiDialog-root input[type="date"]')].pop()?.value ?? ''`,
    );
    check(`统一开土日期默认当天（${today}）`, dateVal === today, `value=${dateVal}`);

    // ③ 允许下载到临时目录 → 点导出
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir });
    await evalJs(`
      (() => {
        const dlgs = [...document.querySelectorAll('.MuiDialog-root')].filter((d) => d.getBoundingClientRect().width > 0);
        const dlg = dlgs[dlgs.length - 1];
        const btn = [...dlg.querySelectorAll('button')].find((b) => b.textContent.includes('导出 1 个孔'));
        btn?.click();
        return btn ? 'clicked' : 'not-found';
      })()
    `);

    const expectName = `${today}_ZK1.docx`;
    let dlPath = '';
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      const files = existsSync(dlDir) ? await readdir(dlDir) : [];
      const hit = files.find((f) => f.endsWith('.docx') && !f.endsWith('.crdownload'));
      if (hit) { dlPath = path.join(dlDir, hit); break; }
    }
    check(`下载文件生成 ${expectName}`, !!dlPath, dlPath || 'timeout');
    if (dlPath) {
      check('文件名 = 日期_孔号.docx', path.basename(dlPath) === expectName, path.basename(dlPath));
      const files = unzipSync(new Uint8Array(await readFile(dlPath)));
      const xml = strFromU8(files['word/document.xml']);
      check('document.xml：工程编号', xml.includes('工程编号：EX26T2211'));
      check('document.xml：孔号', xml.includes('孔号：ZK1'));
      check('document.xml：土号新格式 -1 与 -R1', xml.includes('>-1<') && xml.includes('>-R1<'));
      check('document.xml：开土日期', xml.includes('开土日期2026'));
      check('document.xml：A3 横向', xml.includes('w:w="23814" w:h="16839" w:orient="landscape"'));
      check('document.xml：单页单表', (xml.match(/<w:tbl>/g) || []).length === 1);
      check('document.xml：克隆行无书签', !/<w:tr [^>]*>[\s\S]*?bookmarkStart/.test(xml));
    }

    check('无运行时异常', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 200));

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    child.kill();
    await sleep(400);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    await rm(dlDir, { recursive: true, force: true }).catch(() => {});
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('probe error:', e);
  process.exit(1);
});
