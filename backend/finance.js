// API ฝั่งธุรกิจ: ภาพรวม · งบประมาณ + ใบสั่งซื้อ · ต้นทุนรถ + ค่าใช้จ่ายแฝง · ค่านายหน้า
import { Router } from 'express';
import { pool, withTransaction } from './db.js';
import { ValidationError } from './customers.js';

export const finance = Router();

const isId = (v) => /^\d{1,10}$/.test(String(v)) && Number(v) <= 2147483647;
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
const money = (v) => Number(v);
function requireIds(obj, keys) {
  for (const k of keys) if (!isId(obj[k])) throw new ValidationError(`ข้อมูล ${k} ไม่ถูกต้อง`);
}
// รองรับ /:id ทุกตัวในไฟล์นี้ — id ที่ไม่ใช่จำนวนเต็มถือว่า "ไม่พบ"
for (const p of ['id', 'saleId', 'spId']) {
  finance.param(p, (req, res, next, v) => (isId(v) ? next() : res.status(404).json({ error: 'ไม่พบรายการนี้' })));
}

// ---------------------------------------------------------------------
// งบประมาณ: วงเงินที่จัดสรรแต่ละบรรทัด + ใช้ไปจริงตามชนิดหมวด
//   PURCHASE   = มูลค่าใบสั่งซื้อที่ไม่ถูกยกเลิก (สาขา + รอบงบเดียวกัน)
//   COMMISSION = ค่านายหน้าของการขายในสาขา + รอบงบนั้น (COM-REFER นับเฉพาะผู้แนะนำ)
//   HIDDEN     = ค่าใช้จ่ายแฝงหมวดนั้นของรถในสาขานั้น ที่เกิดภายในช่วงวันของรอบงบ
// ---------------------------------------------------------------------
const BUDGET_LINES = `
  SELECT ba.allocation_id, b.branch_id, b.branch_name,
         p.period_id, p.fiscal_year, p.quarter, p.status AS period_status,
         ec.category_id, ec.category_code, ec.category_name, ec.cost_type,
         ba.amount_allocated,
         COALESCE(CASE ec.cost_type
           WHEN 'PURCHASE' THEN (
             SELECT SUM(i.qty * i.unit_cost - i.discount_amount)
             FROM purchase_order po JOIN purchase_order_item i ON i.po_id = po.po_id
             WHERE po.branch_id = ba.branch_id AND po.period_id = ba.period_id AND po.status <> 'CANCELLED')
           WHEN 'COMMISSION' THEN (
             SELECT SUM(sc.commission_amount)
             FROM sale s JOIN sale_commission sc ON sc.sale_id = s.sale_id
             WHERE s.branch_id = ba.branch_id AND s.period_id = ba.period_id
               AND CASE ec.category_code WHEN 'COM-REFER' THEN sc.role_in_deal = 'REFERRAL'
                                         WHEN 'COM-SALES' THEN sc.role_in_deal <> 'REFERRAL'
                                         ELSE false END)
           ELSE (
             SELECT SUM(h.amount)
             FROM hidden_cost h
             JOIN vehicle_unit v    ON v.unit_id = h.unit_id
             JOIN purchase_order po ON po.po_id  = v.po_id
             WHERE h.category_id = ba.category_id AND po.branch_id = ba.branch_id
               AND h.cost_date BETWEEN p.start_date AND p.end_date)
         END, 0) AS spent
  FROM budget_allocation ba
  JOIN branch b            ON b.branch_id    = ba.branch_id
  JOIN budget_period p     ON p.period_id    = ba.period_id
  JOIN expense_category ec ON ec.category_id = ba.category_id`;

