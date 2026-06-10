import React, { useState, useEffect } from 'react';
import { partnerAPI, productAPI, deliveryBillAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Search, Edit2, Tag, X, Check, Trash2, ShoppingCart, Pencil } from 'lucide-react';

const EMPTY_FORM = { name: '', phone: '', address: '', tax_id: '', credit_days: 0, notes: '' };
const UNITS = [['kg','kg'],['g','g'],['piece','ชิ้น'],['pack','แพค'],['box','กล่อง'],['bag','ถุง'],['bottle','ขวด'],['bunch','มัด']];
const today = () => new Date().toISOString().split('T')[0];

export default function PartnersPage() {
  const { user } = useAuth();
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editPartner, setEditPartner] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Price modal
  const [priceModal, setPriceModal] = useState(null);
  const [products, setProducts] = useState([]);
  const [priceSearch, setPriceSearch] = useState('');
  const [priceForm, setPriceForm] = useState({ product_id: '', special_price: '', min_qty: 1, unit: '' });
  const [editingPriceId, setEditingPriceId] = useState(null); // product_id being edited

  // Bill modal
  const [billModal, setBillModal] = useState(null);
  const [billItems, setBillItems] = useState([]);
  const [billDiscount, setBillDiscount] = useState(0);
  const [billPaymentMethod, setBillPaymentMethod] = useState('cash');
  const [billPaymentStatus, setBillPaymentStatus] = useState('paid');
  const [billNotes, setBillNotes] = useState('');
  const [billDate, setBillDate] = useState(today());
  const [billProductSearch, setBillProductSearch] = useState('');
  const [billSearchResults, setBillSearchResults] = useState([]);
  const [billSaving, setBillSaving] = useState(false);

  const load = () => {
    setLoading(true);
    partnerAPI.list({ q: search || undefined })
      .then(setPartners).catch(() => toast.error('โหลดข้อมูลล้มเหลว'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Bill product search
  useEffect(() => {
    if (!billProductSearch.trim()) { setBillSearchResults([]); return; }
    const t = setTimeout(() => {
      productAPI.all({ q: billProductSearch, limit: 20 })
        .then(r => setBillSearchResults(Array.isArray(r) ? r : r.products || []))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [billProductSearch]);

  const openCreate = () => { setEditPartner(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (p) => { setEditPartner(p); setForm({ name: p.name, phone: p.phone || '', address: p.address || '', tax_id: p.tax_id || '', credit_days: p.credit_days || 0, notes: p.notes || '' }); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name) return toast.error('ต้องระบุชื่อ');
    setSaving(true);
    try {
      if (editPartner) {
        await partnerAPI.update(editPartner.id, form);
        toast.success('แก้ไขสำเร็จ');
      } else {
        await partnerAPI.create(form);
        toast.success('เพิ่มคู่ค้าสำเร็จ');
      }
      setShowForm(false);
      load();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  };

  const loadProducts = async () => {
    if (!products.length) {
      const list = await productAPI.all({ limit: 500 });
      setProducts(Array.isArray(list) ? list : list.products || []);
    }
  };

  const openPrices = async (p) => {
    setPriceModal(p);
    const full = await partnerAPI.get(p.id);
    setPriceModal({ ...p, special_prices: full.special_prices || [] });
    await loadProducts();
  };

  const openBill = async (partner) => {
    setBillModal({ ...partner, special_prices: [] });
    setBillItems([]);
    setBillDiscount(0);
    setBillPaymentMethod(partner.credit_days > 0 ? 'credit' : 'cash');
    setBillPaymentStatus(partner.credit_days > 0 ? 'credit' : 'paid');
    setBillNotes('');
    setBillDate(today());
    setBillProductSearch('');
    setBillSearchResults([]);
    const [full] = await Promise.all([partnerAPI.get(partner.id), loadProducts()]);
    setBillModal({ ...partner, special_prices: full.special_prices || [] });
  };

  const handleAddPrice = async () => {
    if (!priceForm.product_id || !priceForm.special_price) return toast.error('ระบุสินค้าและราคา');
    try {
      await partnerAPI.addPrice(priceModal.id, priceForm);
      toast.success(editingPriceId ? 'แก้ไขราคาพิเศษแล้ว' : 'บันทึกราคาพิเศษแล้ว');
      const full = await partnerAPI.get(priceModal.id);
      setPriceModal({ ...priceModal, special_prices: full.special_prices || [] });
      setPriceForm({ product_id: '', special_price: '', min_qty: 1, unit: '' });
      setEditingPriceId(null);
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
  };

  const startEditPrice = (pp) => {
    setPriceForm({ product_id: pp.product_id, special_price: String(pp.special_price), min_qty: pp.min_qty, unit: pp.unit || '' });
    setEditingPriceId(pp.product_id);
    // scroll product list to top so user sees the selected item
    setPriceSearch('');
  };

  const handleRemovePrice = async (product_id, unit) => {
    try {
      await partnerAPI.removePrice(priceModal.id, product_id, unit);
      toast.success('ลบราคาพิเศษแล้ว');
      setPriceModal(prev => ({ ...prev, special_prices: prev.special_prices.filter(p => !(p.product_id === product_id && p.unit === unit)) }));
    } catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  const addBillItem = (product, overridePrice) => {
    const price = overridePrice ?? parseFloat(product.sell_price || 0);
    setBillItems(prev => {
      const ex = prev.find(i => i.product_id === product.id);
      if (ex) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, product_name: product.name, barcode: product.barcode, unit: product.unit, quantity: 1, unit_price: price, cost_price: product.cost_price || 0 }];
    });
    setBillProductSearch('');
    setBillSearchResults([]);
  };

  const addBillItemFromSpecial = (sp) => {
    const prod = products.find(p => p.id === sp.product_id);
    if (!prod) return;
    addBillItem(prod, parseFloat(sp.special_price));
  };

  const updateBillItem = (idx, field, val) => setBillItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  const removeBillItem = (idx) => setBillItems(prev => prev.filter((_, i) => i !== idx));

  const billSubtotal = billItems.reduce((s, i) => s + (parseFloat(i.unit_price) || 0) * (parseFloat(i.quantity) || 0), 0);
  const billTotal = Math.max(0, billSubtotal - parseFloat(billDiscount || 0));

  const handleCreateBill = async () => {
    if (!billItems.length) return toast.error('ต้องมีรายการสินค้า');
    setBillSaving(true);
    try {
      await deliveryBillAPI.create({
        partner_id: billModal.id,
        partner_name: billModal.name,
        branch_id: user?.branch_id,
        items: billItems,
        discount_amount: parseFloat(billDiscount || 0),
        payment_method: billPaymentMethod,
        payment_status: billPaymentStatus,
        notes: billNotes,
        bill_date: billDate,
      });
      toast.success('สร้างบิลออกสำเร็จ');
      setBillModal(null);
      load();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setBillSaving(false); }
  };

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(priceSearch.toLowerCase()) || p.barcode?.includes(priceSearch));
  const selectedProductUnit = products.find(p => p.id === priceForm.product_id)?.unit || '';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">คู่ค้า (ค้าส่ง)</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> เพิ่มคู่ค้า
        </button>
      </div>

      <div className="card mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" placeholder="ค้นหาชื่อ, รหัส, เบอร์โทร..." />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['รหัส','ชื่อคู่ค้า','เบอร์โทร','เครดิต (วัน)','จำนวนบิล',''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-400">กำลังโหลด...</td></tr>
            ) : partners.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-400">ไม่มีคู่ค้า</td></tr>
            ) : partners.map(p => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.code}</td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-gray-600">{p.phone || '-'}</td>
                <td className="px-4 py-3">{p.credit_days} วัน</td>
                <td className="px-4 py-3">{p.bill_count || 0} บิล</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openBill(p)} className="flex items-center gap-1 text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">
                      <ShoppingCart size={12} /> สั่งสินค้า
                    </button>
                    <button onClick={() => openPrices(p)} className="flex items-center gap-1 text-xs px-2 py-1 bg-orange-50 text-orange-600 rounded hover:bg-orange-100">
                      <Tag size={12} /> ราคาพิเศษ
                    </button>
                    <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <Edit2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-lg">{editPartner ? 'แก้ไขคู่ค้า' : 'เพิ่มคู่ค้าใหม่'}</h2>
              <button onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="label">ชื่อคู่ค้า *</label><input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} /></div>
              <div><label className="label">เบอร์โทร</label><input className="input" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} /></div>
              <div><label className="label">ที่อยู่</label><textarea className="input" rows={2} value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">เลขผู้เสียภาษี</label><input className="input" value={form.tax_id} onChange={e => setForm(f => ({...f, tax_id: e.target.value}))} /></div>
                <div><label className="label">เครดิต (วัน)</label><input type="number" className="input" value={form.credit_days} onChange={e => setForm(f => ({...f, credit_days: parseInt(e.target.value)||0}))} min="0" /></div>
              </div>
              <div><label className="label">หมายเหตุ</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} /></div>
            </div>
            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={() => setShowForm(false)} className="btn-secondary">ยกเลิก</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Special Prices Modal */}
      {priceModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-lg">ราคาพิเศษ — {priceModal.name}</h2>
              <button onClick={() => setPriceModal(null)}><X size={20} /></button>
            </div>

            {/* Add new price */}
            <div className="p-4 border-b bg-gray-50 flex gap-3">
              {/* Product list */}
              <div className="flex-1 flex flex-col min-w-0">
                <input placeholder="ค้นหาสินค้า..." value={priceSearch} onChange={e => setPriceSearch(e.target.value)} className="input text-sm mb-1.5" />
                <div className="border rounded bg-white overflow-y-auto" style={{maxHeight:'180px'}}>
                  {filteredProducts.length === 0 ? (
                    <p className="text-center text-gray-400 text-xs py-3">ไม่พบสินค้า</p>
                  ) : filteredProducts.map(p => {
                    const selected = priceForm.product_id === p.id;
                    const alreadySet = (priceModal.special_prices || []).some(sp => sp.product_id === p.id && sp.unit === (priceForm.product_id === p.id ? (priceForm.unit || p.unit) : p.unit));
                    return (
                      <button key={p.id}
                        onClick={() => setPriceForm(f => ({
                          ...f,
                          product_id: selected ? '' : p.id,
                          unit: selected ? '' : (p.unit || 'kg'),
                        }))}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm border-b last:border-0 text-left transition-colors ${selected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50'}`}>
                        {p.image_url && <img src={p.image_url} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />}
                        <span className="flex-1 truncate font-medium">{p.name}</span>
                        {alreadySet && <span className="text-xs text-orange-500">มีแล้ว</span>}
                        <span className="text-gray-400 text-xs flex-shrink-0">฿{fmt(p.sell_price)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Price inputs */}
              <div className="flex flex-col gap-2 w-36 flex-shrink-0">
                <div>
                  <p className="text-xs text-gray-500 mb-1">ราคาพิเศษ</p>
                  <input type="number" placeholder="ราคา" value={priceForm.special_price}
                    onChange={e => setPriceForm(f => ({...f, special_price: e.target.value}))}
                    className="input text-sm" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">หน่วย</p>
                  <select value={priceForm.unit || selectedProductUnit}
                    onChange={e => setPriceForm(f => ({...f, unit: e.target.value}))}
                    className="input text-sm" disabled={!priceForm.product_id}>
                    {UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">ขั้นต่ำ</p>
                  <input type="number" placeholder="1" value={priceForm.min_qty}
                    onChange={e => setPriceForm(f => ({...f, min_qty: parseFloat(e.target.value)||1}))}
                    className="input text-sm" />
                </div>
                {editingPriceId && (
                  <button onClick={() => { setPriceForm({ product_id: '', special_price: '', min_qty: 1, unit: '' }); setEditingPriceId(null); }}
                    className="btn-secondary text-xs flex items-center justify-center gap-1">
                    <X size={12} /> ยกเลิก
                  </button>
                )}
                <button onClick={handleAddPrice} disabled={!priceForm.product_id || !priceForm.special_price}
                  className={`text-sm flex items-center justify-center gap-1 mt-auto ${editingPriceId ? 'btn-secondary border-orange-400 text-orange-600 hover:bg-orange-50' : 'btn-primary'}`}>
                  <Check size={14} /> {editingPriceId ? 'บันทึกการแก้ไข' : 'บันทึก'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {['สินค้า','ราคาปกติ','ราคาพิเศษ','ขั้นต่ำ',''].map(h => (
                      <th key={h} className="text-left px-4 py-2 font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(priceModal.special_prices || []).length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400">ยังไม่มีราคาพิเศษ</td></tr>
                  ) : (priceModal.special_prices || []).map(pp => (
                    <tr key={`${pp.product_id}_${pp.unit}`} className={`border-b hover:bg-gray-50 ${editingPriceId === pp.product_id && priceForm.unit === pp.unit ? 'bg-orange-50' : ''}`}>
                      <td className="px-4 py-2">{pp.product_name}</td>
                      <td className="px-4 py-2 text-gray-500">฿{fmt(pp.default_price)}</td>
                      <td className="px-4 py-2 font-bold text-orange-600">฿{fmt(pp.special_price)}</td>
                      <td className="px-4 py-2">{parseFloat(pp.min_qty)} {pp.unit}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => startEditPrice(pp)} className="text-gray-400 hover:text-orange-600 p-0.5" title="แก้ไข">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleRemovePrice(pp.product_id, pp.unit)} className="text-gray-400 hover:text-red-600 p-0.5" title="ลบ">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Bill Modal */}
      {billModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-6 flex flex-col">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <ShoppingCart size={18} className="text-green-600" />
                  สั่งสินค้า — {billModal.name}
                </h2>
                {billModal.credit_days > 0 && <p className="text-xs text-orange-500 mt-0.5">เครดิต {billModal.credit_days} วัน</p>}
              </div>
              <button onClick={() => setBillModal(null)}><X size={20} /></button>
            </div>

            <div className="flex gap-0 divide-x flex-1">
              {/* Left: product selection */}
              <div className="w-80 flex-shrink-0 flex flex-col p-4 gap-3">
                {/* Special price products */}
                {(billModal.special_prices || []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-orange-600 mb-1.5">ราคาพิเศษ</p>
                    <div className="border rounded overflow-y-auto" style={{maxHeight:'220px'}}>
                      {(billModal.special_prices || []).map(sp => (
                        <button key={sp.product_id}
                          onClick={() => addBillItemFromSpecial(sp)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm border-b last:border-0 text-left hover:bg-orange-50 transition-colors">
                          {(() => { const prod = products.find(p => p.id === sp.product_id); return prod?.image_url ? <img src={prod.image_url} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" /> : null; })()}
                          <span className="flex-1 truncate">{sp.product_name}</span>
                          <span className="font-bold text-orange-600 text-xs flex-shrink-0">฿{fmt(sp.special_price)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* General search */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">ค้นหาสินค้าเพิ่ม</p>
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={billProductSearch} onChange={e => setBillProductSearch(e.target.value)}
                      className="input text-sm pl-8" placeholder="ชื่อ / บาร์โค้ด..." />
                  </div>
                  {billSearchResults.length > 0 && (
                    <div className="border rounded mt-1 max-h-40 overflow-y-auto bg-white shadow-sm">
                      {billSearchResults.map(p => {
                        const sp = (billModal.special_prices || []).find(s => s.product_id === p.id);
                        const price = sp ? parseFloat(sp.special_price) : parseFloat(p.sell_price || 0);
                        return (
                          <button key={p.id} onClick={() => addBillItem(p, sp ? price : undefined)}
                            className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 text-left border-b last:border-0 text-sm">
                            <span className="truncate">{p.name}</span>
                            <span className={`font-medium flex-shrink-0 ml-2 ${sp ? 'text-orange-600' : 'text-blue-600'}`}>฿{fmt(price)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: cart + payment */}
              <div className="flex-1 flex flex-col p-4">
                {/* Cart items */}
                <div className="flex-1 overflow-y-auto" style={{maxHeight:'320px'}}>
                  {billItems.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-gray-400 text-sm">คลิกสินค้าทางซ้ายเพื่อเพิ่ม</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>{['สินค้า','จำนวน','หน่วย','ราคา/หน่วย','รวม',''].map(h => <th key={h} className="text-left px-2 py-1.5 font-semibold text-gray-600 text-xs">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {billItems.map((it, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1.5 text-sm">{it.product_name}</td>
                            <td className="px-2 py-1.5 w-20">
                              <input type="number" value={it.quantity}
                                onChange={e => updateBillItem(i, 'quantity', parseFloat(e.target.value)||0)}
                                className="input text-sm py-1 w-full" min="0.001" step="0.001" />
                            </td>
                            <td className="px-2 py-1.5 text-gray-500 text-xs">{it.unit}</td>
                            <td className="px-2 py-1.5 w-28">
                              <input type="number" value={it.unit_price}
                                onChange={e => updateBillItem(i, 'unit_price', parseFloat(e.target.value)||0)}
                                className="input text-sm py-1 w-full" min="0" step="0.01" />
                            </td>
                            <td className="px-2 py-1.5 font-bold text-xs">฿{fmt((it.unit_price||0)*(it.quantity||0))}</td>
                            <td className="px-2 py-1.5">
                              <button onClick={() => removeBillItem(i)} className="text-red-400 hover:text-red-600"><X size={13} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Payment section */}
                <div className="border-t pt-3 mt-3 space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">วันที่บิล</label>
                      <input type="date" className="input text-sm py-1.5" value={billDate} onChange={e => setBillDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">ส่วนลด (฿)</label>
                      <input type="number" className="input text-sm py-1.5" value={billDiscount} onChange={e => setBillDiscount(parseFloat(e.target.value)||0)} min="0" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">วิธีชำระ</label>
                      <select className="input text-sm py-1.5" value={billPaymentMethod} onChange={e => setBillPaymentMethod(e.target.value)}>
                        <option value="cash">เงินสด</option>
                        <option value="transfer">โอน</option>
                        <option value="credit">เครดิต</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">สถานะ</label>
                      <select className="input text-sm py-1.5" value={billPaymentStatus} onChange={e => setBillPaymentStatus(e.target.value)}>
                        <option value="paid">ชำระแล้ว</option>
                        <option value="credit">เครดิต</option>
                        <option value="partial">ชำระบางส่วน</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">หมายเหตุ</label>
                    <input className="input text-sm py-1.5" value={billNotes} onChange={e => setBillNotes(e.target.value)} placeholder="หมายเหตุ..." />
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="text-sm space-y-0.5">
                      <div className="flex justify-between gap-8 text-gray-500"><span>ยอดรวม</span><span>฿{fmt(billSubtotal)}</span></div>
                      {billDiscount > 0 && <div className="flex justify-between gap-8 text-gray-500"><span>ส่วนลด</span><span>-฿{fmt(billDiscount)}</span></div>}
                      <div className="flex justify-between gap-8 font-bold text-green-700 text-lg"><span>ยอดสุทธิ</span><span>฿{fmt(billTotal)}</span></div>
                    </div>
                    <button onClick={handleCreateBill} disabled={billSaving || !billItems.length}
                      className="btn-primary flex items-center gap-2 px-6">
                      <Check size={16} /> {billSaving ? 'กำลังบันทึก...' : 'สร้างบิลออก'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
