// 复现：D25.xlsx → Word 导出 → 页数/页眉折行排查
// 注意：模板按记录 mode 选择（A=普通定名 tpl-normal / B=三角坐标 tpl-triangle），
// D25 是 B 模式三角坐标，用 tpl-normal 会套错土名子项行。
const fs = require('fs');
const path = require('path');
const { parseDeliveryFile } = require(path.join(__dirname, 'importDelivery.cjs'));
const dx = require(path.join(__dirname, 'docxExport.cjs'));
const { CMA_DEFAULT } = require(path.join(__dirname, 'cmaHeader.cjs'));
const { unzipSync, strFromU8 } = require('fflate');

const TPL_DIR = path.join(__dirname, '..', '..', 'src', 'assets');
const TPLS = {
  A: new Uint8Array(fs.readFileSync(path.join(TPL_DIR, 'tpl-normal.docx'))),
  B: new Uint8Array(fs.readFileSync(path.join(TPL_DIR, 'tpl-triangle.docx'))),
};
const OUT = path.join(__dirname, 'repro_out');
fs.mkdirSync(OUT, { recursive: true });

/** 可选的版本行覆盖：node repro_d25.cjs "<versionLine>" [输出标签] */
const VERSION_OVERRIDE = (process.argv[2] || '').trim();
const HEADER = VERSION_OVERRIDE
  ? { ...CMA_DEFAULT, versionLine: VERSION_OVERRIDE }
  : CMA_DEFAULT;
const TAG = VERSION_OVERRIDE ? `_${(process.argv[3] || 'alt').trim()}` : '';

(async () => {
  const buf = fs.readFileSync('C:/Users/Dell/Desktop/kaitujilu/D25.xlsx').buffer.slice(0);
  const result = await parseDeliveryFile(buf);
  const recs = result.records.map((r) => r.record);
  console.log('records:', recs.length, 'modes:', JSON.stringify(recs.map((r) => r.mode)));
  for (const rec of recs) {
    const hole = rec.engineering?.holeCode ?? '';
    const tpl = TPLS[rec.mode] ?? TPLS.A;
    console.log(`\n=== ${hole} samples=${rec.samples.length} mode=${rec.mode} openDate=${rec.engineering?.openDate} proj=${rec.engineering?.projectCode}`);
    console.log('  soilNumbers:', JSON.stringify(rec.samples.map((s) => s.soilNumber)));
    const blob = await dx.buildDocxBlob([rec], tpl, HEADER);
    const bytes = Buffer.from(await blob.arrayBuffer());
    const name = `D25_${hole || 'nohole'}${TAG}.docx`;
    fs.writeFileSync(path.join(OUT, name), bytes);
    const files = unzipSync(new Uint8Array(bytes));
    const hdr = strFromU8(files['word/header1.xml']);
    const texts = [...hdr.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    const szs = [...hdr.matchAll(/<w:sz w:val="(\d+)"/g)].map((m) => m[1]);
    const paras = (hdr.match(/<w:p(?: [^>]*)?>/g) || []).length;
    console.log(`  header paragraphs=${paras} text=[${texts.trim()}] len=${texts.trim().length} sz=${[...new Set(szs)].join(',')}`);
    const doc = strFromU8(files['word/document.xml']);
    console.log('  tables:', (doc.match(/<w:tbl>/g) || []).length, 'rows:', (doc.match(/<w:tr(?: [^>]*)?>/g) || []).length);
  }
})().catch((e) => { console.error('ERR', e); process.exit(1); });
