// 生成续接编号夹具 tri-delivery-cont.xlsx：孔号 ZK1 显式写、土样 7~12（接 tri-delivery.xlsx 的 1~6）
// 用途：probe_import_multifile.mjs 验证跨文件同孔正常合并（不触发重复起始拒绝）。
// 运行：node qa_harness/_emit/gen_tri_cont.cjs（exceljs 从 kaitu-app/node_modules 解析）
const path = require('path');
const XL = require('exceljs');

(async () => {
  const wb = new XL.Workbook();
  const ws = wb.addWorksheet('送样单');
  ws.getRow(1).getCell(1).value = '土工试验送样单';
  ws.getRow(2).getCell(1).value = '工程名称：故城县城区水系连通工程';
  ws.getRow(3).getCell(1).value = '孔号';
  ws.getRow(3).getCell(2).value = 'ZK1';
  ws.getRow(4).getCell(1).value = '土样编号';
  ws.getRow(4).getCell(2).value = '野外定名';
  const heads = ['自', '至', '原状', '扰动', '常规物性', '液塑限', '颗分', '压缩系数压缩模量', '垂直渗透', '水平渗透', '饱和固结快剪', '自然快剪'];
  heads.forEach((h, i) => { ws.getRow(5).getCell(i + 3).value = h; });
  const rows = [
    ['7', '粉砂', '6.0', '6.5'],
    ['8', '轻粉质壤土', '6.5', '7.0'],
    ['9', '中粉质壤土', '7.0', '7.5'],
    ['10', '重粉质壤土', '7.5', '8.0'],
    ['11', '粉粘土', '8.0', '8.5'],
    ['12', '粘土', '8.5', '9.0'],
  ];
  rows.forEach(([no, name, from, to], i) => {
    const r = ws.getRow(6 + i);
    r.getCell(1).value = no;
    r.getCell(2).value = name;
    r.getCell(3).value = from;
    r.getCell(4).value = to;
    r.getCell(5).value = '√';
    r.getCell(7).value = '√';
  });
  ws.getRow(12).getCell(1).value = '送样人：';
  const out = path.join(__dirname, 'fixtures', 'tri-delivery-cont.xlsx');
  await wb.xlsx.writeFile(out);
  console.log('written', out);
})().catch((e) => { console.error(e); process.exit(1); });
