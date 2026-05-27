const BASE_URL = 'https://backend-doctors1.vercel.app/api';

export async function sendPaymentNotify({ branch_id, amount, bank_name, message }) {
  const res = await fetch(`${BASE_URL}/payment-notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch_id, amount, bank_name, message }),
  });
  return res.json();
}
