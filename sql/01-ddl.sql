-- =====================================================================
-- CE396 การออกแบบระบบฐานข้อมูล
-- โครงงาน: ระบบบริหารงบประมาณการจัดซื้อ ค่านายหน้า และค่าใช้จ่ายแฝง
--           สำหรับธุรกิจตัวแทนจำหน่ายรถจักรยานยนต์
-- ไฟล์: 01-ddl.sql  (สคริปต์สร้างตารางพร้อมข้อกำหนด) — v2 เพิ่ม customer_phone
-- DBMS: PostgreSQL 16+
-- รันซ้ำได้: สคริปต์นี้ลบสคีมาเดิมทิ้งก่อนสร้างใหม่ทุกครั้ง
-- =====================================================================

DROP SCHEMA IF EXISTS moto_budget CASCADE;
CREATE SCHEMA moto_budget;
SET search_path TO moto_budget;

-- =====================================================================
-- กลุ่มที่ 1 — เอนทิตีหลักด้านองค์กรและงบประมาณ
-- =====================================================================

-- ตารางที่ 1 : สาขา (เอนทิตีปกติ)
CREATE TABLE branch (
    branch_id   serial,
    branch_code varchar(10)  NOT NULL,          -- คีย์คู่แข่ง (candidate key) ที่ไม่ถูกเลือก
    branch_name varchar(120) NOT NULL,
    province    varchar(60)  NOT NULL,
    opened_date date         NOT NULL DEFAULT CURRENT_DATE,
    CONSTRAINT pk_branch PRIMARY KEY (branch_id),
    CONSTRAINT uq_branch_code UNIQUE (branch_code),
    CONSTRAINT ck_branch_code_upper
        CHECK (branch_code = upper(branch_code))
);

-- ตารางที่ 2 : รอบงบประมาณ (ปีงบ + ไตรมาส)
CREATE TABLE budget_period (
    period_id   serial,
    fiscal_year integer     NOT NULL,
    quarter     smallint    NOT NULL,
    start_date  date        NOT NULL,
    end_date    date        NOT NULL,
    status      varchar(10) NOT NULL DEFAULT 'OPEN',
    CONSTRAINT pk_budget_period PRIMARY KEY (period_id),
    CONSTRAINT uq_period_year_quarter UNIQUE (fiscal_year, quarter),
    CONSTRAINT ck_period_quarter   CHECK (quarter BETWEEN 1 AND 4),
    CONSTRAINT ck_period_year      CHECK (fiscal_year BETWEEN 2560 AND 2600),
    CONSTRAINT ck_period_daterange CHECK (end_date > start_date),
    CONSTRAINT ck_period_status    CHECK (status IN ('OPEN', 'CLOSED'))
);

-- ตารางที่ 3 : หมวดค่าใช้จ่าย — แยก 3 ชนิดตามโจทย์ของโครงงาน
--   PURCHASE   = งบจัดซื้อรถเข้าสต็อก
--   COMMISSION = ค่านายหน้า/คอมมิชชันพนักงานขาย
--   HIDDEN     = ค่าใช้จ่ายแฝง (ขนส่ง, PDI, จดทะเบียน, ดอกเบี้ยสต็อก, ค่าจัดเก็บ)
CREATE TABLE expense_category (
    category_id   serial,
    category_code varchar(20)  NOT NULL,
    category_name varchar(120) NOT NULL,
    cost_type     varchar(12)  NOT NULL,
    is_controlled boolean      NOT NULL DEFAULT true,   -- ต้องคุมงบหรือไม่
    CONSTRAINT pk_expense_category PRIMARY KEY (category_id),
    CONSTRAINT uq_category_code UNIQUE (category_code),
    CONSTRAINT ck_category_cost_type
        CHECK (cost_type IN ('PURCHASE', 'COMMISSION', 'HIDDEN'))
);

-- ตารางที่ 4 : การจัดสรรงบประมาณ — ตารางเชื่อมความสัมพันธ์ M:N สามทาง
--   (สาขา × รอบงบประมาณ × หมวดค่าใช้จ่าย) พร้อมแอตทริบิวต์ของความสัมพันธ์
CREATE TABLE budget_allocation (
    allocation_id    serial,
    branch_id        integer       NOT NULL,
    period_id        integer       NOT NULL,
    category_id      integer       NOT NULL,
    amount_allocated numeric(14,2) NOT NULL,
    approved_by      varchar(80)   NOT NULL,
    approved_at      timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT pk_budget_allocation PRIMARY KEY (allocation_id),
    CONSTRAINT uq_allocation_bpc UNIQUE (branch_id, period_id, category_id),
    CONSTRAINT ck_allocation_amount CHECK (amount_allocated >= 0),
    CONSTRAINT fk_allocation_branch   FOREIGN KEY (branch_id)
        REFERENCES branch(branch_id)                     ON DELETE RESTRICT,
    CONSTRAINT fk_allocation_period   FOREIGN KEY (period_id)
        REFERENCES budget_period(period_id)              ON DELETE RESTRICT,
    CONSTRAINT fk_allocation_category FOREIGN KEY (category_id)
        REFERENCES expense_category(category_id)         ON DELETE RESTRICT
);

