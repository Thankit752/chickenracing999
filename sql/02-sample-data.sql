-- =====================================================================
-- CE396 · ระบบบริหารงบประมาณการจัดซื้อ ค่านายหน้า และค่าใช้จ่ายแฝง
-- ไฟล์: 02-sample-data.sql  (ข้อมูลตัวอย่าง v2 — ทุกตารางอย่างน้อย 10 แถว)
-- ต้องรัน 01-ddl.sql ก่อนเสมอ · รันซ้ำได้
-- =====================================================================

SET search_path TO moto_budget;

-- ลบข้อมูลเดิมทั้งหมด (ลูกก่อนแม่) แล้วรีเซ็ตตัวนับ serial
TRUNCATE hidden_cost, sale_commission, sale, vehicle_unit, purchase_order_item,
         purchase_order, budget_allocation, salesperson, customer_phone, customer,
         motorcycle_model, supplier, expense_category, budget_period, branch
RESTART IDENTITY CASCADE;

-- 1) สาขา — 10 แถว
INSERT INTO branch (branch_code, branch_name, province, opened_date) VALUES
('BKK01', 'สาขารามคำแหง',   'กรุงเทพมหานคร', DATE '2019-01-15'),
('BKK02', 'สาขาบางนา',       'กรุงเทพมหานคร', DATE '2020-06-01'),
('CNX01', 'สาขาเชียงใหม่',   'เชียงใหม่',      DATE '2021-03-10'),
('KKN01', 'สาขาขอนแก่น',     'ขอนแก่น',        DATE '2021-09-01'),
('PKT01', 'สาขาภูเก็ต',       'ภูเก็ต',          DATE '2022-02-14'),
('NMA01', 'สาขาโคราช',       'นครราชสีมา',     DATE '2022-07-01'),
('CBI01', 'สาขาชลบุรี',       'ชลบุรี',          DATE '2023-01-09'),
('HDY01', 'สาขาหาดใหญ่',     'สงขลา',          DATE '2023-06-15'),
('UDN01', 'สาขาอุดรธานี',     'อุดรธานี',        DATE '2024-03-01'),
('BKK03', 'สาขาลาดพร้าว',    'กรุงเทพมหานคร', DATE '2024-10-01');

-- 2) รอบงบประมาณ (ปีงบไทย เริ่ม 1 ต.ค.) — 10 แถว
--    id 1–2 คือรอบที่ใช้งานจริงในข้อมูลการขาย (คงลำดับเดิมจาก v1)
INSERT INTO budget_period (fiscal_year, quarter, start_date, end_date, status) VALUES
(2569, 1, DATE '2025-10-01', DATE '2025-12-31', 'CLOSED'),
(2569, 2, DATE '2026-01-01', DATE '2026-03-31', 'OPEN'),
(2569, 3, DATE '2026-04-01', DATE '2026-06-30', 'OPEN'),
(2569, 4, DATE '2026-07-01', DATE '2026-09-30', 'OPEN'),
(2568, 1, DATE '2024-10-01', DATE '2024-12-31', 'CLOSED'),
(2568, 2, DATE '2025-01-01', DATE '2025-03-31', 'CLOSED'),
(2568, 3, DATE '2025-04-01', DATE '2025-06-30', 'CLOSED'),
(2568, 4, DATE '2025-07-01', DATE '2025-09-30', 'CLOSED'),
(2567, 3, DATE '2024-04-01', DATE '2024-06-30', 'CLOSED'),
(2567, 4, DATE '2024-07-01', DATE '2024-09-30', 'CLOSED');

-- 3) หมวดค่าใช้จ่าย — 10 แถว
INSERT INTO expense_category (category_code, category_name, cost_type, is_controlled) VALUES
('PUR-UNIT',    'งบจัดซื้อรถเข้าสต็อก',          'PURCHASE',   true),
('COM-SALES',   'ค่านายหน้าพนักงานขาย',          'COMMISSION', true),
('COM-REFER',   'ค่านายหน้าผู้แนะนำลูกค้า',       'COMMISSION', true),
('HID-FREIGHT', 'ค่าขนส่งรถจากโรงงาน',           'HIDDEN',     true),
('HID-PDI',     'ค่าเตรียมรถก่อนส่งมอบ (PDI)',    'HIDDEN',     true),
('HID-REG',     'ค่าจดทะเบียนและป้ายภาษี',        'HIDDEN',     true),
('HID-FLOOR',   'ดอกเบี้ยสินเชื่อสต็อกรถ',         'HIDDEN',     true),
('HID-STORE',   'ค่าจัดเก็บและประกันสต็อก',        'HIDDEN',     false),
('COM-BONUS',   'โบนัสพนักงานขายถึงเป้า',         'COMMISSION', true),
('HID-PROMO',   'ของแถมและโปรโมชันหน้าร้าน',      'HIDDEN',     true);

