import React, { useState, useEffect, useRef } from 'react';
import { productAPI, uploadAPI } from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Search, RefreshCw, ImagePlus, X } from 'lucide-react';

function genBarcode() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rnd = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `INT${yy}${mm}${dd}${rnd}`;
}

// Resize + convert to base64 JPEG via canvas
async function resizeImage(file, maxSize = 400) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };
    img.src = URL.createObjectURL(file);
  });
}

const PRODUCT_TYPES = [
  { value: 'fresh', label: 'ของสด', color: 'bg-green-100 text-green-700' },
  { value: 'innards', label: 'เครื่องใน', color: 'bg-red-100 text-red-700' },
  { value: 'processed', label: 'แปรรูป', color: 'bg-purple-100 text-purple-700' },
];

function TypeBadge({ type }) {
  const t = PRODUCT_TYPES.find(x => x.value === type) || PRODUCT_TYPES[2];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.color}`}>{t.label}</span>;
}

function ProductImage({ src, size = 10, className = '' }) {
  if (!src) return (
    <div className={`w-${size} h-${size} rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 ${className}`}>
      <ImagePlus size={size * 1.5} className="text-gray-300" />
    </div>
  );
  return <img src={src} alt="" className={`w-${size} h-${size} rounded-lg object-cover flex-shrink-0 ${className}`} />;
}

function ProductModal({ product, onClose, onSave }) {
  const [form, setForm] = useState(product || {
    barcode: genBarcode(), name: '', unit: 'kg', is_weight: false,
    cost_price: 0, sell_price: 0, min_stock: 5, product_type: 'fresh', image_url: '',
  });
  const [loading, setLoading] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const fileRef = useRef();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let data = { ...form };
      // If image is still a local base64 (not yet uploaded), upload it first
      if (data.image_url && data.image_url.startsWith('data:image')) {
        toast.loading('กำลังอัพโหลดรูป...', { id: 'img-upload' });
        const { url } = await uploadAPI.upload(data.image_url);
        toast.dismiss('img-upload');
        data = { ...data, image_url: url };
      }
      if (product?.id) {
        await productAPI.update(product.id, data);
        toast.success('อัปเดตสินค้าสำเร็จ');
      } else {
        await productAPI.create(data);
        toast.success('เพิ่มสินค้าสำเร็จ');
      }
      onSave();
    } catch (err) {
      toast.dismiss('img-upload');
      toast.error(err.error || 'เกิดข้อผิดพลาด');
    } finally { setLoading(false); }
  };

  const f = (k) => ({
    value: form[k] ?? '',
    onChange: (e) => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  });

  const handleImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast.error('ไฟล์ใหญ่เกิน 8MB');
    setImgLoading(true);
    try {
      const b64 = await resizeImage(file, 400);
      setForm(p => ({ ...p, image_url: b64 }));
    } catch { toast.error('อ่านไฟล์ไม่ได้'); }
    setImgLoading(false);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) handleImageFile({ target: { files: [file] } });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">{product?.id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">

          {/* Product type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมวดสินค้า *</label>
            <div className="grid grid-cols-3 gap-2">
              {PRODUCT_TYPES.map(t => (
                <button key={t.value} type="button"
                  onClick={() => setForm(p => ({ ...p, product_type: t.value }))}
                  className={`py-2.5 rounded-lg text-sm font-medium border-2 transition-all ${form.product_type === t.value ? `${t.color} border-current` : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Image upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รูปสินค้า</label>
            <div className="flex gap-3 items-start">
              {/* Preview */}
              <div
                className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors overflow-hidden flex-shrink-0 relative group"
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}>
                {imgLoading ? (
                  <div className="animate-spin h-6 w-6 rounded-full border-b-2 border-blue-500" />
                ) : form.image_url ? (
                  <>
                    <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <ImagePlus size={20} className="text-white" />
                    </div>
                  </>
                ) : (
                  <div className="text-center p-2">
                    <ImagePlus size={22} className="text-gray-300 mx-auto mb-1" />
                    <p className="text-xs text-gray-400">คลิกหรือลาก</p>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-1.5">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="btn-secondary text-sm w-full flex items-center justify-center gap-2">
                  <ImagePlus size={14} /> เลือกรูปภาพ
                </button>
                {form.image_url && (
                  <button type="button" onClick={() => setForm(p => ({ ...p, image_url: '' }))}
                    className="w-full text-xs text-red-500 hover:bg-red-50 rounded-lg py-1.5 flex items-center justify-center gap-1">
                    <X size={12} /> ลบรูป
                  </button>
                )}
                <p className="text-xs text-gray-400">PNG, JPG — max 8MB — resize อัตโนมัติ</p>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
          </div>

          {/* Barcode + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
              <div className="flex gap-1">
                <input {...f('barcode')} className="input flex-1 font-mono text-sm" placeholder="8850006..." />
                {!product?.id && (
                  <button type="button" onClick={() => setForm(p => ({ ...p, barcode: genBarcode() }))}
                    className="px-2 py-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-gray-200 transition-colors" title="สร้างใหม่">
                    <RefreshCw size={13} />
                  </button>
                )}
              </div>
              {!product?.id && <p className="text-xs text-gray-400 mt-0.5">สร้างอัตโนมัติ — แก้ไขได้</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หน่วย</label>
              <select {...f('unit')} className="input">
                {['kg','g','piece','box','bottle','pack','bag'].map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อสินค้า *</label>
            <input {...f('name')} required className="input" placeholder="ชื่อสินค้า" />
          </div>

          {/* Prices + min stock */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ราคาทุน</label>
              <input {...f('cost_price')} type="number" step="0.01" min="0" className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ราคาขาย</label>
              <input {...f('sell_price')} type="number" step="0.01" min="0" className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สต๊อกขั้นต่ำ</label>
              <input {...f('min_stock')} type="number" min="0" className="input" />
            </div>
          </div>

          {/* Weight toggle */}
          <label className={`flex items-center gap-2 cursor-pointer rounded-lg p-2.5 ${(form.product_type === 'fresh' || form.product_type === 'innards') ? 'bg-blue-50' : ''}`}>
            <input type="checkbox" {...f('is_weight')} className="rounded" />
            <span className={`text-sm font-medium ${(form.product_type === 'fresh' || form.product_type === 'innards') ? 'text-blue-700' : 'text-gray-700'}`}>
              สินค้าชั่งน้ำหนัก (ตาชั่ง)
            </span>
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
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 30;

  const loadData = async () => {
    setLoading(true);
    try {
      const prods = await productAPI.all({ search, page, limit: LIMIT, product_type: typeFilter || undefined });
      setProducts(prods.products || []);
      setTotal(prods.total || 0);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [search, page, typeFilter]);

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

      {/* Filters */}
      <div className="card mb-4 flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9" placeholder="ค้นหาชื่อสินค้าหรือ barcode..." />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => { setTypeFilter(''); setPage(1); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${typeFilter === '' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
            ทั้งหมด
          </button>
          {PRODUCT_TYPES.map(t => (
            <button key={t.value} onClick={() => { setTypeFilter(t.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${typeFilter === t.value ? `bg-white shadow ${t.color.split(' ')[1]}` : 'text-gray-500'}`}>
              {t.label}
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
                {['', 'Barcode', 'ชื่อสินค้า', 'หมวด', 'หน่วย', 'ราคาทุน', 'ราคาขาย', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="py-10 text-center text-gray-400">กำลังโหลด...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-gray-400">ไม่พบสินค้า</td></tr>
              ) : products.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    {p.image_url
                      ? <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      : <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center"><ImagePlus size={14} className="text-gray-300" /></div>
                    }
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{p.barcode || '-'}</td>
                  <td className="px-4 py-2.5 font-medium">
                    {p.name}
                    {p.is_weight && <span className="ml-1.5 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">ชั่งน้ำหนัก</span>}
                  </td>
                  <td className="px-4 py-2.5"><TypeBadge type={p.product_type} /></td>
                  <td className="px-4 py-2.5 text-gray-500">{p.unit}</td>
                  <td className="px-4 py-2.5 text-gray-600">฿{fmt(p.cost_price)}</td>
                  <td className="px-4 py-2.5 font-semibold text-blue-600">฿{fmt(p.sell_price)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={() => setModal(p)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
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
        <ProductModal
          product={modal.id ? modal : null}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); loadData(); }}
        />
      )}
    </div>
  );
}
