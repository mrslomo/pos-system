const router = require('express').Router();
const { query, pool } = require('../config/database');
const { auth } = require('../middleware/auth');

// List stock returns
router.get('/', auth, async (req, res, next) => {
  try {
    const branchId = req.query.branch_id || req.user.branch_id || 1;
    const { date_from, date_to } = req.query;
    let sql = `SELECT sr.*, u.name AS created_by, s.receipt_number
               FROM stock_returns sr
               LEFT JOIN users u ON u.id=sr.user_id
               LEFT JOIN sales s ON s.id=sr.sale_id
               WHERE sr.branch_id=$1`;
    const params = [branchId];
    if (date_from) { params.push(date_from); sql += ` AND sr.created_at::date >= $${params.length}`; }
    if (date_to) { params.push(date_to); sql += ` AND sr.created_at::date <= $${params.length}`; }
    sql += ' ORDER BY sr.created_at DESC LIMIT 100';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// Get single return with items
router.get('/:id', auth, async (req, res, next) => {
  try {
    const ret = await query(
      `SELECT sr.*, u.name AS created_by, s.receipt_number FROM stock_returns sr
       LEFT JOIN users u ON u.id=sr.user_id LEFT JOIN sales s ON s.id=sr.sale_id WHERE sr.id=$1`,
      [req.params.id]
    );
    if (!ret.rows[0]) return res.status(404).json({ error: 'ไม่พบรายการ' });
    const items = await query(`SELECT sri.*, p.unit FROM stock_return_items sri LEFT JOIN products p ON p.id=sri.product_id WHERE sri.return_id=$1`, [req.params.id]);
    res.json({ ...ret.rows[0], items: items.rows });
  } catch (err) { next(err); }
});

// Create stock return
router.post('/', auth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { sale_id, branch_id, items, reason } = req.body;
    if (!items || !items.length) throw { status: 400, error: 'ต้องมีรายการ' };
    const branchId = branch_id || req.user.branch_id || 1;

    // Generate return number: RT260513-001
    const today = new Date();
    const prefix = `RT${String(today.getFullYear()).slice(-2)}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    const last = await client.query(`SELECT return_number FROM stock_returns WHERE return_number LIKE $1 ORDER BY return_number DESC LIMIT 1`, [`${prefix}%`]);
    const seq = last.rows[0] ? parseInt(last.rows[0].return_number.split('-')[1]) + 1 : 1;
    const returnNumber = `${prefix}-${String(seq).padStart(3,'0')}`;

    let totalRefund = 0;
    for (const item of items) totalRefund += parseFloat(item.unit_price) * parseFloat(item.quantity);

    const ret = await client.query(
      `INSERT INTO stock_returns (return_number, sale_id, branch_id, user_id, reason, total_refund)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [returnNumber, sale_id || null, branchId, req.user.id, reason || null, totalRefund]
    );
    const returnId = ret.rows[0].id;

    for (const item of items) {
      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.unit_price);

      await client.query(
        `INSERT INTO stock_return_items (return_id, product_id, product_name, quantity, unit_price, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [returnId, item.product_id || null, item.product_name || '', qty, price, qty * price]
      );

      if (item.product_id) {
        // Add back to front stock
        await client.query(
          `INSERT INTO stock (product_id, branch_id, location, quantity) VALUES ($1,$2,'front',$3)
           ON CONFLICT (product_id, branch_id, location) DO UPDATE SET quantity = stock.quantity + $3`,
          [item.product_id, branchId, qty]
        );
        // Log transaction
        const cur = await client.query(`SELECT quantity FROM stock WHERE product_id=$1 AND branch_id=$2 AND location='front'`, [item.product_id, branchId]);
        const afterQty = parseFloat(cur.rows[0]?.quantity || qty);
        await client.query(
          `INSERT INTO stock_transactions (product_id, branch_id, type, to_location, quantity, before_qty, after_qty, notes, user_id, reference_id)
           VALUES ($1,$2,'return','front',$3,$4,$5,$6,$7,$8)`,
          [item.product_id, branchId, qty, afterQty - qty, afterQty, `คืนสต๊อก ${returnNumber}${reason ? ': ' + reason : ''}`, req.user.id, returnId]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ ...ret.rows[0], return_number: returnNumber, total_refund: totalRefund });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

module.exports = router;
