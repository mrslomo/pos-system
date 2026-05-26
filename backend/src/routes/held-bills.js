const router = require('express').Router();
const { query, pool } = require('../config/database');
const { auth } = require('../middleware/auth');

// List active held bills for branch (not expired)
router.get('/', auth, async (req, res, next) => {
  try {
    const branchId = req.query.branch_id || req.user.branch_id || 1;
    // Auto-cleanup expired bills
    await query(`DELETE FROM held_bills WHERE expires_at < NOW()`);
    const result = await query(
      `SELECT hb.*, u.name AS held_by
       FROM held_bills hb LEFT JOIN users u ON u.id = hb.user_id
       WHERE hb.branch_id = $1 ORDER BY hb.created_at DESC`,
      [branchId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// Hold a bill (save cart)
router.post('/', auth, async (req, res, next) => {
  try {
    const { branch_id, cart_items, discount, total_amount, customer_name, notes } = req.body;
    if (!cart_items || !cart_items.length) return res.status(400).json({ error: 'ไม่มีรายการในตะกร้า' });
    const branchId = branch_id || req.user.branch_id || 1;

    // Auto-cleanup expired first
    await query(`DELETE FROM held_bills WHERE expires_at < NOW()`);

    // Check limit: max 10 held bills per branch
    const count = await query(`SELECT COUNT(*) FROM held_bills WHERE branch_id=$1`, [branchId]);
    if (parseInt(count.rows[0].count) >= 10) return res.status(400).json({ error: 'Hold บิลได้สูงสุด 10 บิลต่อสาขา' });

    // Generate session code: H-{time6digits}-{random3}
    const now = new Date();
    const code = `H${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}-${Math.floor(Math.random()*900)+100}`;

    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h

    const r = await query(
      `INSERT INTO held_bills (session_code, branch_id, user_id, customer_name, cart_items, discount, total_amount, notes, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [code, branchId, req.user.id, customer_name || null, JSON.stringify(cart_items), discount || 0, total_amount || 0, notes || null, expiresAt]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

// Recall (retrieve) a held bill — returns it and deletes the hold
router.delete('/:id/recall', auth, async (req, res, next) => {
  try {
    const r = await query(
      `DELETE FROM held_bills WHERE id=$1 AND expires_at > NOW() RETURNING *`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'ไม่พบบิลหรือหมดอายุแล้ว' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// Cancel a held bill (discard)
router.delete('/:id', auth, async (req, res, next) => {
  try {
    await query(`DELETE FROM held_bills WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Summary for dashboard: count + list per user
router.get('/summary', auth, async (req, res, next) => {
  try {
    const branchId = req.query.branch_id || req.user.branch_id || 1;
    await query(`DELETE FROM held_bills WHERE expires_at < NOW()`);
    const r = await query(
      `SELECT u.name AS user_name, COUNT(*) AS count, SUM(hb.total_amount) AS total_value,
              MIN(hb.expires_at) AS earliest_expiry
       FROM held_bills hb LEFT JOIN users u ON u.id=hb.user_id
       WHERE hb.branch_id=$1 GROUP BY u.id, u.name ORDER BY count DESC`,
      [branchId]
    );
    const total = await query(`SELECT COUNT(*) FROM held_bills WHERE branch_id=$1`, [branchId]);
    res.json({ total: parseInt(total.rows[0].count), by_user: r.rows });
  } catch (err) { next(err); }
});

module.exports = router;