-- 4) การจัดสรรงบประมาณ (สาขา × รอบงบ × หมวด) — 15 แถว
INSERT INTO budget_allocation (branch_id, period_id, category_id, amount_allocated, approved_by) VALUES
(1, 2, 1, 8000000.00, 'ผู้จัดการเขต'),
(1, 2, 2,  240000.00, 'ผู้จัดการเขต'),
(1, 2, 4,  120000.00, 'ผู้จัดการเขต'),
(1, 2, 5,   60000.00, 'ผู้จัดการเขต'),
(1, 2, 7,  150000.00, 'ฝ่ายการเงิน'),
(2, 2, 1, 5000000.00, 'ผู้จัดการเขต'),
(2, 2, 2,  150000.00, 'ผู้จัดการเขต'),
(2, 2, 4,   80000.00, 'ผู้จัดการเขต'),
(3, 2, 1, 3000000.00, 'ผู้จัดการเขต'),
(3, 2, 2,   90000.00, 'ผู้จัดการเขต'),
(3, 2, 4,  100000.00, 'ฝ่ายการเงิน'),
(4, 1, 1, 2000000.00, 'ผู้จัดการเขต'),
(4, 1, 2,   60000.00, 'ผู้จัดการเขต'),
(5, 1, 1, 1500000.00, 'ผู้จัดการเขต'),
(6, 1, 1, 1500000.00, 'ผู้จัดการเขต');

-- 5) ผู้จำหน่าย — 10 แถว
INSERT INTO supplier (supplier_code, supplier_name, tax_id, credit_term_days, contact_phone) VALUES
('SUP-HND', 'บริษัท เอ.พี. ฮอนด้า จำกัด',            '0105530000011', 45, '02-100-1000'),
('SUP-YMH', 'บริษัท ไทยยามาฮ่ามอเตอร์ จำกัด',        '0105520000022', 30, '02-200-2000'),
('SUP-KWS', 'บริษัท คาวาซากิ มอเตอร์ จำกัด',         '0105540000033', 60, '02-300-3000'),
('SUP-SZK', 'บริษัท ไทยซูซูกิมอเตอร์ จำกัด',         '0105530000044', 30, '02-400-4000'),
('SUP-GPX', 'บริษัท จีพีเอ็กซ์ เทคโนโลยี จำกัด',      '0105550000055', 30, '02-500-5000'),
('SUP-PGO', 'บริษัท เพียจิโอ้ ประเทศไทย จำกัด',       '0105560000066', 45, '02-600-6000'),
('SUP-RYE', 'บริษัท รอยัล เอ็นฟิลด์ ไทยแลนด์ จำกัด',  '0105570000077', 60, '02-700-7000'),
('SUP-TRI', 'บริษัท ไทรอัมพ์ มอเตอร์ไซเคิลส์ จำกัด',  '0105540000088', 60, '02-800-8000'),
('SUP-BMW', 'บริษัท บีเอ็มดับเบิลยู ประเทศไทย จำกัด', '0105530000099', 90, '02-900-9000'),
('SUP-STL', 'บริษัท สตาเลียนส์ จำกัด',                '0105580000100', 30, NULL);

-- 6) รุ่นรถ — 10 แถว
INSERT INTO motorcycle_model (model_code, brand, model_name, engine_cc, standard_cost, suggested_price) VALUES
('HND-WAV125', 'Honda',    'Wave 125i',       125,  42000.00,  52900.00),
('HND-PCX160', 'Honda',    'PCX 160',         157,  74000.00,  89900.00),
('HND-CLK300', 'Honda',    'CL300',           286, 118000.00, 139900.00),
('YMH-NMX155', 'Yamaha',   'NMAX 155',        155,  71000.00,  87900.00),
('YMH-AER155', 'Yamaha',   'Aerox 155',       155,  62000.00,  76900.00),
('KWS-Z400',   'Kawasaki', 'Z400',            399, 152000.00, 179000.00),
('HND-CLK160', 'Honda',    'Click 160',       157,  58000.00,  69900.00),
('YMH-FIN125', 'Yamaha',   'Fino 125',        125,  44000.00,  54900.00),
('GPX-LGD200', 'GPX',      'Legend 200',      197,  55000.00,  66900.00),
('VSP-PRI150', 'Vespa',    'Primavera 150',   155,  98000.00, 119900.00);

