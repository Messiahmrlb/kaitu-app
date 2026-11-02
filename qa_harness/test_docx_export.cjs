// 回归测试：Word（docx）导出（2026-10-30 用户新增，格式取自桌面模板，
// 文件组织/信息行与 PDF 完全一致——用户原话「和PDF完全一样就行」「和PDF一样」）
//
// 覆盖：
//   fillInfoRow：工程编号 / 孔号 / 孔口标高 / 开土日期（y年m月d日，缺省补空位）
//   sampleDocxCells：土号新格式 -1/-R1/-R2（与 PDF 2026-10-30 修法一致），
//                    土名/夹杂物/扰动/土态/备注/试验列 √ 按模板 tc 位置落位
//   fillTestHeaderRow：试验列标题随记录别名自动修正（固结→回弹压缩、剪切→慢剪）
//   buildDocxBody：22 行/页分页、多页/多孔多表 + 分页段落、空白行克隆不带书签
//   buildDocxBlob：解包→手术→重打包 roundtrip（pgSz A3 保留）
//   文件名：buildSingleDocxFileName / buildMergedDocxFileName（与 PDF 同规则 .docx）
//
// 运行：
//   npx esbuild src/docxExport.ts --bundle --format=cjs --platform=node \
//     --packages=external --outfile=qa_harness/_emit/docxExport.cjs
//   node qa_harness/test_docx_export.cjs
const fs = require('fs');
const path = require('path');
const dx = require(path.join(__dirname, '_emit', 'docxExport.cjs'));
const pdfMod = require(path.join(__dirname, '_emit', 'pdfExport.cjs'));
const namingMod = require(path.join(__dirname, '_emit', 'exportNaming.cjs'));

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}${detail !== undefined ? '  => ' + detail : ''}`);
  } else {
    fail++;
    console.error(`FAIL  ${name}${detail !== undefined ? '  => ' + detail : ''}`);
  }
}

const TPL_A = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'tpl-normal.docx'));
const TPL_B = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'tpl-triangle.docx'));
const { unzipSync, strFromU8 } = require('fflate');
// buildDocxBody 吃的是模板 document.xml（非整个 zip；整个 zip 走 buildDocxBlob）
const XML_A = strFromU8(unzipSync(new Uint8Array(TPL_A))['word/document.xml']);
const XML_B = strFromU8(unzipSync(new Uint8Array(TPL_B))['word/document.xml']);

// ---------- 工具：从 document.xml 提取行/格文本 ----------
const TR_RE = /<w:tr(?: [^>]*)?>[\s\S]*?<\/w:tr>/g;
const TC_RE = /<w:tc>[\s\S]*?<\/w:tc>/g;
const WT_RE = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g;
function rowTcs(rowXml) {
  return (rowXml.match(TC_RE) || []).map((tc) => {
    let m;
    let t = '';
    WT_RE.lastIndex = 0;
    while ((m = WT_RE.exec(tc)) !== null) t += m[1];
    return t;
  });
}
function bodyRows(xml) {
  return xml.match(TR_RE) || [];
}

// ---------- 工具：提取正文中「右对齐文件编号段落」的纯文本 ----------
// 模板 document.xml 在标题之后有一个右对齐段落，编号被拆成多个 run
// （S + HLY + - + TR068-202 + 4），必须跨 run 拼接后才能比对。
const PARA_RE = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g;
const PPR_RE = /<w:pPr>[\s\S]*?<\/w:pPr>/;
const RIGHT_JC_RE = /<w:jc[^>]*w:val="right"[^>]*\/>/;
function docCodeParagraph(xml) {
  for (const p of xml.match(PARA_RE) || []) {
    const pPr = (p.match(PPR_RE) || [''])[0];
    if (!RIGHT_JC_RE.test(pPr)) continue;
    let m;
    let t = '';
    const re = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g;
    while ((m = re.exec(p)) !== null) t += m[1];
    return { paragraph: p, text: t };
  }
  return { paragraph: '', text: '' };
}

// ---------- fixture ----------
function mkSample(no, extra = {}) {
  return {
    id: 's-' + no,
    soilNumber: no,
    fieldRecord: '',
    color: '',
    smell: '',
    soilType: [],
    disturbance: '原状',
    inclusions: [],
    soilState: [],
    soilStateNote: '',
    testItems: [],
    ...extra,
  };
}
function mkRecord(id, hole, samples, extra = {}) {
  return {
    id,
    mode: 'A',
    engineering: {
      projectCode: '26T123',
      holeCode: hole,
      holeElevation: '12.5',
      openDate: '2026-10-30',
    },
    samples,
    customTestItems: [],
    ...extra,
  };
}

// ---------- 1. 单页单孔：信息行 + 土号新格式 ----------
{
  const rec = mkRecord('r1', 'ZK1', [
    mkSample('1', { color: '褐黄', smell: '无', soilType: ['粉质黏土'], inclusions: ['含锈斑'], soilState: ['硬塑'], soilStateNote: '备注A', testItems: ['固结', '饱固快剪'] }),
    mkSample('2'),
    mkSample('R1', { disturbance: '扰动' }),
  ]);
  const xml = dx.buildDocxBody(XML_A, [rec]);
  const rows = bodyRows(xml);
  check('单页：26 行结构保留', rows.length === 26, String(rows.length));
  check('单页：1 张表', (xml.match(/<w:tbl>/g) || []).length === 1);
  check('无分页符', !xml.includes('<w:br w:type="page"/>'));

  const info = rowTcs(rows[0]);
  check('信息行：工程编号', info[0] === '工程编号：26T123', info[0]);
  check('信息行：孔号', info[5] === '孔号：ZK1', info[5]);
  check('信息行：孔口标高', info[9] === '孔口标高12.5', info[9]);
  check('信息行：m 保留', info[10] === 'm', info[10]);
  check('信息行：开土日期', info[12] === '开土日期2026年10月30日', info[12]);

  const r1 = rowTcs(rows[3]);
  check('土号新格式：1 → -1', r1[0] === '-1', r1[0]);
  check('土名 √：粉质黏土 tc10', r1[10] === '√', r1[10]);
  check('土名 空：黏土 tc11', r1[11] === '', r1[11]);
  check('扰动土：原状 tc13 空', r1[13] === '', r1[13]);
  check('夹杂物 √：含锈斑 tc16', r1[16] === '√', r1[16]);
  check('土态 √：硬塑 tc27', r1[27] === '√', r1[27]);
  check('备注 tc30', r1[30] === '备注A', r1[30]);
  check('试验 √：固结 tc33', r1[33] === '√', r1[33]);
  check('试验 √：饱固快剪 tc36', r1[36] === '√', r1[36]);
  check('试验 空：三轴 tc38', r1[38] === '', r1[38]);
  check('颜色 tc4', r1[4] === '褐黄', r1[4]);
  check('气味 tc5', r1[5] === '无', r1[5]);

  const r3 = rowTcs(rows[5]);
  check('土号新格式：R1 → -R1', r3[0] === '-R1', r3[0]);
  check('扰动土：扰动 tc13 √', r3[13] === '√', r3[13]);
  check('空白格不被写入（野外记录 tc1）', r3[1] === '', r3[1]);

  check('模板行数 26 → 克隆行不带书签', !/<w:tr [^>]*>[\s\S]*?bookmarkStart/.test(xml));
  check('克隆行 paraId 已剥离', !/<w:tr [^>]*w14:paraId/.test(xml));
  check('pgSz A3 横向保留', xml.includes('w:w="23814" w:h="16839" w:orient="landscape"'));
}

// ---------- 2. 空土号兜底 -行序 ----------
{
  const rec = mkRecord('r1', 'ZK1', [mkSample(''), mkSample('')]);
  const xml = dx.buildDocxBody(XML_A, [rec]);
  const rows = bodyRows(xml);
  check('空土号兜底 -1', rowTcs(rows[3])[0] === '-1', rowTcs(rows[3])[0]);
  check('空土号兜底 -2', rowTcs(rows[4])[0] === '-2', rowTcs(rows[4])[0]);
}

// ---------- 3. 跨页：>22 行另起一表 + 分页段落 ----------
{
  const samples = [];
  for (let i = 1; i <= 25; i++) samples.push(mkSample(String(i)));
  const xml = dx.buildDocxBody(XML_A, [mkRecord('r1', 'ZK1', samples)]);
  check('25 样 → 2 张表', (xml.match(/<w:tbl>/g) || []).length === 2);
  check('1 个分页段落', (xml.match(/<w:br w:type="page"\/>/g) || []).length === 1);
  const rows = bodyRows(xml);
  check('总行数 = 2×26', rows.length === 52, String(rows.length));
  check('第二页首行土号 -23（第 23 条）', rowTcs(rows[26 + 3])[0] === '-23', rowTcs(rows[29])[0]);
  check('第二页信息行重复工程编号', rowTcs(rows[26])[0] === '工程编号：26T123', rowTcs(rows[26])[0]);
  check('第二页列标题保留', rowTcs(rows[26 + 1])[0] === '土    号', rowTcs(rows[27])[0]);
}

// ---------- 4. 多孔合并：各孔信息行独立、土号按孔内行序 ----------
{
  const rec1 = mkRecord('r1', 'ZK1', [mkSample('1'), mkSample('R1')]);
  const rec2 = mkRecord('r2', 'ZK2', [mkSample('1')]);
  const xml = dx.buildDocxBody(XML_A, [rec1, rec2]);
  check('2 孔 → 2 张表', (xml.match(/<w:tbl>/g) || []).length === 2);
  const rows = bodyRows(xml);
  check('表1 信息行 孔号 ZK1', rowTcs(rows[0])[5] === '孔号：ZK1', rowTcs(rows[0])[5]);
  check('表2 信息行 孔号 ZK2', rowTcs(rows[26])[5] === '孔号：ZK2', rowTcs(rows[26])[5]);
  check('表1 R1 → -R1', rowTcs(rows[4])[0] === '-R1', rowTcs(rows[4])[0]);
  check('表2 首行土号 -1（孔内行序重开）', rowTcs(rows[26 + 3])[0] === '-1', rowTcs(rows[29])[0]);
}

// ---------- 5. 试验列别名自动修正（用户问题：像 PDF 一样改列名） ----------
// 契约：testItems 存列 key；固结列 key 固定「固结」而 label 可别名；剪切列 key=label=shearLabels[i]
{
  const rec = mkRecord('r1', 'ZK1', [mkSample('1', { testItems: ['固结', '慢剪'] })], {
    consolidationLabel: '回弹压缩',
    shearLabels: ['慢剪'],
  });
  const xml = dx.buildDocxBody(XML_A, [rec]);
  const sub = rowTcs(bodyRows(xml)[2]);
  check('子项行：tc33 列名 → 回弹压缩', sub[33] === '回弹压缩', sub[33]);
  check('子项行：tc36 列名 → 慢剪', sub[36] === '慢剪', sub[36]);
  check('子项行：tc37 保持默认（剪切第 2 列无别名）', sub[37] === '自然快剪', sub[37]);
  const data = rowTcs(bodyRows(xml)[3]);
  check('√ 落位按 key：固结 tc33', data[33] === '√', data[33]);
  check('√ 落位按 key：慢剪 tc36', data[36] === '√', data[36]);
  check('√ 落位：自然快剪 tc37 空', data[37] === '', data[37]);
}

// ---------- 6. B 模式（三角坐标模板）----------
{
  const rec = mkRecord('r1', 'ZK1', [mkSample('1', { soilType: ['粘土'] })], { mode: 'B' });
  const xml = dx.buildDocxBody(XML_B, [rec]);
  const data = rowTcs(bodyRows(xml)[3]);
  check('B 模板土名 √：粘土 tc11', data[11] === '√', data[11]);
  check('B 模板子项行保留：轻粉质壤土 tc7', rowTcs(bodyRows(xml)[2])[7] === '轻粉质壤土', rowTcs(bodyRows(xml)[2])[7]);
}

// ---------- 7. buildDocxBlob roundtrip（fflate 解包验证） ----------
{
  (async () => {
    const rec = mkRecord('r1', 'ZK1', [mkSample('R1')]);
    const blob = await dx.buildDocxBlob([rec], new Uint8Array(TPL_A));
    const buf = Buffer.from(await blob.arrayBuffer());
    check('roundtrip：Blob 尺寸 > 20KB（压缩后）', buf.length > 20000, String(buf.length));
    // unzipSync/strFromU8 已在文件头 require 
    const files = unzipSync(new Uint8Array(buf));
    const xml = strFromU8(files['word/document.xml']);
    check('roundtrip：document.xml 含 -R1', xml.includes('>-R1<'), '');
    check('roundtrip：document.xml 含工程编号', xml.includes('工程编号：26T123'));
    check('roundtrip：document.xml 含孔号', xml.includes('孔号：ZK1'));
    check('roundtrip：pgSz A3 保留', xml.includes('w:w="23814" w:h="16839" w:orient="landscape"'));
    check('roundtrip：Content_Types 保留', !!files['[Content_Types].xml']);

    // ---------- 8. 文件名 ----------
    check('单孔文件名', dx.buildSingleDocxFileName(mkRecord('r1', 'ZK1', [])) === '2026-10-30_ZK1.docx');
    check('单孔文件名：缺日期只写孔号', dx.buildSingleDocxFileName(mkRecord('r1', 'ZK1', [], { engineering: { projectCode: '', holeCode: 'ZK1', holeElevation: '', openDate: '' } })) === 'ZK1.docx');
    check('单孔文件名：全空兜底', dx.buildSingleDocxFileName(mkRecord('r1', '', [], { engineering: { projectCode: '', holeCode: '', holeElevation: '', openDate: '' } })) === '未命名孔.docx');
    const multi = [mkRecord('a', 'ZK1', []), mkRecord('b', 'ZK2', []), mkRecord('c', 'ZK3', [])];
    check('多孔合并文件名', dx.buildMergedDocxFileName(multi, '2026-10-30') === '开土记录_3孔_2026-10-30.docx');
    check('多孔合并：单孔回落单孔名', dx.buildMergedDocxFileName([mkRecord('a', 'ZK1', [])]) === '2026-10-30_ZK1.docx');

    // ---------- 9. 土号「原/扰」归一 + 显式字号 + 超宽自适应（2026-10-30 用户反馈） ----------
    // stripSoilNumber 矩阵（PDF/Word 共用，xlsx mergedSoilNumber 同源）
    const stripCases = [
      ['ZK1', '原1', '1'], ['ZK1', '原12', '12'], ['ZK1', '扰1', 'R1'],
      ['ZK1', 'R1', 'R1'], ['ZK1', 'r2', 'R2'], ['ZK1', 'ZK1-3', '3'],
      ['ZK1', '-1', '1'], ['ZK1', '-R1', 'R1'], ['ZK1', '1', '1'],
      ['ZK1', '01', '01'], ['ZK1', 'ZK38-1.65', 'ZK38-1.65'], ['ZK1', '', ''],
    ];
    for (const [hole, sn, want] of stripCases) {
      check(`stripSoilNumber(${hole}, ${sn})`, namingMod.stripSoilNumber(hole, sn) === want, namingMod.stripSoilNumber(hole, sn));
    }
    // docx 土号渲染：原1→-1、扰1→-R1，且 run 显式带 sz=18（防继承模板默认 15pt 撑爆行高）
    const recN = mkRecord('r1', 'ZK1', [mkSample('原1'), mkSample('扰1')]);
    const xmlN = dx.buildDocxBody(XML_A, [recN]);
    const rowsN = bodyRows(xmlN);
    check('docx 土号：原1 → -1', rowTcs(rowsN[3])[0] === '-1', rowTcs(rowsN[3])[0]);
    check('docx 土号：扰1 → -R1', rowTcs(rowsN[4])[0] === '-R1', rowTcs(rowsN[4])[0]);
    check('docx 数据行 run 显式 sz=18', xmlN.includes('<w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">-1</w:t>'));
    // PDF 土号同规则
    const recPdf = mkRecord('r1', 'ZK1', [mkSample('原1'), mkSample('扰1')]);
    const pdfPages = pdfMod.buildPdfPages(recPdf);
    check('PDF 土号：原1 → -1', pdfPages[0].cells[1] === '-1', pdfPages[0].cells[1]);
    check('PDF 土号：扰1 → -R1', pdfPages[0].cells[1001] === '-R1', pdfPages[0].cells[1001]);
    // 信息行超宽自适应：孔口标高12.5 在 69pt 格内应缩字号（sz < 22）
    const recInfo = mkRecord('r1', 'ZK1', [mkSample('1')], { engineering: { projectCode: 'EX26T2211', holeCode: 'ZK1', holeElevation: '12.5', openDate: '2026-10-30' } });
    const xmlInfo = dx.buildDocxBody(XML_A, [recInfo]);
    const infoTc9 = (bodyRows(xmlInfo)[0].match(TC_RE) || [])[9];
    const szs = (infoTc9.match(/<w:sz w:val="(\d+)"\/>/g) || []).map((x) => x.match(/\d+/)[0]);
    check('信息行孔口标高超宽缩字号（sz<22）', szs.some((v) => Number(v) < 22), szs.join(','));

    // ---------- 10. CMA 设置：页眉版本行 + 正文文件编号（2026-10-30 用户澄清） ----------
    // 用户澄清：CMA 版本号在页眉，**文件编号在正文**；页眉不再追加编号。
    {
      const rec = mkRecord('r1', 'ZK1', [mkSample('1')]);
      // 10a. 自定义 header：页眉只换版本行；文件编号写正文右对齐段落
      const cma = {
        versionLine: '第 9 版 第 2 次修改 2027 年 1 月 1 日起实施',
        docCode: 'ABC-TR999-2027',
      };
      const blobCma = await dx.buildDocxBlob([rec], new Uint8Array(TPL_A), cma);
      const filesCma = unzipSync(new Uint8Array(Buffer.from(await blobCma.arrayBuffer())));
      const hdr = strFromU8(filesCma['word/header1.xml']);
      const docCma = strFromU8(filesCma['word/document.xml']);
      check('CMA：header1.xml 含新版本行', hdr.includes('第 9 版 第 2 次修改 2027 年 1 月 1 日起实施'));
      check(
        'CMA：header1.xml 不含文件编号（编号在正文）',
        !hdr.includes('ABC-TR999-2027') && !hdr.includes('　'),
        hdr.includes('ABC-TR999-2027') ? '仍含编号' : '',
      );
      check('CMA：公司名保留', hdr.includes('公司'));
      check('CMA：模板默认版行已清除', !hdr.includes('第 3 版') && !hdr.includes('版第0次修改') && !hdr.includes('2024'));
      const paraCma = docCodeParagraph(docCma);
      check('CMA：正文编号段落文本 = 新编号', paraCma.text === 'ABC-TR999-2027', paraCma.text);
      check(
        'CMA：document.xml 含新文件编号',
        docCma.includes('<w:t xml:space="preserve">ABC-TR999-2027</w:t>'),
        '',
      );
      check(
        'CMA：正文旧编号片段已清除（TR068-202 / HLY）',
        !docCma.includes('TR068-202') && !docCma.includes('>HLY<'),
        '',
      );
      check(
        'CMA：正文右对齐段落仍只有一个（未误伤其它段落）',
        (docCma.match(/<w:jc[^>]*w:val="right"[^>]*\/>/g) || []).length === 1,
        String((docCma.match(/<w:jc[^>]*w:val="right"[^>]*\/>/g) || []).length),
      );
      check('CMA：标题「开土记录表」未被误伤', docCma.includes('>开土记录表<'));
      check('CMA：编号段落保留 pPr（右对齐）', paraCma.paragraph.includes('<w:jc w:val="right"/></w:pPr>'));
      check('CMA：编号 run 沿用模板 rPr（等线 sz=21）', paraCma.paragraph.includes('w:ascii="等线"') && paraCma.paragraph.includes('<w:sz w:val="21"/>'));
      check('CMA：表格/信息行不受页眉手术影响', docCma.includes('孔号：ZK1'));

      // 10b. 不传 header（默认 null）：页眉与正文编号都保留模板原值
      const blobDef = await dx.buildDocxBlob([rec], new Uint8Array(TPL_A));
      const filesDef = unzipSync(new Uint8Array(Buffer.from(await blobDef.arrayBuffer())));
      const hdrDef = strFromU8(filesDef['word/header1.xml']);
      const docDef = strFromU8(filesDef['word/document.xml']);
      check('CMA：不传 header 模板版行原样', hdrDef.includes('版第0次修改 202') && hdrDef.includes('日起实施'));
      check('CMA：不传 header 正文保留模板编号', docCodeParagraph(docDef).text === 'SHLY-TR068-2024', docCodeParagraph(docDef).text);
      check('CMA：不传 header 无新编号', !hdrDef.includes('ABC-TR999-2027') && !docDef.includes('ABC-TR999-2027'));

      // 10c. docCode 为空/纯空白：保留模板编号（只换版本行）
      const blobBlank = await dx.buildDocxBlob([rec], new Uint8Array(TPL_A), {
        versionLine: '第 9 版',
        docCode: '   ',
      });
      const filesBlank = unzipSync(new Uint8Array(Buffer.from(await blobBlank.arrayBuffer())));
      check('CMA：空文件编号保留模板编号', docCodeParagraph(strFromU8(filesBlank['word/document.xml'])).text === 'SHLY-TR068-2024');
      check('CMA：空文件编号时页眉仍替换版本行', strFromU8(filesBlank['word/header1.xml']).includes('第 9 版'));

      // 10d. 特殊字符转义（页眉版本行 + 正文编号）
      const blobEsc = await dx.buildDocxBlob([rec], new Uint8Array(TPL_A), {
        versionLine: '第<A>&"版',
        docCode: 'X&Y',
      });
      const filesEsc = unzipSync(new Uint8Array(Buffer.from(await blobEsc.arrayBuffer())));
      const hdrEsc = strFromU8(filesEsc['word/header1.xml']);
      const docEsc = strFromU8(filesEsc['word/document.xml']);
      check('CMA：页眉版本行特殊字符 esc', hdrEsc.includes('第&lt;A&gt;&amp;&quot;版'));
      check('CMA：正文文件编号特殊字符 esc', docEsc.includes('<w:t xml:space="preserve">X&amp;Y</w:t>'));
      check('CMA：正文文件编号原始 & 不再出现', !docEsc.includes('>X&Y<'));

      // 10e. B 模板同样生效
      const blobB = await dx.buildDocxBlob([mkRecord('r1', 'ZK1', [mkSample('1')], { mode: 'B' })], new Uint8Array(TPL_B), {
        versionLine: '第 9 版',
        docCode: 'B-CODE',
      });
      const filesB = unzipSync(new Uint8Array(Buffer.from(await blobB.arrayBuffer())));
      const hdrB = strFromU8(filesB['word/header1.xml']);
      const docB = strFromU8(filesB['word/document.xml']);
      check('CMA：B 模板页眉同样替换版本行', hdrB.includes('第 9 版'));
      check('CMA：B 模板页眉不含文件编号', !hdrB.includes('B-CODE'));
      check('CMA：B 模板正文写入文件编号', docCodeParagraph(docB).text === 'B-CODE', docCodeParagraph(docB).text);
      check('CMA：B 模板标题与表格保留', docB.includes('>开土记录表<') && docB.includes('孔号：ZK1'));
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  })().catch((e) => {
    console.error('FAIL  roundtrip 异常 =>', e.message);
    process.exit(1);
  });
}
