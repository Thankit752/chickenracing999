import { api, esc, toast } from './common.js';

const rows = document.getElementById('rows');
const search = document.getElementById('search');
const dlg = document.getElementById('dlg');
const form = document.getElementById('form');
const phoneRows = document.getElementById('phoneRows');
const formError = document.getElementById('formError');
const PHONE_TYPE = { MOBILE: 'มือถือ', HOME: 'บ้าน', WORK: 'ที่ทำงาน' };
let customers = [];
let editingId = null;

// มือถือ 10 หลัก → 081-234-5678 · เบอร์บ้าน 9 หลัก → 02-123-4567
const formatPhone = (n) => (n.length === 10
  ? n.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')
  : n.replace(/^(\d{2})(\d{3})(\d{4})$/, '$1-$2-$3'));

const plate = (p) => `<span class="plate${p.is_primary ? ' primary' : ''}">
  <b>${esc(formatPhone(p.phone_no))}</b>
  <small>${PHONE_TYPE[p.phone_type]}${p.is_primary ? ' · หลัก' : ''}</small></span>`;

function render() {
  if (customers.length === 0) {
    rows.innerHTML = `<tr><td colspan="6" class="empty">${search.value ? 'ไม่พบลูกค้าที่ตรงคำค้น' : 'ยังไม่มีลูกค้า — กด "เพิ่มลูกค้า"'}</td></tr>`;
    return;
  }
  rows.innerHTML = customers.map((c) => `
    <tr>
      <td class="num">${c.customer_id}</td>
      <td><div>${esc(c.first_name)} ${esc(c.last_name)}</div>
          <div class="cust-type">${c.customer_type === 'CORPORATE' ? 'นิติบุคคล' : 'บุคคลทั่วไป'}</div></td>
      <td><div class="plates">${c.phones.map(plate).join('')}</div></td>
      <td>${esc(c.email || '—')}</td>
      <td class="num">${c.sale_count}</td>
      <td><div class="row-actions">
        <button class="btn" type="button" data-edit="${c.customer_id}">แก้ไข</button>
        <button class="btn btn-danger" type="button" data-del="${c.customer_id}">ลบ</button>
      </div></td>
    </tr>`).join('');
}

async function load() {
  try {
    customers = await api(`/api/customers?q=${encodeURIComponent(search.value)}`);
    render();
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="6"><p class="error">${esc(err.message)}</p></td></tr>`;
  }
}

function addPhoneRow(p = { phone_no: '', phone_type: 'MOBILE', is_primary: false }) {
  const row = document.createElement('div');
  row.className = 'phone-row';
  row.innerHTML = `
    <input name="phone_no" inputmode="tel" placeholder="0812345678" value="${esc(p.phone_no)}" aria-label="เบอร์โทร">
    <select name="phone_type" aria-label="ประเภทเบอร์">
      ${Object.entries(PHONE_TYPE).map(([v, t]) => `<option value="${v}"${v === p.phone_type ? ' selected' : ''}>${t}</option>`).join('')}
    </select>
    <label><input type="radio" name="primary"${p.is_primary ? ' checked' : ''}> เบอร์หลัก</label>
    <button class="btn btn-ghost" type="button" data-remove aria-label="ลบเบอร์นี้">ลบ</button>`;
  phoneRows.append(row);
}

function openForm(c = null) {
  editingId = c?.customer_id ?? null;
  document.getElementById('dlgTitle').textContent = c ? `แก้ไขลูกค้า #${c.customer_id}` : 'เพิ่มลูกค้า';
  document.getElementById('saveBtn').textContent = c ? 'บันทึกการแก้ไข' : 'บันทึกลูกค้า';
  form.reset();
  formError.hidden = true;
  for (const f of ['first_name', 'last_name', 'email', 'customer_type']) form.elements[f].value = c?.[f] ?? form.elements[f].value;
  form.elements.customer_type.value = c?.customer_type ?? 'INDIVIDUAL';
  phoneRows.innerHTML = '';
  (c?.phones.length ? c.phones : [{ phone_no: '', phone_type: 'MOBILE', is_primary: true }]).forEach(addPhoneRow);
  dlg.showModal();
  form.elements.first_name.focus();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    first_name: form.elements.first_name.value,
    last_name: form.elements.last_name.value,
    email: form.elements.email.value,
    customer_type: form.elements.customer_type.value,
    phones: [...phoneRows.querySelectorAll('.phone-row')].map((r) => ({
      phone_no: r.querySelector('[name=phone_no]').value,
      phone_type: r.querySelector('[name=phone_type]').value,
      is_primary: r.querySelector('[name=primary]').checked,
    })),
  };
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  try {
    await api(editingId ? `/api/customers/${editingId}` : '/api/customers', { method: editingId ? 'PUT' : 'POST', body });
    dlg.close();
    toast(editingId ? 'บันทึกการแก้ไขแล้ว' : 'บันทึกลูกค้าแล้ว');
    load();
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
  } finally {
    saveBtn.disabled = false;
  }
});

phoneRows.addEventListener('click', (e) => {
  if (!e.target.matches('[data-remove]')) return;
  if (phoneRows.children.length === 1) {
    formError.textContent = 'ลูกค้าต้องมีเบอร์โทรอย่างน้อย 1 เบอร์';
    formError.hidden = false;
    return;
  }
  e.target.closest('.phone-row').remove();
});

rows.addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (edit) openForm(customers.find((c) => c.customer_id === Number(edit.dataset.edit)));
  if (del) {
    const c = customers.find((x) => x.customer_id === Number(del.dataset.del));
    if (!confirm(`ลบ ${c.first_name} ${c.last_name} และเบอร์โทรทั้ง ${c.phones.length} เบอร์?`)) return;
    try {
      await api(`/api/customers/${c.customer_id}`, { method: 'DELETE' });
      toast('ลบลูกค้าแล้ว');
      load();
    } catch (err) {
      alert(err.message);
    }
  }
});

document.getElementById('addBtn').addEventListener('click', () => openForm());
document.getElementById('addPhone').addEventListener('click', () => addPhoneRow());
document.getElementById('cancelBtn').addEventListener('click', () => dlg.close());
let timer;
search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });

load();
