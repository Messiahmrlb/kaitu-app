const fs = require('fs');
const path = require('path');
const dx = require(path.join(__dirname, 'docxExport.cjs'));
const { parseDeliveryFile } = require(path.join(__dirname, 'importDelivery.cjs'));
const OUT = 'C:/Users/Dell/AppData/Local/Temp/docx_pages';
(async () => {
  const buf = fs.readFileSync('E:/送样单-天津市武清城区水系排涝能力提升工程-第四次(1).xlsx').buffer.slice(0);
  const recs = (await parseDeliveryFile(buf)).records.map((r) => r.record);
  const tpl = new Uint8Array(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'assets', 'tpl-normal.docx')));
  for (const rec of recs) {
    const hole = rec.engineering.holeCode || 'noname';
    const blob = await dx.buildDocxBlob([rec], tpl);
    const f = path.join(OUT, `hole_${hole.replace(/[^\w-]/g, '_')}.docx`);
    fs.writeFileSync(f, Buffer.from(await blob.arrayBuffer()));
    console.log(`${hole} samples=${rec.samples.length} pagesExpect=${Math.max(1, Math.ceil(rec.samples.length / 22))}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