// ---------- ภาพรวม ----------
finance.get('/dashboard', async (req, res, next) => {
  try {
    const [budget, totals, stock, monthly] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount_allocated), 0) AS allocated, COALESCE(SUM(spent), 0) AS spent
                  FROM (${BUDGET_LINES}) x WHERE cost_type = 'PURCHASE' AND period_status = 'OPEN'`),
      pool.query(`SELECT (SELECT COALESCE(SUM(amount), 0) FROM hidden_cost) AS hidden_total,
                         (SELECT COALESCE(SUM(commission_amount), 0) FROM sale_commission) AS commission_total,
                         (SELECT COALESCE(SUM(commission_amount), 0) FROM sale_commission WHERE paid_date IS NULL) AS commission_unpaid,
                         (SELECT COUNT(*) FROM sale) AS units_sold,
                         (SELECT COALESCE(SUM(sale_price), 0) FROM sale) AS revenue`),
      pool.query(`SELECT status, COUNT(*) AS n FROM vehicle_unit GROUP BY status`),
      // ยอดรายเดือน — สร้างทุกเดือนในช่วงข้อมูลด้วย generate_series เพื่อให้เดือนที่ไม่มีรายการได้ 0
      pool.query(`
        WITH bounds AS (
          SELECT date_trunc('month', LEAST((SELECT MIN(order_date) FROM purchase_order),
                                           (SELECT MIN(cost_date)  FROM hidden_cost),
                                           (SELECT MIN(sale_date)  FROM sale)))::date AS first_m,
                 date_trunc('month', GREATEST((SELECT MAX(order_date) FROM purchase_order),
                                              (SELECT MAX(cost_date)  FROM hidden_cost),
                                              (SELECT MAX(sale_date)  FROM sale)))::date AS last_m),
        months AS (SELECT generate_series(first_m, last_m, interval '1 month')::date AS m FROM bounds)
        SELECT to_char(m, 'YYYY-MM') AS month,
               (SELECT COALESCE(SUM(i.qty * i.unit_cost - i.discount_amount), 0)
                  FROM purchase_order po JOIN purchase_order_item i ON i.po_id = po.po_id
                 WHERE po.status <> 'CANCELLED' AND date_trunc('month', po.order_date) = m) AS purchase,
               (SELECT COALESCE(SUM(h.amount), 0) FROM hidden_cost h
                 WHERE date_trunc('month', h.cost_date) = m) AS hidden,
               (SELECT COALESCE(SUM(sc.commission_amount), 0)
                  FROM sale_commission sc JOIN sale s ON s.sale_id = sc.sale_id
                 WHERE date_trunc('month', s.sale_date) = m) AS commission,
               (SELECT COUNT(*) FROM sale s WHERE date_trunc('month', s.sale_date) = m) AS units_sold
        FROM months ORDER BY m`),
    ]);
    res.json({
      budget: budget.rows[0],
      totals: totals.rows[0],
      stock: Object.fromEntries(stock.rows.map((r) => [r.status, r.n])),
      monthly: monthly.rows,
    });
  } catch (err) { next(err); }
});

// ---------- ตัวเลือกสำหรับฟอร์ม ----------
finance.get('/lookups', async (req, res, next) => {
  try {
    const q = (sql) => pool.query(sql).then((r) => r.rows);
    const [branches, suppliers, periods, models, hiddenCategories, salespeople, sales] = await Promise.all([
      q('SELECT branch_id, branch_name FROM branch ORDER BY branch_id'),
      q('SELECT supplier_id, supplier_name FROM supplier ORDER BY supplier_id'),
      q(`SELECT period_id, fiscal_year, quarter, status, start_date, end_date FROM budget_period
         ORDER BY fiscal_year DESC, quarter DESC`),
      q(`SELECT model_id, brand, model_name, standard_cost FROM motorcycle_model ORDER BY brand, model_name`),
      q(`SELECT category_id, category_code, category_name FROM expense_category
         WHERE cost_type = 'HIDDEN' ORDER BY category_id`),
      q(`SELECT salesperson_id, emp_code, full_name, base_commission_pct, branch_id FROM salesperson
         WHERE is_active ORDER BY emp_code`),
      q(`SELECT s.sale_id, s.sale_no, s.sale_date, s.sale_price, s.branch_id,
                m.brand || ' ' || m.model_name AS model
         FROM sale s JOIN vehicle_unit v ON v.unit_id = s.unit_id
         JOIN motorcycle_model m ON m.model_id = v.model_id ORDER BY s.sale_date DESC`),
    ]);
    res.json({ branches, suppliers, periods, models, hiddenCategories, salespeople, sales });
  } catch (err) { next(err); }
});

// ---------- งบประมาณ ----------
finance.get('/budget', async (req, res, next) => {
  try {
    const period = isId(req.query.period_id) ? Number(req.query.period_id) : null;
    const { rows } = await pool.query(
      `SELECT * FROM (${BUDGET_LINES}) x WHERE ($1::int IS NULL OR period_id = $1)
       ORDER BY fiscal_year DESC, quarter DESC, branch_id, category_id`,
      [period],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ---------- ใบสั่งซื้อ ----------
const PO_LIST = `
  SELECT po.po_id, po.po_no, po.order_date, po.expected_date, po.status,
         po.branch_id, b.branch_name, s.supplier_name, po.period_id, p.fiscal_year, p.quarter,
         COUNT(i.line_no)::int AS lines,
         COALESCE(SUM(i.qty), 0)::int AS units,
         COALESCE(SUM(i.qty * i.unit_cost - i.discount_amount), 0) AS total,
         (SELECT COUNT(*) FROM vehicle_unit v WHERE v.po_id = po.po_id)::int AS received
  FROM purchase_order po
  JOIN branch b        ON b.branch_id   = po.branch_id
  JOIN supplier s      ON s.supplier_id = po.supplier_id
  JOIN budget_period p ON p.period_id   = po.period_id
  LEFT JOIN purchase_order_item i ON i.po_id = po.po_id`;
const PO_GROUP = 'GROUP BY po.po_id, b.branch_name, s.supplier_name, p.fiscal_year, p.quarter';

finance.get('/purchase-orders', async (req, res, next) => {
  try {
    const period = isId(req.query.period_id) ? Number(req.query.period_id) : null;
    const { rows } = await pool.query(
      `${PO_LIST} WHERE ($1::int IS NULL OR po.period_id = $1) ${PO_GROUP} ORDER BY po.order_date DESC, po.po_id DESC`,
      [period],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

finance.get('/purchase-orders/:id', async (req, res, next) => {
  try {
    const head = await pool.query(`${PO_LIST} WHERE po.po_id = $1 ${PO_GROUP}`, [req.params.id]);
    if (!head.rows[0]) return res.status(404).json({ error: 'ไม่พบใบสั่งซื้อนี้' });
    const items = await pool.query(
      `SELECT i.line_no, m.brand || ' ' || m.model_name AS model, i.qty, i.unit_cost, i.discount_amount,
              i.qty * i.unit_cost - i.discount_amount AS line_total
       FROM purchase_order_item i JOIN motorcycle_model m ON m.model_id = i.model_id
       WHERE i.po_id = $1 ORDER BY i.line_no`,
      [req.params.id],
    );
    res.json({ ...head.rows[0], items: items.rows });
  } catch (err) { next(err); }
});

// บันทึกใบสั่งซื้อ + รายการ ใน transaction เดียว และคุมงบ: ยอดใบใหม่ต้องไม่เกินงบ PURCHASE คงเหลือ
finance.post('/purchase-orders', async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const po_no = String(b.po_no ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,20}$/.test(po_no)) throw new ValidationError('เลขที่ใบสั่งซื้อใช้ตัวอักษรอังกฤษ ตัวเลข และ - ได้ 3–20 ตัว');
    requireIds(b, ['branch_id', 'supplier_id', 'period_id']);
    if (!isDate(b.order_date)) throw new ValidationError('ระบุวันที่สั่งซื้อ');
    if (b.expected_date && !isDate(b.expected_date)) throw new ValidationError('วันที่คาดว่าจะได้รับไม่ถูกต้อง');
    if (b.expected_date && b.expected_date < b.order_date) throw new ValidationError('วันที่คาดว่าจะได้รับต้องไม่ก่อนวันสั่งซื้อ');
    const items = (Array.isArray(b.items) ? b.items : []).map((it) => ({
      model_id: it.model_id, qty: Number(it.qty), unit_cost: Number(it.unit_cost), discount_amount: Number(it.discount_amount || 0),
    }));
    if (items.length === 0) throw new ValidationError('ใบสั่งซื้อต้องมีอย่างน้อย 1 รายการ');
    for (const it of items) {
      if (!isId(it.model_id)) throw new ValidationError('เลือกรุ่นรถให้ครบทุกรายการ');
      if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 999) throw new ValidationError('จำนวนต้องเป็นจำนวนเต็ม 1–999');
      if (!(it.unit_cost > 0) || it.unit_cost > 9_999_999) throw new ValidationError('ราคาต่อคันต้องมากกว่า 0');
      if (!(it.discount_amount >= 0) || it.discount_amount > it.unit_cost * it.qty) throw new ValidationError('ส่วนลดต้องไม่ติดลบและไม่เกินมูลค่ารายการ');
    }
    const total = items.reduce((s, it) => s + it.qty * it.unit_cost - it.discount_amount, 0);

    const po = await withTransaction(async (client) => {
      // ล็อกบรรทัดงบไว้ก่อน — กันสองคนบันทึกพร้อมกันแล้วรวมกันเกินงบ (lost update สัปดาห์ที่ 2)
      const alloc = await client.query(
        `SELECT ba.allocation_id FROM budget_allocation ba
         JOIN expense_category ec ON ec.category_id = ba.category_id
         WHERE ba.branch_id = $1 AND ba.period_id = $2 AND ec.cost_type = 'PURCHASE' FOR UPDATE OF ba`,
        [b.branch_id, b.period_id],
      );
      if (alloc.rowCount === 0) throw new ValidationError('สาขานี้ยังไม่ได้รับจัดสรรงบจัดซื้อในรอบงบที่เลือก');
      const { rows: [period] } = await client.query(
        "SELECT status, $2::date BETWEEN start_date AND end_date AS in_range FROM budget_period WHERE period_id = $1",
        [b.period_id, b.order_date],
      );
      if (period.status !== 'OPEN') throw new ValidationError('รอบงบนี้ปิดแล้ว บันทึกใบสั่งซื้อเพิ่มไม่ได้');
      if (!period.in_range) throw new ValidationError('วันที่สั่งซื้อต้องอยู่ในช่วงวันของรอบงบที่เลือก');
      const { rows: [line] } = await client.query(
        `SELECT amount_allocated - spent AS remaining FROM (${BUDGET_LINES}) x WHERE allocation_id = $1`,
        [alloc.rows[0].allocation_id],
      );
      if (total > money(line.remaining)) {
        throw new ValidationError(`ยอดใบสั่งซื้อ ${total.toLocaleString('th-TH')} บาท เกินงบจัดซื้อคงเหลือ ${money(line.remaining).toLocaleString('th-TH')} บาท`);
      }
      const { rows: [head] } = await client.query(
        `INSERT INTO purchase_order (po_no, branch_id, supplier_id, period_id, order_date, expected_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT') RETURNING po_id`,
        [po_no, b.branch_id, b.supplier_id, b.period_id, b.order_date, b.expected_date || null],
      );
      for (const [n, it] of items.entries()) {
        await client.query(
          `INSERT INTO purchase_order_item (po_id, line_no, model_id, qty, unit_cost, discount_amount)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [head.po_id, n + 1, it.model_id, it.qty, it.unit_cost, it.discount_amount],
        );
      }
      return head.po_id;
    });
    res.status(201).json({ po_id: po });
  } catch (err) { next(err); }
});

// เปลี่ยนสถานะ: DRAFT → APPROVED / CANCELLED · APPROVED → CANCELLED (ใบที่รับรถแล้วยกเลิกไม่ได้)
const NEXT_STATUS = { DRAFT: ['APPROVED', 'CANCELLED'], APPROVED: ['CANCELLED'] };
finance.patch('/purchase-orders/:id/status', async (req, res, next) => {
  try {
    const to = req.body?.status;
    const { rows: [po] } = await pool.query('SELECT status FROM purchase_order WHERE po_id = $1', [req.params.id]);
    if (!po) return res.status(404).json({ error: 'ไม่พบใบสั่งซื้อนี้' });
    if (!(NEXT_STATUS[po.status] || []).includes(to)) {
      throw new ValidationError(`เปลี่ยนสถานะจาก ${po.status} เป็น ${to} ไม่ได้`);
    }
    await pool.query('UPDATE purchase_order SET status = $1 WHERE po_id = $2', [to, req.params.id]);
    res.json({ po_id: Number(req.params.id), status: to });
  } catch (err) { next(err); }
});

// ---------- ต้นทุนรถรายคัน ----------
// ต้นทุนจริง = ราคาซื้อหลังหักส่วนลด + ค่าใช้จ่ายแฝงสะสม · กำไรสุทธิ = ราคาขาย − ต้นทุนจริง − ค่านายหน้า
finance.get('/units', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT v.unit_id, v.vin, v.color, v.status, v.receive_date,
             m.brand || ' ' || m.model_name AS model, b.branch_name,
             ROUND(i.unit_cost - i.discount_amount / i.qty, 2) AS purchase_cost,
             COALESCE(h.hidden, 0)  AS hidden_cost,
             COALESCE(h.n, 0)::int  AS hidden_count,
             ROUND(i.unit_cost - i.discount_amount / i.qty, 2) + COALESCE(h.hidden, 0) AS landed_cost,
             s.sale_price,
             (SELECT COALESCE(SUM(sc.commission_amount), 0) FROM sale_commission sc WHERE sc.sale_id = s.sale_id) AS commission,
             s.sale_price - (ROUND(i.unit_cost - i.discount_amount / i.qty, 2) + COALESCE(h.hidden, 0))
               - (SELECT COALESCE(SUM(sc.commission_amount), 0) FROM sale_commission sc WHERE sc.sale_id = s.sale_id) AS net_profit
      FROM vehicle_unit v
      JOIN motorcycle_model m      ON m.model_id = v.model_id
      JOIN purchase_order_item i   ON i.po_id = v.po_id AND i.line_no = v.line_no
      JOIN purchase_order po       ON po.po_id = v.po_id
      JOIN branch b                ON b.branch_id = po.branch_id
      LEFT JOIN (SELECT unit_id, SUM(amount) AS hidden, COUNT(*) AS n FROM hidden_cost GROUP BY unit_id) h
                                   ON h.unit_id = v.unit_id
      LEFT JOIN sale s             ON s.unit_id = v.unit_id
      ORDER BY v.unit_id`);
    res.json(rows);
  } catch (err) { next(err); }
});

