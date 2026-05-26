const router = require('express').Router();
const { query, pool } = require('../config/database');
const { auth } = require('../middleware/auth');

// List purchase bills
router.get('/', auth, async (req, res, next) => {
  try {
    const { branch_id, date_from, date_to, q } = req.query;
    const branchId = branch_id || req.user.branch_id || 1;
    let sql = `SELECT pb.*, u.name AS created_by,
        (SELECT COUNT(*) FROM purchase_bill_items WHERE bill_id = pb.id) AS item_count
       FROM purchase_bills pb LEFT JOIN users u ON u.id = pb.user_id
       WHERE pb.branch_id = $1`;
    const params = [branchId];
    if (date_from) { params.push(date_from); sql += ` AND pb.bill_date >= $${params.length}`; }
    if (date_to) { params.push(date_to); sql += ` AND pb.bill_date <= $${params.length}`; }
    if (q) { params.push(`%${q}%`); sql += ` AND (pb.bill_number ILIKE $${params.length} OR pb.supplier_name ILIKE $${params.length})`; }
    sql += ' ORDER BY pb.created_at DESC LIMIT 200';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// Get single bill with items
router.get('/:id', auth, async (req, res, next) => {
  try {
    const bill = await query('SELECT pb.*, u.name AS created_by FROM purchase_bills pb LEFT JOIN users u ON u.id=pb.user_id WHERE pb.id=$1', [req.params.id]);
    if (!bill.rows[0]) return res.status(404).json({ error: 'ไม่พบบิล' });
    const items = await query(
      `SELECT pbi.*, p.barcode, p.unit FROM purchase_bill_items pbi
       LEFT JOIN products p ON p.id = pbi.product_id WHERE pbi.bill_id=$1`,
      [req.params.id]
    );
    res.json({ ...bill.rows[0], items: items.rows });
  } catch (err) { next(err); }
});

// Create purchase bill (and update stock + cost price)
router.post('/', auth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { supplier_name, branch_id, items, notes, bill_date } = req.body;
    const branchId = branch_id || req.user.branch_id || 1;
    if (!items || !items.length) throw { status: 400, error: 'ต้องมีรายการสินค้า' };

    // Generate bill number IN260513-001
    const today = new Date();
    const prefix = `IN${String(today.getFullYear()).slice(-2)}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    const last = await client.query(`SELECT bill_number FROM purchase_bills WHERE bill_number LIKE $1 ORDER BY bill_number DESC LIMIT 1`, [`${prefix}%`]);
    const seq = last.rows[0] ? parseInt(last.rows[0].bill_number.split('-')[1]) + 1 : 1;
    const billNumber = `${prefix}-${String(seq).padStart(3,'0')}`;

    let totalAmount = 0;
    for (const item of items) {
      totalAmount += parseFloat(item.unit_cost) * parseFloat(item.quantity);
    }

    const bill = await client.query(
      `INSERT INTO purchase_bills (bill_number, supplier_name, branch_id, user_id, total_amount, notes, bill_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [billNumber, supplier_name || null, branchId, req.user.id, totalAmount, notes || null, bill_date || today.toISOString().split('T')[0]]
    );
    const billId = bill.rows[0].id;

    for (const item of items) {
      const qty = parseFloat(item.quantity);
      const cost = parseFloat(item.unit_cost);
      const productName = item.product_name || '';

      await client.query(
        `INSERT INTO purchase_bill_items (bill_id, product_id, product_name, quantity, unit_cost, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [billId, item.product_id || null, productName, qty, cost, qty * cost]
      );

      if (item.product_id) {
        // Add to back stock
        await client.query(
          `INSERT INTO stock (product_id, branch_id, location, quantity)
           VALUES ($1,$2,'back',$3)
           ON CONFLICT (product_id, branch_id, location) DO UPDATE SET quantity = stock.quantity + $3`,
          [item.product_id, branchId, qty]
        );
        // Log transaction
        const before = await client.query(`SELECT quantity FROM stock WHERE product_id=$1 AND branch_id=$2 AND location='back'`, [item.product_id, branchId]);
        const beforeQty = parseFloat(before.rows[0]?.quantity || 0) - qty;
        await client.query(
          `INSERT INTO stock_transactions (product_id, branch_id, type, to_location, quantity, before_qty, after_qty, notes, user_id, reference_id)
           VALUES ($1,$2,'in','back',$3,$4,$5,$6,$7,$8)`,
          [item.product_id, branchId, qty, beforeQty, beforeQty + qty, `บิลเข้า ${billNumber}`, req.user.id, billId]
        );
        // Update cost_price on product (weighted average)
        await client.query(
          `UPDATE products SET cost_price = ROUND(($1::DECIMAL + cost_price) / 2, 2) WHERE id = $2`,
          [cost, item.product_id]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ ...bill.rows[0], total_amount: totalAmount });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// Cancel bill (soft: just mark cancelled, doesn't reverse stock)
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const r = await query(`UPDATE purchase_bills SET status='cancelled' WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'ไม่พบบิล' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
