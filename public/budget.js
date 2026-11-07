import { api, esc, baht, int, dateTh, today, badge, toast } from './common.js';

const periodSel = document.getElementById('period');
const budgetRows = document.getElementById('budgetRows');
const poRows = document.getElementById('poRows');
const poDlg = document.getElementById('poDlg');
const poForm = document.getElementById('poForm');
const itemRows = document.getElementById('itemRows');
const poError = document.getElementById('poError');
let lk;            // ข้อมูลตัวเลือก (สาขา ผู้จำหน่าย รอบงบ รุ่นรถ)
let budget = [];   // บรรทัดงบของรอบที่เลือก

const periodName = (p) => `ปีงบ ${p.fiscal_year} ไตรมาส ${p.quarter}${p.status === 'CLOSED' ? ' (ปิดแล้ว)' : ''}`;
const options = (list, val, label) => list.map((x) => `<option value="${x[val]}">${esc(label(x))}</option>`).join('');

async function loadBudget() {
  budget = await api(`/api/budget?period_id=${periodSel.value}`);
  if (!budget.length) {
    budgetRows.innerHTML = '<tr><td colspan="5" class="empty">รอบงบนี้ยังไม่มีการจัดสรรงบ</td></tr>';
    return;
  }
  let html = '';
  let branch;
  for (const r of budget) {
    if (r.branch_id !== branch) {
      branch = r.branch_id;
      html += `<tr class="branch-row"><td colspan="5">${esc(r.branch_name)}</td></tr>`;
    }
    const pct = r.amount_allocated ? (r.spent / r.amount_allocated) * 100 : 0;
    const over = pct > 100;
    html += `<tr>
      <td>${esc(r.category_name)}</td>
      <td class="num">${baht(r.amount_allocated)}</td>
      <td class="num">${baht(r.spent)}</td>
      <td class="num${over ? ' neg' : ''}">${baht(r.amount_allocated - r.spent)}</td>
      <td><div class="pct"><div class="meter${over ? ' over' : ''}"><span style="width:${Math.min(pct, 100)}%"></span></div>
          <b>${over ? '<span class="over-label">เกินงบ</span>' : `${pct.toFixed(1)}%`}</b></div></td>
    </tr>`;
  }
  budgetRows.innerHTML = html;
}

async function loadPOs() {
  const list = await api(`/api/purchase-orders?period_id=${periodSel.value}`);
  if (!list.length) {
    poRows.innerHTML = '<tr><td colspan="8" class="empty">รอบนี้ยังไม่มีใบสั่งซื้อ — กด "บันทึกใบสั่งซื้อ"</td></tr>';
    return;
  }
  poRows.innerHTML = list.map((po) => `<tr>
    <td><button class="link-btn" type="button" data-view="${po.po_id}">${esc(po.po_no)}</button></td>
    <td>${dateTh(po.order_date)}</td>
    <td>${esc(po.branch_name)}</td>
    <td>${esc(po.supplier_name)}</td>
    <td class="num">${int(po.units)}</td>
    <td class="num">${baht(po.total)}</td>
    <td>${badge(po.status)}</td>
    <td class="actions">
      ${po.status === 'DRAFT' ? `<button class="btn" type="button" data-status="APPROVED" data-id="${po.po_id}">อนุมัติ</button>` : ''}
      ${['DRAFT', 'APPROVED'].includes(po.status) ? `<button class="btn btn-danger" type="button" data-status="CANCELLED" data-id="${po.po_id}">ยกเลิก</button>` : ''}
    </td>
  </tr>`).join('');
}

const reload = () => Promise.all([loadBudget(), loadPOs()]).catch((err) => {
  budgetRows.innerHTML = `<tr><td colspan="5"><p class="error">${esc(err.message)}</p></td></tr>`;
});