finance.get('/units/:id/hidden-costs', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT h.hidden_cost_id, h.category_id, ec.category_name, h.cost_date, h.amount, h.reference_no, h.note
       FROM hidden_cost h JOIN expense_category ec ON ec.category_id = h.category_id
       WHERE h.unit_id = $1 ORDER BY h.cost_date, h.hidden_cost_id`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

async function validateHiddenCost(b) {
  requireIds(b, ['category_id']);
  if (!isDate(b.cost_date)) throw new ValidationError('ระบุวันที่เกิดค่าใช้จ่าย');
  const amount = Number(b.amount);
  if (!(amount > 0) || amount > 9_999_999) throw new ValidationError('จำนวนเงินต้องมากกว่า 0');
  const reference_no = String(b.reference_no ?? '').trim() || null;
  const note = String(b.note ?? '').trim() || null;
  if (reference_no && reference_no.length > 30) throw new ValidationError('เลขอ้างอิงยาวได้ไม่เกิน 30 ตัวอักษร');
  if (note && note.length > 200) throw new ValidationError('หมายเหตุยาวได้ไม่เกิน 200 ตัวอักษร');
  const { rowCount } = await pool.query(
    "SELECT 1 FROM expense_category WHERE category_id = $1 AND cost_type = 'HIDDEN'", [b.category_id]);
  if (rowCount === 0) throw new ValidationError('เลือกหมวดค่าใช้จ่ายแฝงให้ถูกต้อง');
  return { category_id: Number(b.category_id), cost_date: b.cost_date, amount, reference_no, note };
}

finance.post('/hidden-costs', async (req, res, next) => {
  try {
    requireIds(req.body ?? {}, ['unit_id']);
    const h = await validateHiddenCost(req.body);
    const { rows } = await pool.query(
      `INSERT INTO hidden_cost (unit_id, category_id, cost_date, amount, reference_no, note)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING hidden_cost_id`,
      [req.body.unit_id, h.category_id, h.cost_date, h.amount, h.reference_no, h.note],
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

finance.put('/hidden-costs/:id', async (req, res, next) => {
  try {
    const h = await validateHiddenCost(req.body ?? {});
    const { rowCount } = await pool.query(
      `UPDATE hidden_cost SET category_id = $1, cost_date = $2, amount = $3, reference_no = $4, note = $5
       WHERE hidden_cost_id = $6`,
      [h.category_id, h.cost_date, h.amount, h.reference_no, h.note, req.params.id],
    );
    if (rowCount === 0) return res.status(404).json({ error: 'ไม่พบรายการนี้' });
    res.json({ hidden_cost_id: Number(req.params.id) });
  } catch (err) { next(err); }
});

finance.delete('/hidden-costs/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM hidden_cost WHERE hidden_cost_id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'ไม่พบรายการนี้' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ---------- ค่านายหน้า ----------
// เกณฑ์: ผู้ปิดการขาย (LEAD) ได้อัตราประจำตัวของพนักงาน · ผู้ช่วย (ASSIST) 1% · ผู้แนะนำ (REFERRAL) 0.5%
// ยอดค่านายหน้า = ราคาขายจริง × อัตรา ÷ 100 — คำนวณใน SQL ตอนบันทึก แล้วเก็บไว้เป็นยอดที่ต้องจ่าย
export const ROLE_RATES = { ASSIST: 1.0, REFERRAL: 0.5 };

finance.get('/commissions', async (req, res, next) => {
  try {
    const [summary, rows] = await Promise.all([
      pool.query(`
        SELECT sp.salesperson_id, sp.emp_code, sp.full_name, b.branch_name, sp.base_commission_pct, sp.is_active,
               COUNT(sc.sale_id)::int AS deals,
               COALESCE(SUM(sc.commission_amount), 0) AS total,
               COALESCE(SUM(sc.commission_amount) FILTER (WHERE sc.paid_date IS NOT NULL), 0) AS paid,
               COALESCE(SUM(sc.commission_amount) FILTER (WHERE sc.paid_date IS NULL), 0) AS unpaid
        FROM salesperson sp
        JOIN branch b ON b.branch_id = sp.branch_id
        LEFT JOIN sale_commission sc ON sc.salesperson_id = sp.salesperson_id
        GROUP BY sp.salesperson_id, b.branch_name
        ORDER BY total DESC, sp.emp_code`),
      pool.query(`
        SELECT sc.sale_id, sc.salesperson_id, s.sale_no, s.sale_date, sp.full_name,
               m.brand || ' ' || m.model_name AS model, s.sale_price,
               sc.role_in_deal, sc.commission_pct, sc.commission_amount, sc.paid_date
        FROM sale_commission sc
        JOIN sale s         ON s.sale_id = sc.sale_id
        JOIN salesperson sp ON sp.salesperson_id = sc.salesperson_id
        JOIN vehicle_unit v ON v.unit_id = s.unit_id
        JOIN motorcycle_model m ON m.model_id = v.model_id
        ORDER BY s.sale_date DESC, sc.sale_id DESC, sc.role_in_deal`),
    ]);
    res.json({ summary: summary.rows, rows: rows.rows, roleRates: ROLE_RATES });
  } catch (err) { next(err); }
});

finance.post('/commissions', async (req, res, next) => {
  try {
    const b = req.body ?? {};
    requireIds(b, ['sale_id', 'salesperson_id']);
    if (!['LEAD', 'ASSIST', 'REFERRAL'].includes(b.role_in_deal)) throw new ValidationError('เลือกบทบาทในดีล');
    const { rows: [sp] } = await pool.query(
      'SELECT base_commission_pct, is_active FROM salesperson WHERE salesperson_id = $1', [b.salesperson_id]);
    if (!sp || !sp.is_active) throw new ValidationError('เลือกพนักงานขายที่ยังทำงานอยู่');
    if (b.role_in_deal === 'LEAD') {
      const { rowCount } = await pool.query(
        "SELECT 1 FROM sale_commission WHERE sale_id = $1 AND role_in_deal = 'LEAD'", [b.sale_id]);
      if (rowCount) throw new ValidationError('การขายนี้มีผู้ปิดการขาย (LEAD) แล้ว — หนึ่งดีลมี LEAD ได้คนเดียว');
    }
    const pct = b.role_in_deal === 'LEAD' ? Number(sp.base_commission_pct) : ROLE_RATES[b.role_in_deal];
    const { rows } = await pool.query(
      `INSERT INTO sale_commission (sale_id, salesperson_id, role_in_deal, commission_pct, commission_amount)
       SELECT s.sale_id, $2, $3, $4, ROUND(s.sale_price * $4 / 100, 2)
       FROM sale s WHERE s.sale_id = $1
       RETURNING sale_id, salesperson_id, commission_pct, commission_amount`,
      [b.sale_id, b.salesperson_id, b.role_in_deal, pct],
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบการขายนี้' });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

finance.patch('/commissions/:saleId/:spId/pay', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE sale_commission SET paid_date = CURRENT_DATE
       WHERE sale_id = $1 AND salesperson_id = $2 AND paid_date IS NULL RETURNING paid_date`,
      [req.params.saleId, req.params.spId],
    );
    if (!rows[0]) return res.status(409).json({ error: 'รายการนี้จ่ายไปแล้ว หรือไม่มีอยู่' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ลบได้เฉพาะรายการที่ยังไม่จ่าย — จ่ายแล้วถือเป็นเอกสารทางบัญชี
finance.delete('/commissions/:saleId/:spId', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM sale_commission WHERE sale_id = $1 AND salesperson_id = $2 AND paid_date IS NULL',
      [req.params.saleId, req.params.spId],
    );
    if (rowCount === 0) return res.status(409).json({ error: 'ลบไม่ได้ — จ่ายแล้วหรือไม่มีรายการนี้' });
    res.status(204).end();
  } catch (err) { next(err); }
});
