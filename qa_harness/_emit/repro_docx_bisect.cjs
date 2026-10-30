// 二分定位：哪个手术步骤引入 +1 页
const fs = require('fs');
const path = require('path');
const { unzipSync, zipSync, strFromU8, strToU8 } = require('fflate');
const OUT = 'C:/Users/Dell/AppData/Local/Temp/docx_pages';
const TPL = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'assets', 'tpl-normal.docx'));
const TR_RE = /<w:tr(?: [^>]*)?>[\s\S]*?<\/w:tr>/g;
const TC_RE = /<w:tc>[\s\S]*?<\/w:tc>/g;
const P_RE = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/;
const RUN_RE = /<w:r>[\s\S]*?<\/w:r>/;
const RPR_RE = /<w:rPr>[\s\S]*?<\/w:rPr>/;
const PPR_RE = /<w:pPr>[\s\S]*?<\/w:pPr>/;
function clean(xml) {
  return xml.replace(/<w:bookmarkStart[^>]*\/>/g, '').replace(/<w:bookmarkEnd[^>]*\/>/g, '')
    .replace(/ w14:paraId="[^"]*"/g, '').replace(/ w14:textId="[^"]*"/g, '');
}
function fillTc(tc, text) {
  return tc.replace(P_RE, (p) => {
    const pPr = p.match(PPR_RE)?.[0] ?? '';
    const run = p.match(RUN_RE)?.[0] ?? '';
    const rPr = run.match(RPR_RE)?.[0] ?? '';
    return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  });
}
function rezip(xml) {
  const files = unzipSync(new Uint8Array(TPL));
  files['word/document.xml'] = strToU8(xml);
  return Buffer.from(zipSync(files, { level: 6 }));
}
function write(name, xml) { fs.writeFileSync(path.join(OUT, name), rezip(xml)); }
const xml0 = strFromU8(unzipSync(new Uint8Array(TPL))['word/document.xml']);
const tblStart = xml0.indexOf('<w:tbl>');
const tblEnd = xml0.lastIndexOf('</w:tbl>') + 8;
const tbl = xml0.slice(tblStart, tblEnd);
const firstTr = tbl.indexOf('<w:tr');
const tblOpen = tbl.slice(0, firstTr);
const trs = tbl.slice(firstTr, tbl.length - 8).match(TR_RE);

// E: 仅重组全部行 + clean（不填一字）
{
  const rebuilt = tblOpen + trs.map((tr) => {
    const tcs = tr.match(TC_RE) ?? [];
    return tr.slice(0, tr.indexOf('<w:tc>')) + tcs.join('') + '</w:tr>';
  }).map(clean).join('') + '</w:tbl>';
  write('varE_rebuild_clean.docx', xml0.slice(0, tblStart) + rebuilt + xml0.slice(tblEnd));
}
// F: 仅填信息行（保留 paraId）
{
  const tcs = trs[0].match(TC_RE);
  const keep = trs[0].slice(0, trs[0].indexOf('<w:tc>'));
  tcs[0] = fillTc(tcs[0], '工程编号：EX26T2211');
  tcs[5] = fillTc(tcs[5], '孔号：ZK43');
  tcs[9] = fillTc(tcs[9], '孔口标高12.5');
  tcs[12] = fillTc(tcs[12], '开土日期2026年10月30日');
  const row0 = keep + tcs.join('') + '</w:tr>';
  const rebuilt = tblOpen + row0 + trs.slice(1).join('') + '</w:tbl>';
  write('varF_infoonly.docx', xml0.slice(0, tblStart) + rebuilt + xml0.slice(tblEnd));
}
// G: 仅 fillTestHeaderRow（试验列标题 fillTc，内容同模板）
{
  const tcs = trs[2].match(TC_RE);
  const keep = trs[2].slice(0, trs[2].indexOf('<w:tc>'));
  const labels = ['物性', '颗分', '固结', '垂直渗透', '水平渗透', '饱固快剪', '自然快剪', '三轴'];
  for (let i = 0; i < 8; i++) tcs[31 + i] = fillTc(tcs[31 + i], labels[i]);
  const row2 = keep + tcs.join('') + '</w:tr>';
  const rebuilt = tblOpen + trs[0] + trs[1] + row2 + trs.slice(3).join('') + '</w:tbl>';
  write('varG_subheader.docx', xml0.slice(0, tblStart) + rebuilt + xml0.slice(tblEnd));
}
// F1-F4: 信息行逐格二分
const fills = [[0, '工程编号：EX26T2211'], [5, '孔号：ZK43'], [9, '孔口标高12.5'], [12, '开土日期2026年10月30日']];
for (const [idx, text] of fills) {
  const tcs2 = trs[0].match(TC_RE);
  const keep2 = trs[0].slice(0, trs[0].indexOf('<w:tc>'));
  tcs2[idx] = fillTc(tcs2[idx], text);
  const row0b = keep2 + tcs2.join('') + '</w:tr>';
  const rebuilt2 = tblOpen + row0b + trs.slice(1).join('') + '</w:tbl>';
  write(`varF_${idx}.docx`, xml0.slice(0, tblStart) + rebuilt2 + xml0.slice(tblEnd));
}
// H: 纯 rezip（fflate 重打包，XML 一字不动）
write('varH_rezip_only.docx', xml0);
console.log('bisect variants written');
