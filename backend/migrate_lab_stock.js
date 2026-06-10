require('dotenv').config();
const { pool } = require('./src/config/database');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Migrating bulk_items for lab support...');
    await client.query(`ALTER TABLE bulk_items ADD COLUMN IF NOT EXISTS is_lab BOOLEAN DEFAULT FALSE`);
    console.log('Added is_lab column');
    console.log('Migration complete!');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
