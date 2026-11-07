import { api, fmt, esc } from './common.js';

const list = document.getElementById('qList');
const panel = document.getElementById('qPanel');
let queries = [];

// ไฮไลต์คำสงวน SQL และคอมเมนต์แบบง่าย ๆ ให้อ่านตอนนำเสนอได้ชัด
const KEYWORDS = /\b(SELECT|FROM|JOIN|LEFT|ON|WHERE|GROUP BY|HAVING|ORDER BY|AND|OR|IN|AS|WITH|SUM|COUNT|AVG|MIN|MAX|ROUND|COALESCE|FILTER|DESC|ASC|DATE|NOT|IS|NULL)\b/g;
function highlight(sql) {
  return sql.split('\n').map((line) => {
    const i = line.indexOf('--');
    const code = i >= 0 ? line.slice(0, i) : line;
    const comment = i >= 0 ? `<span class="cm">${esc(line.slice(i))}</span>` : '';
    return esc(code).replace(KEYWORDS, '<span class="kw">$1</span>') + comment;
  }).join('\n');
}

function renderList(activeId) {
  list.innerHTML = queries.map((q) => `
    <li><button type="button" role="tab" data-id="${q.id}" aria-selected="${q.id === activeId}">
      <span class="q-num">${q.id}</span><span>${esc(q.title)}</span>
    </button></li>`).join('');
}

function renderPanel(q) {
  panel.innerHTML = `
    <h1>${esc(q.title)}</h1>
    <p class="q-question">${esc(q.question)}</p>
    <div class="tags" aria-label="เทคนิคที่ใช้">${q.uses.map((u) => `<span class="tag">${esc(u)}</span>`).join('')}</div>
    <details class="sql-box" open>
      <summary>คำสั่ง SQL <span class="expect">คาดหวัง: ${esc(q.expect)}</span></summary>
      <pre><code>${highlight(q.sql)}</code></pre>
    </details>
    <div class="run-row">
      <button class="btn btn-primary" id="runBtn" type="button">รันคำสั่งนี้</button>
      <span class="run-meta" id="runMeta"></span>
    </div>
    <div id="result"></div>`;
  document.getElementById('runBtn').addEventListener('click', () => run(q));
  run(q);
}

async function run(q) {
  const btn = document.getElementById('runBtn');
  const out = document.getElementById('result');
  const meta = document.getElementById('runMeta');
  btn.disabled = true;
  meta.textContent = 'กำลังรัน…';
  try {
    const r = await api(`/api/queries/${q.id}/run`, { method: 'POST' });
    meta.textContent = `ได้ ${r.rowCount} แถว · ${r.ms} มิลลิวินาที`;
    if (r.rowCount === 0) { out.innerHTML = '<div class="table-wrap"><p class="empty">ไม่มีแถวที่ตรงเงื่อนไข</p></div>'; return; }
    const numeric = r.fields.map((f) => r.rows.every((row) => row[f] === null || typeof row[f] === 'number'));
    out.innerHTML = `<div class="table-wrap"><table>
      <thead><tr>${r.fields.map((f, i) => `<th class="${numeric[i] ? 'num' : ''}">${esc(f)}</th>`).join('')}</tr></thead>
      <tbody>${r.rows.map((row) => `<tr>${r.fields.map((f, i) => `<td class="${numeric[i] ? 'num' : ''}">${esc(fmt(row[f]))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  } catch (err) {
    meta.textContent = '';
    out.innerHTML = `<p class="error">${esc(err.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
}

function select(id) {
  const q = queries.find((x) => x.id === id) || queries[0];
  renderList(q.id);
  renderPanel(q);
  history.replaceState(null, '', `#q${q.id}`);
}

list.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id]');
  if (b) select(Number(b.dataset.id));
});
list.addEventListener('keydown', (e) => {   // ลูกศรขึ้น/ลงเลื่อนข้อ
  if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
  const ids = queries.map((q) => q.id);
  const cur = Number(document.activeElement?.dataset.id);
  const next = ids[(ids.indexOf(cur) + (e.key === 'ArrowDown' ? 1 : -1) + ids.length) % ids.length];
  select(next);
  list.querySelector(`[data-id="${next}"]`).focus();
  e.preventDefault();
});

try {
  queries = await api('/api/queries');
  select(Number(location.hash.replace('#q', '')) || 1);
} catch (err) {
  panel.innerHTML = `<p class="error">${esc(err.message)}</p>`;
}
