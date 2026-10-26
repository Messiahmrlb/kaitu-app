/**
 * 独立验证脚本（QA）：批量勾选 / 土样录入对话框「自定义试验项目」布局
 * 使用 CDP（Node 22 原生 WebSocket）+ 无头 Edge，在 320/360/390/430 四个宽度实测。
 * 只读验证，不修改任何源码。
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DEBUG_PORT = 9444;
const APP_URL = 'http://127.0.0.1:4199/';
const WIDTHS = [320, 360, 390, 430];
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
      const txt = await res.text();
      return JSON.parse(txt);
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`无法连接 ${url}`);
}

async function launchEdge(profileDir) {
  const child = spawn(
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
      '--window-size=500,900',
      'about:blank',
    ],
    { stdio: 'ignore', detached: false },
  );
  return child;
}

// ---------- 页面内注入的测量工具 ----------
const PAGE_HELPERS = String.raw`
window.__qa = {
  norm(s) { return (s || '').replace(/\s+/g, ' ').trim(); },
  allByText(txt) {
    const t = window.__qa.norm(txt);
    return [...document.querySelectorAll('body *')].filter(
      (el) => window.__qa.norm(el.textContent) === t && el.children.length === 0
        || (window.__qa.norm(el.textContent) === t)
    ).filter((el) => window.__qa.norm(el.textContent) === t);
  },
  innermostByText(txt) {
    const t = window.__qa.norm(txt);
    const cands = [...document.querySelectorAll('body *')].filter(
      (el) => window.__qa.norm(el.textContent) === t
    );
    // 取最深的元素（没有任何子元素同样文本）
    return cands.filter(
      (el) => ![...el.children].some((c) => window.__qa.norm(c.textContent) === t)
    ).pop() || cands.pop() || null;
  },
  buttonByText(txt, exact = true) {
    const t = window.__qa.norm(txt);
    return [...document.querySelectorAll('button')].filter((b) => {
      const bt = window.__qa.norm(b.textContent);
      return exact ? bt === t : bt.includes(t);
    })[0] || null;
  },
  activeDialog(marker) {
    const roots = [...document.querySelectorAll('.MuiDialog-root')].filter((d) => {
      const r = d.getBoundingClientRect();
      const cs = getComputedStyle(d);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    });
    if (!marker) return roots[roots.length - 1] || null;
    return roots.filter((d) => window.__qa.norm(d.textContent).includes(marker)).pop() || null;
  },
  rect(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: +r.left.toFixed(2), right: +r.right.toFixed(2),
      top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2),
      width: +r.width.toFixed(2), height: +r.height.toFixed(2),
    };
  },
  center(el) {
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      rect: window.__qa.rect(el),
    };
  },
  hitAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return {
      tag: el.tagName,
      text: window.__qa.norm(el.textContent).slice(0, 40),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 120),
      isTargetOrChild(target, hit) { return true; },
    };
  },
  hitIsWithin(selector, x, y) {
    const target = document.querySelector(selector);
    const hit = document.elementFromPoint(x, y);
    if (!target || !hit) return { ok: false, reason: 'no-target-or-hit' };
    return {
      ok: target === hit || target.contains(hit),
      targetText: window.__qa.norm(target.textContent).slice(0, 40),
      hitTag: hit.tagName,
      hitText: window.__qa.norm(hit.textContent).slice(0, 40),
    };
  },
  dialogMetrics(dlg) {
    if (!dlg) return null;
    const dc = dlg.querySelector('.MuiDialogContent-root');
    return {
      scrollWidth: dc ? dc.scrollWidth : null,
      clientWidth: dc ? dc.clientWidth : null,
      paper: window.__qa.rect(dlg.querySelector('.MuiPaper-root')),
      innerWidth: window.innerWidth,
      docScrollWidth: document.documentElement.scrollWidth,
    };
  },
  inputByLabel(dlg, labelText) {
    if (!dlg) return null;
    const lab = [...dlg.querySelectorAll('label')].find(
      (l) => window.__qa.norm(l.textContent) === labelText
    );
    if (lab && lab.htmlFor) return document.getElementById(lab.htmlFor);
    return [...dlg.querySelectorAll('input')].find((i) => i.type === 'text') || null;
  },
  setInput(el, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  },
  textPresent(txt, root) {
    const t = window.__qa.norm(txt);
    const scope = root || document.body;
    return window.__qa.norm(scope.textContent).includes(t);
  },
};
true;
`;

async function main() {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'qa-edge-profile-'));
  const edge = await launchEdge(profileDir);
  let cdp;
  const results = [];

  try {
    const ver = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    if (!ver.webSocketDebuggerUrl) throw new Error('未取得 browser ws 地址');
    const browser = new CDP(ver.webSocketDebuggerUrl);
    // 新建一个 page target
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const list = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const page = list.find((t) => t.id === targetId);
    cdp = new CDP(page.webSocketDebuggerUrl);
    browser.close();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

    const evalJs = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (r.exceptionDetails) {
        throw new Error(
          'EVAL: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)).slice(0, 600),
        );
      }
      return r.result.value;
    };

    const waitFor = async (expr, label, timeout = 12000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const v = await evalJs(expr);
        if (v) return v;
        await sleep(120);
      }
      throw new Error(`等待超时: ${label}`);
    };

    const tapSelectorExpression = async (locatorExpr) => {
      // locatorExpr: 返回 element 的表达式
      const pt = await evalJs(`(() => {
        const el = ${locatorExpr};
        if (!el) return null;
        return window.__qa.center(el);
      })()`);
      if (!pt) throw new Error('定位失败: ' + locatorExpr.slice(0, 120));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1,
      });
      return pt;
    };

    const pressEscape = async () => {
      await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
      await sleep(450);
    };

    for (const width of WIDTHS) {
      const row = { width, batch: {}, sample: {}, failures: [] };
      const fail = (msg) => row.failures.push(msg);

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width, height: 844, deviceScaleFactor: 2, mobile: true,
        screenWidth: width, screenHeight: 844,
      });

      await cdp.send('Page.navigate', { url: APP_URL });
      await waitFor(`!!document.querySelector('button.MuiFab-root')`, `宽度 ${width} 首屏 FAB`);
      await evalJs(PAGE_HELPERS);
      await sleep(300);

      // 1. 新建记录
      await tapSelectorExpression(`document.querySelector('button.MuiFab-root')`);
      await waitFor(`!!window.__qa.innermostByText('普通目力鉴别')`, '鉴别格式对话框');
      await sleep(450);
      await tapSelectorExpression(`window.__qa.innermostByText('普通目力鉴别')`);
      await waitFor(`!!window.__qa.buttonByText('生成记录')`, '新建记录设置对话框');
      await sleep(450);
      await tapSelectorExpression(`window.__qa.buttonByText('生成记录')`);
      await waitFor(`!!window.__qa.buttonByText('批量勾选（试验/扰动）', false)`, '编辑视图');
      await sleep(500);

      // ---------- 2. 批量勾选对话框 ----------
      await tapSelectorExpression(`window.__qa.buttonByText('批量勾选（试验/扰动）', false)`);
      await waitFor(`!!window.__qa.activeDialog('自定义/额外试验项目为全局项')`, '批量勾选对话框打开');
      await sleep(600);

      const b = row.batch;
      // 未展开态
      b.unfolded = await evalJs(`(() => {
        const dlg = window.__qa.activeDialog('自定义/额外试验项目为全局项');
        const btn = [...dlg.querySelectorAll('button')].find(
          (x) => window.__qa.norm(x.textContent) === '添加自定义试验项目'
        );
        const pt = window.__qa.center(btn);
        const r = pt.rect;
        const hit = document.elementFromPoint(pt.x, pt.y);
        return {
          rect: r,
          innerWidth: window.innerWidth,
          hitOk: !!hit && (btn === hit || btn.contains(hit)),
          hitTag: hit ? hit.tagName : null,
          hitCls: hit && typeof hit.className === 'string' ? hit.className.slice(0, 90) : null,
          dialog: window.__qa.dialogMetrics(dlg),
        };
      })()`);
      if (!(b.unfolded.rect.height <= 40)) fail(`批量勾选 未展开态按钮 height=${b.unfolded.rect.height} > 40`);
      if (!(b.unfolded.rect.width >= 140)) fail(`批量勾选 未展开态按钮 width=${b.unfolded.rect.width} < 140`);
      if (!(b.unfolded.rect.right <= b.unfolded.innerWidth)) fail(`批量勾选 未展开态按钮 right=${b.unfolded.rect.right} > innerWidth=${b.unfolded.innerWidth}`);
      if (!b.unfolded.hitOk) fail(`批量勾选 未展开态按钮命中测试失败，命中 ${b.unfolded.hitTag}`);
      if (b.unfolded.dialog.scrollWidth !== b.unfolded.dialog.clientWidth) {
        fail(`批量勾选 未展开态 DialogContent scrollWidth=${b.unfolded.dialog.scrollWidth} != clientWidth=${b.unfolded.dialog.clientWidth}`);
      }

      // 展开
      await tapSelectorExpression(`(() => {
        const dlg = window.__qa.activeDialog('自定义/额外试验项目为全局项');
        return [...dlg.querySelectorAll('button')].find((x) => window.__qa.norm(x.textContent) === '添加自定义试验项目');
      })()`);
      await waitFor(`(() => {
        const dlg = window.__qa.activeDialog('自定义/额外试验项目为全局项');
        return dlg && !!window.__qa.inputByLabel(dlg, '自定义试验项目名称');
      })()`, '批量勾选对话框展开表单');
      await sleep(400);

      b.expanded = await evalJs(`(() => {
        const dlg = window.__qa.activeDialog('自定义/额外试验项目为全局项');
        const input = window.__qa.inputByLabel(dlg, '自定义试验项目名称');
        const addBtn = [...dlg.querySelectorAll('button')].find((x) => window.__qa.norm(x.textContent) === '添加');
        const cancelBtn = [...dlg.querySelectorAll('button')].find((x) => window.__qa.norm(x.textContent) === '取消' && dlg.contains(x));
        const info = (el) => {
          if (!el) return null;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          const r = window.__qa.rect(el);
          return r;
        };
        const ir = info(input), ar = info(addBtn), cr = info(cancelBtn);
        let addHitOk = null;
        if (addBtn) {
          const pt = window.__qa.center(addBtn);
          const hit = document.elementFromPoint(pt.x, pt.y);
          addHitOk = !!hit && (addBtn === hit || addBtn.contains(hit));
        }
        const dcm = window.__qa.dialogMetrics(dlg);
        return { input: ir, addBtn: ar, cancelBtn: cr, addHitOk, dialog: dcm, innerWidth: window.innerWidth };
      })()`);

      for (const [k, label] of [['input', '输入框'], ['addBtn', '「添加」'], ['cancelBtn', '「取消」']]) {
        const r = b.expanded[k];
        if (!r) { fail(`批量勾选 展开态找不到 ${label}`); continue; }
        if (!(r.right <= b.expanded.innerWidth)) fail(`批量勾选 展开态 ${label} right=${r.right} > innerWidth=${b.expanded.innerWidth}`);
        if (!(r.left >= 0)) fail(`批量勾选 展开态 ${label} left=${r.left} < 0`);
      }
      if (b.expanded.dialog.scrollWidth !== b.expanded.dialog.clientWidth) {
        fail(`批量勾选 展开态 DialogContent scrollWidth=${b.expanded.dialog.scrollWidth} != clientWidth=${b.expanded.dialog.clientWidth}`);
      }
      if (!b.expanded.addHitOk) fail('批量勾选 展开态「添加」按钮命中测试失败（可能被遮罩覆盖）');

      // 功能验证：输入 -> 添加 -> 文本出现
      const probeBatch = `探针B${width}`;
      await evalJs(`(() => {
        const dlg = window.__qa.activeDialog('自定义/额外试验项目为全局项');
        const input = window.__qa.inputByLabel(dlg, '自定义试验项目名称');
        window.__qa.setInput(input, ${JSON.stringify(probeBatch)});
        return true;
      })()`);
      await sleep(200);
      b.typedValue = await evalJs(`(() => {
        const dlg = window.__qa.activeDialog('自定义/额外试验项目为全局项');
        return window.__qa.inputByLabel(dlg, '自定义试验项目名称').value;
      })()`);
      if (b.typedValue !== probeBatch) fail(`批量勾选 输入框值异常: ${b.typedValue}`);

      await tapSelectorExpression(`(() => {
        const dlg = window.__qa.activeDialog('自定义/额外试验项目为全局项');
        return [...dlg.querySelectorAll('button')].find((x) => window.__qa.norm(x.textContent) === '添加');
      })()`);
      await sleep(500);
      b.added = await evalJs(`(() => {
        const dlg = window.__qa.activeDialog('自定义/额外试验项目为全局项');
        return window.__qa.textPresent(${JSON.stringify(probeBatch)}, dlg);
      })()`);
      if (!b.added) fail(`批量勾选 功能回归：点击「添加」后对话框内未出现「${probeBatch}」`);
      b.formClosed = await evalJs(`(() => {
        const dlg = window.__qa.activeDialog('自定义/额外试验项目为全局项');
        return !window.__qa.inputByLabel(dlg, '自定义试验项目名称');
      })()`);
      if (!b.formClosed) fail('批量勾选 提交后表单未收起');

      // 截图（仅 320 留证）
      if (width === 320) {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        row.batchScreenshot = 'qa_harness/_emit/qa_batch_320.png';
        await writeFile(path.resolve('qa_harness/_emit/qa_batch_320.png'), Buffer.from(shot.data, 'base64'));
      }

      await pressEscape();
      await waitFor(`!window.__qa.activeDialog('自定义/额外试验项目为全局项')`, '批量勾选对话框关闭', 6000);

      // ---------- 3. 土样录入（SampleDialog） ----------
      await waitFor(`!!document.querySelector('button[aria-label="编辑"]')`, '土样编辑按钮');
      await tapSelectorExpression(`document.querySelector('button[aria-label="编辑"]')`);
      await waitFor(`(() => {
        const dlg = window.__qa.activeDialog('自定义试验项目');
        return !!dlg;
      })()`, '土样对话框打开');
      await sleep(600);

      const s = row.sample;
      s.unfolded = await evalJs(`(() => {
        const dlg = window.__qa.activeDialog('自定义试验项目');
        const btn = [...dlg.querySelectorAll('button')].find(
          (x) => window.__qa.norm(x.textContent) === '添加自定义试验项目'
        );
        // 先滚动到可视区域再取中心点：土样对话框内容较长，按钮初始可能在视口外，
        // 未滚动时 elementFromPoint 会返回 null（这是测量方法问题，不是布局问题）
        const pt = window.__qa.center(btn);
        const r = pt.rect;
        const hit = document.elementFromPoint(pt.x, pt.y);
        return {
          rect: r,
          innerWidth: window.innerWidth,
          hitOk: !!hit && (btn === hit || btn.contains(hit)),
          hitTag: hit ? hit.tagName : null,
          dialog: window.__qa.dialogMetrics(dlg),
        };
      })()`);
      if (!(s.unfolded.rect.height <= 40)) fail(`土样录入 未展开态按钮 height=${s.unfolded.rect.height} > 40`);
      if (!(s.unfolded.rect.width >= 140)) fail(`土样录入 未展开态按钮 width=${s.unfolded.rect.width} < 140`);
      if (!(s.unfolded.rect.right <= s.unfolded.innerWidth)) fail(`土样录入 未展开态按钮 right=${s.unfolded.rect.right} > innerWidth=${s.unfolded.innerWidth}`);
      if (!s.unfolded.hitOk) fail(`土样录入 未展开态按钮命中测试失败，命中 ${s.unfolded.hitTag}`);

      await tapSelectorExpression(`(() => {
        const dlg = window.__qa.activeDialog('自定义试验项目');
        return [...dlg.querySelectorAll('button')].find((x) => window.__qa.norm(x.textContent) === '添加自定义试验项目');
      })()`);
      await waitFor(`(() => {
        const dlg = window.__qa.activeDialog('自定义试验项目');
        return dlg && !!window.__qa.inputByLabel(dlg, '自定义试验项目名称');
      })()`, '土样对话框展开表单');
      await sleep(400);

      s.expanded = await evalJs(`(() => {
        const dlg = window.__qa.activeDialog('自定义试验项目');
        const input = window.__qa.inputByLabel(dlg, '自定义试验项目名称');
        const addBtn = [...dlg.querySelectorAll('button')].find((x) => window.__qa.norm(x.textContent) === '添加');
        const cancelBtn = [...dlg.querySelectorAll('button')].find((x) => window.__qa.norm(x.textContent) === '取消' && dlg.contains(x));
        const info = (el) => {
          if (!el) return null;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          return window.__qa.rect(el);
        };
        const ir = info(input), ar = info(addBtn), cr = info(cancelBtn);
        let addHitOk = null;
        if (addBtn) {
          const pt = window.__qa.center(addBtn);
          const hit = document.elementFromPoint(pt.x, pt.y);
          addHitOk = !!hit && (addBtn === hit || addBtn.contains(hit));
        }
        return {
          input: ir, addBtn: ar, cancelBtn: cr, addHitOk,
          dialog: window.__qa.dialogMetrics(dlg), innerWidth: window.innerWidth,
        };
      })()`);

      for (const [k, label] of [['input', '输入框'], ['addBtn', '「添加」'], ['cancelBtn', '「取消」']]) {
        const r = s.expanded[k];
        if (!r) { fail(`土样录入 展开态找不到 ${label}`); continue; }
        if (!(r.right <= s.expanded.innerWidth)) fail(`土样录入 展开态 ${label} right=${r.right} > innerWidth=${s.expanded.innerWidth}`);
        if (!(r.left >= 0)) fail(`土样录入 展开态 ${label} left=${r.left} < 0`);
      }
      if (s.expanded.dialog.scrollWidth !== s.expanded.dialog.clientWidth) {
        fail(`土样录入 展开态 DialogContent scrollWidth=${s.expanded.dialog.scrollWidth} != clientWidth=${s.expanded.dialog.clientWidth}`);
      }
      if (!s.expanded.addHitOk) fail('土样录入 展开态「添加」按钮命中测试失败（可能被遮罩覆盖）');

      const probeSample = `探针S${width}`;
      await evalJs(`(() => {
        const dlg = window.__qa.activeDialog('自定义试验项目');
        const input = window.__qa.inputByLabel(dlg, '自定义试验项目名称');
        window.__qa.setInput(input, ${JSON.stringify(probeSample)});
        return true;
      })()`);
      await sleep(200);
      await tapSelectorExpression(`(() => {
        const dlg = window.__qa.activeDialog('自定义试验项目');
        return [...dlg.querySelectorAll('button')].find((x) => window.__qa.norm(x.textContent) === '添加');
      })()`);
      await sleep(500);
      s.added = await evalJs(`(() => {
        const dlg = window.__qa.activeDialog('自定义试验项目');
        return window.__qa.textPresent(${JSON.stringify(probeSample)}, dlg);
      })()`);
      if (!s.added) fail(`土样录入 功能回归：点击「添加」后对话框内未出现「${probeSample}」`);

      if (width === 320) {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        row.sampleScreenshot = 'qa_harness/_emit/qa_sample_320.png';
        await writeFile(path.resolve('qa_harness/_emit/qa_sample_320.png'), Buffer.from(shot.data, 'base64'));
      }

      await pressEscape();
      await sleep(200);

      results.push(row);
      console.log(`--- 宽度 ${width}px 完成，失败${row.failures.length}项`);
      for (const f of row.failures) console.log('    ✗ ' + f);
    }

    await writeFile(
      path.resolve('qa_harness/_emit/qa_layout_results.json'),
      JSON.stringify(results, null, 2),
      'utf8',
    );
    // 打印精简表格数据
    for (const r of results) {
      console.log(`\n[${r.width}px]`);
      console.log('  batch未展开:', JSON.stringify(r.batch.unfolded?.rect), 'scroll', r.batch.unfolded?.dialog?.scrollWidth, '/', r.batch.unfolded?.dialog?.clientWidth);
      console.log('  batch展开  :', JSON.stringify({ input: r.batch.expanded?.input, add: r.batch.expanded?.addBtn, cancel: r.batch.expanded?.cancelBtn }), 'scroll', r.batch.expanded?.dialog?.scrollWidth, '/', r.batch.expanded?.dialog?.clientWidth);
      console.log('  sample未展开:', JSON.stringify(r.sample.unfolded?.rect), 'scroll', r.sample.unfolded?.dialog?.scrollWidth, '/', r.sample.unfolded?.dialog?.clientWidth);
      console.log('  sample展开  :', JSON.stringify({ input: r.sample.expanded?.input, add: r.sample.expanded?.addBtn, cancel: r.sample.expanded?.cancelBtn }), 'scroll', r.sample.expanded?.dialog?.scrollWidth, '/', r.sample.expanded?.dialog?.clientWidth);
    }
    const totalFail = results.reduce((n, r) => n + r.failures.length, 0);
    console.log(`\nTOTAL_FAILURES=${totalFail}`);
    console.log(totalFail === 0 ? 'IS_PASS: YES' : 'IS_PASS: NO');
  } finally {
    if (cdp) cdp.close();
    try { edge.kill(); } catch { /* noop */ }
    await sleep(800);
    try { await rm(profileDir, { recursive: true, force: true }); } catch { /* noop */ }
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
