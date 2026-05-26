require('dotenv').config();
const { pool } = require('./database');

const migrations = `
  CREATE TABLE IF NOT EXISTS branches (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'cashier',
    branch_id INTEGER REFERENCES branches(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    barcode VARCHAR(100) UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category_id INTEGER REFERENCES categories(id),
    unit VARCHAR(20) DEFAULT 'piece',
    is_weight BOOLEAN DEFAULT false,
    cost_price DECIMAL(10,2) DEFAULT 0,
    sell_price DECIMAL(10,2) DEFAULT 0,
    min_stock INTEGER DEFAULT 5,
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS stock (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    location VARCHAR(10) DEFAULT 'back',
    quantity DECIMAL(10,3) DEFAULT 0,
    UNIQUE(product_id, branch_id, location)
  );

  CREATE TABLE IF NOT EXISTS stock_transactions (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    branch_id INTEGER REFERENCES branches(id),
    type VARCHAR(20) NOT NULL,
    from_location VARCHAR(10),
    to_location VARCHAR(10),
    quantity DECIMAL(10,3) NOT NULL,
    before_qty DECIMAL(10,3),
    after_qty DECIMAL(10,3),
    notes TEXT,
    user_id INTEGER REFERENCES users(id),
    reference_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    branch_id INTEGER REFERENCES branches(id),
    user_id INTEGER REFERENCES users(id),
    subtotal DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0,
    payment_method VARCHAR(20) DEFAULT 'cash',
    payment_amount DECIMAL(10,2) DEFAULT 0,
    change_amount DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    quantity DECIMAL(10,3) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2) DEFAULT 0,
    subtotal DECIMAL(10,2) NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
  CREATE INDEX IF NOT EXISTS idx_stock_product_branch ON stock(product_id, branch_id);
  CREATE INDEX IF NOT EXISTS idx_sales_branch_date ON sales(branch_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
  CREATE INDEX IF NOT EXISTS idx_stock_transactions_date ON stock_transactions(created_at);

  -- คู่ค้า (Wholesale partners)
  CREATE TABLE IF NOT EXISTS partners (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    tax_id VARCHAR(20),
    credit_days INTEGER DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS partner_prices (
    id SERIAL PRIMARY KEY,
    partner_id INTEGER REFERENCES partners(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    special_price DECIMAL(10,2) NOT NULL,
    min_qty DECIMAL(10,3) DEFAULT 1,
    UNIQUE(partner_id, product_id)
  );

  -- บิลเข้า (Purchase bills)
  CREATE TABLE IF NOT EXISTS purchase_bills (
    id SERIAL PRIMARY KEY,
    bill_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_name VARCHAR(200),
    branch_id INTEGER REFERENCES branches(id),
    user_id INTEGER REFERENCES users(id),
    total_amount DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'received',
    notes TEXT,
    bill_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS purchase_bill_items (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER REFERENCES purchase_bills(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name VARCHAR(200),
    quantity DECIMAL(10,3) NOT NULL,
    unit_cost DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL
  );

  -- บิลออก (Delivery/wholesale bills)
  CREATE TABLE IF NOT EXISTS delivery_bills (
    id SERIAL PRIMARY KEY,
    bill_number VARCHAR(50) UNIQUE NOT NULL,
    partner_id INTEGER REFERENCES partners(id),
    partner_name VARCHAR(200),
    branch_id INTEGER REFERENCES branches(id),
    user_id INTEGER REFERENCES users(id),
    subtotal DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0,
    payment_method VARCHAR(20) DEFAULT 'cash',
    payment_status VARCHAR(20) DEFAULT 'paid',
    notes TEXT,
    bill_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS delivery_bill_items (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER REFERENCES delivery_bills(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name VARCHAR(200),
    quantity DECIMAL(10,3) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2) DEFAULT 0,
    subtotal DECIMAL(10,2) NOT NULL
  );

  -- สต๊อกใหญ่ (Bulk raw material)
  CREATE TABLE IF NOT EXISTS bulk_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    unit VARCHAR(20) DEFAULT 'kg',
    category VARCHAR(100),
    current_qty DECIMAL(10,3) DEFAULT 0,
    cost_per_unit DECIMAL(10,2) DEFAULT 0,
    min_qty DECIMAL(10,3) DEFAULT 0,
    branch_id INTEGER REFERENCES branches(id),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS bulk_stock_in (
    id SERIAL PRIMARY KEY,
    bulk_item_id INTEGER REFERENCES bulk_items(id),
    quantity DECIMAL(10,3) NOT NULL,
    cost_per_unit DECIMAL(10,2) NOT NULL,
    total_cost DECIMAL(10,2) NOT NULL,
    supplier_name VARCHAR(200),
    reference VARCHAR(100),
    user_id INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );

  -- การซอยสต๊อก (Stock processing)
  CREATE TABLE IF NOT EXISTS stock_processing (
    id SERIAL PRIMARY KEY,
    process_number VARCHAR(50) UNIQUE NOT NULL,
    bulk_item_id INTEGER REFERENCES bulk_items(id),
    input_qty DECIMAL(10,3) NOT NULL,
    total_output_qty DECIMAL(10,3) DEFAULT 0,
    waste_qty DECIMAL(10,3) DEFAULT 0,
    waste_pct DECIMAL(5,2) DEFAULT 0,
    cost_per_input_unit DECIMAL(10,2) DEFAULT 0,
    total_input_cost DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    user_id INTEGER REFERENCES users(id),
    branch_id INTEGER REFERENCES branches(id),
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS stock_processing_outputs (
    id SERIAL PRIMARY KEY,
    processing_id INTEGER REFERENCES stock_processing(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    output_name VARCHAR(200) NOT NULL,
    quantity DECIMAL(10,3) NOT NULL,
    unit VARCHAR(20) DEFAULT 'kg',
    allocated_cost DECIMAL(10,2) DEFAULT 0,
    cost_per_unit DECIMAL(10,2) DEFAULT 0,
    sell_price DECIMAL(10,2) DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_purchase_bills_date ON purchase_bills(bill_date);
  CREATE INDEX IF NOT EXISTS idx_delivery_bills_date ON delivery_bills(bill_date);
  CREATE INDEX IF NOT EXISTS idx_delivery_bills_partner ON delivery_bills(partner_id);
  CREATE INDEX IF NOT EXISTS idx_bulk_stock_in_item ON bulk_stock_in(bulk_item_id);
  CREATE INDEX IF NOT EXISTS idx_stock_processing_bulk ON stock_processing(bulk_item_id);

  -- product_type: fresh (ของสด), innards (เครื่องใน), processed (แปรรูป)
  ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) DEFAULT 'processed';

  -- expand image_url to TEXT for base64 storage
  ALTER TABLE products ALTER COLUMN image_url TYPE TEXT;

  -- Hold บิล (max 24h, like 7-Eleven)
  CREATE TABLE IF NOT EXISTS held_bills (
    id SERIAL PRIMARY KEY,
    session_code VARCHAR(20) UNIQUE NOT NULL,
    branch_id INTEGER REFERENCES branches(id),
    user_id INTEGER REFERENCES users(id),
    customer_name VARCHAR(100),
    cart_items JSONB NOT NULL DEFAULT '[]',
    discount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );

  -- คืนสต๊อก
  CREATE TABLE IF NOT EXISTS stock_returns (
    id SERIAL PRIMARY KEY,
    return_number VARCHAR(50) UNIQUE NOT NULL,
    sale_id INTEGER REFERENCES sales(id),
    branch_id INTEGER REFERENCES branches(id),
    user_id INTEGER REFERENCES users(id),
    reason TEXT,
    total_refund DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS stock_return_items (
    id SERIAL PRIMARY KEY,
    return_id INTEGER REFERENCES stock_returns(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name VARCHAR(200),
    quantity DECIMAL(10,3) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_held_bills_branch ON held_bills(branch_id, expires_at);
  CREATE INDEX IF NOT EXISTS idx_stock_returns_date ON stock_returns(created_at);

  -- ค้างจ่าย: add paid_amount to delivery_bills for partial payment tracking
  ALTER TABLE delivery_bills ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2) DEFAULT 0;
  ALTER TABLE delivery_bills ADD COLUMN IF NOT EXISTS due_date DATE;

  -- ระบบบัญชีธนาคาร / PromptPay สำหรับ QR Code
  CREATE TABLE IF NOT EXISTS bank_accounts (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER REFERENCES branches(id),
    account_label VARCHAR(100) NOT NULL,
    account_type VARCHAR(30) NOT NULL DEFAULT 'bank',
    bank_name VARCHAR(100),
    account_number VARCHAR(50),
    account_name VARCHAR(100) NOT NULL,
    promptpay_number VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_bank_accounts_branch ON bank_accounts(branch_id);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running migrations...');
    await client.query(migrations);
    console.log('Migrations completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
