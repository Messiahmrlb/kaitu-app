// 复现 Word 页数问题：送样单 → 生成 docx（单孔/多孔）→ 供 Word COM 数页
const fs = require('fs');
const path = require('path');
const dx = require(path.join(__dirname, 'docxExport.cjs'));
const { unzipSync, strFromU8 } = require('fflate');
const { parseDeliveryFile } = require(path.join(__dirname, 'importDelivery.cjs'));

const SRC = 'E:/送样单-天津市武清城区水系排涝能力提升工程-第四次(1).xlsx';
const OUT = 'C:/Users/Dell/AppData/Local/Temp/docx_pages';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const buf = fs.readFileSync(SRC).buffer.slice(0);
  const result = await parseDeliveryFile(buf);
  const recs = result.records.map((r) => r.record);
  const tplA = new Uint8Array(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'assets', 'tpl-normal.docx')));

  // ① 单孔 ZK43（18 样 → 期望 1 页）
  const single = recs.filter((r) => r.engineering.holeCode === 'ZK43');
  const b1 = await dx.buildDocxBlob(single, tplA);
  fs.writeFileSync(path.join(OUT, 'single_ZK43.docx'), Buffer.from(await b1.arrayBuffer()));
  console.log('single_ZK43.docx samples=', single[0].samples.length);

  // ② 多孔合并（8 孔 → 期望 8 页）
  const b2 = await dx.buildDocxBlob(recs, tplA);
  fs.writeFileSync(path.join(OUT, 'merged_8holes.docx'), Buffer.from(await b2.arrayBuffer()));
  console.log('merged_8holes.docx holes=', recs.length, 'tables=', (dx.buildDocxBody(strFromU8(unzipSync(tplA)['word/document.xml']), recs).match(/<w:tbl>/g) || []).length);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
