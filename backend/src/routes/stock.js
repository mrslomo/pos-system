const router = require('express').Router();
const { query } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const { branch_id, location, low_stock } = req.query;
    const branchId = branch_id || req.user.branch_id;

    let sql = `
      SELECT p.id, p.barcode, p.name, p.unit, p.is_weight, p.min_stock,
        p.cost_price, p.sell_price, c.name as category_name,
        COALESCE(sf.quantity, 0) as front_stock,
        COALESCE(sb.quantity, 0) as back_stock,
        COALESCE(sf.quantity, 0) + COALESCE(sb.quantity, 0) as total_stock
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN stock sf ON sf.product_id = p.id AND sf.location = 'front' AND sf.branch_id = $1
      LEFT JOIN stock sb ON sb.product_id = p.id AND sb.location = 'back' AND sb.branch_id = $1
      WHERE p.is_active = true
    `;

    const params = [branchId];
    if (low_stock === 'true') {
      sql += ` AND (COALESCE(sf.quantity, 0) + COALESCE(sb.quantity, 0)) <= p.min_stock`;
    }
    sql += ' ORDER BY p.name';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/low-stock', async (req, res, next) => {
  try {
    const branchId = req.query.branch_id || req.user.branch_id;
    const result = await query(`
      SELECT p.id, p.barcode, p.name, p.unit, p.min_stock,
        COALESCE(sf.quantity, 0) as front_stock,
        COALESCE(sb.quantity, 0) as back_stock,
        COALESCE(sf.quantity, 0) + COALESCE(sb.quantity, 0) as total_stock
      FROM products p
      LEFT JOIN stock sf ON sf.product_id = p.id AND sf.location = 'front' AND sf.branch_id = $1
      LEFT JOIN stock sb ON sb.product_id = p.id AND sb.location = 'back' AND sb.branch_id = $1
      WHERE p.is_active = true
        AND (COALESCE(sf.quantity, 0) + COALESCE(sb.quantity, 0)) <= p.min_stock
      ORDER BY total_stock ASC
    `, [branchId]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/transactions', async (req, res, next) => {
  try {
    const { branch_id, product_id, type, from_date, to_date, page = 1, limit = 50 } = req.query;
    const branchId = branch_id || req.user.branch_id;
    const conditions = ['st.branch_id = $1'];
    const params = [branchId];

    if (product_id) { params.push(product_id); conditions.push(`st.product_id = $${params.length}`); }
    if (type) { params.push(type); conditions.push(`st.type = $${params.length}`); }
    if (from_date) { params.push(from_date); conditions.push(`st.created_at >= $${params.length}`); }
    if (to_date) { params.push(to_date + ' 23:59:59'); conditions.push(`st.created_at <= $${params.length}`); }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const result = await query(`
      SELECT st.*, p.name as product_name, p.unit, u.name as user_name
      FROM stock_transactions st
      JOIN products p ON p.id = st.product_id
      LEFT JOIN users u ON u.id = st.user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY st.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/in', requireRole('admin', 'manager'), async (req, res, next) => {
  const client = await require('../config/database').pool.connect();
  try {
    const { product_id, branch_id, location = 'back', quantity, notes } = req.body;
    if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ error: 'Invalid data' });
    const branchId = branch_id || req.user.branch_id;

    await client.query('BEGIN');

    await client.query(`
      INSERT INTO stock (product_id, branch_id, location, quantity) VALUES ($1,$2,$3,$4)
      ON CONFLICT (product_id, branch_id, location) DO UPDATE SET quantity = stock.quantity + $4
    `, [product_id, branchId, location, quantity]);

    const stockResult = await client.query(
      'SELECT quantity FROM stock WHERE product_id=$1 AND branch_id=$2 AND location=$3',
      [product_id, branchId, location]
    );

    await client.query(`
      INSERT INTO stock_transactions (product_id, branch_id, type, to_location, quantity, after_qty, notes, user_id)
      VALUES ($1,$2,'in',$3,$4,$5,$6,$7)
    `, [product_id, branchId, location, quantity, stockResult.rows[0].quantity, notes, req.user.id]);

    await client.query('COMMIT');
    res.json({ message: 'Stock added successfully' });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

router.post('/out', requireRole('admin', 'manager'), async (req, res, next) => {
  const client = await require('../config/database').pool.connect();
  try {
    const { product_id, branch_id, location = 'back', quantity, notes } = req.body;
    const branchId = branch_id || req.user.branch_id;

    await client.query('BEGIN');

    const stockResult = await client.query(
      'SELECT quantity FROM stock WHERE product_id=$1 AND branch_id=$2 AND location=$3 FOR UPDATE',
      [product_id, branchId, location]
    );
    if (!stockResult.rows.length || stockResult.rows[0].quantity < quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    const newQty = stockResult.rows[0].quantity - quantity;
    await client.query(
      'UPDATE stock SET quantity = $1 WHERE product_id=$2 AND branch_id=$3 AND location=$4',
      [newQty, product_id, branchId, location]
    );

    await client.query(`
      INSERT INTO stock_transactions (product_id, branch_id, type, from_location, quantity, before_qty, after_qty, notes, user_id)
      VALUES ($1,$2,'out',$3,$4,$5,$6,$7,$8)
    `, [product_id, branchId, location, quantity, stockResult.rows[0].quantity, newQty, notes, req.user.id]);

    await client.query('COMMIT');
    res.json({ message: 'Stock removed successfully' });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

router.post('/transfer', requireRole('admin', 'manager'), async (req, res, next) => {
  const client = await require('../config/database').pool.connect();
  try {
    const { product_id, branch_id, from_location, to_location, quantity, notes } = req.body;
    const branchId = branch_id || req.user.branch_id;
    if (from_location === to_location) return res.status(400).json({ error: 'Same location' });

    await client.query('BEGIN');

    const fromStock = await client.query(
      'SELECT quantity FROM stock WHERE product_id=$1 AND branch_id=$2 AND location=$3 FOR UPDATE',
      [product_id, branchId, from_location]
    );
    if (!fromStock.rows.length || fromStock.rows[0].quantity < quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient stock in source location' });
    }

    await client.query(
      'UPDATE stock SET quantity = quantity - $1 WHERE product_id=$2 AND branch_id=$3 AND location=$4',
      [quantity, product_id, branchId, from_location]
    );
    await client.query(`
      INSERT INTO stock (product_id, branch_id, location, quantity) VALUES ($1,$2,$3,$4)
      ON CONFLICT (product_id, branch_id, location) DO UPDATE SET quantity = stock.quantity + $4
    `, [product_id, branchId, to_location, quantity]);

    await client.query(`
      INSERT INTO stock_transactions (product_id, branch_id, type, from_location, to_location, quantity, notes, user_id)
      VALUES ($1,$2,'transfer',$3,$4,$5,$6,$7)
    `, [product_id, branchId, from_location, to_location, quantity, notes, req.user.id]);

    await client.query('COMMIT');
    res.json({ message: 'Stock transferred successfully' });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

router.put('/adjust', requireRole('admin'), async (req, res, next) => {
  const client = await require('../config/database').pool.connect();
  try {
    const { product_id, branch_id, location, quantity, notes } = req.body;
    const branchId = branch_id || req.user.branch_id;
    await client.query('BEGIN');

    const current = await client.query(
      'SELECT quantity FROM stock WHERE product_id=$1 AND branch_id=$2 AND location=$3',
      [product_id, branchId, location]
    );
    const before = current.rows[0]?.quantity || 0;

    await client.query(`
      INSERT INTO stock (product_id, branch_id, location, quantity) VALUES ($1,$2,$3,$4)
      ON CONFLICT (product_id, branch_id, location) DO UPDATE SET quantity = $4
    `, [product_id, branchId, location, quantity]);

    await client.query(`
      INSERT INTO stock_transactions (product_id, branch_id, type, from_location, quantity, before_qty, after_qty, notes, user_id)
      VALUES ($1,$2,'adjustment',$3,$4,$5,$6,$7,$8)
    `, [product_id, branchId, location, Math.abs(quantity - before), before, quantity, notes, req.user.id]);

    await client.query('COMMIT');
    res.json({ message: 'Stock adjusted' });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

module.exports = router;
