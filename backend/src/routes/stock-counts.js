const router = require('express').Router();
const { pool } = require('../config/database');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET / — list counts for branch
router.get('/', async (req, res, next) => {
  const { branch_id, date, status } = req.query;
  try {
    let q = `
      SELECT sc.*, u.name as created_by_name, cb.name as closed_by_name,
        (SELECT COUNT(*) FROM stock_count_items WHERE count_id = sc.id) as item_count
      FROM stock_counts sc
      LEFT JOIN users u ON u.id = sc.created_by
      LEFT JOIN users cb ON cb.id = sc.closed_by
      WHERE 1=1`;
    const p = [];
    if (branch_id) { p.push(branch_id); q += ` AND sc.branch_id=$${p.length}`; }
    if (date)      { p.push(date);      q += ` AND sc.count_date=$${p.length}`; }
    if (status)    { p.push(status);    q += ` AND sc.status=$${p.length}`; }
    q += ` ORDER BY sc.created_at DESC LIMIT 30`;
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / — create new count (snapshot current stock)
router.post('/', async (req, res, next) => {
  const { branch_id, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exist = await client.query(
      `SELECT id FROM stock_counts WHERE branch_id=$1 AND count_date=CURRENT_DATE AND status='open'`,
      [branch_id]
    );
    if (exist.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'มีการนับสต๊อกที่ยังเปิดอยู่สำหรับวันนี้' });
    }
    const { rows: [count] } = await client.query(
      `INSERT INTO stock_counts (branch_id, notes, created_by) VALUES ($1,$2,$3) RETURNING *`,
      [branch_id, notes || null, req.user.id]
    );
    // Snapshot: total stock per product across all locations
    await client.query(`
      INSERT INTO stock_count_items (count_id, product_id, product_name, system_qty, cost_price)
      SELECT $1, p.id, p.name,
        COALESCE((SELECT SUM(quantity) FROM stock WHERE product_id=p.id AND branch_id=$2), 0),
        p.cost_price
      FROM products p
      WHERE p.is_active=true
      ORDER BY p.name
    `, [count.id, branch_id]);
    await client.query('COMMIT');
    res.status(201).json(count);
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// GET /:id — get count with items
router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [count] } = await pool.query(
      `SELECT sc.*, u.name as created_by_name FROM stock_counts sc
       LEFT JOIN users u ON u.id = sc.created_by WHERE sc.id=$1`,
      [req.params.id]
    );
    if (!count) return res.status(404).json({ error: 'ไม่พบการนับสต๊อก' });
    const { rows: items } = await pool.query(
      `SELECT sci.*, p.unit, p.image_url FROM stock_count_items sci
       LEFT JOIN products p ON p.id=sci.product_id
       WHERE sci.count_id=$1 ORDER BY sci.product_name`,
      [req.params.id]
    );
    res.json({ ...count, items });
  } catch (err) { next(err); }
});

// PUT /:id/items — bulk update counted quantities
router.put('/:id/items', async (req, res, next) => {
  const { items } = req.body; // [{ id, counted_qty, notes }]
  const client = await pool.connect();
  try {
    const { rows: [count] } = await pool.query(`SELECT status FROM stock_counts WHERE id=$1`, [req.params.id]);
    if (!count) return res.status(404).json({ error: 'ไม่พบการนับสต๊อก' });
    if (count.status === 'closed') return res.status(400).json({ error: 'การนับสต๊อกปิดแล้ว' });
    await client.query('BEGIN');
    for (const item of items) {
      await client.query(
        `UPDATE stock_count_items SET counted_qty=$1, notes=$2 WHERE id=$3 AND count_id=$4`,
        [item.counted_qty ?? null, item.notes || null, item.id, req.params.id]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// POST /:id/close — ยกยอด: close + adjust stock
router.post('/:id/close', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { rows: [count] } = await pool.query(`SELECT * FROM stock_counts WHERE id=$1`, [req.params.id]);
    if (!count) return res.status(404).json({ error: 'ไม่พบการนับสต๊อก' });
    if (count.status === 'closed') return res.status(400).json({ error: 'ปิดแล้ว' });

    const { rows: items } = await pool.query(
      `SELECT * FROM stock_count_items WHERE count_id=$1 AND counted_qty IS NOT NULL`,
      [req.params.id]
    );
    await client.query('BEGIN');

    let adjustCount = 0;
    for (const item of items) {
      const diff = parseFloat(item.counted_qty) - parseFloat(item.system_qty);
      if (Math.abs(diff) < 0.001) continue;
      adjustCount++;

      // Ensure front stock row exists
      await client.query(`
        INSERT INTO stock (product_id, branch_id, location, quantity)
        VALUES ($1,$2,'front',0) ON CONFLICT (product_id,branch_id,location) DO NOTHING
      `, [item.product_id, count.branch_id]);

      // Apply difference to front stock
      await client.query(`
        UPDATE stock SET quantity = GREATEST(0, quantity+$1)
        WHERE product_id=$2 AND branch_id=$3 AND location='front'
      `, [diff, item.product_id, count.branch_id]);

      await client.query(`
        INSERT INTO stock_transactions (product_id,branch_id,type,quantity,before_qty,after_qty,notes,user_id)
        VALUES ($1,$2,'count_adjust',$3,$4,$5,'ปรับจากการนับสต๊อก',$6)
      `, [item.product_id, count.branch_id, diff, item.system_qty, item.counted_qty, req.user.id]);
    }

    await client.query(
      `UPDATE stock_counts SET status='closed', closed_by=$1, closed_at=NOW() WHERE id=$2`,
      [req.user.id, req.params.id]
    );
    await client.query('COMMIT');
    res.json({ success: true, adjustCount });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// DELETE /:id — delete open count
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows: [c] } = await pool.query(`SELECT status FROM stock_counts WHERE id=$1`, [req.params.id]);
    if (!c) return res.status(404).json({ error: 'ไม่พบ' });
    if (c.status === 'closed') return res.status(400).json({ error: 'ไม่สามารถลบการนับที่ปิดแล้ว' });
    await pool.query(`DELETE FROM stock_counts WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
