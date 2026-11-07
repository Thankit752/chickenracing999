import { api, esc, baht, int, monthTh } from './common.js';

const stats = document.getElementById('stats');
const charts = document.getElementById('charts');

// ตัวเลขย่อสำหรับป้ายบนกราฟ: 732,000 → 732K · 1,250,000 → 1.25M
const short = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : String(Math.round(v)));

function renderStats(d) {
  const remaining = d.budget.allocated - d.budget.spent;
  const usedPct = d.budget.allocated ? (d.budget.spent / d.budget.allocated) * 100 : 0;
  const inStock = (d.stock.IN_STOCK || 0) + (d.stock.RESERVED || 0);
  stats.innerHTML = `
    <div class="stat stat-hero">
      <span class="stat-label">งบจัดซื้อคงเหลือ (รอบงบที่เปิดอยู่)</span>
      <span class="stat-value">${baht(remaining)}</span>
      <div class="meter" role="img" aria-label="ใช้ไป ${usedPct.toFixed(1)} เปอร์เซ็นต์"><span style="width:${Math.min(usedPct, 100)}%"></span></div>
      <span class="stat-note">ใช้ไป ${baht(d.budget.spent)} จากวงเงิน ${baht(d.budget.allocated)} (${usedPct.toFixed(1)}%)</span>
    </div>
    <div class="stat">
      <span class="stat-label">ค่าใช้จ่ายแฝงรวม</span>
      <span class="stat-value">${baht(d.totals.hidden_total)}</span>
      <span class="stat-note">ขนส่ง PDI จดทะเบียน ดอกเบี้ยสต็อก ฯลฯ</span>
    </div>
    <div class="stat">
      <span class="stat-label">ค่านายหน้ารวม</span>
      <span class="stat-value">${baht(d.totals.commission_total)}</span>
      <span class="stat-note">ค้างจ่าย ${baht(d.totals.commission_unpaid)}</span>
    </div>
    <div class="stat">
      <span class="stat-label">รถในสต็อก</span>
      <span class="stat-value">${int(inStock)} คัน</span>
      <span class="stat-note">จองแล้ว ${int(d.stock.RESERVED || 0)} · ขายแล้ว ${int(d.totals.units_sold)} คัน</span>
    </div>`;
}

// กราฟแท่งหนึ่งชุด (สีเดียว ไม่ต้องมีคำอธิบายสัญลักษณ์ — ชื่อกราฟบอกแล้ว)
function barChart(title, months, key) {
  const W = 360, H = 170, top = 18, bottom = 26, gap = 10;
  const values = months.map((m) => Number(m[key]));
  const max = Math.max(...values, 1);
  const bw = (W - gap * (months.length - 1)) / months.length;
  const plotH = H - top - bottom;
  const maxIdx = values.indexOf(Math.max(...values));
  const bars = months.map((m, i) => {
    const v = values[i];
    const h = v > 0 ? Math.max((v / max) * plotH, 2) : 0;
    const x = i * (bw + gap), y = top + plotH - h, r = Math.min(4, h / 2, bw / 2);
    // ปลายแท่งมน 4px ฐานแท่งตรงชิดแกน
    const path = h ? `M${x},${top + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${top + plotH} Z` : '';
    return `
      <g data-i="${i}">
        <rect class="hit" x="${x - gap / 2}" y="0" width="${bw + gap}" height="${H}" fill="transparent"
              tabindex="0" aria-label="${monthTh(m.month)} ${baht(v)} บาท"></rect>
        ${path ? `<path class="bar" d="${path}"></path>` : ''}
        ${i === maxIdx && v > 0 ? `<text class="val" x="${x + bw / 2}" y="${y - 5}" text-anchor="middle">${short(v)}</text>` : ''}
        <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${monthTh(m.month)}</text>
      </g>`;
  }).join('');
  const total = values.reduce((a, b) => a + b, 0);
  const box = document.createElement('div');
  box.className = 'chart';
  box.innerHTML = `
    <h3>${esc(title)}</h3>
    <p class="total">รวม ${baht(total)} บาท</p>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)} รายเดือน">
      <line class="axis" x1="0" x2="${W}" y1="${top + plotH}" y2="${top + plotH}"></line>
      ${bars}
    </svg>`;
  // tooltip ตอนชี้หรือโฟกัสแท่ง
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  box.append(tip);
  const show = (g) => {
    const i = Number(g.dataset.i);
    box.querySelectorAll('.bar').forEach((b) => b.classList.remove('on'));
    g.querySelector('.bar')?.classList.add('on');
    tip.textContent = `${monthTh(months[i].month)} · ${baht(values[i])} บาท`;
    const svg = box.querySelector('svg').getBoundingClientRect();
    const hit = g.querySelector('.hit').getBoundingClientRect();
    const host = box.getBoundingClientRect();
    tip.style.left = `${hit.left + hit.width / 2 - host.left}px`;
    tip.style.top = `${svg.top - host.top + 4}px`;
    tip.hidden = false;
  };
  const hide = () => { tip.hidden = true; box.querySelectorAll('.bar').forEach((b) => b.classList.remove('on')); };
  box.querySelectorAll('g[data-i]').forEach((g) => {
    g.addEventListener('mouseenter', () => show(g));
    g.addEventListener('focusin', () => show(g));
  });
  box.querySelector('svg').addEventListener('mouseleave', hide);
  box.addEventListener('focusout', hide);
  return box;
}

function renderMonthTable(months) {
  document.getElementById('monthTable').innerHTML = `<table>
    <thead><tr><th>เดือน</th><th class="num">จัดซื้อรถ</th><th class="num">ค่าใช้จ่ายแฝง</th><th class="num">ค่านายหน้า</th><th class="num">ขายได้ (คัน)</th></tr></thead>
    <tbody>${months.map((m) => `<tr><td>${monthTh(m.month)}</td><td class="num">${baht(m.purchase)}</td>
      <td class="num">${baht(m.hidden)}</td><td class="num">${baht(m.commission)}</td><td class="num">${int(m.units_sold)}</td></tr>`).join('')}</tbody>
  </table>`;
}

try {
  const d = await api('/api/dashboard');
  renderStats(d);
  charts.append(
    barChart('เงินจัดซื้อรถเข้าสต็อก', d.monthly, 'purchase'),
    barChart('ค่าใช้จ่ายแฝง', d.monthly, 'hidden'),
    barChart('ค่านายหน้า (ตามเดือนที่ขาย)', d.monthly, 'commission'),
  );
  renderMonthTable(d.monthly);
} catch (err) {
  stats.innerHTML = `<p class="error">${esc(err.message)}</p>`;
}
