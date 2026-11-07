-- =====================================================================
-- CE396 · ระบบบริหารงบประมาณการจัดซื้อ ค่านายหน้า และค่าใช้จ่ายแฝง
-- ไฟล์: 04-verify.sql  (ตรวจงานตนเอง + พิสูจน์ว่ากลไกควบคุมความถูกต้องทำงาน)
-- ต้องรัน 01 และ 02 ก่อน · ไม่แก้ข้อมูลจริง (ทุกการทดลองถูกย้อนกลับ)
--
-- ใช้ตอบเกณฑ์นำเสนอหัวข้อ 4 "สร้างจริงบน PostgreSQL + กลไกควบคุมความถูกต้อง"
-- แนวทางตามสัปดาห์ที่ 4–5: "อย่าเชื่อความจำว่าสร้างครบแล้ว — เชื่อได้แค่สิ่งที่สืบค้นได้จากระบบ"
-- =====================================================================

SET search_path TO moto_budget;

-- ---------------------------------------------------------------------
-- ตรวจ 1 — ข้อกำหนดทั้งหมด แยกตามชนิด (ต้องตั้งชื่อ pk_ fk_ uq_ ck_ ครบทุกตัว)
-- ---------------------------------------------------------------------
SELECT CASE contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
                    WHEN 'u' THEN 'UNIQUE'      WHEN 'c' THEN 'CHECK' END AS ชนิด,
       COUNT(*)                                                         AS จำนวน,
       COUNT(*) FILTER (WHERE conname !~ '^(pk|fk|uq|ck)_')             AS ชื่อผิดแนวปฏิบัติ
FROM pg_constraint
WHERE connamespace = 'moto_budget'::regnamespace
  AND contype IN ('p', 'f', 'u', 'c')
GROUP BY contype
ORDER BY ชนิด;
-- คาดหวัง: คอลัมน์ "ชื่อผิดแนวปฏิบัติ" = 0 ทุกแถว · PRIMARY KEY = 15 (หนึ่งตัวต่อตาราง)


-- ---------------------------------------------------------------------
-- ตรวจ 2 — คีย์นอกทุกเส้นพร้อมพฤติกรรม ON DELETE (เทียบกับตารางเหตุผลใน docs/er-design.md)
-- ---------------------------------------------------------------------
SELECT conname                AS ข้อกำหนด,
       conrelid::regclass     AS ตารางลูก,
       confrelid::regclass    AS ตารางแม่,
       CASE confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
                        WHEN 'c' THEN 'CASCADE'   WHEN 'n' THEN 'SET NULL' END AS on_delete
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'moto_budget'::regnamespace
ORDER BY on_delete, ตารางลูก;
-- คาดหวัง: 20 เส้น — CASCADE 4 เส้น (poitem_po, commission_sale, hidden_unit, customer_phone_customer)
--          ที่เหลือ RESTRICT ทั้งหมด (เอกสารบัญชี/ประวัติ ห้ามลบ)


-- ---------------------------------------------------------------------
-- ตรวจ 3 — แถวกำพร้า (ลูกที่ชี้ไปหาแม่ที่ไม่มีอยู่) ด้วย NOT EXISTS → ต้องได้ 0 ทุกคู่
--          FK ป้องกันไว้แล้ว ข้อนี้คือการพิสูจน์ซ้ำจากข้อมูลจริง
-- ---------------------------------------------------------------------
SELECT 'sale → vehicle_unit' AS คู่, COUNT(*) AS แถวกำพร้า
FROM sale s WHERE NOT EXISTS (SELECT 1 FROM vehicle_unit v WHERE v.unit_id = s.unit_id)
UNION ALL
SELECT 'vehicle_unit → purchase_order_item', COUNT(*)
FROM vehicle_unit v WHERE NOT EXISTS (SELECT 1 FROM purchase_order_item i
                                      WHERE i.po_id = v.po_id AND i.line_no = v.line_no)
UNION ALL
SELECT 'customer_phone → customer', COUNT(*)
FROM customer_phone p WHERE NOT EXISTS (SELECT 1 FROM customer c WHERE c.customer_id = p.customer_id)
UNION ALL
SELECT 'sale_commission → salesperson', COUNT(*)
FROM sale_commission sc WHERE NOT EXISTS (SELECT 1 FROM salesperson sp WHERE sp.salesperson_id = sc.salesperson_id);


