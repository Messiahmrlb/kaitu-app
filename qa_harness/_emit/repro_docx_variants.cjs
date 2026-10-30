// 变体对照：定位 Word 溢出的来源
const fs = require('fs');
const path = require('path');
const dx = require(path.join(__dirname, 'docxExport.cjs'));
const OUT = 'C:/Users/Dell/AppData/Local/Temp/docx_pages';
const mkSample = (no, extra = {}) => ({
  id: 's' + no, soilNumber: no, fieldRecord: '', sampleDepth: '', sampleElevation: '',
  color: '', smell: '', soilType: [], inclusions: [], soilState: [], soilStateNote: '',
  testItems: [], il: '', ip: '', disturbance: '原状', siltySand: 'none', otherTestItems: [], ...extra,
});
const mkRec = (id, hole, samples, extra = {}) => ({
  id, mode: 'A',
  engineering: { projectCode: 'EX26T2211', holeCode: hole, holeElevation: '12.5', openDate: '2026-10-30' },
  samples, customTestItems: [], ...extra,
});
(async () => {
  const tplA = new Uint8Array(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'assets', 'tpl-normal.docx')));
  // A: 1 样全空
  const bA = await dx.buildDocxBlob([mkRec('r1', 'ZK43', [mkSample('1')])], tplA);
  fs.writeFileSync(path.join(OUT, 'varA_1sample_empty.docx'), Buffer.from(await bA.arrayBuffer()));
  // B: 18 样全空
  const bB = await dx.buildDocxBlob([mkRec('r1', 'ZK43', Array.from({ length: 18 }, (_, i) => mkSample(String(i + 1))))], tplA);
  fs.writeFileSync(path.join(OUT, 'varB_18sample_empty.docx'), Buffer.from(await bB.arrayBuffer()));
  // C: 0 样（仅信息行）
  const bC = await dx.buildDocxBlob([mkRec('r1', 'ZK43', [])], tplA);
  fs.writeFileSync(path.join(OUT, 'varC_0sample.docx'), Buffer.from(await bC.arrayBuffer()));
  // D: 1 样带真实内容（fieldRecord/color 等）
  const bD = await dx.buildDocxBlob([mkRec('r1', 'ZK43', [mkSample('1', { fieldRecord: '粉质黏土', color: '褐黄', smell: '无', soilType: ['粉质黏土'], inclusions: ['含锈斑'], soilState: ['硬塑'], soilStateNote: '备注文字', testItems: ['固结'] })])], tplA);
  fs.writeFileSync(path.join(OUT, 'varD_1sample_full.docx'), Buffer.from(await bD.arrayBuffer()));
  console.log('variants written');
})().catch((e) => { console.error('ERR', e); process.exit(1); });
