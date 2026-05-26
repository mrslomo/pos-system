const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { auth } = require('../middleware/auth');

const THAI_BANKS = [
  'ธนาคารกสิกรไทย (KBANK)',
  'ธนาคารไทยพาณิชย์ (SCB)',
  'ธนาคารกรุงเทพ (BBL)',
  'ธนาคารกรุงไทย (KTB)',
  'ธนาคารกรุงศรีอยุธยา (BAY)',
  'ธนาคารทหารไทยธนชาต (TTB)',
  'ธนาคารออมสิน (GSB)',
  'ธนาคารเพื่อการเกษตรและสหกรณ์ (BAAC)',
  'ธนาคารอิสลาม (IBANK)',
  'ธนาคารซีไอเอ็มบีไทย (CIMB)',
  'ธนาคารยูโอบี (UOB)',
  'ธนาคารแลนด์แอนด์เฮ้าส์ (LHB)',
  'ธนาคารทิสโก้ (TISCO)',
  'ธนาคารเกียรตินาคินภัทร (KKP)',
  'ธนาคารไทยเครดิต (TCRB)',
];

// GET all bank accounts for branch
router.get('/', auth, async (req, res, next) => {
  try {
    const { branch_id } = req.query;
    const result = await pool.query(
      `SELECT * FROM bank_accounts WHERE branch_id = $1 AND is_active = true ORDER BY sort_order, id`,
      [branch_id || req.user.branch_id]
    );
    res.json({ accounts: result.rows, banks: THAI_BANKS });
  } catch (err) { next(err); }
});

// POST create account
router.post('/', auth, async (req, res, next) => {
  try {
    const { branch_id, account_label, account_type, bank_name, account_number, account_name, promptpay_number, sort_order } = req.body;
    const result = await pool.query(
      `INSERT INTO bank_accounts (branch_id, account_label, account_type, bank_name, account_number, account_name, promptpay_number, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [branch_id || req.user.branch_id, account_label, account_type || 'bank', bank_name, account_number, account_name, promptpay_number, sort_order || 0]
    );
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// PUT update account
router.put('/:id', auth, async (req, res, next) => {
  try {
    const { account_label, account_type, bank_name, account_number, account_name, promptpay_number, sort_order, is_active } = req.body;
    const result = await pool.query(
      `UPDATE bank_accounts SET account_label=$1, account_type=$2, bank_name=$3, account_number=$4, account_name=$5, promptpay_number=$6, sort_order=$7, is_active=$8
       WHERE id=$9 RETURNING *`,
      [account_label, account_type, bank_name, account_number, account_name, promptpay_number, sort_order, is_active, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// DELETE (soft delete)
router.delete('/:id', auth, async (req, res, next) => {
  try {
    await pool.query('UPDATE bank_accounts SET is_active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
