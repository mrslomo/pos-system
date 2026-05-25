require('dotenv').config();
const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding database...');

    await client.query(`
      INSERT INTO branches (name, address, phone) VALUES
      ('สาขาหลัก', '123 ถ.สุขุมวิท กรุงเทพ', '02-123-4567')
      ON CONFLICT DO NOTHING
    `);

    const hashedPassword = await bcrypt.hash('admin1234', 10);
    await client.query(`
      INSERT INTO users (name, email, password, role, branch_id) VALUES
      ('ผู้ดูแลระบบ', 'admin@pos.com', $1, 'admin', 1),
      ('พนักงานขาย', 'cashier@pos.com', $1, 'cashier', 1)
      ON CONFLICT (email) DO NOTHING
    `, [hashedPassword]);

    await client.query(`
      INSERT INTO categories (name) VALUES
      ('อาหารสด'), ('เครื่องดื่ม'), ('ขนม'), ('เครื่องใช้ไฟฟ้า'), ('อื่นๆ')
      ON CONFLICT DO NOTHING
    `);

    await client.query(`
      INSERT INTO products (barcode, name, category_id, unit, is_weight, cost_price, sell_price, min_stock) VALUES
      ('8850006170009', 'มาม่าต้มยำกุ้ง', 1, 'ซอง', false, 4.50, 6.00, 20),
      ('8852098100015', 'น้ำดื่มเพียวไลฟ์ 600ml', 2, 'ขวด', false, 5.00, 7.00, 30),
      ('8850006170016', 'ทองแดง', 1, 'กก.', true, 80.00, 120.00, 5),
      ('8855501000013', 'ขนมปังแผ่น', 3, 'ถุง', false, 20.00, 28.00, 10)
      ON CONFLICT (barcode) DO NOTHING
    `);

    await client.query(`
      INSERT INTO stock (product_id, branch_id, location, quantity) VALUES
      (1, 1, 'front', 50), (1, 1, 'back', 200),
      (2, 1, 'front', 24), (2, 1, 'back', 100),
      (3, 1, 'front', 10), (3, 1, 'back', 50),
      (4, 1, 'front', 15), (4, 1, 'back', 60)
      ON CONFLICT (product_id, branch_id, location) DO NOTHING
    `);

    console.log('Seed completed');
    console.log('Admin: admin@pos.com / admin1234');
    console.log('Cashier: cashier@pos.com / admin1234');
  } catch (err) {
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