-- 7) ใบสั่งซื้อ — 10 แถว (po_id 1–4 เดิม, 5–10 เพิ่มใหม่)
INSERT INTO purchase_order (po_no, branch_id, supplier_id, period_id, order_date, expected_date, status) VALUES
('PO-6902-001', 1, 1, 2, DATE '2026-01-08', DATE '2026-01-20', 'RECEIVED'),
('PO-6902-002', 1, 2, 2, DATE '2026-01-15', DATE '2026-01-28', 'RECEIVED'),
('PO-6902-003', 2, 1, 2, DATE '2026-01-20', DATE '2026-02-05', 'RECEIVED'),
('PO-6902-004', 3, 3, 2, DATE '2026-02-02', DATE '2026-02-20', 'APPROVED'),
('PO-6901-001', 4, 1, 1, DATE '2025-10-10', DATE '2025-10-25', 'RECEIVED'),
('PO-6901-002', 5, 2, 1, DATE '2025-11-05', DATE '2025-11-20', 'RECEIVED'),
('PO-6901-003', 6, 5, 1, DATE '2025-12-01', DATE '2025-12-15', 'RECEIVED'),
('PO-6902-005', 7, 6, 2, DATE '2026-02-10', DATE '2026-03-01', 'APPROVED'),
('PO-6902-006', 2, 1, 2, DATE '2026-02-15', NULL,              'DRAFT'),
('PO-6902-007', 1, 2, 2, DATE '2026-03-01', DATE '2026-03-15', 'CANCELLED');

-- 8) รายการในใบสั่งซื้อ (เอนทิตีอ่อน) — 14 แถว
INSERT INTO purchase_order_item (po_id, line_no, model_id, qty, unit_cost, discount_amount) VALUES
( 1, 1, 1, 3,  42000.00, 3000.00),
( 1, 2, 2, 2,  74000.00,    0.00),
( 2, 1, 4, 2,  71000.00, 2000.00),
( 2, 2, 5, 2,  62000.00,    0.00),
( 3, 1, 1, 2,  42000.00,    0.00),
( 3, 2, 3, 1, 118000.00, 5000.00),
( 4, 1, 6, 2, 152000.00, 4000.00),
( 5, 1, 7, 2,  58000.00, 1000.00),
( 5, 2, 1, 1,  42000.00,    0.00),
( 6, 1, 8, 2,  44000.00,    0.00),
( 7, 1, 9, 2,  55000.00, 2000.00),
( 8, 1,10, 1,  98000.00,    0.00),
( 9, 1, 2, 2,  74000.00,    0.00),
(10, 1, 4, 1,  71000.00,    0.00);

-- 9) คันรถในสต็อก — 19 แถว
INSERT INTO vehicle_unit (vin, po_id, line_no, model_id, color, receive_date, status) VALUES
('MLHJF5012P0001', 1, 1, 1, 'แดง-ดำ',    DATE '2026-01-20', 'SOLD'),
('MLHJF5012P0002', 1, 1, 1, 'น้ำเงิน',   DATE '2026-01-20', 'SOLD'),
('MLHJF5012P0003', 1, 1, 1, 'ดำ',        DATE '2026-01-20', 'IN_STOCK'),
('MLHKF2811P0011', 1, 2, 2, 'เทา',       DATE '2026-01-20', 'SOLD'),
('MLHKF2811P0012', 1, 2, 2, 'ขาว',       DATE '2026-01-20', 'RESERVED'),
('MHLSG5522P0021', 2, 1, 4, 'ฟ้า',       DATE '2026-01-28', 'SOLD'),
('MHLSG5522P0022', 2, 1, 4, 'ดำ-ทอง',    DATE '2026-01-28', 'IN_STOCK'),
('MHLBG4411P0031', 2, 2, 5, 'เหลือง',    DATE '2026-01-28', 'SOLD'),
('MHLBG4411P0032', 2, 2, 5, 'เทาด้าน',   DATE '2026-01-28', 'IN_STOCK'),
('MLHJF5012P0101', 3, 1, 1, 'แดง',       DATE '2026-02-05', 'SOLD'),
('MLHJF5012P0102', 3, 1, 1, 'ดำ',        DATE '2026-02-05', 'IN_STOCK'),
('MLHCL3000P0201', 3, 2, 3, 'เขียว',     DATE '2026-02-05', 'SOLD'),
('MLHCK1601Q0301', 5, 1, 7, 'ขาว',       DATE '2025-10-25', 'SOLD'),
('MLHCK1601Q0302', 5, 1, 7, 'แดง',       DATE '2025-10-25', 'SOLD'),
('MLHJF5012Q0303', 5, 2, 1, 'ดำ',        DATE '2025-10-25', 'IN_STOCK'),
('MHLFN1250Q0401', 6, 1, 8, 'ชมพู',      DATE '2025-11-20', 'SOLD'),
('MHLFN1250Q0402', 6, 1, 8, 'ครีม',      DATE '2025-11-20', 'IN_STOCK'),
('GPXLG2000Q0501', 7, 1, 9, 'เขียวทหาร', DATE '2025-12-15', 'SOLD'),
('GPXLG2000Q0502', 7, 1, 9, 'ดำ',        DATE '2025-12-15', 'RESERVED');

