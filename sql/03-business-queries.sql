-- =====================================================================
-- CE396 · ระบบบริหารงบประมาณการจัดซื้อ ค่านายหน้า และค่าใช้จ่ายแฝง
-- ไฟล์: 03-business-queries.sql  (คำสั่งสืบค้นตอบโจทย์ธุรกิจ 5 ข้อ)
-- ต้องรัน 01-ddl.sql และ 02-sample-data.sql ก่อน
--
-- เงื่อนไขจากอาจารย์ (แต่ละข้อไม่ต้องครบทุกอย่าง):
--   GROUP BY · MIN / MAX / AVG · Subquery · JOIN
--
--   ข้อ | GROUP BY | MIN/MAX/AVG | Subquery | JOIN
--   ----+----------+-------------+----------+------
--    1  |    ✓     |             |          |  ✓
--    2  |    ✓     |      ✓      |          |  ✓
--    3  |    ✓     |      ✓      |    ✓     |  ✓
--    4  |    ✓     |             |    ✓     |  ✓
--    5  |          |      ✓      |    ✓     |  ✓
--
-- หมายเหตุ: บรรทัด "-- @..." เป็นป้ายกำกับให้หน้าเว็บอ่านไปแสดง ไม่มีผลกับ PostgreSQL
-- =====================================================================

SET search_path TO moto_budget;


-- @query 1
-- @title ยอดขายและกำไรขั้นต้นรายสาขา
-- @question แต่ละสาขาขายรถได้กี่คัน รายได้เท่าไร และเหลือกำไรขั้นต้นเท่าไรหลังหักต้นทุนซื้อ
-- @uses GROUP BY, JOIN
-- @expect 5 แถว (เฉพาะสาขาที่มีการขาย)
SELECT b.branch_name                                          AS สาขา,
       COUNT(*)                                               AS จำนวนคันที่ขาย,
       SUM(s.sale_price)                                      AS รายได้รวม,
       SUM(ROUND(poi.unit_cost - poi.discount_amount / poi.qty, 2)) AS ต้นทุนซื้อรวม,
       SUM(s.sale_price - ROUND(poi.unit_cost - poi.discount_amount / poi.qty, 2)) AS กำไรขั้นต้น
FROM sale s
JOIN branch b               ON b.branch_id = s.branch_id
JOIN vehicle_unit v         ON v.unit_id   = s.unit_id
JOIN purchase_order_item poi ON poi.po_id  = v.po_id AND poi.line_no = v.line_no
GROUP BY b.branch_id, b.branch_name
ORDER BY กำไรขั้นต้น DESC;


-- @query 2
-- @title ราคาขายจริงต่ำสุด สูงสุด เฉลี่ย แยกตามยี่ห้อ
-- @question ขายรถแต่ละยี่ห้อได้ราคาจริงต่ำสุด สูงสุด และเฉลี่ยเท่าไร เทียบกับราคาแนะนำเฉลี่ย
-- @uses GROUP BY, MIN/MAX/AVG, JOIN
-- @expect 3 แถว (Honda · Yamaha · GPX — ยี่ห้อที่ขายได้จริง)
SELECT m.brand                               AS ยี่ห้อ,
       COUNT(*)                              AS จำนวนคัน,
       MIN(s.sale_price)                     AS ราคาขายต่ำสุด,
       MAX(s.sale_price)                     AS ราคาขายสูงสุด,
       ROUND(AVG(s.sale_price), 2)           AS ราคาขายเฉลี่ย,
       ROUND(AVG(m.suggested_price), 2)      AS ราคาแนะนำเฉลี่ย,
       ROUND(AVG(m.suggested_price - s.sale_price), 2) AS ส่วนลดเฉลี่ยต่อคัน
FROM sale s
JOIN vehicle_unit v     ON v.unit_id  = s.unit_id
JOIN motorcycle_model m ON m.model_id = v.model_id
GROUP BY m.brand
ORDER BY ราคาขายเฉลี่ย DESC;


-- @query 3
-- @title พนักงานขายที่ได้ค่านายหน้าสูงกว่าค่าเฉลี่ย
-- @question พนักงานคนไหนได้ค่านายหน้ารวมสูงกว่าค่าเฉลี่ยของพนักงานที่มีค่านายหน้า และค้างจ่ายอยู่เท่าไร
-- @uses GROUP BY, AVG, Subquery (derived table ใน HAVING), JOIN
-- @expect 4 แถว (ค่าเฉลี่ยคิดจากยอดรวมรายคน 10 คน ไม่ใช่รายดีล)
SELECT sp.emp_code                                AS รหัสพนักงาน,
       sp.full_name                               AS ชื่อ,
       b.branch_name                              AS สาขา,
       COUNT(*)                                   AS จำนวนดีล,
       SUM(sc.commission_amount)                  AS ค่านายหน้ารวม,
       COALESCE(SUM(sc.commission_amount) FILTER (WHERE sc.paid_date IS NULL), 0) AS ค้างจ่าย
