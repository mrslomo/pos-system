import React, { useState, useEffect } from 'react';
import { purchaseBillAPI, productAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Search, Eye, Trash2, X, ChevronDown } from 'lucide-react';

const today = () => new Date().toISOString().split('T')[0];

export default function PurchaseBillsPage() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date_from: today(), date_to: today(), q: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [viewBill, setViewBill] = useState(null);

  // Create form state
  const [supplier, setSupplier] = useState('');
  const [billDate, setBillDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    purchaseBillAPI.list({ ...filters, branch_id: user.branch_id })
      .then(setBills).catch(() => toast.error('โหลดข้อมูลล้มเหลว'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filters]);

  useEffect(() => {
    if (!productSearch.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      productAPI.all({ q: productSearch, limit: 20 }).then(r => setSearchResults(Array.isArray(r) ? r : r.products || [])).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [productSearch]);

  const addItem = (product) => {
    setItems(prev => {
      const ex = prev.find(i => i.product_id === product.id);
      if (ex) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, product_name: product.name, barcode: product.barcode, unit: product.unit, quantity: 1, unit_cost: product.cost_price || 0 }];
    });
    setProductSearch(''); setSearchResults([]);
  };

  const updateItem = (idx, field, val) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const totalAmount = items.reduce((s, i) => s + (parseFloat(i.unit_cost) || 0) * (parseFloat(i.quantity) || 0), 0);

  const handleCreate = async () => {
    if (!items.length) return toast.error('ต้องมีรายการสินค้า');
    setSaving(true);
    try {
      await purchaseBillAPI.create({ supplier_name: supplier, branch_id: user.branch_id, items, notes, bill_date: billDate });
      toast.success('สร้างบิลเข้าสำเร็จ');
      setShowCreate(false); setItems([]); setSupplier(''); setNotes('');
      load();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  };

  const handleView = async (id) => {
    const bill = await purchaseBillAPI.get(id);
    setViewBill(bill);
  };

  const handleCancel = async (id) => {
    if (!window.confirm('ยืนยันยกเลิกบิลนี้?')) return;
    try {
      await purchaseBillAPI.cancel(id);
      toast.success('ยกเลิกบิลแล้ว');
      load();
    } catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">บิลเข้า (รับสินค้า)</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> สร้างบิลเข้า
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-500">จาก</label>
          <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({...f, date_from: e.target.value}))} className="input text-sm py-1.5" />
          <label className="text-gray-500">ถึง</label>
          <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({...f, date_to: e.target.value}))} className="input text-sm py-1.5" />
        </div>
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={filters.q} onChange={e => setFilters(f => ({...f, q: e.target.value}))} className="input pl-8 text-sm py-1.5" placeholder="ค้นหาเลขบิล, ผู้ขาย..." />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['เลขบิล','วันที่','ผู้ขาย/ซัพพลายเออร์','รายการ','ยอดรวม','สถานะ',''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">กำลังโหลด...</td></tr>
            ) : bills.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">ไม่พบบิล</td></tr>
            ) : bills.map(b => (
              <tr key={b.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-blue-600 font-medium">{b.bill_number}</td>
                <td className="px-4 py-3">{b.bill_date}</td>
                <td className="px-4 py-3">{b.supplier_name || '-'}</td>
                <td className="px-4 py-3">{b.item_count} รายการ</td>
                <td className="px-4 py-3 font-bold">฿{fmt(b.total_amount)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {b.status === 'received' ? 'รับแล้ว' : 'ยกเลิก'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => handleView(b.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Eye size={14} /></button>
                    {b.status === 'received' && (
                      <button onClick={() => handleCancel(b.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-lg">สร้างบิลเข้าใหม่</h2>
              <button onClick={() => setShowCreate(false)}><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><label className="label">ผู้ขาย / ซัพพลายเออร์</label><input className="input" value={supplier} onChange={e => setSupplier(e.target.value)} /></div>
                <div><label className="label">วันที่บิล</label><input type="date" className="input" value={billDate} onChange={e => setBillDate(e.target.value)} /></div>
              </div>

              {/* Product search */}
              <div>
                <label className="label">เพิ่มสินค้า</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={productSearch} onChange={e => setProductSearch(e.target.value)} className="input pl-8" placeholder="ค้นหาสินค้า..." />
                </div>
                {searchResults.length > 0 && (
                  <div className="border rounded-lg mt-1 max-h-40 overflow-y-auto bg-white shadow-sm">
                    {searchResults.map(p => (
                      <button key={p.id} onClick={() => addItem(p)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 text-left border-b last:border-0 text-sm">
                        <span>{p.name} <span className="text-gray-400 text-xs">{p.barcode}</span></span>
                        <span className="text-gray-500">ต้นทุน: ฿{fmt(p.cost_price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Items table */}
              {items.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['สินค้า','จำนวน','หน่วย','ราคาต่อหน่วย','รวม',''].map(h => (
                          <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2">{it.product_name}</td>
                          <td className="px-3 py-2 w-24">
                            <input type="number" value={it.quantity} onChange={e => updateItem(i, 'quantity', parseFloat(e.target.value)||0)} className="input text-sm py-1 w-full" min="0.001" step="0.001" />
                          </td>
                          <td className="px-3 py-2 text-gray-500">{it.unit}</td>
                          <td className="px-3 py-2 w-32">
                            <input type="number" value={it.unit_cost} onChange={e => updateItem(i, 'unit_cost', parseFloat(e.target.value)||0)} className="input text-sm py-1 w-full" min="0" step="0.01" />
                          </td>
                          <td className="px-3 py-2 font-bold">฿{fmt((it.unit_cost||0)*(it.quantity||0))}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right font-semibold">รวมทั้งสิ้น</td>
                        <td className="px-3 py-2 font-bold text-blue-600">฿{fmt(totalAmount)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <div><label className="label">หมายเหตุ</label><textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
            </div>
            <div className="p-5 border-t flex justify-between items-center">
              <span className="text-lg font-bold text-blue-600">ยอดรวม ฿{fmt(totalAmount)}</span>
              <div className="flex gap-3">
                <button onClick={() => setShowCreate(false)} className="btn-secondary">ยกเลิก</button>
                <button onClick={handleCreate} disabled={saving} className="btn-primary">{saving ? 'กำลังบันทึก...' : 'สร้างบิล + รับสินค้า'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Bill Modal */}
      {viewBill && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-semibold text-lg">{viewBill.bill_number}</h2>
                <p className="text-sm text-gray-500">{viewBill.supplier_name || 'ไม่ระบุผู้ขาย'} • {viewBill.bill_date}</p>
              </div>
              <button onClick={() => setViewBill(null)}><X size={20} /></button>
            </div>
            <div className="p-5">
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left py-1">สินค้า</th><th className="text-right py-1">จำนวน</th><th className="text-right py-1">ราคา</th><th className="text-right py-1">รวม</th></tr></thead>
                <tbody>
                  {(viewBill.items || []).map((it, i) => (
                    <tr key={i} className="border-b"><td className="py-2">{it.product_name}</td><td className="text-right py-2">{it.quantity} {it.unit}</td><td className="text-right py-2">฿{fmt(it.unit_cost)}</td><td className="text-right py-2 font-bold">฿{fmt(it.subtotal)}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3} className="text-right pt-3 font-semibold">รวม</td><td className="text-right pt-3 font-bold text-blue-600">฿{fmt(viewBill.total_amount)}</td></tr></tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
