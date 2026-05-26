import React, { useState, useEffect } from 'react';
import { deliveryBillAPI, partnerAPI, productAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Search, Eye, Tag, X, Check } from 'lucide-react';

const today = () => new Date().toISOString().split('T')[0];

export default function DeliveryBillsPage() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date_from: today(), date_to: today(), q: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [viewBill, setViewBill] = useState(null);

  // Create form
  const [partners, setPartners] = useState([]);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [billDate, setBillDate] = useState(today());
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    deliveryBillAPI.list({ ...filters, branch_id: user.branch_id })
      .then(setBills).catch(() => toast.error('โหลดข้อมูลล้มเหลว'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filters]);
  useEffect(() => {
    partnerAPI.list({ is_active: true }).then(setPartners).catch(() => {});
  }, []);

  useEffect(() => {
    if (!productSearch.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      productAPI.all({ q: productSearch, limit: 20 }).then(r => setSearchResults(Array.isArray(r) ? r : r.products || [])).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [productSearch]);

  const addItem = async (product) => {
    let price = parseFloat(product.sell_price || 0);
    // Check partner special price
    if (selectedPartner) {
      try {
        const pp = await partnerAPI.getPrice(selectedPartner.id, product.id);
        if (pp?.special_price) price = parseFloat(pp.special_price);
      } catch {}
    }
    setItems(prev => {
      const ex = prev.find(i => i.product_id === product.id);
      if (ex) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, product_name: product.name, barcode: product.barcode, unit: product.unit, quantity: 1, unit_price: price, cost_price: product.cost_price || 0 }];
    });
    setProductSearch(''); setSearchResults([]);
  };

  const updateItem = (idx, field, val) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + (parseFloat(i.unit_price) || 0) * (parseFloat(i.quantity) || 0), 0);
  const total = Math.max(0, subtotal - parseFloat(discount || 0));

  const handleCreate = async () => {
    if (!items.length) return toast.error('ต้องมีรายการสินค้า');
    setSaving(true);
    try {
      await deliveryBillAPI.create({
        partner_id: selectedPartner?.id || null,
        partner_name: selectedPartner?.name || null,
        branch_id: user.branch_id,
        items,
        discount_amount: parseFloat(discount || 0),
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        notes,
        bill_date: billDate,
      });
      toast.success('สร้างบิลออกสำเร็จ');
      setShowCreate(false); setItems([]); setSelectedPartner(null); setPartnerSearch(''); setDiscount(0); setNotes('');
      load();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  };

  const handleView = async (id) => {
    const bill = await deliveryBillAPI.get(id);
    setViewBill(bill);
  };

  const handleUpdatePayment = async (id, status) => {
    try {
      await deliveryBillAPI.updatePayment(id, status);
      toast.success('อัปเดตสถานะแล้ว');
      load();
    } catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  const filteredPartners = partners.filter(p => p.name.toLowerCase().includes(partnerSearch.toLowerCase()) || p.code?.includes(partnerSearch));

  const statusBadge = (s) => s === 'paid' ? 'bg-green-100 text-green-700' : s === 'partial' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700';
  const statusLabel = (s) => s === 'paid' ? 'ชำระแล้ว' : s === 'partial' ? 'ชำระบางส่วน' : 'ค้างชำระ';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">บิลออก (ส่งสินค้า / ค้าส่ง)</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> สร้างบิลออก
        </button>
      </div>

      <div className="card mb-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-500">จาก</label>
          <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({...f, date_from: e.target.value}))} className="input text-sm py-1.5" />
          <label className="text-gray-500">ถึง</label>
          <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({...f, date_to: e.target.value}))} className="input text-sm py-1.5" />
        </div>
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={filters.q} onChange={e => setFilters(f => ({...f, q: e.target.value}))} className="input pl-8 text-sm py-1.5" placeholder="ค้นหาเลขบิล..." />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['เลขบิล','วันที่','คู่ค้า','รายการ','ยอดสุทธิ','ชำระ',''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">กำลังโหลด...</td></tr>
            ) : bills.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">ไม่พบบิล</td></tr>
            ) : bills.map(b => {
              const unpaid = b.payment_status !== 'paid';
              return (
              <tr key={b.id} className={`border-b hover:bg-gray-50 ${unpaid ? 'bg-red-50/40' : ''}`}>
                <td className="px-4 py-3 font-mono font-medium text-blue-600">{b.bill_number}</td>
                <td className="px-4 py-3">{b.bill_date}</td>
                <td className="px-4 py-3 font-medium">{b.partner_name || <span className="text-gray-400">ลูกค้าทั่วไป</span>}</td>
                <td className="px-4 py-3">{b.item_count} รายการ</td>
                <td className={`px-4 py-3 font-bold ${unpaid ? 'text-red-600' : 'text-gray-800'}`}>฿{fmt(b.total_amount)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(b.payment_status)}`}>
                    {statusLabel(b.payment_status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => handleView(b.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Eye size={14} /></button>
                    {b.payment_status === 'credit' && (
                      <button onClick={() => handleUpdatePayment(b.id, 'paid')} title="ทำเครื่องหมายว่าชำระแล้ว"
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"><Check size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-lg">สร้างบิลออก</h2>
              <button onClick={() => setShowCreate(false)}><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Partner select */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="label">คู่ค้า</label>
                  <div className="relative">
                    <input value={selectedPartner ? selectedPartner.name : partnerSearch}
                      onChange={e => { setPartnerSearch(e.target.value); setSelectedPartner(null); }}
                      className="input" placeholder="ค้นหาคู่ค้า หรือเว้นว่างสำหรับลูกค้าทั่วไป..." />
                    {selectedPartner && (
                      <button onClick={() => { setSelectedPartner(null); setPartnerSearch(''); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
                    )}
                  </div>
                  {!selectedPartner && partnerSearch && filteredPartners.length > 0 && (
                    <div className="border rounded-lg mt-1 max-h-36 overflow-y-auto bg-white shadow-sm">
                      {filteredPartners.slice(0, 8).map(p => (
                        <button key={p.id} onClick={() => { setSelectedPartner(p); setPartnerSearch(''); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0 flex items-center gap-2">
                          <Tag size={12} className="text-orange-400" />
                          <span>{p.name}</span><span className="text-gray-400 text-xs ml-auto">{p.code}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedPartner && <p className="text-xs text-orange-600 mt-1">ราคาพิเศษจะถูกใช้อัตโนมัติ</p>}
                </div>
                <div>
                  <label className="label">วันที่บิล</label>
                  <input type="date" className="input" value={billDate} onChange={e => setBillDate(e.target.value)} />
                </div>
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
                      <button key={p.id} onClick={() => addItem(p)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 text-left border-b last:border-0 text-sm">
                        <span>{p.name}</span>
                        <span className="text-blue-600 font-medium">฿{fmt(p.sell_price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {items.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>{['สินค้า','จำนวน','หน่วย','ราคา/หน่วย','รวม',''].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2">{it.product_name}</td>
                          <td className="px-3 py-2 w-24"><input type="number" value={it.quantity} onChange={e => updateItem(i, 'quantity', parseFloat(e.target.value)||0)} className="input text-sm py-1 w-full" min="0.001" step="0.001" /></td>
                          <td className="px-3 py-2 text-gray-500">{it.unit}</td>
                          <td className="px-3 py-2 w-32"><input type="number" value={it.unit_price} onChange={e => updateItem(i, 'unit_price', parseFloat(e.target.value)||0)} className="input text-sm py-1 w-full" min="0" step="0.01" /></td>
                          <td className="px-3 py-2 font-bold">฿{fmt((it.unit_price||0)*(it.quantity||0))}</td>
                          <td className="px-3 py-2"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><X size={14} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">ส่วนลด (฿)</label><input type="number" className="input" value={discount} onChange={e => setDiscount(parseFloat(e.target.value)||0)} min="0" /></div>
                <div>
                  <label className="label">วิธีชำระ</label>
                  <select className="input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    <option value="cash">เงินสด</option><option value="transfer">โอน</option><option value="credit">เครดิต</option>
                  </select>
                </div>
                <div>
                  <label className="label">สถานะ</label>
                  <select className="input" value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                    <option value="paid">ชำระแล้ว</option><option value="credit">เครดิต</option><option value="partial">ชำระบางส่วน</option>
                  </select>
                </div>
              </div>

              <div><label className="label">หมายเหตุ</label><textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
            </div>
            <div className="p-5 border-t flex justify-between items-center">
              <div className="text-sm space-y-0.5">
                <div className="flex justify-between gap-8 text-gray-500"><span>ยอดรวม</span><span>฿{fmt(subtotal)}</span></div>
                {discount > 0 && <div className="flex justify-between gap-8 text-gray-500"><span>ส่วนลด</span><span>-฿{fmt(discount)}</span></div>}
                <div className="flex justify-between gap-8 font-bold text-blue-600 text-base"><span>ยอดสุทธิ</span><span>฿{fmt(total)}</span></div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCreate(false)} className="btn-secondary">ยกเลิก</button>
                <button onClick={handleCreate} disabled={saving} className="btn-primary">{saving ? 'กำลังบันทึก...' : 'สร้างบิลออก'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewBill && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-semibold text-lg">{viewBill.bill_number}</h2>
                <p className="text-sm text-gray-500">{viewBill.partner_name || 'ลูกค้าทั่วไป'} • {viewBill.bill_date}</p>
              </div>
              <button onClick={() => setViewBill(null)}><X size={20} /></button>
            </div>
            <div className="p-5">
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left py-1">สินค้า</th><th className="text-right py-1">จำนวน</th><th className="text-right py-1">ราคา</th><th className="text-right py-1">รวม</th></tr></thead>
                <tbody>{(viewBill.items || []).map((it, i) => (
                  <tr key={i} className="border-b"><td className="py-2">{it.product_name}</td><td className="text-right">{it.quantity} {it.unit}</td><td className="text-right">฿{fmt(it.unit_price)}</td><td className="text-right font-bold">฿{fmt(it.subtotal)}</td></tr>
                ))}</tbody>
                <tfoot>
                  <tr><td colSpan={3} className="text-right pt-2 text-gray-500">ยอดรวม</td><td className="text-right pt-2">฿{fmt(viewBill.subtotal)}</td></tr>
                  {parseFloat(viewBill.discount_amount) > 0 && <tr><td colSpan={3} className="text-right text-gray-500">ส่วนลด</td><td className="text-right">-฿{fmt(viewBill.discount_amount)}</td></tr>}
                  <tr><td colSpan={3} className="text-right font-semibold">ยอดสุทธิ</td><td className="text-right font-bold text-blue-600">฿{fmt(viewBill.total_amount)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