-- 10) ลูกค้า — 10 แถว (ไม่มีคอลัมน์ phone แล้ว ดูตาราง 10.1)
INSERT INTO customer (first_name, last_name, email, customer_type) VALUES
('สมชาย',           'ใจดี',        'somchai@mail.com',  'INDIVIDUAL'),
('อารีย์',           'พงษ์ศรี',     'aree@mail.com',     'INDIVIDUAL'),
('ณัฐพล',           'ทองแท้',      NULL,                'INDIVIDUAL'),
('กมลวรรณ',         'สุขสวัสดิ์',   'kamon@mail.com',    'INDIVIDUAL'),
('บริษัท เดลิเวอรี่ฟาสต์', 'จำกัด',  'fleet@fast.co.th',  'CORPORATE'),
('ปิยะ',             'มั่นคง',       NULL,                'INDIVIDUAL'),
('ธิดารัตน์',         'แสงทอง',      'thida@mail.com',    'INDIVIDUAL'),
('ประยุทธ',          'ขยันดี',       NULL,                'INDIVIDUAL'),
('วรรณา',           'ศรีสุข',       'wanna@mail.com',    'INDIVIDUAL'),
('หจก. ส่งไว',        'ขนส่ง',        'ops@songwai.co.th', 'CORPORATE');

-- 10.1) เบอร์โทรลูกค้า (แอตทริบิวต์พหุค่า) — 16 แถว · ลูกค้าทุกคนมีเบอร์หลัก 1 เบอร์
INSERT INTO customer_phone (customer_id, phone_no, phone_type, is_primary) VALUES
( 1, '0810000001', 'MOBILE', true),
( 1, '021110001',  'HOME',   false),
( 2, '0810000002', 'MOBILE', true),
( 3, '0810000003', 'MOBILE', true),
( 3, '0899990003', 'WORK',   false),
( 4, '0810000004', 'MOBILE', true),
( 5, '0210000005', 'WORK',   true),
( 5, '0820000005', 'MOBILE', false),
( 5, '0820000015', 'MOBILE', false),
( 6, '0810000006', 'MOBILE', true),
( 7, '0810000007', 'MOBILE', true),
( 8, '0810000008', 'MOBILE', true),
( 8, '044000008',  'HOME',   false),
( 9, '0810000009', 'MOBILE', true),
(10, '074000010',  'WORK',   true),
(10, '0810000010', 'MOBILE', false);

-- 11) พนักงานขาย — 10 แถว
INSERT INTO salesperson (emp_code, full_name, branch_id, hire_date, base_commission_pct, is_active) VALUES
('EMP-001', 'วีระ ขายเก่ง',      1, DATE '2021-05-01', 2.50, true),
('EMP-002', 'จันทนา ปิดการขาย',  1, DATE '2022-08-15', 2.00, true),
('EMP-003', 'ธนกร ลูกค้าเยอะ',   2, DATE '2020-11-01', 2.50, true),
('EMP-004', 'ศิริพร ใจเย็น',     2, DATE '2023-02-01', 1.80, true),
('EMP-005', 'อนุชา เหนือสุด',    3, DATE '2022-01-10', 2.20, true),
('EMP-006', 'พิมพ์ชนก อีสานยิ้ม', 4, DATE '2021-10-01', 2.00, true),
('EMP-007', 'กิตติ อันดามัน',    5, DATE '2022-03-01', 2.50, true),
('EMP-008', 'สุรเชษฐ์ ย่าโม',     6, DATE '2022-08-01', 2.20, true),
('EMP-009', 'มาลัย ชายทะเล',     7, DATE '2023-02-01', 2.00, true),
('EMP-010', 'ภัทร ช่วยปิด',       4, DATE '2024-01-15', 1.50, false);