-- ---------------------------------------------------------------------
-- ตรวจ 4 — กฎธุรกิจที่ SQL ธรรมดาบังคับไม่ได้ ตรวจด้วยคำสั่งสืบค้นแทน → ต้องได้ 0 แถว
-- ---------------------------------------------------------------------
-- 4.1 (1,N): ลูกค้าทุกคนต้องมีเบอร์อย่างน้อย 1 เบอร์ (บังคับที่ backend) — หาคนที่ไม่มีเลย
SELECT c.customer_id, c.first_name
FROM customer c
WHERE NOT EXISTS (SELECT 1 FROM customer_phone p WHERE p.customer_id = c.customer_id);

-- 4.2 ลูกค้าที่มีเบอร์แต่ไม่มีเบอร์หลัก (partial unique index กันได้แค่ "เกิน 1" กัน "ไม่มีเลย" ไม่ได้)
SELECT customer_id, COUNT(*) AS จำนวนเบอร์
FROM customer_phone
GROUP BY customer_id
HAVING COUNT(*) FILTER (WHERE is_primary) <> 1;

-- 4.3 รถที่ขายแล้วแต่สถานะยังไม่ใช่ SOLD (ข้อมูลสองที่ต้องสอดคล้องกัน)
SELECT v.vin, v.status
FROM vehicle_unit v
JOIN sale s ON s.unit_id = v.unit_id
WHERE v.status <> 'SOLD';


-- ---------------------------------------------------------------------
-- ตรวจ 5 — ทดลอง "ทำผิดให้เห็นจริง" ทั้ง 5 แบบ ในบล็อกเดียว
--   แต่ละคำสั่งอยู่ใน BEGIN ... EXCEPTION ของตัวเอง จึงถูกย้อนกลับเสมอ
--   ผลอยู่ในแท็บ Messages ของ pgAdmin (RAISE NOTICE) — บอก SQLSTATE และชื่อข้อกำหนดที่ทำงาน
-- ---------------------------------------------------------------------
DO $$
DECLARE
    tests text[][] := ARRAY[
        ['FK ตอนเพิ่ม: ขายให้ลูกค้าที่ไม่มีอยู่ (คาด 23503)',
         $q$INSERT INTO sale (sale_no, unit_id, customer_id, branch_id, period_id, sale_price)
            VALUES ('SO-TEST-1', 3, 99999, 1, 2, 50000)$q$],
        ['FK ตอนลบ: ลบลูกค้าที่เคยซื้อรถ — RESTRICT (คาด 23503)',
         $q$DELETE FROM customer WHERE customer_id = 1$q$],
        ['UNIQUE 1:1: ขายรถคันเดิมซ้ำ (คาด 23505 uq_sale_unit_id)',
         $q$INSERT INTO sale (sale_no, unit_id, customer_id, branch_id, period_id, sale_price)
            VALUES ('SO-TEST-2', 1, 2, 1, 2, 50000)$q$],
        ['UNIQUE index: ลูกค้ามีเบอร์หลัก 2 เบอร์ (คาด 23505 uq_customer_phone_primary)',
         $q$INSERT INTO customer_phone VALUES (2, '0899999999', 'MOBILE', true)$q$],
        ['CHECK: เบอร์โทรผิดรูปแบบ (คาด 23514 ck_customer_phone_format)',
         $q$INSERT INTO customer_phone VALUES (2, '12345', 'MOBILE', false)$q$]
    ];
    i int;
    err_constraint text;
BEGIN
    FOR i IN 1 .. array_length(tests, 1) LOOP
        BEGIN
            EXECUTE tests[i][2];
            RAISE NOTICE '✗ % — ผ่านได้ (ข้อกำหนดไม่ทำงาน!)', tests[i][1];
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS err_constraint = CONSTRAINT_NAME;
            RAISE NOTICE '✓ % → SQLSTATE % · ข้อกำหนด %', tests[i][1], SQLSTATE, err_constraint;
        END;
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- ตรวจ 6 — CASCADE ทำงานจริง: ลบลูกค้าที่ไม่เคยซื้อ เบอร์ต้องหายตาม (แล้วย้อนกลับ)
-- ---------------------------------------------------------------------
BEGIN;
    INSERT INTO customer (first_name, last_name, customer_type) VALUES ('ทดลอง', 'ลบ', 'INDIVIDUAL');
    INSERT INTO customer_phone VALUES (currval('customer_customer_id_seq'), '0800000000', 'MOBILE', true),
                                      (currval('customer_customer_id_seq'), '0800000001', 'HOME',   false);
    DELETE FROM customer WHERE customer_id = currval('customer_customer_id_seq');   -- ลบเจ้าของ
    SELECT COUNT(*) AS เบอร์ที่เหลือ
    FROM customer_phone WHERE customer_id = currval('customer_customer_id_seq');  -- 0 = CASCADE ทำงาน
ROLLBACK;
