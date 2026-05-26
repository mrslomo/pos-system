// ESC/POS commands for Bluetooth thermal printer (80mm)
// Works with Epson TM-T82, Star, and most generic thermal printers

const ESC = '\x1B';
const GS = '\x1D';
const LF = '\n';
const CR = '\r';

export const CMD = {
  INIT:           ESC + '@',
  CUT_PARTIAL:    GS + 'V' + '\x41' + '\x00',
  CUT_FULL:       GS + 'V' + '\x00',
  ALIGN_LEFT:     ESC + 'a' + '\x00',
  ALIGN_CENTER:   ESC + 'a' + '\x01',
  ALIGN_RIGHT:    ESC + 'a' + '\x02',
  BOLD_ON:        ESC + 'E' + '\x01',
  BOLD_OFF:       ESC + 'E' + '\x00',
  FONT_NORMAL:    ESC + '!' + '\x00',
  FONT_DOUBLE_H:  ESC + '!' + '\x10',
  FONT_DOUBLE_WH: ESC + '!' + '\x30',
  CASH_DRAWER:    ESC + 'p' + '\x00' + '\x19' + '\xFA', // Open cash drawer pin 2
  LINE_FEED:      LF,
  LINE_FEED_2:    LF + LF,
  LINE_FEED_4:    LF + LF + LF + LF,
};

// Pad/truncate text to exact width
function padEnd(text, len) {
  const s = String(text || '');
  return s.length >= len ? s.substring(0, len) : s + ' '.repeat(len - s.length);
}

function padStart(text, len) {
  const s = String(text || '');
  return s.length >= len ? s.substring(0, len) : ' '.repeat(len - s.length) + s;
}

function fmt(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
}

// Build receipt ESC/POS string
export function buildReceipt({ storeName, storeAddress, storePhone, receiptNumber, items, subtotal, discount, total, paymentMethod, paymentAmount, change, cashierName, date, notes }) {
  const WIDTH = 42; // chars for 80mm printer
  const LINE = '-'.repeat(WIDTH);

  let r = CMD.INIT;

  // Header
  r += CMD.ALIGN_CENTER;
  r += CMD.BOLD_ON + CMD.FONT_DOUBLE_WH;
  r += (storeName || 'POS SYSTEM') + LF;
  r += CMD.FONT_NORMAL + CMD.BOLD_OFF;
  if (storeAddress) r += storeAddress + LF;
  if (storePhone) r += 'Tel: ' + storePhone + LF;
  r += LINE + LF;

  // Receipt info
  r += CMD.ALIGN_LEFT;
  r += 'เลขที่: ' + (receiptNumber || '') + LF;
  r += 'วันที่: ' + (date || new Date().toLocaleString('th-TH')) + LF;
  if (cashierName) r += 'พนักงาน: ' + cashierName + LF;
  r += LINE + LF;

  // Column headers
  r += padEnd('รายการ', WIDTH - 16) + padStart('จำนวน', 6) + padStart('ราคา', 10) + LF;
  r += LINE + LF;

  // Items
  for (const item of (items || [])) {
    const name = String(item.product_name || item.name || '');
    const qty = String(Number(item.quantity || 0).toFixed(item.is_weight ? 3 : 0));
    const price = fmt(item.subtotal || (item.quantity * item.unit_price));

    // Name may wrap to next line
    if (name.length > WIDTH - 16) {
      r += name.substring(0, WIDTH) + LF;
      r += padEnd('', WIDTH - 16) + padStart(qty, 6) + padStart(price, 10) + LF;
    } else {
      r += padEnd(name, WIDTH - 16) + padStart(qty, 6) + padStart(price, 10) + LF;
    }
  }

  r += LINE + LF;

  // Totals
  const totalWidth = WIDTH;
  r += padEnd('รวม', totalWidth - 10) + padStart(fmt(subtotal), 10) + LF;
  if (parseFloat(discount) > 0) {
    r += padEnd('ส่วนลด', totalWidth - 10) + padStart('-' + fmt(discount), 10) + LF;
  }

  r += CMD.BOLD_ON;
  r += padEnd('ยอดสุทธิ', totalWidth - 10) + padStart(fmt(total), 10) + LF;
  r += CMD.BOLD_OFF;

  const pm = { cash: 'เงินสด', transfer: 'โอนเงิน', promptpay: 'พร้อมเพย์', credit: 'เครดิต' };
  r += padEnd('ชำระ (' + (pm[paymentMethod] || paymentMethod) + ')', totalWidth - 10) + padStart(fmt(paymentAmount), 10) + LF;
  if (parseFloat(change) > 0) {
    r += padEnd('เงินทอน', totalWidth - 10) + padStart(fmt(change), 10) + LF;
  }

  r += LINE + LF;

  // Footer
  r += CMD.ALIGN_CENTER;
  if (notes) r += notes + LF;
  r += 'ขอบคุณที่ใช้บริการ' + LF;
  r += LF;

  r += CMD.LINE_FEED_4;
  r += CMD.CUT_PARTIAL;

  return r;
}

// Build weight slip
export function buildWeighSlip({ storeName, productName, weight, pricePerKg, total, partnerName }) {
  const WIDTH = 42;
  let r = CMD.INIT;

  r += CMD.ALIGN_CENTER;
  r += CMD.BOLD_ON;
  r += (storeName || 'POS SYSTEM') + LF;
  r += CMD.BOLD_OFF;
  r += '--- ใบชั่งน้ำหนัก ---' + LF;
  r += new Date().toLocaleString('th-TH') + LF;
  r += '-'.repeat(WIDTH) + LF;

  r += CMD.ALIGN_LEFT;
  r += CMD.FONT_DOUBLE_H;
  r += productName + LF;
  r += CMD.FONT_NORMAL;
  r += LF;

  r += padEnd('น้ำหนัก', WIDTH - 12) + padStart(Number(weight).toFixed(3) + ' kg', 12) + LF;
  r += padEnd('ราคา/kg', WIDTH - 12) + padStart('฿' + fmt(pricePerKg), 12) + LF;
  if (partnerName) r += padEnd('คู่ค้า', WIDTH - 12) + padStart(partnerName, 12) + LF;
  r += '-'.repeat(WIDTH) + LF;

  r += CMD.BOLD_ON + CMD.FONT_DOUBLE_H;
  r += CMD.ALIGN_RIGHT;
  r += '฿ ' + fmt(total) + LF;
  r += CMD.FONT_NORMAL + CMD.BOLD_OFF;

  r += CMD.LINE_FEED_4;
  r += CMD.CUT_PARTIAL;

  return r;
}
