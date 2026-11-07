// เซิร์ฟเวอร์หลัก — Express ให้บริการทั้ง API (/api/...) และหน้าเว็บใน public/
import express from 'express';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { queries } from './queries.js';
import { customers, ValidationError } from './customers.js';
import { finance } from './finance.js';

const app = express();
app.use(express.json());
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

// ---------- คำสั่งสืบค้น 5 ข้อ ----------
app.get('/api/queries', (req, res) => {
  res.json(queries);
});

app.post('/api/queries/:id/run', async (req, res, next) => {
  const q = queries.find((x) => x.id === Number(req.params.id));
  if (!q) return res.status(404).json({ error: 'ไม่มีคำสั่งสืบค้นข้อนี้' });
  try {
    const started = performance.now();
    const result = await pool.query(q.sql);
    res.json({
      // ส่งชนิดข้อมูล (OID) ไปด้วย ให้หน้าเว็บรู้ว่าคอลัมน์ไหนเป็นเงิน (numeric) คอลัมน์ไหนเป็นจำนวนนับ
      fields: result.fields.map((f) => ({ name: f.name, type: f.dataTypeID })),
      rows: result.rows,
      rowCount: result.rowCount,
      ms: Math.round(performance.now() - started),
    });
  } catch (err) { next(err); }
});

// ---------- ลูกค้า ----------
app.use('/api/customers', customers);

// ---------- ภาพรวม · งบประมาณ · ใบสั่งซื้อ · ต้นทุนรถ · ค่านายหน้า ----------
app.use('/api', finance);

// ---------- แปลง error ของ PostgreSQL เป็นข้อความที่อ่านเข้าใจ ----------
// ชื่อข้อกำหนดที่ตั้งเอง (pk_ fk_ uq_ ck_) ทำให้บอกผู้ใช้ได้ตรงจุดว่าผิดกฎข้อไหน
const CONSTRAINT_MESSAGES = {
  fk_sale_customer: 'ลบไม่ได้ — ลูกค้ารายนี้มีประวัติการซื้อรถอยู่ (FK fk_sale_customer แบบ RESTRICT)',
  uq_po_no: 'เลขที่ใบสั่งซื้อนี้มีอยู่แล้ว (uq_po_no)',
  uq_hidden_unit_cat_date: 'รถคันนี้มีค่าใช้จ่ายหมวดนี้ในวันเดียวกันอยู่แล้ว (uq_hidden_unit_cat_date)',
  pk_sale_commission: 'พนักงานคนนี้มีค่านายหน้าในการขายนี้อยู่แล้ว (pk_sale_commission)',
  pk_customer_phone: 'ลูกค้ามีเบอร์นี้อยู่แล้ว (pk_customer_phone)',
  uq_sale_one_lead: 'การขายนี้มีผู้ปิดการขาย (LEAD) แล้ว — หนึ่งดีลมี LEAD ได้คนเดียว (uq_sale_one_lead)',
};
const PG_ERRORS = {
  23503: { status: 409, message: 'ข้อมูลนี้ถูกอ้างอิงอยู่ หรืออ้างถึงข้อมูลที่ไม่มีอยู่ (FOREIGN KEY)' },
  23505: { status: 409, message: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' },
  23514: { status: 400, message: 'ข้อมูลไม่ผ่านเงื่อนไข CHECK' },
  22007: { status: 400, message: 'รูปแบบวันที่ไม่ถูกต้อง' },
  22008: { status: 400, message: 'วันที่ไม่มีอยู่จริง' },
  '22P02': { status: 400, message: 'ชนิดข้อมูลไม่ถูกต้อง' },
  22003: { status: 400, message: 'ตัวเลขเกินช่วงที่รับได้' },
  '28P01': { status: 500, message: 'รหัสผ่านฐานข้อมูลไม่ถูกต้อง — ตรวจ PGPASSWORD ในไฟล์ .env' },
  '3D000': { status: 500, message: 'ยังไม่มีฐานข้อมูล — รัน npm run db:setup ก่อน' },
  '42P01': { status: 500, message: 'ยังไม่มีตาราง — รัน npm run db:setup ก่อน' },
};

app.use((err, req, res, next) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  // JSON ที่ส่งมาพัง (express.json แจ้ง status 400 มาเอง)
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'ข้อมูลที่ส่งมาไม่ใช่ JSON ที่ถูกต้อง' });
  const known = PG_ERRORS[err.code];
  if (known) {
    const message = CONSTRAINT_MESSAGES[err.constraint] || known.message;
    return res.status(known.status).json({ error: message, code: err.code, constraint: err.constraint });
  }
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({ error: 'ต่อ PostgreSQL ไม่ได้ — เปิดบริการ postgresql ก่อน' });
  }
  console.error(err);
  res.status(500).json({ error: err.message, code: err.code });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`CE396 moto_budget พร้อมใช้งานที่ http://localhost:${port}`);
});
