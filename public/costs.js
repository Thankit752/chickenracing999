import { api, esc, baht, int, dateTh, today, badge, toast } from './common.js';

const rows = document.getElementById('rows');
const filter = document.getElementById('filter');
const search = document.getElementById('search');
const dlg = document.getElementById('dlg');
const hcForm = document.getElementById('hcForm');
const hcRows = document.getElementById('hcRows');
const hcError = document.getElementById('hcError');
let units = [];
let categories = [];
let current = null;   // รถคันที่เปิดดูอยู่
let editing = null;   // hidden_cost_id ที่กำลังแก้

const money = (v) => (v === null || v === undefined ? '—' : baht(v));

function visible() {
  const q = search.value.trim().toLowerCase();
  return units.filter((u) =>
    (filter.value === '' || (filter.value === 'SOLD' ? u.status === 'SOLD' : u.status !== 'SOLD')) &&
    (!q || `${u.vin} ${u.model} ${u.branch_name}`.toLowerCase().includes(q)));
}

function render() {
  const list = visible();
  const stock = units.filter((u) => u.status !== 'SOLD');
  const sold = units.filter((u) => u.status === 'SOLD');
  document.getElementById('summary').innerHTML =
    `รถค้างสต็อก ${int(stock.length)} คัน ทุนจมรวม <b>${baht(stock.reduce((s, u) => s + u.landed_cost, 0))}</b> บาท · ` +
    `รถที่ขายแล้ว ${int(sold.length)} คัน กำไรสุทธิรวม <b>${baht(sold.reduce((s, u) => s + u.net_profit, 0))}</b> บาท ` +
    `(ค่าใช้จ่ายแฝงรวม ${baht(sold.reduce((s, u) => s + u.hidden_cost, 0))} บาท)`;
  if (!list.length) { rows.innerHTML = '<tr><td colspan="10" class="empty">ไม่มีรถที่ตรงเงื่อนไข</td></tr>'; return; }
  rows.innerHTML = list.map((u) => `<tr>
    <td>${esc(u.vin)}</td>
    <td><div>${esc(u.model)} · ${esc(u.color)}</div><div class="cust-type">${esc(u.branch_name)} · รับเข้า ${dateTh(u.receive_date)}</div></td>
    <td>${badge(u.status)}</td>
    <td class="num">${baht(u.purchase_cost)}</td>
    <td class="num">${baht(u.hidden_cost)}<div class="cust-type">${int(u.hidden_count)} รายการ</div></td>
    <td class="num"><b>${baht(u.landed_cost)}</b></td>
    <td class="num">${money(u.sale_price)}</td>
    <td class="num">${u.sale_price === null ? '—' : baht(u.commission)}</td>
    <td class="num${u.net_profit < 0 ? ' neg' : ''}">${money(u.net_profit)}</td>
    <td class="actions"><button class="btn" type="button" data-unit="${u.unit_id}">ค่าใช้จ่ายแฝง</button></td>
  </tr>`).join('');
}

async function loadUnits() {
  units = await api('/api/units');
  render();
}

function resetForm() {
  editing = null;
  hcForm.reset();
  hcForm.hc_date.value = today();
  hcError.hidden = true;
  document.getElementById('hcLegend').textContent = 'เพิ่มค่าใช้จ่ายแฝง';
  document.getElementById('hcSave').textContent = 'เพิ่มรายการ';
  document.getElementById('hcCancel').hidden = true;
}

