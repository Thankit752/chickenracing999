// แถบบนของทุกหน้า — เขียนที่เดียว ทุกหน้าเรียกใช้ไฟล์นี้
const PAGES = [
  ['index.html', 'ภาพรวม'],
  ['budget.html', 'งบจัดซื้อ'],
  ['costs.html', 'ต้นทุนรถ'],
  ['commissions.html', 'ค่านายหน้า'],
  ['customers.html', 'ลูกค้า'],
  ['queries.html', 'คำสั่งสืบค้น 5 ข้อ'],
];

const here = location.pathname.split('/').pop() || 'index.html';
const header = document.getElementById('topbar');
header.className = 'topbar';
header.innerHTML = `
  <div class="topbar-inner">
    <a class="brand" href="index.html">
      <img src="logo.png" alt="" width="64" height="63">
      <span class="brand-text">
        <strong>Chicken Racing 999</strong>
        <span>ระบบงบจัดซื้อ ค่านายหน้า และค่าใช้จ่ายแฝง · โครงงาน CE396</span>
      </span>
    </a>
    <nav class="nav" aria-label="เมนูหลัก">
      ${PAGES.map(([href, label]) => `<a href="${href}"${href === here ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
    </nav>
  </div>`;
