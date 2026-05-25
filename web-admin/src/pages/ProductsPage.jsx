import React, { useState, useEffect } from 'react';
import { productAPI, categoryAPI } from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Search, Package } from 'lucide-react';

function ProductModal({ product, categories, onClose, onSave }) {
  const [form, setForm] = useState(product || { barcode:'', name:'', category_id:'', unit:'piece', is_weight:false, cost_price:0, sell_price:0, min_stock:5 });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (product?.id) {
        await productAPI.update(product.id, form);
        toast.success('อัปเดตสินค้าสำเร็จ');
      } else {
        await productAPI.create(form);
        toast.success('เพิ่มสินค้าสำเร็จ');
      }
      onSave();
    } catch (err) {
      toast.error(err.error || 'เกิดข้อผิดพลาด');
    } finally { setLoading(false); }
  };

  const f = (k) => ({ value: form[k], onChange: (e) => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })) });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">{product?.id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><span className="text-xl">×</span></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
              <input {...f('barcode')} className="input" placeholder="8850006..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หน่วย</label>
              <select {...f('unit')} className="input">
                {['piece','kg','g','box','bottle','pack','bag'].map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อสินค้า *</label>
            <input {...f('name')} required className="input" placeholder="ชื่อสินค้า" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่</label>
            <select {...f('category_id')} className="input">
              <option value="">-- ไม่ระบุ --</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ราคาทุน</label>
              <input {...f('cost_price')} type="number" step="0.01" className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ราคาขาย</label>
              <input {...f('sell_price')} type="number" step="0.01" className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สต๊อกขั้นต่ำ</label>
              <input {...f('min_stock')} type="number" className="input" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...f('is_weight')} className="rounded" />
            <span className="text-sm">สินค้าชั่งน้ำหนัก</span>
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">ยกเลิก</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'กำลังบันทึก...' : 'บันทึก'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 30;

  const loadData = async () => {
    setLoading(true);
    try {
      const [prods, cats] = await Promise.all([
        productAPI.all({ search, page, limit: LIMIT }),
        categoryAPI.list(),
      ]);
      setProducts(prods.products);
      setTotal(prods.total);
      setCategories(cats);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [search, page]);

  const handleDelete = async (id) => {
    if (!confirm('ยืนยันการลบสินค้า?')) return;
    try { await productAPI.delete(id); toast.success('ลบสินค้าสำเร็จ'); loadData(); }
    catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
  };

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">จัดการสินค้า</h1>
          <p className="text-gray-500 text-sm">ทั้งหมด {total} รายการ</p>
        </div>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> เพิ่มสินค้าใหม่
        </button>
      </div>

      <div className="card mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9" placeholder="ค้นหาชื่อสินค้าหรือ barcode..." />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Barcode','ชื่อสินค้า','หมวดหมู่','หน่วย','ราคาทุน','ราคาขาย','สต๊อกขั้นต่ำ','ประเภท',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={9} className="py-10 text-center text-gray-400">กำลังโหลด...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center text-gray-400">ไม่พบสินค้า</td></tr>
              ) : products.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{p.barcode || '-'}</td>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-gray-500">{p.category_name || '-'}</td>
                  <td className="px-4 py-2 text-gray-500">{p.unit}</td>
                  <td className="px-4 py-2">฿{fmt(p.cost_price)}</td>
                  <td className="px-4 py-2 font-semibold text-blue-600">฿{fmt(p.sell_price)}</td>
                  <td className="px-4 py-2">{p.min_stock}</td>
                  <td className="px-4 py-2">{p.is_weight ? <span className="badge-blue">ชั่งน้ำหนัก</span> : <span className="badge-green">ชิ้น</span>}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => setModal(p)} className="p-1 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(p.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-gray-500">หน้า {page} / {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="btn-secondary text-xs py-1 px-3">ก่อนหน้า</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="btn-secondary text-xs py-1 px-3">ถัดไป</button>
            </div>
          </div>
        )}
      </div>

      {modal !== null && (
        <ProductModal product={modal.id ? modal : null} categories={categories}
          onClose={() => setModal(null)} onSave={() => { setModal(null); loadData(); }} />
      )}
    </div>
  );
}
