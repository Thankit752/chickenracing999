// ฟังก์ชันใช้ร่วมกันทุกหน้า
export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
  return data;
}

const money = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const fmt = (v) => (typeof v === 'number' ? money.format(v) : v ?? '—');

// จัดรูปแบบตัวเลขด้วยจำนวนทศนิยมคงที่ เช่น เงิน 5,442.50 · จำนวนนับ 7
export const fmtNumber = (v, digits) =>
  v.toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

export const baht = (v) => fmtNumber(Number(v ?? 0), 2);
export const int = (v) => fmtNumber(Number(v ?? 0), 0);

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
// '2026-01' → 'ม.ค. 69' (ปี พ.ศ. สองหลัก)
export const monthTh = (ym) => { const [y, m] = ym.split('-').map(Number); return `${TH_MONTHS[m - 1]} ${String(y + 543).slice(-2)}`; };
// '2026-01-25' → '25 ม.ค. 69'
export const dateTh = (d) => (d ? `${Number(d.slice(8, 10))} ${monthTh(d.slice(0, 7))}` : '—');
export const today = () => new Date().toLocaleDateString('sv-SE');

const STATUS_TH = {
  DRAFT: 'ร่าง', APPROVED: 'อนุมัติแล้ว', RECEIVED: 'รับรถแล้ว', CANCELLED: 'ยกเลิก',
  IN_STOCK: 'ในสต็อก', RESERVED: 'จองแล้ว', SOLD: 'ขายแล้ว', RETURNED: 'คืนรถ',
  paid: 'จ่ายแล้ว', unpaid: 'ค้างจ่าย',
};
export const badge = (s) => `<span class="badge ${s}">${STATUS_TH[s] ?? s}</span>`;
export const ROLE_TH = { LEAD: 'ผู้ปิดการขาย', ASSIST: 'ผู้ช่วยขาย', REFERRAL: 'ผู้แนะนำ' };

// ---------- กล่องยืนยัน (ใช้แทน confirm() ของเบราว์เซอร์ หน้าตาเดียวกับทั้งเว็บ) ----------
// คืน Promise<boolean> — true เมื่อกดปุ่มยืนยัน · Esc หรือปุ่มยกเลิก = false
export function confirmBox(message, { title = 'ยืนยันอีกครั้ง', ok = 'ยืนยัน', cancel = 'ไม่ใช่', danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'confirm';
    dlg.setAttribute('aria-labelledby', 'confirmTitle');
    dlg.innerHTML = `
      <div class="dlg-head"><h2 id="confirmTitle">${esc(title)}</h2></div>
      <div class="dlg-body"><p>${esc(message)}</p></div>
      <div class="dlg-foot">
        <button class="btn" type="button" data-answer="no">${esc(cancel)}</button>
        <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" type="button" data-answer="yes">${esc(ok)}</button>
      </div>`;
    document.body.append(dlg);
    let done = false;
    const finish = (answer) => {
      if (done) return;
      done = true;
      dlg.close();
      dlg.remove();
      resolve(answer);
    };
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-answer]');
      if (b) finish(b.dataset.answer === 'yes');
    });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });   // กด Esc = ไม่ยืนยัน
    dlg.showModal();
    dlg.querySelector('[data-answer="no"]').focus();   // ปุ่มที่ปลอดภัยได้โฟกัสก่อน กด Enter พลาดจะไม่เสียข้อมูล
  });
}

// ---------- กันปิดฟอร์มแล้วข้อมูลที่กรอกหาย ----------
// mark() จดค่าตั้งต้นหลังเปิดฟอร์ม · tryClose() ถ้ามีการแก้ไขจะถามก่อนปิด (รวมถึงกด Esc)
const snapshot = (form) => JSON.stringify([...form.elements].map((e) =>
  (e.type === 'radio' || e.type === 'checkbox' ? e.checked : e.value)));
export function guardForm(dlg, form) {
  let initial = snapshot(form);
  const mark = () => { initial = snapshot(form); };
  const isDirty = () => snapshot(form) !== initial;
  const tryClose = async () => {
    if (!isDirty() || await confirmBox('ข้อมูลที่กรอกไว้จะหายไป', {
      title: 'ทิ้งข้อมูลที่กรอก?', ok: 'ทิ้งข้อมูล', cancel: 'กรอกต่อ', danger: true,
    })) dlg.close();
  };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); tryClose(); });
  return { mark, tryClose, isDirty };
}
