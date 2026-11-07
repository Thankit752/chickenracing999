import { api, esc, baht, int, dateTh, badge, toast, ROLE_TH } from './common.js';

const summary = document.getElementById('summary');
const rows = document.getElementById('rows');
const dlg = document.getElementById('dlg');
const form = document.getElementById('form');
const formError = document.getElementById('formError');
let lk;
let roleRates = {};

async function load() {
  const d = await api('/api/commissions');
  roleRates = d.roleRates;
  document.getElementById('rules').textContent =
    `${ROLE_TH.LEAD}: อัตราประจำตัวของพนักงาน (1.50–2.50%) · ${ROLE_TH.ASSIST}: ${roleRates.ASSIST.toFixed(2)}% · ` +
    `${ROLE_TH.REFERRAL}: ${roleRates.REFERRAL.toFixed(2)}% · หนึ่งดีลมีผู้ปิดการขายได้คนเดียว`;
  summary.innerHTML = d.summary.map((s) => `<tr>
    <td><div>${esc(s.full_name)}</div><div class="cust-type">${esc(s.emp_code)}${s.is_active ? '' : ' · ลาออกแล้ว'}</div></td>
    <td>${esc(s.branch_name)}</td>
    <td class="num">${baht(s.base_commission_pct)}%</td>
    <td class="num">${int(s.deals)}</td>
    <td class="num"><b>${baht(s.total)}</b></td>
    <td class="num">${baht(s.paid)}</td>
    <td class="num${s.unpaid > 0 ? ' neg' : ''}">${baht(s.unpaid)}</td>
  </tr>`).join('');
  rows.innerHTML = d.rows.map((r) => `<tr>
    <td><div>${esc(r.sale_no)}</div><div class="cust-type">${dateTh(r.sale_date)}</div></td>
    <td>${esc(r.model)}</td>
    <td>${esc(r.full_name)}</td>
    <td>${ROLE_TH[r.role_in_deal]}</td>
    <td class="num">${baht(r.sale_price)}</td>
    <td class="num">${baht(r.commission_pct)}%</td>
    <td class="num"><b>${baht(r.commission_amount)}</b></td>
    <td>${r.paid_date ? `${badge('paid')} <span class="cust-type">${dateTh(r.paid_date)}</span>` : badge('unpaid')}</td>
    <td class="actions">${r.paid_date ? '' : `
      <button class="btn" type="button" data-pay="${r.sale_id}/${r.salesperson_id}">จ่ายแล้ว</button>
      <button class="btn btn-danger" type="button" data-del="${r.sale_id}/${r.salesperson_id}">ลบ</button>`}</td>
  </tr>`).join('');
}

// แสดงสูตรและยอดก่อนบันทึก — ใช้สูตรเดียวกับฝั่งฐานข้อมูล
function preview() {
  const sale = lk.sales.find((s) => String(s.sale_id) === form.f_sale.value);
  const sp = lk.salespeople.find((p) => String(p.salesperson_id) === form.f_sp.value);
  if (!sale || !sp) return;
  const pct = form.f_role.value === 'LEAD' ? sp.base_commission_pct : roleRates[form.f_role.value];
  const amount = Math.round(sale.sale_price * pct) / 100;
  document.getElementById('calcText').textContent = `${baht(sale.sale_price)} × ${baht(pct)}% =`;
  document.getElementById('calcAmount').textContent = baht(amount);
}

function openForm() {
  form.reset();
  formError.hidden = true;
  dlg.showModal();
  preview();
}

form.addEventListener('change', preview);
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/commissions', {
      method: 'POST',
      body: { sale_id: form.f_sale.value, salesperson_id: form.f_sp.value, role_in_deal: form.f_role.value },
    });
    dlg.close();
    toast('บันทึกค่านายหน้าแล้ว');
    load();
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
  }
});

rows.addEventListener('click', async (e) => {
  const pay = e.target.closest('[data-pay]');
  const del = e.target.closest('[data-del]');
  try {
    if (pay) {
      await api(`/api/commissions/${pay.dataset.pay}/pay`, { method: 'PATCH' });
      toast('บันทึกการจ่ายค่านายหน้าแล้ว');
      load();
    }
    if (del && confirm('ลบค่านายหน้ารายการนี้?')) {
      await api(`/api/commissions/${del.dataset.del}`, { method: 'DELETE' });
      toast('ลบค่านายหน้าแล้ว');
      load();
    }
  } catch (err) { alert(err.message); }
});

document.getElementById('addBtn').addEventListener('click', openForm);
document.getElementById('cancel').addEventListener('click', () => dlg.close());

try {
  lk = await api('/api/lookups');
  form.f_sale.innerHTML = lk.sales.map((s) =>
    `<option value="${s.sale_id}">${esc(s.sale_no)} · ${esc(s.model)} · ${baht(s.sale_price)}</option>`).join('');
  form.f_sp.innerHTML = lk.salespeople.map((p) =>
    `<option value="${p.salesperson_id}">${esc(p.full_name)} (${baht(p.base_commission_pct)}%)</option>`).join('');
  await load();
} catch (err) {
  summary.innerHTML = `<tr><td colspan="7"><p class="error">${esc(err.message)}</p></td></tr>`;
}
