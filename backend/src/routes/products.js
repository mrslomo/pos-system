const router = require('express').Router();
const { query } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const { search, category_id, is_weight, branch_id, page = 1, limit = 50 } = req.query;
    const branchId = branch_id || req.user.branch_id || 1;
    const conditions = ['p.is_active = true'];
    const params = [branchId];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(p.name ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`);
    }
    if (category_id) { params.push(category_id); conditions.push(`p.category_id = $${params.length}`); }
    if (is_weight !== undefined && is_weight !== '') { params.push(is_weight === 'true'); conditions.push(`p.is_weight = $${params.length}`); }

    const filterParams = [...params];
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const result = await query(`
      SELECT p.*, c.name as category_name,
        COALESCE(sf.quantity, 0) as front_stock,
        COALESCE(sb.quantity, 0) as back_stock
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN stock sf ON sf.product_id = p.id AND sf.location = 'front' AND sf.branch_id = $1
      LEFT JOIN stock sb ON sb.product_id = p.id AND sb.location = 'back' AND sb.branch_id = $1
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.name
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countResult = await query(
      `SELECT COUNT(*) FROM products p WHERE ${conditions.join(' AND ')}`,
      filterParams
    );

    res.json({ products: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

router.get('/search', async (req, res, next) => {
  try {
    const { q, branch_id } = req.query;
    if (!q) return res.json([]);
    const branchId = branch_id || req.user.branch_id;

    const result = await query(`
      SELECT p.*, c.name as category_name,
        COALESCE(sf.quantity, 0) as front_stock,
        COALESCE(sb.quantity, 0) as back_stock,
        COALESCE(sf.quantity, 0) + COALESCE(sb.quantity, 0) as total_stock
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN stock sf ON sf.product_id = p.id AND sf.location = 'front' AND sf.branch_id = $2
      LEFT JOIN stock sb ON sb.product_id = p.id AND sb.location = 'back' AND sb.branch_id = $2
      WHERE p.is_active = true AND (p.name ILIKE $1 OR p.barcode = $3)
      ORDER BY p.name LIMIT 20
    `, [`%${q}%`, branchId, q]);

    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/barcode/:barcode', async (req, res, next) => {
  try {
    const branch_id = req.query.branch_id || req.user.branch_id;
    const result = await query(`
      SELECT p.*, c.name as category_name,
        COALESCE(sf.quantity, 0) as front_stock,
        COALESCE(sb.quantity, 0) as back_stock
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN stock sf ON sf.product_id = p.id AND sf.location = 'front' AND sf.branch_id = $2
      LEFT JOIN stock sb ON sb.product_id = p.id AND sb.location = 'back' AND sb.branch_id = $2
      WHERE p.barcode = $1 AND p.is_active = true
    `, [req.params.barcode, branch_id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT p.*, c.name as category_name FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { barcode, name, description, category_id, unit, is_weight, cost_price, sell_price, min_stock } = req.body;
    if (!name) return res.status(400).json({ error: 'Product name required' });

    const result = await query(`
      INSERT INTO products (barcode, name, description, category_id, unit, is_weight, cost_price, sell_price, min_stock)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [barcode, name, description, category_id, unit || 'piece', is_weight || false, cost_price || 0, sell_price || 0, min_stock || 5]);

    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { barcode, name, description, category_id, unit, is_weight, cost_price, sell_price, min_stock, is_active } = req.body;
    const result = await query(`
      UPDATE products SET barcode=$1, name=$2, description=$3, category_id=$4, unit=$5,
        is_weight=$6, cost_price=$7, sell_price=$8, min_stock=$9, is_active=$10, updated_at=NOW()
      WHERE id=$11 RETURNING *
    `, [barcode, name, description, category_id, unit, is_weight, cost_price, sell_price, min_stock, is_active, req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await query('UPDATE products SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Product deactivated' });
  } catch (err) { next(err); }
});

module.exports = router;
