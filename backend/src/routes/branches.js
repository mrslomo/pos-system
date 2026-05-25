const router = require('express').Router();
const { query } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT b.*, COUNT(DISTINCT u.id)::int as user_count
      FROM branches b LEFT JOIN users u ON u.branch_id = b.id AND u.is_active = true
      GROUP BY b.id ORDER BY b.name
    `);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM branches WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Branch not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { name, address, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'Branch name required' });
    const result = await query(
      'INSERT INTO branches (name, address, phone) VALUES ($1,$2,$3) RETURNING *',
      [name, address, phone]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { name, address, phone, is_active } = req.body;
    const result = await query(
      'UPDATE branches SET name=$1, address=$2, phone=$3, is_active=$4 WHERE id=$5 RETURNING *',
      [name, address, phone, is_active, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Branch not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