-- 12) การขาย (1 คัน : 1 การขาย) — 11 แถว
INSERT INTO sale (sale_no, unit_id, customer_id, branch_id, period_id, sale_date, sale_price, payment_type) VALUES
('SO-6902-001',  1,  1, 1, 2, DATE '2026-01-25',  52900.00, 'HIRE_PURCHASE'),
('SO-6902-002',  2,  2, 1, 2, DATE '2026-01-27',  51500.00, 'CASH'),
('SO-6902-003',  4,  3, 1, 2, DATE '2026-02-01',  89900.00, 'HIRE_PURCHASE'),
('SO-6902-004',  6,  4, 1, 2, DATE '2026-02-03',  87900.00, 'LEASING'),
('SO-6902-005',  8,  5, 1, 2, DATE '2026-02-08',  74900.00, 'CASH'),
('SO-6902-006', 10,  6, 2, 2, DATE '2026-02-12',  52900.00, 'CASH'),
('SO-6902-007', 12,  5, 2, 2, DATE '2026-02-18', 139900.00, 'LEASING'),
('SO-6901-001', 13,  7, 4, 1, DATE '2025-11-02',  69900.00, 'CASH'),
('SO-6901-002', 14,  8, 4, 1, DATE '2025-11-15',  68500.00, 'HIRE_PURCHASE'),
('SO-6901-003', 16,  9, 5, 1, DATE '2025-12-05',  54900.00, 'CASH'),
('SO-6901-004', 18, 10, 6, 1, DATE '2025-12-28',  66900.00, 'HIRE_PURCHASE');

-- 13) ค่านายหน้า (M:N — บางดีลแบ่งคอมมิชชันหลายคน) — 15 แถว
INSERT INTO sale_commission (sale_id, salesperson_id, role_in_deal, commission_pct, commission_amount, paid_date) VALUES
( 1, 1, 'LEAD',     2.50, 1322.50, DATE '2026-02-05'),
( 2, 2, 'LEAD',     2.00, 1030.00, DATE '2026-02-05'),
( 3, 1, 'LEAD',     2.50, 2247.50, DATE '2026-02-28'),
( 3, 2, 'ASSIST',   1.00,  899.00, DATE '2026-02-28'),
( 4, 2, 'LEAD',     2.00, 1758.00, DATE '2026-02-28'),
( 5, 1, 'LEAD',     2.50, 1872.50, NULL),
( 5, 5, 'REFERRAL', 0.50,  374.50, NULL),
( 6, 3, 'LEAD',     2.50, 1322.50, NULL),
( 7, 3, 'LEAD',     2.50, 3497.50, NULL),
( 7, 4, 'ASSIST',   1.00, 1399.00, NULL),
( 8, 6, 'LEAD',     2.00, 1398.00, DATE '2025-12-05'),
( 9, 6, 'LEAD',     2.00, 1370.00, DATE '2025-12-05'),
( 9,10, 'ASSIST',   1.00,  685.00, DATE '2025-12-05'),
(10, 7, 'LEAD',     2.50, 1372.50, DATE '2026-01-05'),
(11, 8, 'LEAD',     2.20, 1471.80, DATE '2026-01-05');

