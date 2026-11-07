// อ่านคำสั่งสืบค้น 5 ข้อจาก sql/03-business-queries.sql โดยตรง
// ไฟล์ .sql จึงเป็นแหล่งความจริงเดียว — แก้ที่ไฟล์ หน้าเว็บเปลี่ยนตาม (รีสตาร์ตเซิร์ฟเวอร์)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../sql/03-business-queries.sql', import.meta.url));

function parse(text) {
  // แต่ละข้อเริ่มด้วยบรรทัด "-- @query N" และจบก่อนข้อถัดไป
  const blocks = text.split(/^-- @query /m).slice(1);
  return blocks.map((block) => {
    const lines = block.replace(/\r/g, '').split('\n');
    const id = Number(lines[0].trim());
    const meta = {};
    const sqlLines = [];
    for (const line of lines.slice(1)) {
      const m = line.match(/^-- @(\w+)\s+(.*)$/);
      if (m) meta[m[1]] = m[2].trim();
      else sqlLines.push(line);
    }
    return {
      id,
      title: meta.title,
      question: meta.question,
      uses: (meta.uses || '').split(',').map((s) => s.trim()).filter(Boolean),
      expect: meta.expect,
      sql: sqlLines.join('\n').trim(),
    };
  });
}

export const queries = parse(readFileSync(file, 'utf8'));