// ---------- ฟอร์มใบสั่งซื้อ ----------
function addItemRow() {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <select name="model_id" aria-label="รุ่นรถ" required><option value="">เลือกรุ่น</option>${options(lk.models, 'model_id', (m) => `${m.brand} ${m.model_name}`)}</select>
    <input name="qty" type="number" min="1" max="999" value="1" aria-label="จำนวน" required>
    <input name="unit_cost" type="number" min="1" step="0.01" aria-label="ราคาต่อคัน" required>
    <input name="discount_amount" type="number" min="0" step="0.01" value="0" aria-label="ส่วนลดรวม">
    <button class="btn btn-ghost" type="button" data-remove aria-label="ลบรายการนี้">ลบ</button>`;
  itemRows.append(row);
}

function readItems() {
  return [...itemRows.querySelectorAll('.item-row')].map((r) => ({
    model_id: r.querySelector('[name=model_id]').value,
    qty: Number(r.querySelector('[name=qty]').value),
    unit_cost: Number(r.querySelector('[name=unit_cost]').value),
    discount_amount: Number(r.querySelector('[name=discount_amount]').value || 0),
  }));
}

// แสดงยอดรวมสด ๆ และงบคงเหลือของสาขา/รอบที่เลือก
async function updateTotal() {
  const total = readItems().reduce((s, it) => s + (it.qty || 0) * (it.unit_cost || 0) - (it.discount_amount || 0), 0);
  document.getElementById('poTotal').textContent = baht(total);
  const remainEl = document.getElementById('poRemain');
  const lines = await api(`/api/budget?period_id=${poForm.po_period.value}`).catch(() => []);
  const line = lines.find((l) => l.cost_type === 'PURCHASE' && String(l.branch_id) === poForm.po_branch.value);
  if (!line) { remainEl.innerHTML = '<span class="over-label">สาขานี้ไม่มีงบจัดซื้อในรอบนี้</span>'; return; }
  const remain = line.amount_allocated - line.spent;
  remainEl.innerHTML = total > remain
    ? `<span class="over-label">เกินงบคงเหลือ ${baht(remain)}</span>`
    : `งบคงเหลือหลังบันทึก ${baht(remain - total)}`;
}

// วันที่สั่งซื้อต้องอยู่ในรอบงบ: ใช้วันนี้ถ้าอยู่ในช่วง ไม่งั้นใช้วันแรกของรอบ และจำกัดช่วงในปฏิทิน
function setDefaultDate() {
  const p = lk.periods.find((x) => String(x.period_id) === poForm.po_period.value);
  if (!p) return;
  const t = today();
  poForm.po_date.min = p.start_date;
  poForm.po_date.max = p.end_date;
  poForm.po_date.value = t >= p.start_date && t <= p.end_date ? t : p.start_date;
}

function openPoForm() {
  poForm.reset();
  poError.hidden = true;
  poForm.po_period.innerHTML = options(lk.periods.filter((p) => p.status === 'OPEN'), 'period_id', periodName);
  if ([...poForm.po_period.options].some((o) => o.value === periodSel.value)) poForm.po_period.value = periodSel.value;
  setDefaultDate();
  itemRows.innerHTML = '';
  addItemRow();
  poDlg.showModal();
  updateTotal();
  poForm.po_no.focus();
}

itemRows.addEventListener('change', (e) => {
  // เลือกรุ่นแล้วเติมราคาต้นทุนมาตรฐานให้ แก้เองได้
  if (e.target.name === 'model_id') {
    const m = lk.models.find((x) => String(x.model_id) === e.target.value);
    const cost = e.target.closest('.item-row').querySelector('[name=unit_cost]');
    if (m && !cost.value) cost.value = m.standard_cost;
  }
  updateTotal();
});
itemRows.addEventListener('input', updateTotal);
itemRows.addEventListener('click', (e) => {
  if (!e.target.matches('[data-remove]')) return;
  if (itemRows.children.length > 1) e.target.closest('.item-row').remove();
  updateTotal();
});
poForm.po_branch.addEventListener('change', updateTotal);
poForm.po_period.addEventListener('change', () => { setDefaultDate(); updateTotal(); });
document.getElementById('addItem').addEventListener('click', addItemRow);

poForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const save = document.getElementById('poSave');
  save.disabled = true;
  try {
    await api('/api/purchase-orders', {
      method: 'POST',
      body: {
        po_no: poForm.po_no.value, period_id: poForm.po_period.value, branch_id: poForm.po_branch.value,
        supplier_id: poForm.po_supplier.value, order_date: poForm.po_date.value,
        expected_date: poForm.po_expected.value || null, items: readItems(),
      },
    });
    poDlg.close();
    toast('บันทึกใบสั่งซื้อแล้ว (สถานะ: ร่าง)');
    periodSel.value = poForm.po_period.value;
    reload();
  } catch (err) {
    poError.textContent = err.message;
    poError.hidden = false;
  } finally {
    save.disabled = false;
  }
});

// ---------- รายการใบสั่งซื้อ ----------
poRows.addEventListener('click', async (e) => {
  const view = e.target.closest('[data-view]');
  const act = e.target.closest('[data-status]');
  if (view) {
    const po = await api(`/api/purchase-orders/${view.dataset.view}`);
    document.getElementById('viewTitle').textContent = `ใบสั่งซื้อ ${po.po_no}`;
    document.getElementById('viewBody').innerHTML = `
      <p>${esc(po.branch_name)} · ${esc(po.supplier_name)} · สั่ง ${dateTh(po.order_date)} · คาดว่าได้รับ ${dateTh(po.expected_date)} · ${badge(po.status)}</p>
      <div class="table-wrap"><table>
        <thead><tr><th class="num">บรรทัด</th><th>รุ่น</th><th class="num">จำนวน</th><th class="num">ราคาต่อคัน</th><th class="num">ส่วนลด</th><th class="num">รวม</th></tr></thead>
        <tbody>${po.items.map((i) => `<tr><td class="num">${i.line_no}</td><td>${esc(i.model)}</td><td class="num">${int(i.qty)}</td>
          <td class="num">${baht(i.unit_cost)}</td><td class="num">${baht(i.discount_amount)}</td><td class="num">${baht(i.line_total)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="total-line"><span>รับรถเข้าสต็อกแล้ว ${int(po.received)} จาก ${int(po.units)} คัน</span><span>ยอดรวม <b>${baht(po.total)}</b></span></p>`;
    document.getElementById('viewDlg').showModal();
  }
  if (act) {
    const label = act.dataset.status === 'APPROVED' ? 'อนุมัติ' : 'ยกเลิก';
    if (act.dataset.status === 'CANCELLED' && !confirm('ยกเลิกใบสั่งซื้อนี้? ยอดจะไม่นับเป็นการใช้งบอีก')) return;
    try {
      await api(`/api/purchase-orders/${act.dataset.id}/status`, { method: 'PATCH', body: { status: act.dataset.status } });
      toast(`${label}ใบสั่งซื้อแล้ว`);
      reload();
    } catch (err) { alert(err.message); }
  }
});

document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
document.getElementById('newPo').addEventListener('click', openPoForm);
periodSel.addEventListener('change', reload);

try {
  lk = await api('/api/lookups');
  periodSel.innerHTML = options(lk.periods, 'period_id', periodName);
  // เริ่มที่รอบงบที่เปิดอยู่และมีการจัดสรร (ปีงบ 2569 ไตรมาส 2 ในข้อมูลตัวอย่าง)
  const all = await api('/api/budget');
  const open = all.find((l) => l.period_status === 'OPEN');
  if (open) periodSel.value = open.period_id;
  poForm.po_branch.innerHTML = options(lk.branches, 'branch_id', (b) => b.branch_name);
  poForm.po_supplier.innerHTML = options(lk.suppliers, 'supplier_id', (s) => s.supplier_name);
  await reload();
  if (location.hash === '#new') openPoForm();
} catch (err) {
  budgetRows.innerHTML = `<tr><td colspan="5"><p class="error">${esc(err.message)}</p></td></tr>`;
}
