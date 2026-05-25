const router = require('express').Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');
const ExcelJS = require('exceljs');
const moment = require('moment');

router.use(auth);

router.get('/summary', async (req, res, next) => {
  try {
    const { branch_id, from_date, to_date } = req.query;
    const branchId = branch_id || req.user.branch_id;
    const from = from_date || moment().startOf('day').toISOString();
    const to = to_date ? to_date + ' 23:59:59' : moment().endOf('day').toISOString();

    const salesResult = await query(`
      SELECT
        COUNT(*)::int as total_bills,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(total_amount - COALESCE(s.total_cost, 0)), 0) as gross_profit
      FROM sales s
      LEFT JOIN (
        SELECT sale_id, SUM(quantity * cost_price) as total_cost FROM sale_items GROUP BY sale_id
      ) sc ON sc.sale_id = s.id
      WHERE s.branch_id = $1 AND s.created_at BETWEEN $2 AND $3
    `, [branchId, from, to]);

    const topProducts = await query(`
      SELECT p.name, p.barcode, SUM(si.quantity) as total_qty,
        SUM(si.subtotal) as total_revenue,
        SUM(si.quantity * (si.unit_price - si.cost_price)) as gross_profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.branch_id = $1 AND s.created_at BETWEEN $2 AND $3
      GROUP BY p.id, p.name, p.barcode
      ORDER BY total_revenue DESC LIMIT 10
    `, [branchId, from, to]);

    const hourlyResult = await query(`
      SELECT EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*)::int as bills, SUM(total_amount) as revenue
      FROM sales WHERE branch_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY hour ORDER BY hour
    `, [branchId, from, to]);

    res.json({
      summary: salesResult.rows[0],
      top_products: topProducts.rows,
      hourly: hourlyResult.rows
    });
  } catch (err) { next(err); }
});

router.get('/daily', async (req, res, next) => {
  try {
    const { branch_id, days = 30 } = req.query;
    const branchId = branch_id || req.user.branch_id;

    const result = await query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*)::int as total_bills,
        SUM(total_amount) as revenue,
        SUM(sc.cost) as cost,
        SUM(total_amount) - SUM(sc.cost) as profit
      FROM sales s
      LEFT JOIN (SELECT sale_id, SUM(quantity * cost_price) as cost FROM sale_items GROUP BY sale_id) sc ON sc.sale_id = s.id
      WHERE s.branch_id = $1 AND created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(created_at) ORDER BY date DESC
    `, [branchId]);

    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/weekly', async (req, res, next) => {
  try {
    const { branch_id, weeks = 12 } = req.query;
    const branchId = branch_id || req.user.branch_id;

    const result = await query(`
      SELECT
        DATE_TRUNC('week', created_at) as week_start,
        COUNT(*)::int as total_bills,
        SUM(total_amount) as revenue,
        SUM(sc.cost) as cost,
        SUM(total_amount) - SUM(sc.cost) as profit
      FROM sales s
      LEFT JOIN (SELECT sale_id, SUM(quantity * cost_price) as cost FROM sale_items GROUP BY sale_id) sc ON sc.sale_id = s.id
      WHERE s.branch_id = $1 AND created_at >= NOW() - INTERVAL '${parseInt(weeks)} weeks'
      GROUP BY DATE_TRUNC('week', created_at) ORDER BY week_start DESC
    `, [branchId]);

    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/profit', async (req, res, next) => {
  try {
    const { branch_id, from_date, to_date, group_by = 'day' } = req.query;
    const branchId = branch_id || req.user.branch_id;
    const from = from_date || moment().subtract(30, 'days').startOf('day').toISOString();
    const to = to_date ? to_date + ' 23:59:59' : moment().endOf('day').toISOString();

    const trunc = ['day', 'week', 'month'].includes(group_by) ? group_by : 'day';

    const result = await query(`
      SELECT
        DATE_TRUNC($4, s.created_at) as period,
        COUNT(DISTINCT s.id)::int as bills,
        SUM(s.total_amount) as revenue,
        SUM(si.quantity * si.cost_price) as cost,
        SUM(s.total_amount) - SUM(si.quantity * si.cost_price) as profit,
        CASE WHEN SUM(s.total_amount) > 0
          THEN ROUND((SUM(s.total_amount) - SUM(si.quantity * si.cost_price)) / SUM(s.total_amount) * 100, 2)
          ELSE 0 END as profit_margin
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      WHERE s.branch_id = $1 AND s.created_at BETWEEN $2 AND $3
      GROUP BY DATE_TRUNC($4, s.created_at)
      ORDER BY period
    `, [branchId, from, to, trunc]);

    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/export', async (req, res, next) => {
  try {
    const { branch_id, from_date, to_date, type = 'sales' } = req.query;
    const branchId = branch_id || req.user.branch_id;
    const from = from_date || moment().startOf('day').toISOString();
    const to = to_date ? to_date + ' 23:59:59' : moment().endOf('day').toISOString();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');

    if (type === 'sales') {
      const result = await query(`
        SELECT s.receipt_number, s.created_at, u.name as cashier, b.name as branch,
          s.subtotal, s.discount_amount, s.total_amount, s.payment_method, s.payment_amount
        FROM sales s JOIN users u ON u.id = s.user_id JOIN branches b ON b.id = s.branch_id
        WHERE s.branch_id = $1 AND s.created_at BETWEEN $2 AND $3
        ORDER BY s.created_at
      `, [branchId, from, to]);

      sheet.columns = [
        { header: 'เลขที่ใบเสร็จ', key: 'receipt_number', width: 20 },
        { header: 'วันเวลา', key: 'created_at', width: 20 },
        { header: 'พนักงาน', key: 'cashier', width: 15 },
        { header: 'สาขา', key: 'branch', width: 15 },
        { header: 'ยอดรวม', key: 'subtotal', width: 12 },
        { header: 'ส่วนลด', key: 'discount_amount', width: 12 },
        { header: 'ยอดสุทธิ', key: 'total_amount', width: 12 },
        { header: 'วิธีชำระ', key: 'payment_method', width: 12 },
      ];
      sheet.addRows(result.rows);
    } else if (type === 'stock') {
      const result = await query(`
        SELECT p.barcode, p.name, c.name as category, p.unit, p.min_stock,
          COALESCE(sf.quantity, 0) as front_stock,
          COALESCE(sb.quantity, 0) as back_stock,
          COALESCE(sf.quantity, 0) + COALESCE(sb.quantity, 0) as total_stock
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN stock sf ON sf.product_id = p.id AND sf.location = 'front' AND sf.branch_id = $1
        LEFT JOIN stock sb ON sb.product_id = p.id AND sb.location = 'back' AND sb.branch_id = $1
        WHERE p.is_active = true ORDER BY p.name
      `, [branchId]);

      sheet.columns = [
        { header: 'Barcode', key: 'barcode', width: 18 },
        { header: 'ชื่อสินค้า', key: 'name', width: 25 },
        { header: 'หมวดหมู่', key: 'category', width: 15 },
        { header: 'หน่วย', key: 'unit', width: 10 },
        { header: 'สต๊อกขั้นต่ำ', key: 'min_stock', width: 12 },
        { header: 'หน้าร้าน', key: 'front_stock', width: 12 },
        { header: 'หลังบ้าน', key: 'back_stock', width: 12 },
        { header: 'รวม', key: 'total_stock', width: 10 },
      ];
      sheet.addRows(result.rows);
    }

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=report-${type}-${moment().format('YYYYMMDD')}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

module.exports = router;
