const router = require('express').Router();
const { query, pool } = require('../config/database');
const { auth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(auth);

function generateReceiptNumber(branchId) {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `B${String(branchId).padStart(2,'0')}-${date}-${random}`;
}

router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { branch_id, items, payment_method = 'cash', payment_amount, discount_amount = 0, notes } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'No items provided' });
    const branchId = branch_id || req.user.branch_id;

    await client.query('BEGIN');

    let subtotal = 0;
    const itemDetails = [];

    for (const item of items) {
      const productResult = await client.query(
        'SELECT id, name, sell_price, cost_price, is_weight FROM products WHERE id = $1 AND is_active = true',
        [item.product_id]
      );
      if (!productResult.rows.length) throw { status: 400, message: `Product ${item.product_id} not found` };

      const product = productResult.rows[0];
      const unitPrice = item.unit_price || product.sell_price;
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;
      itemDetails.push({ ...product, quantity: item.quantity, unit_price: unitPrice, subtotal: itemSubtotal });

      const stockResult = await client.query(
        'SELECT quantity FROM stock WHERE product_id=$1 AND branch_id=$2 AND location=$3 FOR UPDATE',
        [item.product_id, branchId, 'front']
      );
      const available = stockResult.rows[0]?.quantity || 0;
      if (available < item.quantity) throw { status: 400, message: `Insufficient stock for ${product.name}` };

      await client.query(
        'UPDATE stock SET quantity = quantity - $1 WHERE product_id=$2 AND branch_id=$3 AND location=$4',
        [item.quantity, item.product_id, branchId, 'front']
      );
    }

    const totalAmount = subtotal - discount_amount;
    const changeAmount = payment_method === 'cash' ? (payment_amount - totalAmount) : 0;
    const receiptNumber = generateReceiptNumber(branchId);

    const saleResult = await client.query(`
      INSERT INTO sales (receipt_number, branch_id, user_id, subtotal, discount_amount, total_amount, payment_method, payment_amount, change_amount, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [receiptNumber, branchId, req.user.id, subtotal, discount_amount, totalAmount, payment_method, payment_amount, changeAmount, notes]);

    const sale = saleResult.rows[0];

    for (const item of itemDetails) {
      await client.query(`
        INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, subtotal)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [sale.id, item.id, item.quantity, item.unit_price, item.cost_price, item.subtotal]);

      await client.query(`
        INSERT INTO stock_transactions (product_id, branch_id, type, from_location, quantity, notes, user_id, reference_id)
        VALUES ($1,$2,'sale','front',$3,$4,$5,$6)
      `, [item.id, branchId, item.quantity, `Sale: ${receiptNumber}`, req.user.id, sale.id]);
    }

    await client.query('COMMIT');

    const fullSale = await query(`
      SELECT s.*, b.name as branch_name, u.name as cashier_name,
        json_agg(json_build_object('product_name', p.name, 'quantity', si.quantity, 'unit_price', si.unit_price, 'subtotal', si.subtotal)) as items
      FROM sales s
      JOIN branches b ON b.id = s.branch_id
      JOIN users u ON u.id = s.user_id
      JOIN sale_items si ON si.sale_id = s.id
      JOIN products p ON p.id = si.product_id
      WHERE s.id = $1
      GROUP BY s.id, b.name, u.name
    `, [sale.id]);

    res.status(201).json(fullSale.rows[0]);
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

router.get('/', async (req, res, next) => {
  try {
    const { branch_id, from_date, to_date, page = 1, limit = 20 } = req.query;
    const branchId = branch_id || req.user.branch_id;
    const conditions = ['s.branch_id = $1'];
    const params = [branchId];

    if (from_date) { params.push(from_date); conditions.push(`s.created_at >= $${params.length}`); }
    if (to_date) { params.push(to_date + ' 23:59:59'); conditions.push(`s.created_at <= $${params.length}`); }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const result = await query(`
      SELECT s.*, u.name as cashier_name, b.name as branch_name,
        COUNT(si.id)::int as item_count
      FROM sales s
      JOIN users u ON u.id = s.user_id
      JOIN branches b ON b.id = s.branch_id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY s.id, u.name, b.name
      ORDER BY s.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT s.*, b.name as branch_name, u.name as cashier_name,
        json_agg(json_build_object(
          'id', si.id, 'product_id', si.product_id, 'product_name', p.name,
          'quantity', si.quantity, 'unit_price', si.unit_price, 'subtotal', si.subtotal
        ) ORDER BY si.id) as items
      FROM sales s
      JOIN branches b ON b.id = s.branch_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.id = $1
      GROUP BY s.id, b.name, u.name
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Sale not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
