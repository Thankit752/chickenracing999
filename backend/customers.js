// API ลูกค้า + เบอร์โทรหลายเบอร์ (แอตทริบิวต์พหุค่า → ตาราง customer_phone)
import { Router } from 'express';
import { pool, withTransaction } from './db.js';

export const customers = Router();

// id ต้องเป็นจำนวนเต็มบวกในช่วง integer — นอกนั้นถือว่า "ไม่พบ" แทนที่จะปล่อยให้ PostgreSQL error
customers.param('id', (req, res, next, id) => {
  if (!/^\d{1,10}$/.test(id) || Number(id) > 2147483647) return res.status(404).json({ error: 'ไม่พบลูกค้ารายนี้' });
  next();
});

// รวมเบอร์ของลูกค้าแต่ละคนเป็น array ด้วย json_agg — เบอร์หลักขึ้นก่อน
const SELECT_CUSTOMERS = `
  SELECT c.customer_id, c.first_name, c.last_name, c.email, c.customer_type,
         COALESCE(json_agg(json_build_object(
                    'phone_no', p.phone_no, 'phone_type', p.phone_type, 'is_primary', p.is_primary)
                  ORDER BY p.is_primary DESC, p.phone_no)
                  FILTER (WHERE p.phone_no IS NOT NULL), '[]') AS phones,
         (SELECT COUNT(*) FROM sale s WHERE s.customer_id = c.customer_id)::int AS sale_count
  FROM customer c
  LEFT JOIN customer_phone p ON p.customer_id = c.customer_id`;

const PHONE_TYPES = ['MOBILE', 'HOME', 'WORK'];
const CUSTOMER_TYPES = ['INDIVIDUAL', 'CORPORATE'];

class ValidationError extends Error {}

// ตรวจข้อมูลก่อนแตะฐานข้อมูล — กฎ (1,N) "ต้องมีอย่างน้อย 1 เบอร์" บังคับที่นี่ เพราะ SQL ธรรมดาบังคับไม่ได้
function validate(body) {
  const first_name = String(body.first_name ?? '').trim();
  const last_name = String(body.last_name ?? '').trim();
  const email = String(body.email ?? '').trim() || null;
  const customer_type = body.customer_type || 'INDIVIDUAL';
  if (!first_name || !last_name) throw new ValidationError('กรอกชื่อและนามสกุลให้ครบ');
  if (first_name.length > 60 || last_name.length > 60) throw new ValidationError('ชื่อและนามสกุลยาวได้ไม่เกิน 60 ตัวอักษร');
  if (email && email.length > 120) throw new ValidationError('อีเมลยาวได้ไม่เกิน 120 ตัวอักษร');
  if (!CUSTOMER_TYPES.includes(customer_type)) throw new ValidationError('ประเภทลูกค้าไม่ถูกต้อง');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError('รูปแบบอีเมลไม่ถูกต้อง');

  const phones = (Array.isArray(body.phones) ? body.phones : [])
    .map((p) => ({
      phone_no: String(p.phone_no ?? '').replace(/[\s-]/g, ''),
      phone_type: p.phone_type || 'MOBILE',
      is_primary: Boolean(p.is_primary),
    }))
    .filter((p) => p.phone_no);
  if (phones.length === 0) throw new ValidationError('ลูกค้าต้องมีเบอร์โทรอย่างน้อย 1 เบอร์');
  for (const p of phones) {
    if (!/^0\d{8,9}$/.test(p.phone_no)) throw new ValidationError(`เบอร์ ${p.phone_no} ต้องขึ้นต้นด้วย 0 และยาว 9–10 หลัก`);
    if (!PHONE_TYPES.includes(p.phone_type)) throw new ValidationError('ประเภทเบอร์ไม่ถูกต้อง');
  }
  if (new Set(phones.map((p) => p.phone_no)).size !== phones.length) throw new ValidationError('มีเบอร์ซ้ำกันในรายการ');
  const primaries = phones.filter((p) => p.is_primary).length;
  if (primaries === 0) phones[0].is_primary = true;
  if (primaries > 1) throw new ValidationError('เลือกเบอร์หลักได้เบอร์เดียว');

  return { first_name, last_name, email, customer_type, phones };
}

async function insertPhones(client, customerId, phones) {
  for (const p of phones) {
    await client.query(
      'INSERT INTO customer_phone (customer_id, phone_no, phone_type, is_primary) VALUES ($1, $2, $3, $4)',
      [customerId, p.phone_no, p.phone_type, p.is_primary],
    );
  }
}

async function fetchOne(id) {
  const { rows } = await pool.query(`${SELECT_CUSTOMERS} WHERE c.customer_id = $1 GROUP BY c.customer_id`, [id]);
  return rows[0];
}

customers.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const params = [];
    let where = '';
    if (q) {
      // ค้นจากชื่อ อีเมล หรือเบอร์ใดเบอร์หนึ่งของลูกค้า (EXISTS = มีอย่างน้อย 1 เบอร์ที่ตรง)
      params.push(`%${q}%`);
      where = `WHERE c.first_name ILIKE $1 OR c.last_name ILIKE $1 OR c.email ILIKE $1
               OR EXISTS (SELECT 1 FROM customer_phone x WHERE x.customer_id = c.customer_id AND x.phone_no LIKE $1)`;
    }
    const { rows } = await pool.query(`${SELECT_CUSTOMERS} ${where} GROUP BY c.customer_id ORDER BY c.customer_id`, params);
    res.json(rows);
  } catch (err) { next(err); }
});

customers.get('/:id', async (req, res, next) => {
  try {
    const row = await fetchOne(req.params.id);
    if (!row) return res.status(404).json({ error: 'ไม่พบลูกค้ารายนี้' });
    res.json(row);
  } catch (err) { next(err); }
});

customers.post('/', async (req, res, next) => {
  try {
    const c = validate(req.body);
    const id = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO customer (first_name, last_name, email, customer_type)
         VALUES ($1, $2, $3, $4) RETURNING customer_id`,
        [c.first_name, c.last_name, c.email, c.customer_type],
      );
      await insertPhones(client, rows[0].customer_id, c.phones);
      return rows[0].customer_id;
    });
    res.status(201).json(await fetchOne(id));
  } catch (err) { next(err); }
});

// แก้ไข = อัปเดตลูกค้า + ลบเบอร์เดิมแล้วใส่ชุดใหม่ ภายใน transaction เดียว
customers.put('/:id', async (req, res, next) => {
  try {
    const c = validate(req.body);
    const found = await withTransaction(async (client) => {
      const { rowCount } = await client.query(
        `UPDATE customer SET first_name = $1, last_name = $2, email = $3, customer_type = $4
         WHERE customer_id = $5`,
        [c.first_name, c.last_name, c.email, c.customer_type, req.params.id],
      );
      if (rowCount === 0) return false;
      await client.query('DELETE FROM customer_phone WHERE customer_id = $1', [req.params.id]);
      await insertPhones(client, req.params.id, c.phones);
      return true;
    });
    if (!found) return res.status(404).json({ error: 'ไม่พบลูกค้ารายนี้' });
    res.json(await fetchOne(req.params.id));
  } catch (err) { next(err); }
});

// ลบลูกค้า: เบอร์หายตาม (ON DELETE CASCADE) · ถ้ามีประวัติการขาย FK แบบ RESTRICT จะขวาง → 23503
customers.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM customer WHERE customer_id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'ไม่พบลูกค้ารายนี้' });
    res.status(204).end();
  } catch (err) { next(err); }
});

export { ValidationError };
