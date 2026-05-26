import React, { useState, useEffect } from 'react';
import { deliveryBillAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Eye, X, CreditCard, CheckCircle, AlertCircle, Clock } from 'lucide-react';

const today = () => new Date().toISOString().split('T')[0];
const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

const STATUS_STYLES = {
  credit: { label: 'ค้างชำระ', bg: 'bg-red-100 text-red-700', icon: AlertCircle },
  partial: { label: 'ชำระบางส่วน', bg: 'bg-yellow-100 text-yellow-700', icon: Clock },
  paid: { label: 'ชำระแล้ว', bg: 'bg-green-100 text-green-700', icon: CheckCircle },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.credit;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg}`}>
      <s.icon size={11} />
      {s.label}
    </span>
  );
}

function PaymentModal({ bill, onClose, onPaid }) {
  const [payAmount, setPayAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const outstanding = parseFloat(bill.total_amount) - parseFloat(bill.paid_amount || 0);

  const handlePay = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return toast.error('ระบุจำนวนเงิน');
    if (amount > outstanding + 0.01) return toast.error(`ยอดไม่เกิน ฿${fmt(outstanding)}`);
    setSaving(true);
    try {
      const newPaid = parseFloat(bill.paid_amount || 0) + amount;
      const newStatus = newPaid >= parseFloat(bill.total_amount) - 0.01 ? 'paid' : 'partial';
      await deliveryBillAPI.updatePayment(bill.id, newStatus, newPaid);
      toast.success('บันทึกการชำระเงินสำเร็จ');
      onPaid();
    } catch (err) {
      toast.error(err.error || 'เกิดข้อผิดพลาด');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-semibold text-lg">บันทึกการชำระเงิน</h2>
            <p className="text-sm text-gray-500">{bill.bill_number} — {bill.partner_name || 'ไม่ระบุคู่ค้า'}</p>
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-gray-500">ยอดบิลรวม</p>
              <p className="font-bold text-gray-900">฿{fmt(bill.total_amount)}</p>
            </div>
            <div>
              <p className="text-gray-500">ชำระแล้ว</p>
              <p className="font-bold text-green-600">฿{fmt(bill.paid_amount || 0)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-500">ยังค้างอยู่</p>
              <p className="font-bold text-red-600 text-lg">฿{fmt(outstanding)}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงินที่รับ (บาท)</label>
            <div className="flex gap-2">
              <input
                type="number" step="0.01" min="0" max={outstanding}
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                className="input flex-1 text-right text-lg"
                placeholder="0.00"
                autoFocus
              />
              <button onClick={() => setPayAmount(outstanding.toFixed(2))} className="btn-secondary text-sm px-3">
                เต็ม
              </button>
            </div>
          </div>
        </div>
        <div className="p-5 border-t flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">ยกเลิก</button>
          <button onClick={handlePay} disabled={saving} className="btn-primary flex items-center gap-2">
            <CheckCircle size={15} />
            {saving ? 'กำลังบันทึก...' : 'บันทึกรับเงิน'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewBillModal({ bill, onClose }) {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    deliveryBillAPI.get(bill.id).then(setDetail).catch(() => toast.error('โหลดข้อมูลล้มเหลว'));
  }, [bill.id]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-semibold text-lg">{bill.bill_number}</h2>
            <p className="text-sm text-gray-500">{bill.partner_name || 'ไม่ระบุคู่ค้า'}</p>
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="p-5">
          {!detail ? (
            <p className="text-center text-gray-400 py-6">กำลังโหลด...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div><p className="text-gray-500">วันที่</p><p className="font-medium">{new Date(detail.bill_date).toLocaleDateString('th-TH')}</p></div>
                <div><p className="text-gray-500">สถานะ</p><StatusBadge status={detail.payment_status} /></div>
                <div><p className="text-gray-500">ยอดรวม</p><p className="font-bold">฿{fmt(detail.total_amount)}</p></div>
                <div><p className="text-gray-500">ชำระแล้ว</p><p className="font-bold text-green-600">฿{fmt(detail.paid_amount || 0)}</p></div>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-b">
                  <th className="text-left py-1.5">สินค้า</th>
                  <th className="text-right py-1.5">จำนวน</th>
                  <th className="text-right py-1.5">ราคา</th>
                  <th className="text-right py-1.5">รวม</th>
                </tr></thead>
                <tbody>
                  {(detail.items || []).map((it, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-1.5">{it.product_name}</td>
                      <td className="text-right">{it.quantity} {it.unit || ''}</td>
                      <td className="text-right">฿{fmt(it.unit_price)}</td>
                      <td className="text-right font-medium">฿{fmt(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {parseFloat(detail.discount_amount) > 0 && (
                    <tr><td colSpan={3} className="text-right pt-2 text-gray-500">ส่วนลด</td><td className="text-right pt-2 text-red-600">-฿{fmt(detail.discount_amount)}</td></tr>
                  )}
                  <tr><td colSpan={3} className="text-right pt-2 font-semibold">ยอดรวมสุทธิ</td><td className="text-right pt-2 font-bold">฿{fmt(detail.total_amount)}</td></tr>
                  <tr><td colSpan={3} className="text-right pt-1 text-green-600">ชำระแล้ว</td><td className="text-right pt-1 text-green-600 font-medium">฿{fmt(detail.paid_amount || 0)}</td></tr>
                  <tr className="text-red-600"><td colSpan={3} className="text-right pt-1 font-semibold">ค้างชำระ</td><td className="text-right pt-1 font-bold">฿{fmt(Math.max(0, parseFloat(detail.total_amount) - parseFloat(detail.paid_amount || 0)))}</td></tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreditHistoryPage() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date_from: '', date_to: '' });
  const [statusFilter, setStatusFilter] = useState('credit,partial');
  const [payModal, setPayModal] = useState(null);
  const [viewModal, setViewModal] = useState(null);

  const load = () => {
    setLoading(true);
    // Fetch both credit and partial separately, then merge
    const statuses = statusFilter.split(',').filter(Boolean);
    Promise.all(
      statuses.map(s =>
        deliveryBillAPI.list({
          branch_id: user.branch_id,
          payment_status: s,
          date_from: filters.date_from || undefined,
          date_to: filters.date_to || undefined,
        })
      )
    ).then(results => {
      const merged = results.flat();
      merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setBills(merged);
    }).catch(() => toast.error('โหลดข้อมูลล้มเหลว'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filters, statusFilter]);

  const totalOutstanding = bills.reduce((s, b) => {
    if (b.payment_status === 'paid') return s;
    return s + Math.max(0, parseFloat(b.total_amount) - parseFloat(b.paid_amount || 0));
  }, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ประวัติการค้างจ่าย</h1>
          <p className="text-gray-500 text-sm">ยอดค้างชำระรวม: <span className="font-bold text-red-600">฿{fmt(totalOutstanding)}</span></p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4 flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-500">จาก</label>
          <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} className="input text-sm py-1.5" />
          <label className="text-gray-500">ถึง</label>
          <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} className="input text-sm py-1.5" />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { value: 'credit,partial', label: 'ยังค้างอยู่' },
            { value: 'credit', label: 'ค้างชำระ' },
            { value: 'partial', label: 'บางส่วน' },
            { value: 'paid', label: 'ชำระแล้ว' },
          ].map(opt => (
            <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${statusFilter === opt.value ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['เลขบิล', 'วันที่', 'คู่ค้า', 'ยอดรวม', 'ชำระแล้ว', 'ค้างอยู่', 'สถานะ', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="py-10 text-center text-gray-400">กำลังโหลด...</td></tr>
              ) : bills.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-gray-400">ไม่พบรายการค้างจ่าย</td></tr>
              ) : bills.map(b => {
                const outstanding = Math.max(0, parseFloat(b.total_amount) - parseFloat(b.paid_amount || 0));
                return (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium text-blue-600">{b.bill_number}</td>
                    <td className="px-4 py-3 text-gray-600">{new Date(b.bill_date).toLocaleDateString('th-TH')}</td>
                    <td className="px-4 py-3 font-medium">{b.partner_name || '-'}</td>
                    <td className="px-4 py-3 font-semibold">฿{fmt(b.total_amount)}</td>
                    <td className="px-4 py-3 text-green-600">฿{fmt(b.paid_amount || 0)}</td>
                    <td className="px-4 py-3 font-bold text-red-600">฿{fmt(outstanding)}</td>
                    <td className="px-4 py-3"><StatusBadge status={b.payment_status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setViewModal(b)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="ดูรายละเอียด">
                          <Eye size={14} />
                        </button>
                        {b.payment_status !== 'paid' && (
                          <button onClick={() => setPayModal(b)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="รับชำระเงิน">
                            <CreditCard size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {bills.length > 0 && (
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right font-semibold text-gray-600">ยอดค้างรวม</td>
                  <td className="px-4 py-3 font-bold text-red-600">฿{fmt(totalOutstanding)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {payModal && (
        <PaymentModal bill={payModal} onClose={() => setPayModal(null)} onPaid={() => { setPayModal(null); load(); }} />
      )}
      {viewModal && (
        <ViewBillModal bill={viewModal} onClose={() => setViewModal(null)} />
      )}
    </div>
  );
}
