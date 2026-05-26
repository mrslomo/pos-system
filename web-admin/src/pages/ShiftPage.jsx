import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Clock, UserCheck, DollarSign, TrendingUp, TrendingDown, X, ChevronDown, ChevronUp, Printer, RefreshCw } from 'lucide-react';
import api from '../services/api';

const shiftAPI = {
  current: (branch_id) => api.get('/shifts/current', { params: { branch_id } }),
  list: (p) => api.get('/shifts', { params: p }),
  daily: (branch_id, date) => api.get('/shifts/daily-summary', { params: { branch_id, date } }),
  open: (d) => api.post('/shifts', d),
  close: (id, d) => api.post(`/shifts/${id}/close`, d),
  sales: (id) => api.get(`/shifts/${id}/sales`),
};
const usersAPI = { list: (p) => api.get('/users', { params: p }) };

const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];
const fmtTime = (dt) => dt ? new Date(dt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-';

const SHIFT_TYPES = [
  { value: 'morning',   label: 'เช้า (Morning)' },
  { value: 'afternoon', label: 'บ่าย (Afternoon)' },
  { value: 'night',     label: 'ดึก (Night)' },
  { value: 'full',      label: 'เต็มวัน (Full Day)' },
];

// ─── Open Shift Form ────────────────────────────────────────────────

function OpenShiftForm({ branchId, onSuccess }) {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    user_id: user.id,
    shift_type: 'morning',
    opening_cash: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    usersAPI.list({ branch_id: branchId, is_active: true })
      .then(r => setUsers(Array.isArray(r) ? r : (r.users || [])))
      .catch(() => {});
  }, [branchId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await shiftAPI.open({ ...form, branch_id: branchId, opening_cash: parseFloat(form.opening_cash || 0) });
      toast.success('เปิดกะสำเร็จ');
      onSuccess();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card max-w-md">
      <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Clock size={16} className="text-blue-600" /> เปิดกะทำงานใหม่
      </h3>
      <form onSubmit={handleSubmit} className="space-y-3 text-sm">
        <div>
          <label className="label">พนักงาน (Cashier) *</label>
          <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="input" required>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
        </div>
        <div>
          <label className="label">กะ</label>
          <div className="grid grid-cols-2 gap-2">
            {SHIFT_TYPES.map(t => (
              <button key={t.value} type="button"
                onClick={() => setForm(f => ({ ...f, shift_type: t.value }))}
                className={`py-2 rounded-lg border-2 text-xs font-medium transition-all ${form.shift_type === t.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">เงินเก๊ะ (Opening Cash)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">฿</span>
            <input type="number" step="0.01" min="0"
              value={form.opening_cash} onChange={e => setForm(f => ({ ...f, opening_cash: e.target.value }))}
              className="input pl-7" placeholder="0.00" />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">จำนวนเงินสดที่ใส่ในลิ้นชักเมื่อเริ่มกะ</p>
        </div>
        <div>
          <label className="label">หมายเหตุ</label>
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" placeholder="..." />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full py-2.5">
          {saving ? 'กำลังเปิดกะ...' : 'เปิดกะทำงาน'}
        </button>
      </form>
    </div>
  );
}

// ─── Active Shift Card ──────────────────────────────────────────────

function ShiftCard({ shift, onClose, onViewSales }) {
  const [closing, setClosing] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');

  const expected = parseFloat(shift.opening_cash || 0) + parseFloat(shift.cash_sales || 0);

  const handleClose = async () => {
    if (actualCash === '') return toast.error('กรุณากรอกเงินที่นับได้');
    setClosing(true);
    try {
      const result = await shiftAPI.close(shift.id, { actual_cash: parseFloat(actualCash), notes });
      const diff = result.cash_difference;
      if (Math.abs(diff) < 0.01) toast.success('ปิดกะสำเร็จ — เงินครบถ้วน');
      else if (diff > 0) toast.success(`ปิดกะสำเร็จ — เงินเกิน ฿${fmt(diff)}`);
      else toast(`ปิดกะสำเร็จ — เงินขาด ฿${fmt(Math.abs(diff))}`, { icon: '⚠️' });
      onClose();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setClosing(false); }
  };

  const shiftLabel = SHIFT_TYPES.find(t => t.value === shift.shift_type)?.label || shift.shift_type;

  return (
    <div className="card border-2 border-blue-200">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="font-bold text-gray-800">{shift.cashier_name}</span>
            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">{shiftLabel}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">เปิดกะ {fmtTime(shift.opened_at)} · เงินเก๊ะ ฿{fmt(shift.opening_cash)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">บิลทั้งหมด</p>
          <p className="font-bold text-lg text-blue-600">{shift.sale_count}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <p className="text-xs text-blue-500 mb-0.5">ยอดขายรวม</p>
          <p className="font-bold text-blue-700">฿{fmt(shift.total_sales)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <p className="text-xs text-green-500 mb-0.5">เงินสด</p>
          <p className="font-bold text-green-700">฿{fmt(shift.cash_sales)}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-3 text-center">
          <p className="text-xs text-purple-500 mb-0.5">โอน/พร้อมเพย์</p>
          <p className="font-bold text-purple-700">฿{fmt(shift.transfer_sales)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onViewSales} className="btn-secondary flex-1 text-sm">ดูบิลทั้งหมด</button>
        <button onClick={() => setShowClose(!showClose)} className="flex-1 text-sm py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium">
          ปิดกะ
        </button>
      </div>

      {showClose && (
        <div className="mt-3 pt-3 border-t space-y-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">เงินเก๊ะ</span><span>฿{fmt(shift.opening_cash)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">เงินสดที่ขาย</span><span className="text-green-600">+ ฿{fmt(shift.cash_sales)}</span></div>
            <div className="flex justify-between font-semibold border-t pt-1"><span>ยอดเงินที่ควรมี</span><span>฿{fmt(expected)}</span></div>
          </div>
          <div>
            <label className="label">เงินที่นับได้จริง *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">฿</span>
              <input type="number" step="0.01" min="0" value={actualCash}
                onChange={e => setActualCash(e.target.value)} className="input pl-7" placeholder="0.00" autoFocus />
            </div>
            {actualCash !== '' && (
              <div className={`mt-1 px-2 py-1 rounded text-xs font-bold ${parseFloat(actualCash) >= expected ? 'bg-green-50 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {parseFloat(actualCash) >= expected
                  ? `✓ เงินเกิน ฿${fmt(parseFloat(actualCash) - expected)}`
                  : `⚠ เงินขาด ฿${fmt(expected - parseFloat(actualCash))}`}
              </div>
            )}
          </div>
          <input value={notes} onChange={e => setNotes(e.target.value)} className="input" placeholder="หมายเหตุการปิดกะ..." />
          <div className="flex gap-2">
            <button onClick={() => setShowClose(false)} className="btn-secondary flex-1 text-sm">ยกเลิก</button>
            <button onClick={handleClose} disabled={closing}
              className="flex-1 text-sm py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium disabled:opacity-50">
              {closing ? 'กำลังปิด...' : 'ยืนยันปิดกะ'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sales in Shift Modal ───────────────────────────────────────────

function ShiftSalesModal({ shiftId, cashierName, onClose }) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    shiftAPI.sales(shiftId).then(r => setSales(r)).finally(() => setLoading(false));
  }, [shiftId]);

  const total = sales.reduce((s, sale) => s + parseFloat(sale.total_amount || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">บิลของ {cashierName} ในกะนี้</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <div className="py-10 text-center text-gray-400">กำลังโหลด...</div>
            : sales.length === 0 ? <div className="py-10 text-center text-gray-400">ยังไม่มีบิล</div>
            : (
              <div className="space-y-2">
                {sales.map(s => (
                  <div key={s.id} className="border rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-medium text-blue-600">{s.receipt_number}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${s.payment_method === 'cash' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                          {s.payment_method === 'cash' ? 'เงินสด' : s.payment_method}
                        </span>
                        <span className="font-bold">฿{fmt(s.total_amount)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(s.items || []).map((item, i) => (
                        <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {item.name} ×{Number(item.qty).toFixed(item.qty % 1 ? 3 : 0)}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{new Date(s.created_at).toLocaleString('th-TH')}</p>
                  </div>
                ))}
              </div>
            )}
        </div>
        <div className="p-4 border-t flex items-center justify-between">
          <span className="text-sm text-gray-500">{sales.length} บิล</span>
          <span className="font-bold text-blue-600">รวม ฿{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Daily Summary Card ─────────────────────────────────────────────

function DailySummaryCard({ branchId }) {
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await shiftAPI.daily(branchId, date)); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, [branchId, date]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700 flex items-center gap-2"><TrendingUp size={16} className="text-green-600" /> สรุปกำไรรายวัน</h3>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input text-sm py-1 w-36" />
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><RefreshCw size={14} /></button>
        </div>
      </div>
      {loading ? <div className="py-6 text-center text-gray-400 text-sm">กำลังโหลด...</div>
        : !data ? <div className="py-6 text-center text-gray-400 text-sm">ไม่พบข้อมูล</div>
        : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'รายได้รวม', val: data.revenue, color: 'bg-blue-50 text-blue-700', border: 'border-blue-100' },
                { label: 'ต้นทุนขาย (COGS)', val: data.cogs, color: 'bg-orange-50 text-orange-700', border: 'border-orange-100' },
                { label: 'ต้นทุนเสื่อม', val: data.detrCost, color: 'bg-red-50 text-red-700', border: 'border-red-100' },
                { label: 'กำไรขั้นต้น', val: data.gross_profit, color: data.gross_profit >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700', border: 'border-green-100' },
              ].map(c => (
                <div key={c.label} className={`rounded-xl p-3 border ${c.border} ${c.color}`}>
                  <p className="text-xs opacity-70 mb-0.5">{c.label}</p>
                  <p className="font-bold text-base">฿{fmt(c.val)}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-center">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-gray-400">จำนวนบิล</p>
                <p className="font-bold text-gray-700">{data.sale_count} บิล</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-gray-400">Margin</p>
                <p className={`font-bold ${data.margin >= 20 ? 'text-green-600' : 'text-orange-500'}`}>{data.margin}%</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-gray-400">ส่วนลดรวม</p>
                <p className="font-bold text-gray-700">฿{fmt(data.total_discount)}</p>
              </div>
            </div>
            <div className="flex gap-2 text-xs">
              <div className="flex-1 bg-green-50 rounded-lg p-2 text-center">
                <p className="text-gray-400">เงินสด</p>
                <p className="font-bold text-green-700">฿{fmt(data.cash_revenue)}</p>
              </div>
              <div className="flex-1 bg-purple-50 rounded-lg p-2 text-center">
                <p className="text-gray-400">โอน/พร้อมเพย์</p>
                <p className="font-bold text-purple-700">฿{fmt(data.transfer_revenue)}</p>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

// ─── Shift History Tab ──────────────────────────────────────────────

function ShiftHistoryTab({ branchId }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [expanded, setExpanded] = useState(null);
  const [shiftSales, setShiftSales] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await shiftAPI.list({ branch_id: branchId, date_from: dateFrom, date_to: dateTo });
      setShifts(rows);
    } finally { setLoading(false); }
  }, [branchId, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!shiftSales[id]) {
      const sales = await shiftAPI.sales(id);
      setShiftSales(p => ({ ...p, [id]: sales }));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <label className="text-sm text-gray-500">ตั้งแต่:</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input text-sm py-1 w-36" />
        <label className="text-sm text-gray-500">ถึง:</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input text-sm py-1 w-36" />
        <button onClick={load} className="btn-secondary text-sm flex items-center gap-1.5"><RefreshCw size={13} /> โหลด</button>
      </div>
      <div className="card overflow-hidden p-0">
        {loading ? <div className="py-10 text-center text-gray-400">กำลังโหลด...</div>
          : shifts.length === 0 ? <div className="py-10 text-center text-gray-400 text-sm">ไม่พบกะในช่วงที่เลือก</div>
          : (
            <div className="divide-y">
              {shifts.map(s => {
                const shiftLabel = SHIFT_TYPES.find(t => t.value === s.shift_type)?.label || s.shift_type;
                const cashDiff = parseFloat(s.cash_difference || 0);
                return (
                  <div key={s.id} className={cashDiff < -0.01 ? 'bg-red-50/60' : ''}>
                    <button onClick={() => toggleExpand(s.id)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50/80 text-left" style={cashDiff < -0.01 ? {} : {}}>
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2 items-center text-sm">
                        <div>
                          <p className="font-semibold text-gray-800">{s.cashier_name}</p>
                          <p className="text-xs text-gray-400">{s.shift_date} · {shiftLabel}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-400">บิล</p>
                          <p className="font-bold">{s.sale_count}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-400">ยอดขาย</p>
                          <p className="font-bold text-blue-600">฿{fmt(s.total_sales)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-400">เงินเก๊ะ</p>
                          <p className="font-medium">฿{fmt(s.opening_cash)}</p>
                        </div>
                        <div className="text-center">
                          {s.status === 'open'
                            ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">กำลังทำงาน</span>
                            : <div>
                                <p className="text-xs text-gray-400">ผลต่างเงิน</p>
                                <p className={`font-bold text-sm ${Math.abs(cashDiff) < 0.01 ? 'text-gray-500' : cashDiff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {cashDiff > 0.01 ? `+฿${fmt(cashDiff)}` : cashDiff < -0.01 ? `⚠ ขาด ฿${fmt(Math.abs(cashDiff))}` : 'ครบ'}
                                </p>
                              </div>
                          }
                        </div>
                      </div>
                      {expanded === s.id ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
                    </button>
                    {expanded === s.id && (
                      <div className="px-4 pb-3 bg-gray-50">
                        <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                          <div className="bg-white rounded-lg p-2 space-y-1">
                            <div className="flex justify-between"><span className="text-gray-400">เปิดกะ</span><span>{fmtTime(s.opened_at)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-400">ปิดกะ</span><span>{fmtTime(s.closed_at)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-400">เงินเก๊ะ</span><span>฿{fmt(s.opening_cash)}</span></div>
                            {s.actual_cash != null && (
                              <>
                                <div className="flex justify-between"><span className="text-gray-400">เงินที่นับได้</span><span>฿{fmt(s.actual_cash)}</span></div>
                                <div className="flex justify-between font-semibold border-t pt-1">
                                  <span>ผลต่าง</span>
                                  <span className={cashDiff >= 0 ? 'text-green-600' : 'text-red-600'}>
                                    {cashDiff >= 0 ? '+' : ''}฿{fmt(cashDiff)}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                          <div className="bg-white rounded-lg p-2 space-y-1">
                            <div className="flex justify-between"><span className="text-gray-400">เงินสด</span><span className="text-green-600 font-medium">฿{fmt(s.cash_sales)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-400">โอน</span><span className="text-purple-600 font-medium">฿{fmt(s.transfer_sales)}</span></div>
                            <div className="flex justify-between font-semibold border-t pt-1"><span>รวม</span><span className="text-blue-600">฿{fmt(s.total_sales)}</span></div>
                          </div>
                        </div>
                        {shiftSales[s.id] && (
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            <p className="text-xs font-medium text-gray-500 mb-1">บิลทั้งหมด ({shiftSales[s.id].length})</p>
                            {shiftSales[s.id].map(sale => (
                              <div key={sale.id} className="flex items-center justify-between bg-white rounded px-2 py-1.5 text-xs">
                                <span className="font-mono text-blue-600">{sale.receipt_number}</span>
                                <span className="text-gray-500">{new Date(sale.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                                <span className={`px-1.5 py-0.5 rounded ${sale.payment_method === 'cash' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                                  {sale.payment_method === 'cash' ? 'สด' : 'โอน'}
                                </span>
                                <span className="font-bold">฿{fmt(sale.total_amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

const TABS = ['กะปัจจุบัน + เปิดกะ', 'ประวัติกะ'];

export default function ShiftPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [activeShifts, setActiveShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewSales, setViewSales] = useState(null);

  const loadActive = useCallback(async () => {
    setLoading(true);
    try { setActiveShifts(await shiftAPI.current(user.branch_id)); }
    finally { setLoading(false); }
  }, [user.branch_id]);

  useEffect(() => { loadActive(); }, [loadActive]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">กะทำงาน</h1>
        <p className="text-gray-500 text-sm">จัดการกะ เงินเก๊ะ และดูบิลของพนักงานแต่ละกะ</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === i ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t}
            {i === 0 && activeShifts.length > 0 && (
              <span className="ml-1.5 text-xs bg-green-500 text-white rounded-full px-1.5 py-0.5">{activeShifts.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="space-y-4">
          <DailySummaryCard branchId={user.branch_id} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Active shifts */}
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-700 text-sm">กะที่กำลังทำงาน ({activeShifts.length})</h3>
              {loading ? <div className="text-gray-400 text-sm">กำลังโหลด...</div>
                : activeShifts.length === 0
                  ? <div className="card border-dashed text-center py-8 text-gray-400 text-sm">ยังไม่มีกะที่เปิดอยู่</div>
                  : activeShifts.map(s => (
                      <ShiftCard key={s.id} shift={s}
                        onClose={loadActive}
                        onViewSales={() => setViewSales(s)} />
                    ))}
            </div>
            {/* Open new shift */}
            <OpenShiftForm branchId={user.branch_id} onSuccess={loadActive} />
          </div>
        </div>
      )}

      {tab === 1 && <ShiftHistoryTab branchId={user.branch_id} />}

      {viewSales && (
        <ShiftSalesModal
          shiftId={viewSales.id}
          cashierName={viewSales.cashier_name}
          onClose={() => setViewSales(null)}
        />
      )}
    </div>
  );
}