-- =====================================================================
-- กลุ่มที่ 2 — การจัดซื้อรถเข้าสต็อก
-- =====================================================================

-- ตารางที่ 5 : ผู้จำหน่าย (โรงงาน / ผู้จัดจำหน่ายรายใหญ่)
CREATE TABLE supplier (
    supplier_id      serial,
    supplier_code    varchar(20)  NOT NULL,
    supplier_name    varchar(150) NOT NULL,
    tax_id           char(13)     NOT NULL,
    credit_term_days integer      NOT NULL DEFAULT 30,
    contact_phone    varchar(20),
    CONSTRAINT pk_supplier PRIMARY KEY (supplier_id),
    CONSTRAINT uq_supplier_code UNIQUE (supplier_code),
    CONSTRAINT uq_supplier_tax_id UNIQUE (tax_id),
    CONSTRAINT ck_supplier_credit CHECK (credit_term_days BETWEEN 0 AND 180),
    CONSTRAINT ck_supplier_taxid  CHECK (tax_id ~ '^[0-9]{13}$')
);

-- ตารางที่ 6 : รุ่นรถจักรยานยนต์
CREATE TABLE motorcycle_model (
    model_id        serial,
    model_code      varchar(20)   NOT NULL,
    brand           varchar(60)   NOT NULL,
    model_name      varchar(100)  NOT NULL,
    engine_cc       integer       NOT NULL,
    standard_cost   numeric(12,2) NOT NULL,            -- ต้นทุนมาตรฐานต่อคัน
    suggested_price numeric(12,2) NOT NULL,            -- ราคาขายแนะนำ
    CONSTRAINT pk_motorcycle_model PRIMARY KEY (model_id),
    CONSTRAINT uq_model_code UNIQUE (model_code),
    CONSTRAINT uq_model_brand_name UNIQUE (brand, model_name),
    CONSTRAINT ck_model_cc         CHECK (engine_cc > 0),
    CONSTRAINT ck_model_cost       CHECK (standard_cost > 0),
    CONSTRAINT ck_model_price      CHECK (suggested_price >= standard_cost)
);

-- ตารางที่ 7 : ใบสั่งซื้อ — ผูกกับรอบงบประมาณเพื่อตัดงบหมวด PURCHASE
CREATE TABLE purchase_order (
    po_id         serial,
    po_no         varchar(20) NOT NULL,
    branch_id     integer     NOT NULL,
    supplier_id   integer     NOT NULL,
    period_id     integer     NOT NULL,
    order_date    date        NOT NULL DEFAULT CURRENT_DATE,
    expected_date date,
    status        varchar(12) NOT NULL DEFAULT 'DRAFT',
    CONSTRAINT pk_purchase_order PRIMARY KEY (po_id),
    CONSTRAINT uq_po_no UNIQUE (po_no),
    CONSTRAINT ck_po_status    CHECK (status IN ('DRAFT','APPROVED','RECEIVED','CANCELLED')),
    CONSTRAINT ck_po_expected  CHECK (expected_date IS NULL OR expected_date >= order_date),
    CONSTRAINT fk_po_branch   FOREIGN KEY (branch_id)
        REFERENCES branch(branch_id)                     ON DELETE RESTRICT,
    CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id)
        REFERENCES supplier(supplier_id)                 ON DELETE RESTRICT,
    CONSTRAINT fk_po_period   FOREIGN KEY (period_id)
        REFERENCES budget_period(period_id)              ON DELETE RESTRICT
);

