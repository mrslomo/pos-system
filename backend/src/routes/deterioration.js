const router = require('express').Router();
const { pool } = require('../config/database');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET / — list deterioration records
router.get('/', async (req, res, next) => {
  const { branch_id, date_from, date_to } = req.query;
  try {
    let q = `
      SELECT sd.*, u.name as recorded_by
      FROM stock_deterioration sd
      LEFT JOIN users u ON u.id = sd.user_id
      WHERE 1=1`;
    const p = [];
    if (branch_id) { p.push(branch_id); q += ` AND sd.branch_id=$${p.length}`; }
    if (date_from)  { p.push(date_from);  q += ` AND sd.deterioration_date>=$${p.length}`; }
    if (date_to)    { p.push(date_to);    q += ` AND sd.deterioration_date<=$${p.length}`; }
    q += ` ORDER BY sd.created_at DESC LIMIT 100`;
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / — record deterioration + deduct stock
router.post('/', async (req, res, next) => {
  const { branch_id, product_id, quantity, reason, cost_price, notes, deterioration_date } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [prod] } = await client.query(`SELECT * FROM products WHERE id=$1`, [product_id]);
    if (!prod) return res.status(404).json({ error: 'ไม่พบสินค้า' });

    const unitCost = parseFloat(cost_price ?? prod.cost_price);
    const qty = parseFloat(quantity);
    const totalCost = unitCost * qty;

    const { rows: [rec] } = await client.query(`
      INSERT INTO stock_deterioration
        (branch_id, product_id, product_name, quantity, cost_price, total_cost, reason, deterioration_date, user_id, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [branch_id, product_id, prod.name, qty, unitCost, totalCost,
        reason || null, deterioration_date || new Date().toISOString().split('T')[0],
        req.user.id, notes || null]);

    // Deduct from front stock first, then back
    let remaining = qty;
    const frontRow = await client.query(
      `SELECT quantity FROM stock WHERE product_id=$1 AND branch_id=$2 AND location='front'`,
      [product_id, branch_id]
    );
    if (frontRow.rows.length) {
      const deduct = Math.min(remaining, parseFloat(frontRow.rows[0].quantity));
      await client.query(
        `UPDATE stock SET quantity=quantity-$1 WHERE product_id=$2 AND branch_id=$3 AND location='front'`,
        [deduct, product_id, branch_id]
      );
      remaining -= deduct;
    }
    if (remaining > 0.001) {
      await client.query(
        `UPDATE stock SET quantity=GREATEST(0,quantity-$1) WHERE product_id=$2 AND branch_id=$3 AND location='back'`,
        [remaining, product_id, branch_id]
      );
    }
    await client.query(`
      INSERT INTO stock_transactions (product_id,branch_id,type,quantity,notes,user_id)
      VALUES ($1,$2,'deterioration',$3,$4,$5)
    `, [product_id, branch_id, -qty, reason || 'สต๊อกเสื่อม', req.user.id]);

    await client.query('COMMIT');
    res.status(201).json(rec);
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// DELETE /:id — soft delete (revert stock? no — just mark deleted)
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM stock_deterioration WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
