// 二分2：数据行填充哪部分引入 +1 页
const fs = require('fs');
const path = require('path');
const dx = require(path.join(__dirname, 'docxExport.cjs'));
const { unzipSync, strFromU8 } = require('fflate');
const OUT = 'C:/Users/Dell/AppData/Local/Temp/docx_pages';
const TPL = new Uint8Array(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'assets', 'tpl-normal.docx')));

// 直接在 XML 层面做变体：以模板为基础，手工构造数据行填充
const xml0 = strFromU8(unzipSync(TPL)['word/document.xml']);
const TR_RE = /<w:tr(?: [^>]*)?>[\s\S]*?<\/w:tr>/g;
const TC_RE = /<w:tc>[\s\S]*?<\/w:tc>/g;
const P_RE = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/;
const RUN_RE = /<w:r>[\s\S]*?<\/w:r>/;
const RPR_RE = /<w:rPr>[\s\S]*?<\/w:rPr>/;
const PPR_RE = /<w:pPr>[\s\S]*?<\/w:pPr>/;
function fillTc(tc, text) {
  return tc.replace(P_RE, (p) => {
    const pPr = p.match(PPR_RE)?.[0] ?? '';
    const run = p.match(RUN_RE)?.[0] ?? '';
    const rPr = run.match(RPR_RE)?.[0] ?? '';
    return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  });
}
const tblStart = xml0.indexOf('<w:tbl>');
const tblEnd = xml0.lastIndexOf('</w:tbl>') + 8;
const tbl = xml0.slice(tblStart, tblEnd);
const firstTr = tbl.indexOf('<w:tr');
const tblOpen = tbl.slice(0, firstTr);
const trs = tbl.slice(firstTr, tbl.length - 8).match(TR_RE);
function rezip(newXml, name) {
  const files = unzipSync(TPL);
  files['word/document.xml'] = Buffer.from(newXml, 'utf8');
  fs.writeFileSync(path.join(OUT, name), Buffer.from(require('fflate').zipSync(files, { level: 6 })));
}
function variant(name, fillFn) {
  const rows = [trs[0], trs[1], trs[2]];
  for (let r = 0; r < 22; r++) {
    const tcs = trs[3].match(TC_RE);
    const keep = trs[3].slice(0, trs[3].indexOf('<w:tc>'));
    const fill = fillFn(r); // {idx: text}
    for (const [idx, text] of Object.entries(fill)) tcs[Number(idx)] = fillTc(tcs[Number(idx)], text);
    rows.push(keep + tcs.join('') + '</w:tr>');
  }
  rows.push(trs[25]);
  rezip(xml0.slice(0, tblStart) + tblOpen + rows.join('') + '</w:tbl>' + xml0.slice(tblEnd), name);
}
// L: 仅土号
variant('varL_soilonly.docx', (r) => ({ 0: `-${r + 1}` }));
// M: 仅野外记录（中文 4 字）
variant('varM_fieldonly.docx', () => ({ 1: '粉质黏土' }));
// N: 仅 √ 勾选格（土名/夹杂物/扰动/土态/试验 各一格）
variant('varN_checks.docx', () => ({ 6: '√', 14: '√', 13: '√', 25: '√', 31: '√' }));
// O: 全部数据格填充（含备注与长土号）
variant('varO_alldata.docx', (r) => ({ 0: `-${r + 1}`, 1: '粉质黏土', 4: '褐黄', 5: '无', 6: '√', 13: '√', 14: '√', 25: '√', 30: '备注文字较长测试看看', 31: '√' }));
console.log('bisect2 written');
