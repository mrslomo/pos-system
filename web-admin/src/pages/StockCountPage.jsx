import React, { useState, useEffect, useCallback } from 'react';
import { productAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { ClipboardList, Check, Search, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Plus, TrendingDown, TrendingUp, BarChart3, ArrowRight } from 'lucide-react';
import api from '../services/api';

const stockCountAPI = {
  list: (p) => api.get('/stock-counts', { params: p }),
  create: (d) => api.post('/stock-counts', d),
  get: (id) => api.get(`/stock-counts/${id}`),
  updateItems: (id, items) => api.put(`/stock-counts/${id}/items`, { items }),
  close: (id) => api.post(`/stock-counts/${id}/close`),
  delete: (id) => api.delete(`/stock-counts/${id}`),
};
const deteriorationAPI = {
  list: (p) => api.get('/deterioration', { params: p }),
  create: (d) => api.post('/deterioration', d),
};

const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
const fmtQty = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 3 });
const today = () => new Date().toISOString().split('T')[0];

// ─────────────────── Tab 1: นับสต๊อก ──────────────────────────────

function StockCountTab({ branchId }) {
  const [counts, setCounts] = useState([]);
  const [activeCount, setActiveCount] = useState(null);
  const [items, setItems] = useState([]);
  const [localQty, setLocalQty] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [search, setSearch] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [carryForward, setCarryForward] = useState(false);

  const closedCounts = counts.filter(c => c.status === 'closed');
  const lastClosed = closedCounts[0] || null;

  const loadCounts = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await stockCountAPI.list({ branch_id: branchId });
      setCounts(rows);
      const open = rows.find(r => r.status === 'open');
      if (open) {
        const detail = await stockCountAPI.get(open.id);
        setActiveCount(detail);
        setItems(detail.items || []);
        const init = {};
        (detail.items || []).forEach(i => { init[i.id] = i.counted_qty ?? ''; });
        setLocalQty(init);
      } else {
        setActiveCount(null);
        setItems([]);
      }
    } finally { setLoading(false); }
  }, [branchId]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const startCount = async () => {
    try {
      const payload = { branch_id: branchId };
      if (carryForward && lastClosed) payload.carry_from_count_id = lastClosed.id;
      await stockCountAPI.create(payload);
      toast.success(carryForward ? `ยกยอดจากการนับวันที่ ${lastClosed.count_date} แล้ว` : 'เริ่มนับสต๊อกวันนี้แล้ว');
      loadCounts();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
  };

  const saveAll = async () => {
    if (!activeCount) return;
    setSaving(true);
    try {
      const payload = items.map(i => ({
        id: i.id,
        counted_qty: localQty[i.id] !== '' && localQty[i.id] != null ? parseFloat(localQty[i.id]) : null,
      }));
      await stockCountAPI.updateItems(activeCount.id, payload);
      toast.success('บันทึกแล้ว');
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  };

  const closeCount = async () => {
    if (!activeCount) return;
    const filled = items.filter(i => localQty[i.id] !== '' && localQty[i.id] != null);
    if (!filled.length) return toast.error('ต้องกรอกจำนวนอย่างน้อย 1 รายการ');
    if (!confirm(`ยืนยันยกยอด? ระบบจะปรับสต๊อกตามจำนวนที่นับ (${filled.length} รายการ)`)) return;
    setClosing(true);
    try {
      const payload = items.map(i => ({
        id: i.id,
        counted_qty: localQty[i.id] !== '' && localQty[i.id] != null ? parseFloat(localQty[i.id]) : null,
      }));
      await stockCountAPI.updateItems(activeCount.id, payload);
      const result = await stockCountAPI.close(activeCount.id);
      toast.success(`ยกยอดสำเร็จ ปรับสต๊อก ${result.adjustCount} รายการ`);
      loadCounts();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setClosing(false); }
  };

  const visibleItems = search.trim()
    ? items.filter(i => i.product_name.toLowerCase().includes(search.toLowerCase()))
    : items;

  const stats = {
    total: items.length,
    counted: items.filter(i => localQty[i.id] !== '' && localQty[i.id] != null).length,
    surplus: items.filter(i => localQty[i.id] != null && localQty[i.id] !== '' && parseFloat(localQty[i.id]) > parseFloat(i.system_qty) + 0.001).length,
    deficit: items.filter(i => localQty[i.id] != null && localQty[i.id] !== '' && parseFloat(localQty[i.id]) < parseFloat(i.system_qty) - 0.001).length,
  };

  if (loading) return <div className="py-20 text-center text-gray-400">กำลังโหลด...</div>;

  if (!activeCount) {
    return (
      <div className="space-y-4">
        <div className="card flex flex-col items-center py-10 text-center">
          <ClipboardList size={48} className="text-gray-300 mb-3" />
          <h2 className="text-xl font-bold text-gray-700 mb-1">ยังไม่มีการนับสต๊อกวันนี้</h2>
          <p className="text-gray-400 text-sm mb-5">กดปุ่มด้านล่างเพื่อเริ่มนับสต๊อกประจำวัน</p>

          {lastClosed && (
            <label className="flex items-center gap-2 mb-5 cursor-pointer select-none">
              <input type="checkbox" checked={carryForward} onChange={e => setCarryForward(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600" />
              <span className="text-sm text-gray-700">
                ยกยอดจากการนับครั้งล่าสุด
                <span className="ml-1 text-blue-600 font-medium">({lastClosed.count_date})</span>
              </span>
            </label>
          )}

          <button onClick={startCount} className="btn-primary flex items-center gap-2 px-6 py-3 text-base">
            {carryForward && lastClosed
              ? <><ArrowRight size={18} /> ยกยอดและเริ่มนับใหม่</>
              : <><Plus size={18} /> เริ่มนับสต๊อกวันนี้</>}
          </button>

          {carryForward && lastClosed && (
            <p className="mt-2 text-xs text-gray-400">ยอดเริ่มต้นจะใช้จำนวนที่นับวันที่ {lastClosed.count_date} แทนยอดระบบ</p>
          )}
        </div>

        {closedCounts.length > 0 && (
          <div className="card">
            <button onClick={() => setShowHistory(!showHistory)} className="flex items-center justify-between w-full text-sm font-medium text-gray-600">
              ประวัติการนับสต๊อก ({closedCounts.length} รายการ)
              {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showHistory && (
              <div className="mt-3 divide-y">
                {closedCounts.map(c => (
                  <div key={c.id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="font-semibold text-gray-800">{c.count_date}</span>
                        <span className="ml-2 text-xs text-gray-400">โดย: {c.created_by_name}</span>
                        {c.notes && <span className="ml-2 text-xs text-blue-500">{c.notes}</span>}
                      </div>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">ยกยอดแล้ว</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      <span>นับแล้ว <strong className="text-gray-700">{c.counted_count}/{c.item_count}</strong> รายการ</span>
                      {c.surplus_count > 0 && <span className="text-green-600">เกิน <strong>{c.surplus_count}</strong> รายการ</span>}
                      {c.deficit_count > 0 && <span className="text-red-600">ขาด <strong>{c.deficit_count}</strong> รายการ</span>}
                      {parseFloat(c.total_diff_cost) > 0 && (
                        <span className="text-orange-600">ผลต่างมูลค่า ฿<strong>{fmt(c.total_diff_cost)}</strong></span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">วันที่ {activeCount.count_date}</span>
            <div className="flex gap-3 text-sm">
              <span className="text-gray-500">ทั้งหมด <strong>{stats.total}</strong></span>
              <span className="text-blue-600">นับแล้ว <strong>{stats.counted}</strong></span>
              {stats.surplus > 0 && <span className="text-green-600">เกิน <strong>{stats.surplus}</strong></span>}
              {stats.deficit > 0 && <span className="text-red-600">ขาด <strong>{stats.deficit}</strong></span>}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="input pl-8 text-sm py-1.5 w-48" placeholder="ค้นหาสินค้า..." />
            </div>
            <button onClick={saveAll} disabled={saving} className="btn-secondary text-sm flex items-center gap-1.5">
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />} บันทึก
            </button>
            <button onClick={closeCount} disabled={closing || stats.counted === 0}
              className="btn-primary text-sm flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-40">
              {closing ? 'กำลังยกยอด...' : '✓ ยกยอด'}
            </button>
          </div>
        </div>
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${stats.total ? (stats.counted / stats.total) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Items table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">#</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">สินค้า</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">ยอดอ้างอิง</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">จำนวนที่นับ</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">ผลต่าง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibleItems.map((item, idx) => {
                const val = localQty[item.id];
                const hasVal = val !== '' && val != null;
                const diff = hasVal ? parseFloat(val) - parseFloat(item.system_qty) : null;
                const diffColor = diff === null ? '' : diff > 0.001 ? 'text-green-600' : diff < -0.001 ? 'text-red-600' : 'text-gray-400';
                return (
                  <tr key={item.id} className={`${hasVal ? (diff !== null && diff < -0.001 ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-gray-50') : 'hover:bg-gray-50 opacity-60'}`}>
                    <td className="px-4 py-2 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {item.image_url
                          ? <img src={item.image_url} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                          : <div className="w-7 h-7 rounded bg-gray-100 flex-shrink-0" />}
                        <div>
                          <p className="font-medium text-gray-900 leading-tight">{item.product_name}</p>
                          <p className="text-xs text-gray-400">{item.unit} · ทุน ฿{fmt(item.cost_price)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-gray-700">{fmtQty(item.system_qty)}</td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number" step="0.001" min="0"
                        value={localQty[item.id] ?? ''}
                        onChange={e => setLocalQty(p => ({ ...p, [item.id]: e.target.value }))}
                        className="w-24 text-right border rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                        placeholder="0.000"
                      />
                    </td>
                    <td className={`px-4 py-2 text-right font-mono font-semibold ${diffColor}`}>
                      {diff !== null ? (diff > 0.001 ? `+${fmtQty(diff)}` : diff < -0.001 ? fmtQty(diff) : '=') : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────── Tab 2: สรุปรายวัน ────────────────────────────

function DailySummaryTab({ branchId }) {
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await stockCountAPI.list({ branch_id: branchId, status: 'closed' });
      setCounts(rows);
    } finally { setLoading(false); }
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!detail[id]) {
      const d = await stockCountAPI.get(id);
      setDetail(p => ({ ...p, [id]: d }));
    }
  };

  if (loading) return <div className="py-20 text-center text-gray-400">กำลังโหลด...</div>;
  if (!counts.length) return <div className="card py-16 text-center text-gray-400 text-sm">ยังไม่มีประวัติการนับสต๊อก</div>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
        {[
          { label: 'รอบนับทั้งหมด', val: counts.length + ' รอบ', color: 'bg-blue-50 text-blue-700' },
          { label: 'รอบที่มีสินค้าขาด', val: counts.filter(c => c.deficit_count > 0).length + ' รอบ', color: 'bg-red-50 text-red-700' },
          { label: 'รอบที่มีสินค้าเกิน', val: counts.filter(c => c.surplus_count > 0).length + ' รอบ', color: 'bg-green-50 text-green-700' },
          { label: 'มูลค่าผลต่างรวม', val: '฿' + fmt(counts.reduce((s, c) => s + parseFloat(c.total_diff_cost || 0), 0)), color: 'bg-orange-50 text-orange-700' },
        ].map(c => (
          <div key={c.label} className={`rounded-xl p-3 ${c.color}`}>
            <p className="text-xs opacity-70 mb-0.5">{c.label}</p>
            <p className="font-bold text-base">{c.val}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="divide-y">
          {counts.map(c => (
            <div key={c.id}>
              <button onClick={() => toggleExpand(c.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left">
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm items-center">
                  <div>
                    <p className="font-semibold text-gray-800">{c.count_date}</p>
                    <p className="text-xs text-gray-400">{c.created_by_name}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400">นับแล้ว</p>
                    <p className="font-bold">{c.counted_count}/{c.item_count}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-red-400 flex items-center justify-center gap-0.5"><TrendingDown size={10} />ขาด</p>
                    <p className={`font-bold ${c.deficit_count > 0 ? 'text-red-600' : 'text-gray-400'}`}>{c.deficit_count}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-green-400 flex items-center justify-center gap-0.5"><TrendingUp size={10} />เกิน</p>
                    <p className={`font-bold ${c.surplus_count > 0 ? 'text-green-600' : 'text-gray-400'}`}>{c.surplus_count}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400">ผลต่างมูลค่า</p>
                    <p className={`font-bold text-sm ${parseFloat(c.total_diff_cost) > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                      ฿{fmt(c.total_diff_cost)}
                    </p>
                  </div>
                </div>
                {expanded === c.id ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
              </button>

              {expanded === c.id && detail[c.id] && (
                <div className="px-4 pb-3 bg-gray-50">
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-gray-400">
                        <th className="text-left py-1.5 font-medium">สินค้า</th>
                        <th className="text-right py-1.5 font-medium">ยอดอ้างอิง</th>
                        <th className="text-right py-1.5 font-medium">นับได้</th>
                        <th className="text-right py-1.5 font-medium">ผลต่าง</th>
                        <th className="text-right py-1.5 font-medium">มูลค่าผลต่าง</th>
                      </tr></thead>
                      <tbody>
                        {(detail[c.id].items || [])
                          .filter(i => i.counted_qty != null)
                          .sort((a, b) => Math.abs(parseFloat(b.counted_qty) - parseFloat(b.system_qty)) - Math.abs(parseFloat(a.counted_qty) - parseFloat(a.system_qty)))
                          .map(i => {
                            const diff = parseFloat(i.counted_qty) - parseFloat(i.system_qty);
                            const cost = Math.abs(diff) * parseFloat(i.cost_price || 0);
                            return (
                              <tr key={i.id} className={`border-t border-gray-100 ${diff < -0.001 ? 'bg-red-50/50' : diff > 0.001 ? 'bg-green-50/50' : ''}`}>
                                <td className="py-1.5 font-medium text-gray-700">{i.product_name}</td>
                                <td className="py-1.5 text-right font-mono text-gray-500">{fmtQty(i.system_qty)}</td>
                                <td className="py-1.5 text-right font-mono text-gray-700">{fmtQty(i.counted_qty)}</td>
                                <td className={`py-1.5 text-right font-mono font-semibold ${diff > 0.001 ? 'text-green-600' : diff < -0.001 ? 'text-red-600' : 'text-gray-400'}`}>
                                  {diff > 0.001 ? `+${fmtQty(diff)}` : diff < -0.001 ? fmtQty(diff) : '='}
                                </td>
                                <td className="py-1.5 text-right font-mono text-orange-600">
                                  {cost > 0.01 ? `฿${fmt(cost)}` : '-'}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────── Tab 3: สต๊อกเสื่อม ──────────────────────────

function DeteriorationTab({ branchId, userId }) {
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState({ product_id: '', quantity: '', reason: '', reason_type: '', cost_price: '', notes: '', deterioration_date: today() });
  const [search, setSearch] = useState('');
  const [searchRes, setSearchRes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dateFrom, setDateFrom] = useState(today());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await deteriorationAPI.list({ branch_id: branchId, date_from: dateFrom });
      setRecords(rows);
    } finally { setLoading(false); }
  }, [branchId, dateFrom]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!search.trim()) { setSearchRes([]); return; }
    const t = setTimeout(async () => {
      const r = await productAPI.all({ search, limit: 10 });
      setSearchRes(Array.isArray(r) ? r : (r.products || []));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const selectProduct = (p) => {
    setForm(f => ({ ...f, product_id: p.id, cost_price: p.cost_price }));
    setSearch(p.name);
    setSearchRes([]);
  };

  const totalCost = records.reduce((s, r) => s + parseFloat(r.total_cost || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_id || !form.quantity) return toast.error('กรุณาเลือกสินค้าและระบุจำนวน');
    const fullReason = [form.reason_type, form.reason].filter(Boolean).join(' — ');
    if (!fullReason) return toast.error('กรุณาระบุสาเหตุการเสื่อม');
    setSaving(true);
    try {
      await deteriorationAPI.create({ ...form, reason: fullReason, branch_id: branchId, user_id: userId });
      toast.success('บันทึกสต๊อกเสื่อมแล้ว');
      setForm({ product_id: '', quantity: '', reason: '', reason_type: '', cost_price: '', notes: '', deterioration_date: today() });
      setSearch('');
      load();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  };

  const REASON_TYPES = [
    { value: 'หมดอายุ', label: '📅 หมดอายุ' },
    { value: 'เสียหาย/แตก', label: '💥 เสียหาย/แตก' },
    { value: 'สัตว์กัด', label: '🐀 สัตว์กัด' },
    { value: 'น้ำท่วม/เปียก', label: '💧 น้ำท่วม/เปียก' },
    { value: 'ราขึ้น/เน่า', label: '🟤 ราขึ้น/เน่า' },
    { value: 'ขนส่งเสียหาย', label: '📦 ขนส่งเสียหาย' },
    { value: 'อื่นๆ', label: '❓ อื่นๆ' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Form */}
      <div className="card">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <AlertTriangle size={16} className="text-orange-500" /> บันทึกสต๊อกเสื่อม
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="label">สินค้า *</label>
            <div className="relative">
              <input value={search} onChange={e => setSearch(e.target.value)} className="input" placeholder="ค้นหาสินค้า..." />
              {searchRes.length > 0 && (
                <div className="absolute top-full left-0 right-0 border rounded-lg bg-white shadow-lg z-20 max-h-44 overflow-y-auto">
                  {searchRes.map(p => (
                    <button key={p.id} type="button" onClick={() => selectProduct(p)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-0 text-sm">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-gray-400">ทุน ฿{fmt(p.cost_price)} | สต๊อก {fmtQty(p.front_stock || 0)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">จำนวน *</label>
              <input type="number" step="0.001" min="0.001" value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="input" placeholder="0.000" required />
            </div>
            <div>
              <label className="label">ราคาทุน/หน่วย</label>
              <input type="number" step="0.01" min="0" value={form.cost_price}
                onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} className="input" placeholder="อัตโนมัติ" />
            </div>
          </div>

          {/* Reason type — required */}
          <div>
            <label className="label">สาเหตุการเสื่อม * <span className="text-red-500">(บังคับเลือก)</span></label>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {REASON_TYPES.map(r => (
                <button key={r.value} type="button"
                  onClick={() => setForm(f => ({ ...f, reason_type: r.value }))}
                  className={`text-xs px-2 py-1.5 rounded-lg border text-left transition-all ${form.reason_type === r.value ? 'bg-orange-500 text-white border-orange-500 font-medium' : 'border-gray-200 text-gray-600 hover:border-orange-300 hover:bg-orange-50'}`}>
                  {r.label}
                </button>
              ))}
            </div>
            <input value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className="input"
              placeholder={form.reason_type === 'อื่นๆ' ? 'ระบุสาเหตุเพิ่มเติม...' : 'รายละเอียดเพิ่มเติม (ถ้ามี)'}
            />
          </div>

          <div>
            <label className="label">วันที่</label>
            <input type="date" value={form.deterioration_date}
              onChange={e => setForm(f => ({ ...f, deterioration_date: e.target.value }))} className="input" />
          </div>

          {form.quantity && form.cost_price && (
            <div className="bg-orange-50 rounded-lg p-2 text-xs text-orange-700 font-medium">
              ต้นทุนที่เสียไป: ฿{fmt(parseFloat(form.quantity || 0) * parseFloat(form.cost_price || 0))}
            </div>
          )}
          <button type="submit" disabled={saving || !form.reason_type} className="btn-primary w-full disabled:opacity-50">
            {saving ? 'กำลังบันทึก...' : 'บันทึกสต๊อกเสื่อม'}
          </button>
        </form>
      </div>

      {/* Records */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">ตั้งแต่:</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input text-sm py-1 w-36" />
          </div>
          {totalCost > 0 && (
            <div className="bg-red-50 rounded-lg px-3 py-1.5 text-sm">
              <span className="text-red-500">รวมต้นทุนที่เสียไป: </span>
              <span className="font-bold text-red-600">฿{fmt(totalCost)}</span>
            </div>
          )}
        </div>
        <div className="card overflow-hidden p-0">
          {loading ? (
            <div className="py-10 text-center text-gray-400">กำลังโหลด...</div>
          ) : records.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">ไม่พบรายการในช่วงวันที่เลือก</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">สินค้า</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">จำนวน</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">ต้นทุน</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">สาเหตุ</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">วันที่</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{r.product_name}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-red-600">-{fmtQty(r.quantity)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-red-600">฿{fmt(r.total_cost)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.reason || '-'}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{r.deterioration_date}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={2} className="px-4 py-2 text-right text-xs font-semibold text-gray-500">รวม</td>
                  <td className="px-4 py-2 text-right font-bold text-red-600">฿{fmt(totalCost)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────── Main Page ─────────────────────────────────────

const TABS = ['นับสต๊อก / ยกยอด', 'สรุปรายวัน', 'สต๊อกเสื่อม'];

export default function StockCountPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">จัดการสต๊อกรายวัน</h1>
        <p className="text-gray-500 text-sm">นับสต๊อก ยกยอด สรุปผลต่าง และบันทึกสต๊อกเสื่อม</p>
      </div>
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === i ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 0 && <StockCountTab branchId={user.branch_id} />}
      {tab === 1 && <DailySummaryTab branchId={user.branch_id} />}
      {tab === 2 && <DeteriorationTab branchId={user.branch_id} userId={user.id} />}
    </div>
  );
}
