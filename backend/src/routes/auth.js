const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await query(
      `SELECT u.*, b.name as branch_name FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.email = $1 AND u.is_active = true`,
      [email]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (err) { next(err); }
});

router.get('/me', auth, async (req, res) => {
  const result = await query(
    `SELECT u.id, u.name, u.email, u.role, u.branch_id, b.name as branch_name
     FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = $1`,
    [req.user.id]
  );
  res.json(result.rows[0]);
});

// PIN login — identify cashier at POS without full re-auth
router.post('/pin-login', auth, async (req, res, next) => {
  try {
    const { pin, branch_id } = req.body;
    if (!pin) return res.status(400).json({ error: 'ต้องระบุ PIN' });
    const branchId = branch_id || req.user.branch_id || 1;
    const result = await query(
      `SELECT id, name, role, branch_id FROM users WHERE pin=$1 AND branch_id=$2 AND is_active=true LIMIT 1`,
      [pin, branchId]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'PIN ไม่ถูกต้อง' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/change-password', auth, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const result = await query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(oldPassword, result.rows[0].password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.user.id]);
    res.json({ message: 'Password changed successfully' });
  } catch (err) { next(err); }
});

module.exports = router;
