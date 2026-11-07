// สร้างฐานข้อมูล (ถ้ายังไม่มี) แล้วรัน sql/01-ddl.sql และ sql/02-sample-data.sql
// ใช้: npm run db:setup   — รันซ้ำได้ ข้อมูลกลับเป็นค่าตั้งต้นทุกครั้ง
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dbName = process.env.PGDATABASE || 'ce396_moto';
const sqlFile = (name) => readFileSync(fileURLToPath(new URL(`../sql/${name}`, import.meta.url)), 'utf8');

// 1) ต่อฐานข้อมูลระบบ postgres เพื่อสร้าง ce396_moto
const admin = new pg.Client({ database: 'postgres' });
await admin.connect();
const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
if (rowCount === 0) {
  await admin.query(`CREATE DATABASE "${dbName}" WITH ENCODING 'UTF8' TEMPLATE template0`);
  console.log(`สร้างฐานข้อมูล ${dbName} แล้ว`);
}
await admin.end();

// 2) รัน DDL + ข้อมูลตัวอย่าง (simple query protocol รันหลายคำสั่งในครั้งเดียวได้)
const db = new pg.Client({ database: dbName });
await db.connect();
await db.query(sqlFile('01-ddl.sql'));
console.log('รัน 01-ddl.sql เสร็จ');
const results = await db.query(sqlFile('02-sample-data.sql'));
console.log('รัน 02-sample-data.sql เสร็จ — จำนวนแถว:');
console.table([].concat(results).at(-1).rows);
await db.end();
