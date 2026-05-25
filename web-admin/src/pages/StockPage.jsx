import React, { useState, useEffect } from 'react';
import { stockAPI, productAPI, branchAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Edit3, AlertTriangle, Search } from 'lucide-react';

function StockModal({ type, product, onClose, onSave }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ product_id: product?.id || '', location: 'back', quantity: '', notes: '', from_location: 'back', to_location: 'front' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = { ...form, branch_id: user.branch_id, quantity: parseFloat(form.quantity) };
      if (type === 'in') await stockAPI.stockIn(data);
      else if (type === 'out') await stockAPI.stockOut(data);
      else if (type === 'transfer') await stockAPI.transfer(data);
      else await stockAPI.adjust(data);
      toast.success('บันทึกสำเร็จ');
      onSave();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  const titles = { in: 'รับสินค้าเข้า', out: 'จ่ายสินค้าออก', transfer: 'โอนระหว่างที่เก็บ', adjust: 'ปรับยอดสต๊อก' };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">{titles[type]}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">สินค้า: <span className="text-blue-600">{product?.name}</span></label>
          </div>
          {type === 'transfer' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">จาก</label>
                <select value={form.from_location} onChange={e => setForm(p => ({...p, from_location: e.target.value}))} className="input">
                  <option value="back">หลังบ้าน</option>
                  <option value="front">หน้าร้าน</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ไปยัง</label>
                <select value={form.to_location} onChange={e => setForm(p => ({...p, to_location: e.target.value}))} className="input">
                  <option value="front">หน้าร้าน</option>
                  <option value="back">หลังบ้าน</option>
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ที่เก็บ</label>
              <select value={form.location} onChange={e => setForm(p => ({...p, location: e.target.value}))} className="input">
                <option value="back">หลังบ้าน</option>
                <option value="front">หน้าร้าน</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {type === 'adjust' ? 'ยอดที่ถูกต้อง' : 'จำนวน'} ({product?.unit})
            </label>
            <input type="number" step="0.001" min="0" required value={form.quantity}
              onChange={e => setForm(p => ({...p, quantity: e.target.value}))} className="input" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <input value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))} className="input" placeholder="หมายเหตุ (ถ้ามี)" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">ยกเลิก</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'กำลังบันทึก...' : 'บันทึก'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function StockPage() {
  const { user } = useAuth();
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [showLowOnly, setShowLowOnly] = useState(false);

  const loadStock = async () => {
    setLoading(true);
    try {
      const data = await stockAPI.list({ branch_id: user.branch_id, low_stock: showLowOnly ? 'true' : undefined });
      setStock(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadStock(); }, [showLowOnly]);

  const filtered = stock.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || '').includes(search)
  );

  const fmt = (n) => Number(n || 0).toFixed(3).replace(/\.?0+$/, '');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">จัดการสต๊อก</h1>
          <p className="text-gray-500 text-sm">{filtered.length} รายการ</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowLowOnly(!showLowOnly)}
            className={`btn text-sm ${showLowOnly ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'btn-secondary'}`}>
            <AlertTriangle size={14} className="inline mr-1" />
            {showLowOnly ? 'ดูทั้งหมด' : 'สินค้าใกล้หมด'}
          </button>
        </div>
      </div>

      <div className="card mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" placeholder="ค้นหาสินค้า..." />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['สินค้า','หมวดหมู่','หน้าร้าน','หลังบ้าน','รวม','ขั้นต่ำ','สถานะ','จัดการ'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="py-10 text-center text-gray-400">กำลังโหลด...</td></tr>
              ) : filtered.map(p => {
                const isLow = p.total_stock <= p.min_stock;
                const isEmpty = p.total_stock <= 0;
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 ${isEmpty ? 'bg-red-50' : isLow ? 'bg-orange-50' : ''}`}>
                    <td className="px-4 py-2">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.barcode || '-'}</p>
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{p.category_name || '-'}</td>
                    <td className="px-4 py-2 font-mono">{fmt(p.front_stock)} <span className="text-xs text-gray-400">{p.unit}</span></td>
                    <td className="px-4 py-2 font-mono">{fmt(p.back_stock)} <span className="text-xs text-gray-400">{p.unit}</span></td>
                    <td className="px-4 py-2 font-bold font-mono">{fmt(p.total_stock)}</td>
                    <td className="px-4 py-2 text-gray-500">{p.min_stock}</td>
                    <td className="px-4 py-2">
                      {isEmpty ? <span className="badge-red">หมด</span> : isLow ? <span className="badge-yellow">ใกล้หมด</span> : <span className="badge-green">ปกติ</span>}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => setModal({type:'in',product:p})} title="รับเข้า" className="p-1 text-green-500 hover:bg-green-50 rounded"><ArrowDownToLine size={14} /></button>
                        <button onClick={() => setModal({type:'out',product:p})} title="จ่ายออก" className="p-1 text-red-500 hover:bg-red-50 rounded"><ArrowUpFromLine size={14} /></button>
                        <button onClick={() => setModal({type:'transfer',product:p})} title="โอน" className="p-1 text-blue-500 hover:bg-blue-50 rounded"><ArrowLeftRight size={14} /></button>
                        <button onClick={() => setModal({type:'adjust',product:p})} title="ปรับยอด" className="p-1 text-purple-500 hover:bg-purple-50 rounded"><Edit3 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <StockModal type={modal.type} product={modal.product}
          onClose={() => setModal(null)} onSave={() => { setModal(null); loadStock(); }} />
      )}
    </div>
  );
}
