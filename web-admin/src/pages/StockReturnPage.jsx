import React, { useState, useEffect } from 'react';
import { stockReturnAPI, salesAPI, productAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Search, Eye, X, RotateCcw } from 'lucide-react';

const today = () => new Date().toISOString().split('T')[0];
const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

export default function StockReturnPage() {
  const { user } = useAuth();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date_from: today(), date_to: today() });
  const [showCreate, setShowCreate] = useState(false);
  const [viewReturn, setViewReturn] = useState(null);

  // Create form
  const [mode, setMode] = useState('receipt'); // 'receipt' | 'manual'
  const [receiptSearch, setReceiptSearch] = useState('');
  const [foundSale, setFoundSale] = useState(null);
  const [items, setItems] = useState([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Manual mode
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);

  const load = () => {
    setLoading(true);
    stockReturnAPI.list({ branch_id: user.branch_id, ...filters })
      .then(setReturns).catch(() => toast.error('โหลดข้อมูลล้มเหลว'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [filters]);

  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return; }
    const t = setTimeout(() => {
      productAPI.all({ q: productSearch, limit: 15 }).then(r => setProductResults(Array.isArray(r) ? r : r.products || [])).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [productSearch]);

  const searchReceipt = async () => {
    if (!receiptSearch.trim()) return;
    try {
      const sales = await salesAPI.list({ branch_id: user.branch_id, q: receiptSearch, limit: 1 });
      if (!sales.sales?.length) return toast.error('ไม่พบบิล');
      const sale = await salesAPI.get(sales.sales[0].id);
      setFoundSale(sale);
      setItems((sale.items || []).map(it => ({ ...it, product_name: it.name || it.product_name, return_qty: it.quantity, unit_price: it.unit_price, selected: true })));
    } catch { toast.error('ไม่พบบิล'); }
  };

  const addManualItem = (product) => {
    setItems(prev => {
      if (prev.find(i => i.product_id === product.id)) return prev;
      return [...prev, { product_id: product.id, product_name: product.name, return_qty: 1, unit_price: product.sell_price, unit: product.unit, selected: true }];
    });
    setProductSearch(''); setProductResults([]);
  };

  const updateItem = (idx, field, val) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));

  const selectedItems = items.filter(i => i.selected);
  const totalRefund = selectedItems.reduce((s, i) => s + (parseFloat(i.unit_price) || 0) * (parseFloat(i.return_qty) || 0), 0);

  const handleCreate = async () => {
    if (!selectedItems.length) return toast.error('เลือกรายการที่ต้องการคืน');
    if (!reason.trim()) return toast.error('ต้องระบุเหตุผล');
    setSaving(true);
    try {
      await stockReturnAPI.create({
        sale_id: foundSale?.id || null,
        branch_id: user.branch_id,
        reason,
        items: selectedItems.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: parseFloat(i.return_qty),
          unit_price: parseFloat(i.unit_price),
        })),
      });
      toast.success('บันทึกคืนสต๊อกสำเร็จ');
      setShowCreate(false);
      setFoundSale(null); setItems([]); setReason(''); setReceiptSearch(''); setMode('receipt');
      load();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  };

  const handleView = async (id) => {
    const r = await stockReturnAPI.get(id);
    setViewReturn(r);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">คืนสต๊อก</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> บันทึกคืนสต๊อก
        </button>
      </div>

      <div className="card mb-4 flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-500">จาก</label>
          <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({...f, date_from: e.target.value}))} className="input text-sm py-1.5" />
          <label className="text-gray-500">ถึง</label>
          <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({...f, date_to: e.target.value}))} className="input text-sm py-1.5" />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>{['เลขคืนสต๊อก','วันที่','อ้างอิงบิลขาย','เหตุผล','ยอดคืน',''].map(h => (
              <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">กำลังโหลด...</td></tr>
              : returns.length === 0 ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">ไม่พบรายการ</td></tr>
              : returns.map(r => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-red-600 font-medium">{r.return_number}</td>
                <td className="px-4 py-3">{new Date(r.created_at).toLocaleDateString('th-TH')}</td>
                <td className="px-4 py-3 text-gray-500">{r.receipt_number || '-'}</td>
                <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{r.reason || '-'}</td>
                <td className="px-4 py-3 font-bold text-red-600">฿{fmt(r.total_refund)}</td>
                <td className="px-4 py-3"><button onClick={() => handleView(r.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Eye size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-lg flex items-center gap-2"><RotateCcw size={18} className="text-red-500" /> บันทึกคืนสต๊อก</h2>
              <button onClick={() => { setShowCreate(false); setFoundSale(null); setItems([]); setReceiptSearch(''); }}><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Mode toggle */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                {[['receipt','อ้างอิงบิลขาย'],['manual','ระบุสินค้าเอง']].map(([v,l]) => (
                  <button key={v} onClick={() => { setMode(v); setFoundSale(null); setItems([]); }}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === v ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>
                    {l}
                  </button>
                ))}
              </div>

              {mode === 'receipt' ? (
                <div>
                  <label className="label">ค้นหาบิลขาย (เลขบิล)</label>
                  <div className="flex gap-2">
                    <input value={receiptSearch} onChange={e => setReceiptSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchReceipt()}
                      className="input flex-1" placeholder="เช่น S2605..." />
                    <button onClick={searchReceipt} className="btn-primary px-4">ค้นหา</button>
                  </div>
                  {foundSale && (
                    <div className="mt-2 text-sm text-green-700 bg-green-50 rounded-lg p-2">
                      พบบิล <strong>{foundSale.receipt_number}</strong> • {new Date(foundSale.created_at).toLocaleDateString('th-TH')} • ฿{fmt(foundSale.total_amount)}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="label">ค้นหาสินค้า</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={productSearch} onChange={e => setProductSearch(e.target.value)} className="input pl-8" placeholder="ชื่อสินค้าหรือ barcode..." />
                  </div>
                  {productResults.length > 0 && (
                    <div className="border rounded-lg mt-1 max-h-36 overflow-y-auto bg-white shadow-sm">
                      {productResults.map(p => (
                        <button key={p.id} onClick={() => addManualItem(p)}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 text-left border-b last:border-0 text-sm">
                          <span>{p.name}</span><span className="text-gray-400">฿{fmt(p.sell_price)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Items list */}
              {items.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50"><tr>
                      <th className="text-left px-3 py-2 w-6"></th>
                      <th className="text-left px-3 py-2">สินค้า</th>
                      <th className="text-right px-3 py-2 w-28">จำนวนคืน</th>
                      <th className="text-right px-3 py-2 w-28">ราคา/หน่วย</th>
                      <th className="text-right px-3 py-2 w-28">รวม</th>
                    </tr></thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i} className={`border-t ${!it.selected ? 'opacity-40' : ''}`}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={it.selected} onChange={e => updateItem(i, 'selected', e.target.checked)} />
                          </td>
                          <td className="px-3 py-2">{it.product_name}</td>
                          <td className="px-3 py-2">
                            <input type="number" value={it.return_qty} onChange={e => updateItem(i, 'return_qty', parseFloat(e.target.value)||0)}
                              className="input text-sm py-1 text-right w-full" min="0.001" step="0.001" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={it.unit_price} onChange={e => updateItem(i, 'unit_price', parseFloat(e.target.value)||0)}
                              className="input text-sm py-1 text-right w-full" min="0" step="0.01" />
                          </td>
                          <td className="px-3 py-2 font-bold text-right text-red-600">
                            ฿{fmt((it.unit_price||0)*(it.return_qty||0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right font-semibold">ยอดคืนรวม</td>
                        <td className="px-3 py-2 font-bold text-right text-red-600">฿{fmt(totalRefund)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <div>
                <label className="label">เหตุผลการคืน *</label>
                <textarea className="input" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="เช่น สินค้าเสียหาย, ลูกค้าเปลี่ยนใจ..." />
              </div>
            </div>
            <div className="p-5 border-t flex justify-between items-center">
              <span className="font-bold text-red-600">ยอดคืน ฿{fmt(totalRefund)}</span>
              <div className="flex gap-3">
                <button onClick={() => { setShowCreate(false); setFoundSale(null); setItems([]); setReceiptSearch(''); }} className="btn-secondary">ยกเลิก</button>
                <button onClick={handleCreate} disabled={saving} className="btn-primary">{saving ? 'กำลังบันทึก...' : 'บันทึกคืนสต๊อก'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewReturn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-semibold text-lg">{viewReturn.return_number}</h2>
                <p className="text-sm text-gray-500">{viewReturn.receipt_number ? `อ้างอิงบิล ${viewReturn.receipt_number}` : 'ไม่อ้างอิงบิล'} • {new Date(viewReturn.created_at).toLocaleDateString('th-TH')}</p>
              </div>
              <button onClick={() => setViewReturn(null)}><X size={20} /></button>
            </div>
            <div className="p-5">
              {viewReturn.reason && <p className="text-sm text-gray-600 mb-3 bg-gray-50 rounded-lg p-2">เหตุผล: {viewReturn.reason}</p>}
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left py-1">สินค้า</th><th className="text-right py-1">จำนวน</th><th className="text-right py-1">ราคา</th><th className="text-right py-1">รวม</th></tr></thead>
                <tbody>{(viewReturn.items || []).map((it, i) => (
                  <tr key={i} className="border-b"><td className="py-2">{it.product_name}</td><td className="text-right">{it.quantity} {it.unit}</td><td className="text-right">฿{fmt(it.unit_price)}</td><td className="text-right font-bold text-red-600">฿{fmt(it.subtotal)}</td></tr>
                ))}</tbody>
                <tfoot><tr><td colSpan={3} className="text-right pt-3 font-semibold">ยอดคืนรวม</td><td className="text-right pt-3 font-bold text-red-600">฿{fmt(viewReturn.total_refund)}</td></tr></tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
