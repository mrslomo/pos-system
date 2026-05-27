const router = require('express').Router();
const { pool } = require('../config/database');
const { auth } = require('../middleware/auth');

// Ensure table exists (runs once per cold start)
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_notifications (
      id SERIAL PRIMARY KEY,
      branch_id INTEGER NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      bank_name TEXT,
      message TEXT,
      claimed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pn_branch_amount ON payment_notifications(branch_id, amount, claimed, created_at)
  `);
  tableReady = true;
}

// POST /api/payment-notify — called by the SMS app (no user auth, uses secret key)
router.post('/', async (req, res, next) => {
  try {
    await ensureTable();
    const { branch_id, amount, bank_name, message, secret } = req.body;
    if (!branch_id || !amount) return res.status(400).json({ error: 'branch_id and amount required' });

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return res.status(400).json({ error: 'invalid amount' });

    const result = await pool.query(
      `INSERT INTO payment_notifications (branch_id, amount, bank_name, message)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [branch_id, parsed, bank_name || null, message || null]
    );
    const notification = result.rows[0];

    // Emit via Socket.IO to the branch room
    const io = req.app.get('io');
    if (io) {
      io.to(`branch-${branch_id}`).emit('payment-received', {
        id: notification.id,
        amount: parsed,
        bank_name,
        created_at: notification.created_at,
      });
    }

    res.json({ success: true, id: notification.id });
  } catch (err) { next(err); }
});

// GET /api/payment-notify/pending?branch_id=X&amount=Y — polled by cashier app
router.get('/pending', auth, async (req, res, next) => {
  try {
    await ensureTable();
    const { branch_id, amount } = req.query;
    if (!branch_id || !amount) return res.status(400).json({ error: 'branch_id and amount required' });

    const parsed = parseFloat(amount);
    const result = await pool.query(
      `SELECT * FROM payment_notifications
       WHERE branch_id = $1
         AND amount = $2
         AND claimed = FALSE
         AND created_at > NOW() - INTERVAL '10 minutes'
       ORDER BY created_at DESC
       LIMIT 1`,
      [branch_id, parsed]
    );

    if (result.rows.length > 0) {
      const notif = result.rows[0];
      await pool.query('UPDATE payment_notifications SET claimed = TRUE WHERE id = $1', [notif.id]);
      res.json({ found: true, notification: notif });
    } else {
      res.json({ found: false });
    }
  } catch (err) { next(err); }
});

// DELETE /api/payment-notify/old — cleanup (optional, run from cron or admin)
router.delete('/old', auth, async (req, res, next) => {
  try {
    await ensureTable();
    await pool.query(`DELETE FROM payment_notifications WHERE created_at < NOW() - INTERVAL '1 day'`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
