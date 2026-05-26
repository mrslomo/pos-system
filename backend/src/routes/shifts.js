const router = require('express').Router();
const { pool } = require('../config/database');
const { auth } = require('../middleware/auth');

router.use(auth);

// GET /current — open shifts for branch (with live totals)
router.get('/current', async (req, res, next) => {
  const { branch_id } = req.query;
  try {
    const { rows } = await pool.query(`
      SELECT s.*, u.name as cashier_name,
        COUNT(sa.id)::int as sale_count,
        COALESCE(SUM(sa.total_amount),0) as total_sales,
        COALESCE(SUM(CASE WHEN sa.payment_method='cash' THEN sa.total_amount ELSE 0 END),0) as cash_sales,
        COALESCE(SUM(CASE WHEN sa.payment_method!='cash' THEN sa.total_amount ELSE 0 END),0) as transfer_sales
      FROM shifts s
      LEFT JOIN users u ON u.id=s.user_id
      LEFT JOIN sales sa ON sa.shift_id=s.id
      WHERE s.branch_id=$1 AND s.status='open'
      GROUP BY s.id, u.name
      ORDER BY s.opened_at DESC
    `, [branch_id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET / — shift history
router.get('/', async (req, res, next) => {
  const { branch_id, date_from, date_to, user_id, status } = req.query;
  try {
    let q = `
      SELECT s.*, u.name as cashier_name,
        COUNT(sa.id)::int as sale_count,
        COALESCE(SUM(sa.total_amount),0) as total_sales,
        COALESCE(SUM(CASE WHEN sa.payment_method='cash' THEN sa.total_amount ELSE 0 END),0) as cash_sales,
        COALESCE(SUM(CASE WHEN sa.payment_method!='cash' THEN sa.total_amount ELSE 0 END),0) as transfer_sales
      FROM shifts s
      LEFT JOIN users u ON u.id=s.user_id
      LEFT JOIN sales sa ON sa.shift_id=s.id
      WHERE 1=1`;
    const p = [];
    if (branch_id) { p.push(branch_id); q += ` AND s.branch_id=$${p.length}`; }
    if (date_from)  { p.push(date_from);  q += ` AND s.shift_date>=$${p.length}`; }
    if (date_to)    { p.push(date_to);    q += ` AND s.shift_date<=$${p.length}`; }
    if (user_id)    { p.push(user_id);    q += ` AND s.user_id=$${p.length}`; }
    if (status)     { p.push(status);     q += ` AND s.status=$${p.length}`; }
    q += ` GROUP BY s.id, u.name ORDER BY s.opened_at DESC LIMIT 100`;
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /:id/sales — all sales in a shift
router.get('/:id/sales', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*, u.name as cashier_name,
        json_agg(json_build_object('name',p.name,'qty',si.quantity,'price',si.unit_price,'subtotal',si.subtotal)
          ORDER BY si.id) as items
      FROM sales s
      LEFT JOIN users u ON u.id=s.user_id
      LEFT JOIN sale_items si ON si.sale_id=s.id
      LEFT JOIN products p ON p.id=si.product_id
      WHERE s.shift_id=$1
      GROUP BY s.id, u.name
      ORDER BY s.created_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /daily-summary — daily P&L summary
router.get('/daily-summary', async (req, res, next) => {
  const { branch_id, date } = req.query;
  const d = date || new Date().toISOString().split('T')[0];
  try {
    const [salesRow, deteriorRow] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int as sale_count,
          COALESCE(SUM(total_amount),0) as revenue,
          COALESCE(SUM(discount_amount),0) as total_discount,
          COALESCE(SUM(CASE WHEN payment_method='cash' THEN total_amount ELSE 0 END),0) as cash_revenue,
          COALESCE(SUM(CASE WHEN payment_method!='cash' THEN total_amount ELSE 0 END),0) as transfer_revenue,
          COALESCE((SELECT SUM(si2.quantity*si2.cost_price)
            FROM sale_items si2 JOIN sales s2 ON s2.id=si2.sale_id
            WHERE s2.branch_id=$1 AND DATE(s2.created_at)=$2),0) as cogs
        FROM sales WHERE branch_id=$1 AND DATE(created_at)=$2
      `, [branch_id, d]),
      pool.query(
        `SELECT COALESCE(SUM(total_cost),0) as deterioration_cost FROM stock_deterioration
         WHERE branch_id=$1 AND deterioration_date=$2`,
        [branch_id, d]
      ),
    ]);
    const s = salesRow.rows[0];
    const detrCost = parseFloat(deteriorRow.rows[0].deterioration_cost);
    const revenue = parseFloat(s.revenue);
    const cogs = parseFloat(s.cogs);
    const grossProfit = revenue - cogs - detrCost;
    const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    res.json({
      date: d,
      sale_count: s.sale_count,
      revenue, cogs, detrCost,
      gross_profit: grossProfit,
      margin: parseFloat(margin.toFixed(1)),
      total_discount: parseFloat(s.total_discount),
      cash_revenue: parseFloat(s.cash_revenue),
      transfer_revenue: parseFloat(s.transfer_revenue),
    });
  } catch (err) { next(err); }
});

// POST / — open new shift
router.post('/', async (req, res, next) => {
  const { branch_id, user_id, shift_type, opening_cash, notes } = req.body;
  try {
    const cashierId = user_id || req.user.id;
    const exist = await pool.query(
      `SELECT id FROM shifts WHERE branch_id=$1 AND user_id=$2 AND status='open'`,
      [branch_id, cashierId]
    );
    if (exist.rows.length) return res.status(400).json({ error: 'พนักงานคนนี้มีกะที่เปิดอยู่แล้ว' });

    const { rows: [shift] } = await pool.query(`
      INSERT INTO shifts (branch_id, user_id, shift_type, opening_cash, notes)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [branch_id, cashierId, shift_type || 'morning', parseFloat(opening_cash || 0), notes || null]);
    res.status(201).json(shift);
  } catch (err) { next(err); }
});

// POST /:id/close — close shift
router.post('/:id/close', async (req, res, next) => {
  const { actual_cash, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [shift] } = await pool.query(`SELECT * FROM shifts WHERE id=$1`, [req.params.id]);
    if (!shift) return res.status(404).json({ error: 'ไม่พบกะ' });
    if (shift.status === 'closed') return res.status(400).json({ error: 'ปิดกะแล้ว' });

    const { rows: [t] } = await client.query(`
      SELECT COALESCE(SUM(CASE WHEN payment_method='cash' THEN total_amount ELSE 0 END),0) as cash_sales
      FROM sales WHERE shift_id=$1
    `, [req.params.id]);
    const cashInDrawer = parseFloat(shift.opening_cash) + parseFloat(t.cash_sales);
    const cashDiff = parseFloat(actual_cash) - cashInDrawer;

    await client.query(`
      UPDATE shifts SET status='closed', actual_cash=$1, cash_difference=$2, closed_at=NOW(), notes=COALESCE($3,notes)
      WHERE id=$4
    `, [actual_cash, cashDiff, notes || null, req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, cash_difference: cashDiff, expected_cash: cashInDrawer });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

module.exports = router;
