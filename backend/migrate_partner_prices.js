require('dotenv').config();
const { pool } = require('./src/config/database');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Migrating partner_prices table...');

    // 1. Add unit column if not exists
    await client.query(`
      ALTER TABLE partner_prices
      ADD COLUMN IF NOT EXISTS unit VARCHAR(50)
    `);
    console.log('Added unit column');

    // 2. Fill existing rows with unit from products table
    await client.query(`
      UPDATE partner_prices pp
      SET unit = p.unit
      FROM products p
      WHERE pp.product_id = p.id AND pp.unit IS NULL
    `);
    console.log('Filled unit from products');

    // 3. Set default not null
    await client.query(`
      UPDATE partner_prices SET unit = 'kg' WHERE unit IS NULL
    `);

    // 4. Drop old unique constraint (try both possible names)
    try {
      await client.query(`ALTER TABLE partner_prices DROP CONSTRAINT IF EXISTS partner_prices_partner_id_product_id_key`);
    } catch (e) {}
    try {
      await client.query(`ALTER TABLE partner_prices DROP CONSTRAINT IF EXISTS uq_partner_product`);
    } catch (e) {}

    // Find and drop any existing unique constraints on (partner_id, product_id) without unit
    const constraints = await client.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'partner_prices'::regclass
      AND contype = 'u'
    `);
    for (const row of constraints.rows) {
      // Drop constraints that don't include 'unit' in name
      console.log('Found constraint:', row.conname);
      await client.query(`ALTER TABLE partner_prices DROP CONSTRAINT IF EXISTS "${row.conname}"`);
    }
    console.log('Dropped old constraints');

    // 5. Add new unique constraint on (partner_id, product_id, unit)
    await client.query(`
      ALTER TABLE partner_prices
      ADD CONSTRAINT uq_partner_product_unit UNIQUE (partner_id, product_id, unit)
    `);
    console.log('Added new unique constraint on (partner_id, product_id, unit)');

    console.log('Migration complete!');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
