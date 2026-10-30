// Emit a docx with custom CMA header settings for Word COM page-count check.
const fs = require('fs');
const path = require('path');
const dx = require(path.join(__dirname, 'docxExport.cjs'));

const TPL = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'assets', 'tpl-normal.docx'));

function mkSample(no, extra = {}) {
  return {
    id: 's-' + no, soilNumber: no, fieldRecord: '', color: '', smell: '',
    soilType: ['粉质黏土'], disturbance: '原状', inclusions: ['含锈斑'],
    soilState: ['硬塑'], soilStateNote: '', testItems: ['固结', '慢剪'], ...extra,
  };
}
function mkRecord(id, hole, samples) {
  return {
    id, mode: 'A',
    engineering: { projectCode: 'EX26T2211', holeCode: hole, holeElevation: '12.5', openDate: '2026-10-30' },
    samples, customTestItems: [], consolidationLabel: '回弹压缩', shearLabels: ['慢剪'],
  };
}
const samples = [];
for (let i = 1; i <= 22; i++) samples.push(mkSample(String(i)));

(async () => {
  const rec = mkRecord('r1', 'ZK1', samples);
  // custom CMA: long-ish version line + docCode
  const blob = await dx.buildDocxBlob([rec], new Uint8Array(TPL), {
    versionLine: '第 9 版 第 2 次修改 2027 年 1 月 1 日起实施',
    docCode: 'ABC-TR999-2027',
  });
  fs.writeFileSync(path.join(__dirname, 'cma_check_custom.docx'), Buffer.from(await blob.arrayBuffer()));
  // default (no header override) control file
  const blobDef = await dx.buildDocxBlob([rec], new Uint8Array(TPL));
  fs.writeFileSync(path.join(__dirname, 'cma_check_default.docx'), Buffer.from(await blobDef.arrayBuffer()));
  console.log('emitted cma_check_custom.docx / cma_check_default.docx (22 samples each)');
})().catch((e) => { console.error('EMIT FAIL', e); process.exit(1); });
