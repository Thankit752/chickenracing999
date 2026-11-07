// เซิร์ฟเวอร์หลัก — Express ให้บริการทั้ง API (/api/...) และหน้าเว็บใน public/
import express from 'express';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { queries } from './queries.js';
import { customers, ValidationError } from './customers.js';

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

// ---------- แปลง error ของ PostgreSQL เป็นข้อความที่อ่านเข้าใจ ----------
const PG_ERRORS = {
  23503: { status: 409, message: 'ลบไม่ได้ — ลูกค้ารายนี้มีประวัติการซื้อรถอยู่ (FK fk_sale_customer แบบ RESTRICT)' },
  23505: { status: 409, message: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' },
  23514: { status: 400, message: 'ข้อมูลไม่ผ่านเงื่อนไข CHECK' },
  '28P01': { status: 500, message: 'รหัสผ่านฐานข้อมูลไม่ถูกต้อง — ตรวจ PGPASSWORD ในไฟล์ .env' },
  '3D000': { status: 500, message: 'ยังไม่มีฐานข้อมูล — รัน npm run db:setup ก่อน' },
  '42P01': { status: 500, message: 'ยังไม่มีตาราง — รัน npm run db:setup ก่อน' },
};

app.use((err, req, res, next) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  const known = PG_ERRORS[err.code];
  if (known) {
    return res.status(known.status).json({ error: known.message, code: err.code, constraint: err.constraint });
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
