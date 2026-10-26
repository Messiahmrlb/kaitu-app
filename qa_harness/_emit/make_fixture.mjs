import ExcelJS from 'exceljs';
const TRI = ['轻粉质壤土', '中粉质壤土', '重粉质壤土', '粉粘土', '粘土', '粉砂'];
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('送样单');
ws.getCell('A1').value = '土工试验送样单';
ws.getCell('A2').value = '工程名称：故城县城区水系连通工程';
ws.getCell('A3').value = '孔号';
ws.getCell('B3').value = 'ZK1';
ws.getCell('A4').value = '土样编号';
ws.getCell('B4').value = '野外定名';
['C','D','E','F','G','H','I','J','K','L','M','N'].forEach((c, i) => {
  ws.getCell(`${c}5`).value = ['自','至','原状','扰动','常规物性','液塑限','颗分','压缩系数压缩模量','垂直渗透','水平渗透','饱和固结快剪','自然快剪'][i];
});
TRI.forEach((name, i) => {
  const r = 6 + i;
  ws.getCell(`A${r}`).value = i + 1;
  ws.getCell(`B${r}`).value = name;
  ws.getCell(`C${r}`).value = (3 + i * 0.5).toFixed(1);
  ws.getCell(`D${r}`).value = (3.5 + i * 0.5).toFixed(1);
  ws.getCell(`E${r}`).value = '√';
  ws.getCell(`G${r}`).value = '√';
});
ws.getCell(`A${6 + TRI.length}`).value = '送样人：';
await wb.xlsx.writeFile('qa_harness/_emit/fixtures/tri-delivery.xlsx');
console.log('fixture written');
