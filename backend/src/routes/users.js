const router = require('express').Router();
const { query } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

router.use(auth, requireRole('admin', 'manager'));

router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT u.id, u.name, u.email, u.role, u.branch_id, u.is_active, u.created_at, b.name as branch_name
      FROM users u LEFT JOIN branches b ON b.id = u.branch_id ORDER BY u.name
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { name, email, password, role = 'cashier', branch_id } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });
    const hashed = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (name, email, password, role, branch_id) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,role,branch_id,created_at',
      [name, email, hashed, role, branch_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { name, email, role, branch_id, is_active, password } = req.body;
    let passwordUpdate = '';
    const params = [name, email, role, branch_id, is_active, req.params.id];
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      params.splice(5, 0, hashed);
      passwordUpdate = ', password = $6';
    }
    const result = await query(
      `UPDATE users SET name=$1, email=$2, role=$3, branch_id=$4, is_active=$5${passwordUpdate} WHERE id=$${params.length} RETURNING id,name,email,role,branch_id,is_active`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot deactivate yourself' });
    await query('UPDATE users SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deactivated' });
  } catch (err) { next(err); }
});

module.exports = router;
