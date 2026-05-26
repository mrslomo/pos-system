import React, { useState, useEffect } from 'react';
import { partnerAPI, productAPI } from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Search, Edit2, Tag, X, Check, Trash2 } from 'lucide-react';

const EMPTY_FORM = { name: '', phone: '', address: '', tax_id: '', credit_days: 0, notes: '' };

export default function PartnersPage() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editPartner, setEditPartner] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Price modal
  const [priceModal, setPriceModal] = useState(null); // partner obj
  const [products, setProducts] = useState([]);
  const [priceSearch, setPriceSearch] = useState('');
  const [priceForm, setPriceForm] = useState({ product_id: '', special_price: '', min_qty: 1 });

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

  const openPrices = async (p) => {
    setPriceModal(p);
    const full = await partnerAPI.get(p.id);
    setPriceModal({ ...p, special_prices: full.special_prices || [] });
    if (!products.length) {
      const list = await productAPI.all({ limit: 500 });
      setProducts(Array.isArray(list) ? list : list.products || []);
    }
  };

  const handleAddPrice = async () => {
    if (!priceForm.product_id || !priceForm.special_price) return toast.error('ระบุสินค้าและราคา');
    try {
      await partnerAPI.addPrice(priceModal.id, priceForm);
      toast.success('บันทึกราคาพิเศษแล้ว');
      const full = await partnerAPI.get(priceModal.id);
      setPriceModal({ ...priceModal, special_prices: full.special_prices || [] });
      setPriceForm({ product_id: '', special_price: '', min_qty: 1 });
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
  };

  const handleRemovePrice = async (product_id) => {
    try {
      await partnerAPI.removePrice(priceModal.id, product_id);
      toast.success('ลบราคาพิเศษแล้ว');
      setPriceModal(prev => ({ ...prev, special_prices: prev.special_prices.filter(p => p.product_id !== product_id) }));
    } catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(priceSearch.toLowerCase()) || p.barcode?.includes(priceSearch));

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
            <div className="p-4 border-b bg-gray-50">
              <p className="text-sm font-medium text-gray-600 mb-2">เพิ่มราคาพิเศษ</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input placeholder="ค้นหาสินค้า..." value={priceSearch} onChange={e => setPriceSearch(e.target.value)} className="input text-sm mb-1" />
                  {priceSearch && filteredProducts.length > 0 && (
                    <div className="border rounded bg-white max-h-32 overflow-y-auto">
                      {filteredProducts.slice(0,10).map(p => (
                        <button key={p.id} onClick={() => { setPriceForm(f => ({...f, product_id: p.id})); setPriceSearch(p.name); }}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 border-b last:border-0">
                          {p.name} <span className="text-gray-400 text-xs">฿{fmt(p.sell_price)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input type="number" placeholder="ราคาพิเศษ" value={priceForm.special_price}
                  onChange={e => setPriceForm(f => ({...f, special_price: e.target.value}))}
                  className="input text-sm w-32" />
                <input type="number" placeholder="ขั้นต่ำ" value={priceForm.min_qty}
                  onChange={e => setPriceForm(f => ({...f, min_qty: parseFloat(e.target.value)||1}))}
                  className="input text-sm w-20" />
                <button onClick={handleAddPrice} className="btn-primary text-sm px-3"><Check size={16} /></button>
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
                    <tr key={pp.product_id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2">{pp.product_name}</td>
                      <td className="px-4 py-2 text-gray-500">฿{fmt(pp.default_price)}</td>
                      <td className="px-4 py-2 font-bold text-orange-600">฿{fmt(pp.special_price)}</td>
                      <td className="px-4 py-2">{pp.min_qty} {pp.unit}</td>
                      <td className="px-4 py-2">
                        <button onClick={() => handleRemovePrice(pp.product_id)} className="text-red-400 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