-- ตารางที่ 8 : รายการในใบสั่งซื้อ — เอนทิตีอ่อน (คีย์หลักประกอบ po_id + line_no)
--   ลบใบสั่งซื้อ = รายการย่อยหายตาม จึงใช้ CASCADE
CREATE TABLE purchase_order_item (
    po_id           integer       NOT NULL,
    line_no         integer       NOT NULL,             -- คีย์บางส่วน: ไม่ซ้ำภายในใบเดียวกัน
    model_id        integer       NOT NULL,
    qty             integer       NOT NULL DEFAULT 1,
    unit_cost       numeric(12,2) NOT NULL,
    discount_amount numeric(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT pk_purchase_order_item PRIMARY KEY (po_id, line_no),
    CONSTRAINT ck_poitem_qty      CHECK (qty > 0),
    CONSTRAINT ck_poitem_cost     CHECK (unit_cost > 0),
    CONSTRAINT ck_poitem_discount CHECK (discount_amount >= 0 AND discount_amount <= unit_cost * qty),
    CONSTRAINT fk_poitem_po    FOREIGN KEY (po_id)
        REFERENCES purchase_order(po_id)                 ON DELETE CASCADE,
    CONSTRAINT fk_poitem_model FOREIGN KEY (model_id)
        REFERENCES motorcycle_model(model_id)            ON DELETE RESTRICT
);

-- ตารางที่ 9 : คันรถจริงในสต็อก (ระบุด้วยเลขตัวถัง VIN)
--   อ้างกลับไปยังรายการใบสั่งซื้อด้วยคีย์นอกแบบประกอบ → รู้ต้นทุนซื้อของรถทุกคัน
CREATE TABLE vehicle_unit (
    unit_id      serial,
    vin          varchar(17) NOT NULL,
    po_id        integer     NOT NULL,
    line_no      integer     NOT NULL,
    model_id     integer     NOT NULL,
    color        varchar(40) NOT NULL,
    receive_date date        NOT NULL DEFAULT CURRENT_DATE,
    status       varchar(12) NOT NULL DEFAULT 'IN_STOCK',
    CONSTRAINT pk_vehicle_unit PRIMARY KEY (unit_id),
    CONSTRAINT uq_unit_vin UNIQUE (vin),
    CONSTRAINT ck_unit_status CHECK (status IN ('IN_STOCK','RESERVED','SOLD','RETURNED')),
    CONSTRAINT ck_unit_vin    CHECK (char_length(vin) BETWEEN 10 AND 17),
    CONSTRAINT fk_unit_poitem FOREIGN KEY (po_id, line_no)
        REFERENCES purchase_order_item(po_id, line_no)   ON DELETE RESTRICT,
    CONSTRAINT fk_unit_model  FOREIGN KEY (model_id)
        REFERENCES motorcycle_model(model_id)            ON DELETE RESTRICT
);

-- =====================================================================
-- กลุ่มที่ 3 — การขาย ค่านายหน้า และค่าใช้จ่ายแฝง
-- =====================================================================

-- ตารางที่ 10 : ลูกค้า
--   (v2) ตัดคอลัมน์ phone ออก — ลูกค้า 1 คนมีเบอร์โทรได้หลายเบอร์ (แอตทริบิวต์พหุค่า)
--   ย้ายไปเก็บที่ตาราง customer_phone ตามกฎแปลงข้อที่ 6
CREATE TABLE customer (
    customer_id   serial,
    first_name    varchar(60)  NOT NULL,               -- ครึ่งหนึ่งของแอตทริบิวต์ประกอบ
    last_name     varchar(60)  NOT NULL,
    email         varchar(120),
    customer_type varchar(12)  NOT NULL DEFAULT 'INDIVIDUAL',
    CONSTRAINT pk_customer PRIMARY KEY (customer_id),
    CONSTRAINT ck_customer_type  CHECK (customer_type IN ('INDIVIDUAL','CORPORATE')),
    CONSTRAINT ck_customer_email CHECK (email IS NULL OR email LIKE '%@%.%')
);

-- ตารางที่ 10.1 : เบอร์โทรลูกค้า — แยกจากแอตทริบิวต์พหุค่า (กฎแปลงข้อ 6 → 1:M กลับหาเจ้าของ)
--   PK ผสม (customer_id, phone_no) = ลูกค้าคนเดิมใส่เบอร์เดิมซ้ำไม่ได้
--   ลบลูกค้า → เบอร์หายตาม (CASCADE) เพราะเบอร์ไม่มีความหมายถ้าไม่มีเจ้าของ
--   กฎ "ลูกค้าต้องมีอย่างน้อย 1 เบอร์" (1,N) SQL ธรรมดาบังคับไม่ได้ → บังคับที่ฝั่ง backend
CREATE TABLE customer_phone (
    customer_id integer     NOT NULL,
    phone_no    varchar(20) NOT NULL,
    phone_type  varchar(10) NOT NULL DEFAULT 'MOBILE',
    is_primary  boolean     NOT NULL DEFAULT false,
    CONSTRAINT pk_customer_phone PRIMARY KEY (customer_id, phone_no),
    CONSTRAINT ck_customer_phone_type   CHECK (phone_type IN ('MOBILE','HOME','WORK')),
    CONSTRAINT ck_customer_phone_format CHECK (phone_no ~ '^0[0-9]{8,9}$'),
    CONSTRAINT fk_customer_phone_customer FOREIGN KEY (customer_id)
        REFERENCES customer(customer_id)                 ON DELETE CASCADE
);
-- เบอร์หลักได้เบอร์เดียวต่อลูกค้า (partial unique index)
CREATE UNIQUE INDEX uq_customer_phone_primary ON customer_phone (customer_id) WHERE is_primary;

-- ตารางที่ 11 : พนักงานขาย / นายหน้า
CREATE TABLE salesperson (
    salesperson_id      serial,
    emp_code            varchar(20)  NOT NULL,
    full_name           varchar(120) NOT NULL,
    branch_id           integer      NOT NULL,
    hire_date           date         NOT NULL DEFAULT CURRENT_DATE,
    base_commission_pct numeric(5,2) NOT NULL DEFAULT 2.00,
    is_active           boolean      NOT NULL DEFAULT true,
    CONSTRAINT pk_salesperson PRIMARY KEY (salesperson_id),
    CONSTRAINT uq_salesperson_emp_code UNIQUE (emp_code),
    CONSTRAINT ck_salesperson_pct CHECK (base_commission_pct BETWEEN 0 AND 20),
    CONSTRAINT fk_salesperson_branch FOREIGN KEY (branch_id)
        REFERENCES branch(branch_id)                     ON DELETE RESTRICT
);

-- ตารางที่ 12 : การขาย — 1:1 กับคันรถ บังคับด้วย UNIQUE บนคีย์นอก
CREATE TABLE sale (
    sale_id      serial,
    sale_no      varchar(20)   NOT NULL,
    unit_id      integer       NOT NULL,        -- ← uq_sale_unit_id ทำให้ 1 คัน ขายได้ครั้งเดียว (1:1)
    customer_id  integer       NOT NULL,
    branch_id    integer       NOT NULL,
    period_id    integer       NOT NULL,
    sale_date    date          NOT NULL DEFAULT CURRENT_DATE,
    sale_price   numeric(12,2) NOT NULL,
    payment_type varchar(15)   NOT NULL DEFAULT 'CASH',
    CONSTRAINT pk_sale PRIMARY KEY (sale_id),
    CONSTRAINT uq_sale_no UNIQUE (sale_no),
    CONSTRAINT uq_sale_unit_id UNIQUE (unit_id),
    CONSTRAINT ck_sale_price   CHECK (sale_price > 0),
    CONSTRAINT ck_sale_payment CHECK (payment_type IN ('CASH','HIRE_PURCHASE','LEASING')),
    CONSTRAINT fk_sale_unit     FOREIGN KEY (unit_id)
        REFERENCES vehicle_unit(unit_id)                 ON DELETE RESTRICT,
    CONSTRAINT fk_sale_customer FOREIGN KEY (customer_id)
        REFERENCES customer(customer_id)                 ON DELETE RESTRICT,
    CONSTRAINT fk_sale_branch   FOREIGN KEY (branch_id)
        REFERENCES branch(branch_id)                     ON DELETE RESTRICT,
    CONSTRAINT fk_sale_period   FOREIGN KEY (period_id)
        REFERENCES budget_period(period_id)              ON DELETE RESTRICT
);

-- ตารางที่ 13 : ค่านายหน้า — ตารางเชื่อม M:N (การขาย × พนักงานขาย)
--   หนึ่งการขายแบ่งคอมมิชชันได้หลายคน / หนึ่งคนได้คอมมิชชันจากหลายการขาย
CREATE TABLE sale_commission (
    sale_id           integer       NOT NULL,
    salesperson_id    integer       NOT NULL,
    role_in_deal      varchar(12)   NOT NULL DEFAULT 'LEAD',
    commission_pct    numeric(5,2)  NOT NULL,
    commission_amount numeric(12,2) NOT NULL,
    paid_date         date,
    CONSTRAINT pk_sale_commission PRIMARY KEY (sale_id, salesperson_id),
    CONSTRAINT ck_commission_role   CHECK (role_in_deal IN ('LEAD','ASSIST','REFERRAL')),
    CONSTRAINT ck_commission_pct    CHECK (commission_pct BETWEEN 0 AND 20),
    CONSTRAINT ck_commission_amount CHECK (commission_amount >= 0),
    CONSTRAINT fk_commission_sale        FOREIGN KEY (sale_id)
        REFERENCES sale(sale_id)                         ON DELETE CASCADE,
    CONSTRAINT fk_commission_salesperson FOREIGN KEY (salesperson_id)
        REFERENCES salesperson(salesperson_id)           ON DELETE RESTRICT
);

-- หนึ่งการขายมีผู้ปิดการขาย (LEAD) ได้คนเดียว — partial unique index บังคับที่ฐานข้อมูล
-- (ตรวจใน backend อย่างเดียวไม่พอ ถ้าสองคนบันทึกพร้อมกันจะหลุดได้)
CREATE UNIQUE INDEX uq_sale_one_lead ON sale_commission (sale_id) WHERE role_in_deal = 'LEAD';

-- ตารางที่ 14 : ค่าใช้จ่ายแฝงรายคัน — ตารางเชื่อม M:N (คันรถ × หมวดค่าใช้จ่าย)
--   ค่าขนส่ง, PDI, จดทะเบียน, ดอกเบี้ยสต็อก ฯลฯ ที่ไม่อยู่ในราคาซื้อ
CREATE TABLE hidden_cost (
    hidden_cost_id serial,
    unit_id        integer       NOT NULL,
    category_id    integer       NOT NULL,
    cost_date      date          NOT NULL DEFAULT CURRENT_DATE,
    amount         numeric(12,2) NOT NULL,
    reference_no   varchar(30),
    note           varchar(200),
    CONSTRAINT pk_hidden_cost PRIMARY KEY (hidden_cost_id),
    CONSTRAINT uq_hidden_unit_cat_date UNIQUE (unit_id, category_id, cost_date),
    CONSTRAINT ck_hidden_amount CHECK (amount > 0),
    CONSTRAINT fk_hidden_unit     FOREIGN KEY (unit_id)
        REFERENCES vehicle_unit(unit_id)                 ON DELETE CASCADE,
    CONSTRAINT fk_hidden_category FOREIGN KEY (category_id)
        REFERENCES expense_category(category_id)         ON DELETE RESTRICT
);

-- =====================================================================
-- ดัชนีเสริมสำหรับคอลัมน์ที่ใช้กรอง/เชื่อมบ่อย (คีย์นอกไม่ถูกสร้างดัชนีอัตโนมัติ)
-- =====================================================================
CREATE INDEX ix_po_branch_period      ON purchase_order (branch_id, period_id);
CREATE INDEX ix_poitem_model          ON purchase_order_item (model_id);
CREATE INDEX ix_unit_status           ON vehicle_unit (status);
CREATE INDEX ix_sale_branch_date      ON sale (branch_id, sale_date);
CREATE INDEX ix_commission_salesperson ON sale_commission (salesperson_id);
CREATE INDEX ix_hidden_category       ON hidden_cost (category_id);

-- =====================================================================
-- คำอธิบายตาราง (COMMENT) — ช่วยให้ ERD Tool และผู้ตรวจอ่านเข้าใจตรงกัน
-- =====================================================================
COMMENT ON TABLE branch             IS 'สาขาของตัวแทนจำหน่าย';
COMMENT ON TABLE budget_period      IS 'รอบงบประมาณ ปีงบ + ไตรมาส';
COMMENT ON TABLE expense_category   IS 'หมวดค่าใช้จ่าย: จัดซื้อ / ค่านายหน้า / ค่าใช้จ่ายแฝง';
COMMENT ON TABLE budget_allocation  IS 'ตารางเชื่อม M:N สามทาง สาขา-รอบงบ-หมวด พร้อมวงเงินที่จัดสรร';
COMMENT ON TABLE purchase_order_item IS 'เอนทิตีอ่อนของใบสั่งซื้อ คีย์หลักประกอบ (po_id, line_no)';
COMMENT ON TABLE vehicle_unit       IS 'รถรายคันตาม VIN เป็นจุดผูกต้นทุนซื้อและค่าใช้จ่ายแฝง';
COMMENT ON TABLE sale_commission    IS 'ตารางเชื่อม M:N การขาย-พนักงานขาย เก็บอัตราและยอดค่านายหน้า';
COMMENT ON TABLE customer_phone     IS 'เบอร์โทรลูกค้า แยกจากแอตทริบิวต์พหุค่า ลูกค้า 1 คนมีได้หลายเบอร์';
COMMENT ON TABLE hidden_cost        IS 'ตารางเชื่อม M:N คันรถ-หมวดค่าใช้จ่าย เก็บค่าใช้จ่ายแฝงรายคัน';

-- =====================================================================
-- ตรวจงานตนเอง: ควรได้ 15 แถว
-- =====================================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'moto_budget' AND table_type = 'BASE TABLE'
ORDER BY table_name;
