// Creates tests/e2e/test-po.pdf and pdf-expect.json from the seed's master data.
const { jsPDF } = require('jspdf'); const fs = require('fs'); const path = require('path');
const SEED = process.env.OT_SEED || path.join(__dirname, 'seed', 'ordertrack-database.json');
const d = JSON.parse(fs.readFileSync(SEED)); const ms = Object.fromEntries(d.masters.map(m => [m.id, m.items]));
const c = ms.customers[5], p1 = ms.products[2], p2 = ms.products[7];
const doc = new jsPDF(); doc.setFontSize(16); doc.text('PURCHASE ORDER', 20, 20); doc.setFontSize(11);
const L = ['PO No: PO/TEST/7781', 'PO Date: 01/11/2026', 'Supplier SO Ref: SO 55210', 'Bill To: ' + c.name, 'Ship To: ' + c.name, 'Delivery required by: 28/11/2026', 'Incoterms: ' + ms.incoterms[3].name, 'Payment terms: ' + ms.payment[1].name, '', 'Line  Item code    Description    Qty',
  '1     ' + p1.code + '   ' + p1.name + '   2,000 kg   Packing: ' + ms.packing[0].name, '2     ' + p2.code + '   ' + p2.name + '   1.5 MT', '3     ZZZ-UNKNOWN-9   Mystery Compound X   500 kg', '', 'Remarks: COA required with every batch.'];
L.forEach((t, i) => doc.text(t, 20, 34 + i * 8)); fs.writeFileSync(path.join(__dirname, 'test-po.pdf'), Buffer.from(doc.output('arraybuffer')));
fs.writeFileSync(path.join(__dirname, 'pdf-expect.json'), JSON.stringify({ customer: c.name, p1: p1.code, p2: p2.code, inco: ms.incoterms[3].name, pay: ms.payment[1].name, pack: ms.packing[0].name }));
console.log('fixtures written');
