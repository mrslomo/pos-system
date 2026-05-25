const router = require('express').Router();
const { query } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM categories ORDER BY name');
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name required' });
    const result = await query('INSERT INTO categories (name, description) VALUES ($1,$2) RETURNING *', [name, description]);
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const result = await query('UPDATE categories SET name=$1, description=$2 WHERE id=$3 RETURNING *', [name, description, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Category not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ message: 'Category deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