let costs = [];
async function loadCosts() {
  costs = await api(`/api/units/${current.unit_id}/hidden-costs`);
  const u = units.find((x) => x.unit_id === current.unit_id);
  document.getElementById('dlgInfo').innerHTML =
    `${esc(u.model)} · ${esc(u.branch_name)} · ${badge(u.status)} — ราคาซื้อ ${baht(u.purchase_cost)} + ค่าใช้จ่ายแฝง ${baht(u.hidden_cost)} = ต้นทุนจริง <b>${baht(u.landed_cost)}</b> บาท`;
  hcRows.innerHTML = costs.length ? costs.map((h) => `<tr>
    <td>${dateTh(h.cost_date)}</td>
    <td>${esc(h.category_name)}</td>
    <td class="num">${baht(h.amount)}</td>
    <td>${esc(h.reference_no || '—')}${h.note ? `<div class="cust-type">${esc(h.note)}</div>` : ''}</td>
    <td class="actions"><button class="btn" type="button" data-edit="${h.hidden_cost_id}">แก้ไข</button>
        <button class="btn btn-danger" type="button" data-del="${h.hidden_cost_id}">ลบ</button></td>
  </tr>`).join('') : '<tr><td colspan="5" class="empty">ยังไม่มีค่าใช้จ่ายแฝง — เพิ่มด้านล่าง</td></tr>';
}

async function openUnit(id) {
  current = units.find((u) => u.unit_id === id);
  document.getElementById('dlgTitle').textContent = `ค่าใช้จ่ายแฝง · ${current.vin}`;
  resetForm();
  await loadCosts();
  dlg.showModal();
}

// หลังเพิ่ม/แก้/ลบ — โหลดตารางรถใหม่ (ต้นทุนจริงเปลี่ยน) แล้วโหลดรายการในหน้าต่างใหม่
async function refreshAfterChange(message) {
  toast(message);
  await loadUnits();
  await loadCosts();
}

hcForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    unit_id: current.unit_id, category_id: hcForm.hc_cat.value, cost_date: hcForm.hc_date.value,
    amount: hcForm.hc_amount.value, reference_no: hcForm.hc_ref.value, note: hcForm.hc_note.value,
  };
  try {
    if (editing) await api(`/api/hidden-costs/${editing}`, { method: 'PUT', body });
    else await api('/api/hidden-costs', { method: 'POST', body });
    const msg = editing ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มค่าใช้จ่ายแฝงแล้ว';
    resetForm();
    await refreshAfterChange(msg);
  } catch (err) {
    hcError.textContent = err.message;
    hcError.hidden = false;
  }
});

hcRows.addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (edit) {
    const h = costs.find((x) => x.hidden_cost_id === Number(edit.dataset.edit));
    editing = h.hidden_cost_id;
    hcForm.hc_cat.value = h.category_id;
    hcForm.hc_date.value = h.cost_date;
    hcForm.hc_amount.value = h.amount;
    hcForm.hc_ref.value = h.reference_no || '';
    hcForm.hc_note.value = h.note || '';
    hcError.hidden = true;
    document.getElementById('hcLegend').textContent = 'แก้ไขค่าใช้จ่ายแฝง';
    document.getElementById('hcSave').textContent = 'บันทึกการแก้ไข';
    document.getElementById('hcCancel').hidden = false;
    hcForm.hc_amount.focus();
  }
  if (del) {
    if (!confirm('ลบค่าใช้จ่ายแฝงรายการนี้?')) return;
    try {
      await api(`/api/hidden-costs/${del.dataset.del}`, { method: 'DELETE' });
      if (editing === Number(del.dataset.del)) resetForm();
      await refreshAfterChange('ลบค่าใช้จ่ายแฝงแล้ว');
    } catch (err) { alert(err.message); }
  }
});

rows.addEventListener('click', (e) => {
  const b = e.target.closest('[data-unit]');
  if (b) openUnit(Number(b.dataset.unit));
});
document.getElementById('hcCancel').addEventListener('click', resetForm);
document.getElementById('close').addEventListener('click', () => dlg.close());
filter.addEventListener('change', render);
search.addEventListener('input', render);

try {
  const lk = await api('/api/lookups');
  categories = lk.hiddenCategories;
  hcForm.hc_cat.innerHTML = categories.map((c) => `<option value="${c.category_id}">${esc(c.category_name)}</option>`).join('');
  await loadUnits();
} catch (err) {
  rows.innerHTML = `<tr><td colspan="10"><p class="error">${esc(err.message)}</p></td></tr>`;
}