FROM sale_commission sc
JOIN salesperson sp ON sp.salesperson_id = sc.salesperson_id
JOIN branch b       ON b.branch_id       = sp.branch_id
GROUP BY sp.salesperson_id, sp.emp_code, sp.full_name, b.branch_name
HAVING SUM(sc.commission_amount) > (
        SELECT AVG(t.total)                       -- รอบ 2: เฉลี่ยของยอดรวมรายคน
        FROM (SELECT SUM(commission_amount) AS total
              FROM sale_commission
              GROUP BY salesperson_id) AS t       -- รอบ 1: ยอดรวมของแต่ละคน
       )
ORDER BY ค่านายหน้ารวม DESC;


-- @query 4
-- @title งบจัดซื้อที่จัดสรร เทียบกับใช้จริง (รอบ 2569 ไตรมาส 2)
-- @question แต่ละสาขาใช้งบจัดซื้อรถไปแล้วกี่เปอร์เซ็นต์ของวงเงินที่ได้รับ (ไม่นับใบสั่งซื้อที่ยกเลิก)
-- @uses GROUP BY, Subquery (derived table ใน FROM), JOIN, LEFT JOIN
-- @expect 3 แถว (สาขาที่ได้รับจัดสรรงบ PURCHASE ในรอบนี้)
SELECT b.branch_name                                   AS สาขา,
       ba.amount_allocated                             AS งบที่จัดสรร,
       COALESCE(used.spent, 0)                         AS ใช้จริง,
       ba.amount_allocated - COALESCE(used.spent, 0)   AS คงเหลือ,
       ROUND(100.0 * COALESCE(used.spent, 0) / ba.amount_allocated, 2) AS เปอร์เซ็นต์ที่ใช้
FROM budget_allocation ba
JOIN branch b            ON b.branch_id    = ba.branch_id
JOIN budget_period p     ON p.period_id    = ba.period_id
JOIN expense_category ec ON ec.category_id = ba.category_id
LEFT JOIN (
        SELECT po.branch_id, po.period_id,
               SUM(poi.qty * poi.unit_cost - poi.discount_amount) AS spent
        FROM purchase_order po
        JOIN purchase_order_item poi ON poi.po_id = po.po_id
        WHERE po.status <> 'CANCELLED'
        GROUP BY po.branch_id, po.period_id
     ) AS used ON used.branch_id = ba.branch_id AND used.period_id = ba.period_id
WHERE ec.cost_type = 'PURCHASE'
  AND p.fiscal_year = 2569 AND p.quarter = 2
ORDER BY เปอร์เซ็นต์ที่ใช้ DESC;


-- @query 5
-- @title รถค้างสต็อกที่ต้นทุนจมสูงกว่าค่าเฉลี่ย
-- @question รถที่ยังไม่ได้ขายคันไหนมีต้นทุนจม (ราคาซื้อ + ค่าใช้จ่ายแฝงสะสม) สูงกว่าค่าเฉลี่ยของรถค้างสต็อกทั้งหมด
-- @uses AVG, Subquery (correlated ใน SELECT + scalar ใน WHERE), JOIN
-- @expect 3 แถว (จากรถค้างสต็อก 8 คัน)
WITH stock AS (
    SELECT v.unit_id, v.vin, v.status, v.receive_date,
           m.brand || ' ' || m.model_name                 AS รุ่น,
           b.branch_name                                  AS สาขา,
           ROUND(poi.unit_cost - poi.discount_amount / poi.qty, 2) AS ต้นทุนซื้อ,
           (SELECT COALESCE(SUM(h.amount), 0)             -- correlated: รวมค่าแฝงของคันนี้
              FROM hidden_cost h
             WHERE h.unit_id = v.unit_id)                 AS ค่าใช้จ่ายแฝง
    FROM vehicle_unit v
    JOIN motorcycle_model m      ON m.model_id = v.model_id
    JOIN purchase_order_item poi ON poi.po_id  = v.po_id AND poi.line_no = v.line_no
    JOIN purchase_order po       ON po.po_id   = v.po_id
    JOIN branch b                ON b.branch_id = po.branch_id
    WHERE v.status IN ('IN_STOCK', 'RESERVED')
)
SELECT vin                          AS เลขตัวถัง,
       รุ่น, สาขา, status           AS สถานะ,
       DATE '2026-03-31' - receive_date AS วันค้างสต็อก,
       ต้นทุนซื้อ, ค่าใช้จ่ายแฝง,
       ต้นทุนซื้อ + ค่าใช้จ่ายแฝง     AS ต้นทุนจมรวม
FROM stock
WHERE ต้นทุนซื้อ + ค่าใช้จ่ายแฝง > (SELECT AVG(ต้นทุนซื้อ + ค่าใช้จ่ายแฝง) FROM stock)
ORDER BY ต้นทุนจมรวม DESC;
