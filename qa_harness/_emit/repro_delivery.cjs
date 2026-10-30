const fs = require('fs');
const path = require('path');
const { parseDeliveryFile } = require('C:/Users/Dell/WorkBuddy/2026-09-10-09-55-25/kaitu-app/qa_harness/_emit/importDelivery.cjs');
const naming = require('C:/Users/Dell/WorkBuddy/2026-09-10-09-55-25/kaitu-app/qa_harness/_emit/exportNaming.cjs');
const { buildPdfPages } = require('C:/Users/Dell/WorkBuddy/2026-09-10-09-55-25/kaitu-app/qa_harness/_emit/pdfExport.cjs');

(async () => {
  const buf = fs.readFileSync('E:/送样单-天津市武清城区水系排涝能力提升工程-第四次(1).xlsx').buffer.slice(0);
  const result = await parseDeliveryFile(buf);
  const recs = result.records.map((r) => r.record);
  console.log('records:', recs.length);
  for (const rec of recs) {
    const hole = rec.engineering?.holeCode ?? '';
    console.log(`\n=== ${hole} mode=${rec.mode} samples=${rec.samples.length} proj=${rec.engineering?.projectCode}`);
    const pages = buildPdfPages(rec);
    const sns = rec.samples.slice(0, 8).map((s) => s.soilNumber);
    const pdfCol = pages[0] ? [1, 2, 3, 4].map((r) => pages[0].cells[r * 1000 + 1]).filter(Boolean) : [];
    console.log('  raw soilNumber:', JSON.stringify(sns));
    console.log('  PDF 土号列:', JSON.stringify(pdfCol));
    console.log('  mergedSoilNumber:', JSON.stringify(rec.samples.slice(0, 8).map((s) => naming.mergedSoilNumber(hole, s.soilNumber))));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
