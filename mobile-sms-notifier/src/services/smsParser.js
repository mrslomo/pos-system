// Thai bank SMS patterns for PromptPay/transfer received notifications

const BANK_PATTERNS = [
  { bank: 'KBank',    pattern: /kbank/i },
  { bank: 'SCB',      pattern: /scb/i },
  { bank: 'KTB',      pattern: /ktb|krungthai/i },
  { bank: 'BBL',      pattern: /bangkok\s*bank|bbl/i },
  { bank: 'BAY',      pattern: /krungsri|bay\b/i },
  { bank: 'TTB',      pattern: /ttb|tmb|thanachart/i },
  { bank: 'GSB',      pattern: /gsb|ออมสิน/i },
  { bank: 'BAAC',     pattern: /baac|ธกส/i },
  { bank: 'Promptpay',pattern: /promptpay|พร้อมเพย์/i },
];

// Keywords that mean "received money"
const RECEIVED_KEYWORDS = [
  'รับโอน', 'รับเงิน', 'เงินเข้า', 'โอนเข้า',
  'received', 'transfer in', 'credit',
];

// Amount regex: matches 1,234.56 or 1234.56 or 1,234 บาท
const AMOUNT_RE = /([\d]{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:บาท|thb|baht)/i;

export function parseSms(sender, body) {
  const text = (body || '').trim();
  const lower = text.toLowerCase();

  // Must contain a "received" keyword to avoid parsing outgoing transfer SMS
  const isReceived = RECEIVED_KEYWORDS.some(kw => text.includes(kw));
  if (!isReceived) return null;

  // Extract amount
  const amountMatch = AMOUNT_RE.exec(text);
  if (!amountMatch) return null;

  const amountStr = amountMatch[1].replace(/,/g, '');
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  // Detect bank from sender or body
  const searchStr = `${sender || ''} ${text}`;
  let bank_name = 'Unknown';
  for (const { bank, pattern } of BANK_PATTERNS) {
    if (pattern.test(searchStr)) {
      bank_name = bank;
      break;
    }
  }

  return { amount, bank_name, message: text.substring(0, 200) };
}
