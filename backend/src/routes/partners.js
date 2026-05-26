const router = require('express').Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');

// List partners
router.get('/', auth, async (req, res, next) => {
  try {
    const { q, is_active } = req.query;
    let sql = `SELECT p.*,
      (SELECT COUNT(*) FROM delivery_bills d WHERE d.partner_id = p.id) AS bill_count
      FROM partners p WHERE 1=1`;
    const params = [];
    if (q) { params.push(`%${q}%`); sql += ` AND (p.name ILIKE $${params.length} OR p.code ILIKE $${params.length} OR p.phone ILIKE $${params.length})`; }
    if (is_active !== undefined) { params.push(is_active); sql += ` AND p.is_active = $${params.length}`; }
    sql += ' ORDER BY p.name';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// Get single partner with special prices
router.get('/:id', auth, async (req, res, next) => {
  try {
    const partner = await query('SELECT * FROM partners WHERE id=$1', [req.params.id]);
    if (!partner.rows[0]) return res.status(404).json({ error: 'ไม่พบคู่ค้า' });
    const prices = await query(
      `SELECT pp.*, p.name AS product_name, p.barcode, p.unit, p.sell_price AS default_price
       FROM partner_prices pp JOIN products p ON p.id = pp.product_id
       WHERE pp.partner_id = $1 ORDER BY p.name`,
      [req.params.id]
    );
    res.json({ ...partner.rows[0], special_prices: prices.rows });
  } catch (err) { next(err); }
});

// Create partner
router.post('/', auth, async (req, res, next) => {
  try {
    const { name, phone, address, tax_id, credit_days, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'ต้องระบุชื่อคู่ค้า' });
    // auto generate code
    const last = await query("SELECT code FROM partners WHERE code LIKE 'P%' ORDER BY id DESC LIMIT 1");
    const num = last.rows[0] ? parseInt(last.rows[0].code.slice(1)) + 1 : 1;
    const code = `P${String(num).padStart(4, '0')}`;
    const r = await query(
      `INSERT INTO partners (code, name, phone, address, tax_id, credit_days, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [code, name, phone || null, address || null, tax_id || null, credit_days || 0, notes || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

// Update partner
router.put('/:id', auth, async (req, res, next) => {
  try {
    const { name, phone, address, tax_id, credit_days, notes, is_active } = req.body;
    const r = await query(
      `UPDATE partners SET name=$1, phone=$2, address=$3, tax_id=$4, credit_days=$5, notes=$6, is_active=$7
       WHERE id=$8 RETURNING *`,
      [name, phone || null, address || null, tax_id || null, credit_days || 0, notes || null, is_active !== false, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'ไม่พบคู่ค้า' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// Upsert special price for a partner
router.post('/:id/prices', auth, async (req, res, next) => {
  try {
    const { product_id, special_price, min_qty } = req.body;
    if (!product_id || !special_price) return res.status(400).json({ error: 'ต้องระบุสินค้าและราคา' });
    const r = await query(
      `INSERT INTO partner_prices (partner_id, product_id, special_price, min_qty)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (partner_id, product_id) DO UPDATE SET special_price=$3, min_qty=$4
       RETURNING *`,
      [req.params.id, product_id, special_price, min_qty || 1]
    );
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// Delete special price
router.delete('/:id/prices/:product_id', auth, async (req, res, next) => {
  try {
    await query('DELETE FROM partner_prices WHERE partner_id=$1 AND product_id=$2', [req.params.id, req.params.product_id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Get partner's price for a specific product
router.get('/:id/price/:product_id', auth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT pp.special_price, p.sell_price, p.name, p.unit FROM partner_prices pp
       JOIN products p ON p.id = pp.product_id
       WHERE pp.partner_id=$1 AND pp.product_id=$2`,
      [req.params.id, req.params.product_id]
    );
    res.json(r.rows[0] || null);
  } catch (err) { next(err); }
});

module.exports = router;
