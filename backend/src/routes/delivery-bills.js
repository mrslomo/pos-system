const router = require('express').Router();
const { query, pool } = require('../config/database');
const { auth } = require('../middleware/auth');

// List delivery bills
router.get('/', auth, async (req, res, next) => {
  try {
    const { branch_id, date_from, date_to, partner_id, payment_status } = req.query;
    const branchId = branch_id || req.user.branch_id || 1;
    let sql = `SELECT db.*, p.name AS partner_name, u.name AS created_by,
        (SELECT COUNT(*) FROM delivery_bill_items WHERE bill_id = db.id) AS item_count
       FROM delivery_bills db
       LEFT JOIN partners p ON p.id = db.partner_id
       LEFT JOIN users u ON u.id = db.user_id
       WHERE db.branch_id = $1`;
    const params = [branchId];
    if (date_from) { params.push(date_from); sql += ` AND db.bill_date >= $${params.length}`; }
    if (date_to) { params.push(date_to); sql += ` AND db.bill_date <= $${params.length}`; }
    if (partner_id) { params.push(partner_id); sql += ` AND db.partner_id = $${params.length}`; }
    if (payment_status) { params.push(payment_status); sql += ` AND db.payment_status = $${params.length}`; }
    sql += ' ORDER BY db.created_at DESC LIMIT 200';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// Get single delivery bill with items
router.get('/:id', auth, async (req, res, next) => {
  try {
    const bill = await query(
      `SELECT db.*, p.name AS partner_name, p.phone AS partner_phone, p.address AS partner_address,
              u.name AS created_by
       FROM delivery_bills db
       LEFT JOIN partners p ON p.id = db.partner_id
       LEFT JOIN users u ON u.id = db.user_id
       WHERE db.id = $1`, [req.params.id]
    );
    if (!bill.rows[0]) return res.status(404).json({ error: 'ไม่พบบิล' });
    const items = await query(
      `SELECT dbi.*, pr.barcode, pr.unit FROM delivery_bill_items dbi
       LEFT JOIN products pr ON pr.id = dbi.product_id WHERE dbi.bill_id=$1`,
      [req.params.id]
    );
    res.json({ ...bill.rows[0], items: items.rows });
  } catch (err) { next(err); }
});

// Create delivery bill (deduct stock)
router.post('/', auth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { partner_id, partner_name, branch_id, items, discount_amount, payment_method, payment_status, notes, bill_date } = req.body;
    const branchId = branch_id || req.user.branch_id || 1;
    if (!items || !items.length) throw { status: 400, error: 'ต้องมีรายการสินค้า' };

    // Generate bill number OUT260513-001
    const today = new Date();
    const prefix = `OUT${String(today.getFullYear()).slice(-2)}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    const last = await client.query(`SELECT bill_number FROM delivery_bills WHERE bill_number LIKE $1 ORDER BY bill_number DESC LIMIT 1`, [`${prefix}%`]);
    const seq = last.rows[0] ? parseInt(last.rows[0].bill_number.split('-')[1]) + 1 : 1;
    const billNumber = `${prefix}-${String(seq).padStart(3,'0')}`;

    let subtotal = 0;
    for (const item of items) {
      subtotal += parseFloat(item.unit_price) * parseFloat(item.quantity);
    }
    const disc = parseFloat(discount_amount || 0);
    const total = Math.max(0, subtotal - disc);

    // Resolve partner name
    let resolvedPartnerName = partner_name || null;
    if (partner_id && !resolvedPartnerName) {
      const p = await client.query('SELECT name FROM partners WHERE id=$1', [partner_id]);
      resolvedPartnerName = p.rows[0]?.name || null;
    }

    const bill = await client.query(
      `INSERT INTO delivery_bills (bill_number, partner_id, partner_name, branch_id, user_id, subtotal, discount_amount, total_amount, payment_method, payment_status, notes, bill_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [billNumber, partner_id || null, resolvedPartnerName, branchId, req.user.id, subtotal, disc, total,
       payment_method || 'cash', payment_status || 'paid', notes || null,
       bill_date || today.toISOString().split('T')[0]]
    );
    const billId = bill.rows[0].id;

    for (const item of items) {
      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.unit_price);
      const cost = parseFloat(item.cost_price || 0);

      await client.query(
        `INSERT INTO delivery_bill_items (bill_id, product_id, product_name, quantity, unit_price, cost_price, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [billId, item.product_id || null, item.product_name || '', qty, price, cost, qty * price]
      );

      if (item.product_id) {
        // Deduct from front stock first, then back
        const frontStk = await client.query(`SELECT quantity FROM stock WHERE product_id=$1 AND branch_id=$2 AND location='front' FOR UPDATE`, [item.product_id, branchId]);
        let frontQty = parseFloat(frontStk.rows[0]?.quantity || 0);
        let deductFront = Math.min(frontQty, qty);
        let deductBack = qty - deductFront;

        if (deductFront > 0) {
          await client.query(`UPDATE stock SET quantity = quantity - $1 WHERE product_id=$2 AND branch_id=$3 AND location='front'`, [deductFront, item.product_id, branchId]);
        }
        if (deductBack > 0) {
          await client.query(
            `INSERT INTO stock (product_id, branch_id, location, quantity) VALUES ($1,$2,'back',$3)
             ON CONFLICT (product_id, branch_id, location) DO UPDATE SET quantity = GREATEST(0, stock.quantity - $3)`,
            [item.product_id, branchId, deductBack]
          );
        }
        // Log
        await client.query(
          `INSERT INTO stock_transactions (product_id, branch_id, type, from_location, quantity, before_qty, after_qty, notes, user_id, reference_id)
           VALUES ($1,$2,'out','front',$3,$4,$5,$6,$7,$8)`,
          [item.product_id, branchId, qty, frontQty, frontQty - qty, `บิลออก ${billNumber}`, req.user.id, billId]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ ...bill.rows[0], bill_number: billNumber });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// Update payment status / record payment
router.patch('/:id/payment', auth, async (req, res, next) => {
  try {
    const { payment_status, paid_amount, due_date } = req.body;
    const bill = await query('SELECT * FROM delivery_bills WHERE id=$1', [req.params.id]);
    if (!bill.rows[0]) return res.status(404).json({ error: 'ไม่พบบิล' });

    const b = bill.rows[0];
    const newPaid = paid_amount !== undefined ? parseFloat(paid_amount) : parseFloat(b.paid_amount || 0);
    const newStatus = payment_status || (newPaid >= parseFloat(b.total_amount) ? 'paid' : newPaid > 0 ? 'partial' : b.payment_status);

    const r = await query(
      `UPDATE delivery_bills SET payment_status=$1, paid_amount=$2, due_date=$3 WHERE id=$4 RETURNING *`,
      [newStatus, newPaid, due_date || b.due_date, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
