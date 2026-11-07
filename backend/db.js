// การเชื่อมต่อ PostgreSQL — อ่านค่าจาก .env (PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT)
// ทุก connection ตั้ง search_path เป็น moto_budget จึงไม่ต้องเขียนชื่อ schema นำหน้าตาราง
import pg from 'pg';

// numeric (OID 1700) ส่งกลับมาเป็นสตริงโดยค่าเริ่มต้น — แปลงเป็นตัวเลขเพื่อจัดรูปแบบบนหน้าเว็บ
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// date (OID 1082) — เก็บเป็นสตริง YYYY-MM-DD ไม่ให้เลื่อนวันตาม timezone
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  options: '-c search_path=moto_budget',
  max: 5,
});
// connection ที่ว่างอยู่หลุด (เช่น รีสตาร์ต PostgreSQL) — log ไว้ ไม่ให้เซิร์ฟเวอร์ล่ม
pool.on('error', (err) => console.error('idle pg client error:', err.message));

// ใช้กับงานที่ต้องทำหลายคำสั่งให้สำเร็จพร้อมกัน (BEGIN … COMMIT / ROLLBACK)
export async function withTransaction(fn) {
  const client = await pool.connect();
  let broken;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // ROLLBACK พังได้ถ้า connection หลุด — เก็บ error เดิมไว้ และทิ้ง client ที่เสีย
    await client.query('ROLLBACK').catch((e) => { broken = e; });
    throw err;
  } finally {
    client.release(broken);
  }
}
