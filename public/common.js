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