-- 14) ค่าใช้จ่ายแฝงรายคัน (M:N คันรถ × หมวด) — 32 แถว
INSERT INTO hidden_cost (unit_id, category_id, cost_date, amount, reference_no, note) VALUES
( 1, 4, DATE '2026-01-20', 1200.00, 'FR-0001',  'ขนส่งจากโรงงานอยุธยา'),
( 1, 5, DATE '2026-01-22',  800.00, 'PDI-0001', 'เช็กก่อนส่งมอบ'),
( 1, 6, DATE '2026-01-25', 2100.00, 'REG-0001', 'จดทะเบียน + พ.ร.บ.'),
( 2, 4, DATE '2026-01-20', 1200.00, 'FR-0002',  NULL),
( 2, 6, DATE '2026-01-27', 2100.00, 'REG-0002', NULL),
( 3, 4, DATE '2026-01-20', 1200.00, 'FR-0003',  NULL),
( 3, 7, DATE '2026-02-28', 1750.00, 'FP-0003',  'ดอกเบี้ยสต็อกค้าง 40 วัน'),
( 4, 4, DATE '2026-01-20', 1500.00, 'FR-0004',  NULL),
( 4, 5, DATE '2026-01-30', 1200.00, 'PDI-0004', NULL),
( 4, 6, DATE '2026-02-01', 3400.00, 'REG-0004', NULL),
( 5, 4, DATE '2026-01-20', 1500.00, 'FR-0005',  NULL),
( 5, 7, DATE '2026-02-28', 2200.00, 'FP-0005',  'ดอกเบี้ยสต็อกค้าง'),
( 6, 4, DATE '2026-01-28', 1400.00, 'FR-0006',  NULL),
( 6, 6, DATE '2026-02-03', 3300.00, 'REG-0006', NULL),
( 7, 4, DATE '2026-01-28', 1400.00, 'FR-0007',  NULL),
( 7, 8, DATE '2026-02-28',  900.00, 'ST-0007',  'ค่าประกันสต็อก'),
( 8, 4, DATE '2026-01-28', 1350.00, 'FR-0008',  NULL),
( 8, 6, DATE '2026-02-08', 2900.00, 'REG-0008', NULL),
( 9, 7, DATE '2026-02-28', 1980.00, 'FP-0009',  'ดอกเบี้ยสต็อกค้าง 60 วัน'),
(10, 4, DATE '2026-02-05', 1200.00, 'FR-0010',  NULL),
(10, 6, DATE '2026-02-12', 2100.00, 'REG-0010', NULL),
(12, 4, DATE '2026-02-05', 2500.00, 'FR-0012',  'ขนส่งรถบิ๊กไบก์'),
(12, 5, DATE '2026-02-15', 2500.00, 'PDI-0012', NULL),
(12, 6, DATE '2026-02-18', 5200.00, 'REG-0012', NULL),
(13, 4, DATE '2025-10-25', 1600.00, 'FR-0013',  'ขนส่งไปขอนแก่น'),
(13, 6, DATE '2025-11-02', 2300.00, 'REG-0013', NULL),
(14, 4, DATE '2025-10-25', 1600.00, 'FR-0014',  NULL),
(14,10, DATE '2025-11-15',  990.00, 'PR-0014',  'หมวกกันน็อกแถม'),
(15, 7, DATE '2026-01-31', 2450.00, 'FP-0015',  'ดอกเบี้ยสต็อกค้าง 98 วัน'),
(16, 4, DATE '2025-11-20', 1500.00, 'FR-0016',  NULL),
(17, 8, DATE '2026-01-31', 1100.00, 'ST-0017',  'ค่าประกันสต็อก'),
(18, 4, DATE '2025-12-15', 1800.00, 'FR-0018',  NULL);

-- ตรวจจำนวนแถวที่โหลดเข้าไป — ทุกตารางต้องได้ ≥ 10
SELECT 'branch' AS ตาราง, count(*) AS จำนวนแถว FROM branch
UNION ALL SELECT 'budget_period',       count(*) FROM budget_period
UNION ALL SELECT 'expense_category',    count(*) FROM expense_category
UNION ALL SELECT 'budget_allocation',   count(*) FROM budget_allocation
UNION ALL SELECT 'supplier',            count(*) FROM supplier
UNION ALL SELECT 'motorcycle_model',    count(*) FROM motorcycle_model
UNION ALL SELECT 'purchase_order',      count(*) FROM purchase_order
UNION ALL SELECT 'purchase_order_item', count(*) FROM purchase_order_item
UNION ALL SELECT 'vehicle_unit',        count(*) FROM vehicle_unit
UNION ALL SELECT 'customer',            count(*) FROM customer
UNION ALL SELECT 'customer_phone',      count(*) FROM customer_phone
UNION ALL SELECT 'salesperson',         count(*) FROM salesperson
UNION ALL SELECT 'sale',                count(*) FROM sale
UNION ALL SELECT 'sale_commission',     count(*) FROM sale_commission
UNION ALL SELECT 'hidden_cost',         count(*) FROM hidden_cost;
