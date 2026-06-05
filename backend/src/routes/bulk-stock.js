const router = require('express').Router();
const { query, pool } = require('../config/database');
const { auth } = require('../middleware/auth');

// ─── Bulk Items ─────────────────────────────────────────────────────────────

router.get('/items', auth, async (req, res, next) => {
  try {
    const branchId = req.query.branch_id || req.user.branch_id || 1;
    const result = await query(
      `SELECT bi.*,
        (SELECT COALESCE(SUM(quantity),0) FROM bulk_stock_in WHERE bulk_item_id=bi.id) AS total_received,
        (SELECT COALESCE(SUM(input_qty),0) FROM stock_processing WHERE bulk_item_id=bi.id) AS total_processed
       FROM bulk_items bi WHERE bi.branch_id=$1 AND bi.is_active=true ORDER BY bi.name`,
      [branchId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/items', auth, async (req, res, next) => {
  try {
    const { name, unit, category, min_qty, notes, branch_id } = req.body;
    if (!name) return res.status(400).json({ error: 'ต้องระบุชื่อ' });
    const branchId = branch_id || req.user.branch_id || 1;
    const r = await query(
      `INSERT INTO bulk_items (name, unit, category, min_qty, notes, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, unit || 'kg', category || null, min_qty || 0, notes || null, branchId]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

router.put('/items/:id', auth, async (req, res, next) => {
  try {
    const { name, unit, category, min_qty, notes, is_active, cost_per_unit } = req.body;
    const r = await query(
      `UPDATE bulk_items SET name=$1, unit=$2, category=$3, min_qty=$4, notes=$5, is_active=$6,
       cost_per_unit = CASE WHEN $7::TEXT IS NOT NULL AND $7::TEXT != '' THEN $7::DECIMAL ELSE cost_per_unit END
       WHERE id=$8 RETURNING *`,
      [name, unit || 'kg', category || null, min_qty || 0, notes || null, is_active !== false, cost_per_unit != null ? String(cost_per_unit) : null, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'ไม่พบรายการ' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── Stock In ───────────────────────────────────────────────────────────────

router.get('/items/:id/history', auth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT bsi.*, u.name AS user_name FROM bulk_stock_in bsi
       LEFT JOIN users u ON u.id=bsi.user_id WHERE bsi.bulk_item_id=$1 ORDER BY bsi.created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
});

router.post('/stock-in', auth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { bulk_item_id, quantity, cost_per_unit, supplier_name, reference, notes } = req.body;
    if (!bulk_item_id || !quantity || !cost_per_unit) throw { status: 400, error: 'ต้องระบุ bulk_item_id, quantity, cost_per_unit' };
    const qty = parseFloat(quantity);
    const cost = parseFloat(cost_per_unit);

    await client.query(
      `INSERT INTO bulk_stock_in (bulk_item_id, quantity, cost_per_unit, total_cost, supplier_name, reference, user_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [bulk_item_id, qty, cost, qty * cost, supplier_name || null, reference || null, req.user.id, notes || null]
    );
    const r = await client.query(
      `UPDATE bulk_items
       SET current_qty = current_qty + $1,
           cost_per_unit = ROUND(
             CASE WHEN current_qty + $1 > 0
               THEN (current_qty * cost_per_unit + $1 * $2) / (current_qty + $1)
               ELSE $2
             END, 2)
       WHERE id=$3 RETURNING *`,
      [qty, cost, bulk_item_id]
    );
    await client.query('COMMIT');
    res.status(201).json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// ─── Stock Processing (ซอยสต๊อก) ───────────────────────────────────────────

router.get('/processing', auth, async (req, res, next) => {
  try {
    const branchId = req.query.branch_id || req.user.branch_id || 1;
    const r = await query(
      `SELECT sp.*, bi.name AS bulk_item_name, bi.unit, u.name AS user_name
       FROM stock_processing sp
       LEFT JOIN bulk_items bi ON bi.id=sp.bulk_item_id
       LEFT JOIN users u ON u.id=sp.user_id
       WHERE sp.branch_id=$1 ORDER BY sp.created_at DESC LIMIT 100`,
      [branchId]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
});

router.get('/processing/:id', auth, async (req, res, next) => {
  try {
    const sp = await query(
      `SELECT sp.*, bi.name AS bulk_item_name, bi.unit, u.name AS user_name
       FROM stock_processing sp LEFT JOIN bulk_items bi ON bi.id=sp.bulk_item_id LEFT JOIN users u ON u.id=sp.user_id
       WHERE sp.id=$1`, [req.params.id]
    );
    if (!sp.rows[0]) return res.status(404).json({ error: 'ไม่พบรายการ' });
    const outputs = await query(
      `SELECT spo.*, p.barcode FROM stock_processing_outputs spo
       LEFT JOIN products p ON p.id=spo.product_id WHERE spo.processing_id=$1`,
      [req.params.id]
    );
    res.json({ ...sp.rows[0], outputs: outputs.rows });
  } catch (err) { next(err); }
});

// Create processing record (ซอยสต๊อก)
router.post('/processing', auth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { bulk_item_id, input_qty, outputs, notes, branch_id } = req.body;
    if (!bulk_item_id || !input_qty || !outputs?.length) throw { status: 400, error: 'ข้อมูลไม่ครบ' };
    const branchId = branch_id || req.user.branch_id || 1;

    // Check stock availability
    const bulkItem = await client.query('SELECT * FROM bulk_items WHERE id=$1 FOR UPDATE', [bulk_item_id]);
    if (!bulkItem.rows[0]) throw { status: 404, error: 'ไม่พบสต๊อกใหญ่' };
    const inQty = parseFloat(input_qty);
    if (bulkItem.rows[0].current_qty < inQty) throw { status: 400, error: `สต๊อกไม่พอ (มี ${bulkItem.rows[0].current_qty} ${bulkItem.rows[0].unit})` };

    // Generate process number
    const today = new Date();
    const prefix = `PR${String(today.getFullYear()).slice(-2)}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    const last = await client.query(`SELECT process_number FROM stock_processing WHERE process_number LIKE $1 ORDER BY process_number DESC LIMIT 1`, [`${prefix}%`]);
    const seq = last.rows[0] ? parseInt(last.rows[0].process_number.split('-')[1]) + 1 : 1;
    const processNumber = `${prefix}-${String(seq).padStart(3,'0')}`;

    const costPerUnit = parseFloat(bulkItem.rows[0].cost_per_unit || 0);
    const totalInputCost = inQty * costPerUnit;

    // Calculate outputs
    let totalOutputQty = 0;
    for (const o of outputs) totalOutputQty += parseFloat(o.quantity || 0);
    const wasteQty = Math.max(0, inQty - totalOutputQty);
    const wastePct = inQty > 0 ? (wasteQty / inQty) * 100 : 0;

    // Allocate cost proportionally to outputs
    const proc = await client.query(
      `INSERT INTO stock_processing (process_number, bulk_item_id, input_qty, total_output_qty, waste_qty, waste_pct, cost_per_input_unit, total_input_cost, notes, user_id, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [processNumber, bulk_item_id, inQty, totalOutputQty, wasteQty, wastePct.toFixed(2), costPerUnit, totalInputCost, notes || null, req.user.id, branchId]
    );
    const procId = proc.rows[0].id;

    for (const o of outputs) {
      const oQty = parseFloat(o.quantity || 0);
      // Allocate cost by weight ratio
      const allocatedCost = totalOutputQty > 0 ? (oQty / totalOutputQty) * totalInputCost : 0;
      const costPerUnitOut = oQty > 0 ? allocatedCost / oQty : 0;

      await client.query(
        `INSERT INTO stock_processing_outputs (processing_id, product_id, output_name, quantity, unit, allocated_cost, cost_per_unit, sell_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [procId, o.product_id || null, o.output_name, oQty, o.unit || 'kg', allocatedCost.toFixed(2), costPerUnitOut.toFixed(4), o.sell_price || 0]
      );

      // Add output to product front stock if product_id given
      if (o.product_id) {
        await client.query(
          `INSERT INTO stock (product_id, branch_id, location, quantity) VALUES ($1,$2,'front',$3)
           ON CONFLICT (product_id, branch_id, location) DO UPDATE SET quantity = stock.quantity + $3`,
          [o.product_id, branchId, oQty]
        );
        // Update product cost_price
        await client.query(`UPDATE products SET cost_price=$1 WHERE id=$2`, [costPerUnitOut.toFixed(2), o.product_id]);
      }
    }

    // Deduct from bulk stock
    await client.query(`UPDATE bulk_items SET current_qty = current_qty - $1 WHERE id=$2`, [inQty, bulk_item_id]);

    await client.query('COMMIT');
    res.status(201).json({ ...proc.rows[0], process_number: processNumber });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// ─── Cost Analysis ───────────────────────────────────────────────────────────

router.get('/cost-analysis', auth, async (req, res, next) => {
  try {
    const { branch_id, date_from, date_to } = req.query;
    const branchId = branch_id || req.user.branch_id || 1;
    const from = date_from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const to = date_to || new Date().toISOString().split('T')[0];

    // Sales profit (POS + delivery bills)
    const salesProfit = await query(
      `SELECT
         COALESCE(SUM(si.subtotal), 0) AS revenue,
         COALESCE(SUM(si.cost_price * si.quantity), 0) AS cost,
         COALESCE(SUM(si.subtotal - si.cost_price * si.quantity), 0) AS profit
       FROM sales s JOIN sale_items si ON si.sale_id=s.id
       WHERE s.branch_id=$1 AND s.created_at::date BETWEEN $2 AND $3`,
      [branchId, from, to]
    );

    const deliveryProfit = await query(
      `SELECT
         COALESCE(SUM(di.subtotal), 0) AS revenue,
         COALESCE(SUM(di.cost_price * di.quantity), 0) AS cost,
         COALESCE(SUM(di.subtotal - di.cost_price * di.quantity), 0) AS profit
       FROM delivery_bills db JOIN delivery_bill_items di ON di.bill_id=db.id
       WHERE db.branch_id=$1 AND db.bill_date BETWEEN $2 AND $3`,
      [branchId, from, to]
    );

    // Purchase cost
    const purchaseCost = await query(
      `SELECT COALESCE(SUM(total_amount),0) AS total_purchase
       FROM purchase_bills WHERE branch_id=$1 AND bill_date BETWEEN $2 AND $3 AND status='received'`,
      [branchId, from, to]
    );

    // Top profit products (POS)
    const topProducts = await query(
      `SELECT p.name, p.unit,
         SUM(si.quantity) AS qty_sold,
         SUM(si.subtotal) AS revenue,
         SUM(si.cost_price * si.quantity) AS cost,
         SUM(si.subtotal - si.cost_price * si.quantity) AS profit,
         CASE WHEN SUM(si.subtotal) > 0 THEN ROUND(SUM(si.subtotal - si.cost_price * si.quantity)/SUM(si.subtotal)*100,1) ELSE 0 END AS margin_pct
       FROM sales s JOIN sale_items si ON si.sale_id=s.id JOIN products p ON p.id=si.product_id
       WHERE s.branch_id=$1 AND s.created_at::date BETWEEN $2 AND $3
       GROUP BY p.id, p.name, p.unit ORDER BY profit DESC LIMIT 20`,
      [branchId, from, to]
    );

    // Processing waste summary
    const wasteSummary = await query(
      `SELECT bi.name, SUM(sp.input_qty) AS total_input, SUM(sp.waste_qty) AS total_waste,
         ROUND(AVG(sp.waste_pct),2) AS avg_waste_pct, SUM(sp.total_input_cost) AS total_cost
       FROM stock_processing sp JOIN bulk_items bi ON bi.id=sp.bulk_item_id
       WHERE sp.branch_id=$1 AND sp.created_at::date BETWEEN $2 AND $3
       GROUP BY bi.id, bi.name ORDER BY total_waste DESC`,
      [branchId, from, to]
    );

    const sp = salesProfit.rows[0];
    const dp = deliveryProfit.rows[0];
    const totalRevenue = parseFloat(sp.revenue) + parseFloat(dp.revenue);
    const totalCost = parseFloat(sp.cost) + parseFloat(dp.cost);
    const totalProfit = totalRevenue - totalCost;

    res.json({
      period: { from, to },
      summary: {
        revenue: totalRevenue,
        cost: totalCost,
        profit: totalProfit,
        margin_pct: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0,
        total_purchase: parseFloat(purchaseCost.rows[0].total_purchase),
        pos_revenue: parseFloat(sp.revenue),
        delivery_revenue: parseFloat(dp.revenue),
      },
      top_products: topProducts.rows,
      waste_summary: wasteSummary.rows,
    });
  } catch (err) { next(err); }
});

module.exports = router;
