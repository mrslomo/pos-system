import React, { useState, useEffect } from 'react';
import { branchAPI } from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, GitBranch } from 'lucide-react';

function BranchModal({ branch, onClose, onSave }) {
  const [form, setForm] = useState(branch || { name:'', address:'', phone:'', is_active:true });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (branch?.id) { await branchAPI.update(branch.id, form); toast.success('อัปเดตสาขาสำเร็จ'); }
      else { await branchAPI.create(form); toast.success('เพิ่มสาขาสำเร็จ'); }
      onSave();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">{branch?.id ? 'แก้ไขสาขา' : 'เพิ่มสาขาใหม่'}</h2>
          <button onClick={onClose} className="text-xl text-gray-400 hover:text-gray-600">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อสาขา *</label>
            <input required value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} className="input" placeholder="สาขาหลัก" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่</label>
            <textarea value={form.address} onChange={e => setForm(p => ({...p, address: e.target.value}))} className="input" rows={2} placeholder="ที่อยู่สาขา" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทร</label>
            <input value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} className="input" placeholder="02-xxx-xxxx" />
          </div>
          {branch?.id && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({...p, is_active: e.target.checked}))} />
              <span className="text-sm">สาขาเปิดใช้งาน</span>
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">ยกเลิก</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'บันทึก...' : 'บันทึก'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BranchesPage() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const data = await branchAPI.list(); setBranches(data); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">จัดการสาขา</h1>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> เพิ่มสาขา
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">กำลังโหลด...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map(b => (
            <div key={b.id} className={`card ${!b.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <GitBranch size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{b.name}</h3>
                    <p className="text-xs text-gray-400">{b.user_count} ผู้ใช้</p>
                  </div>
                </div>
                <span className={b.is_active ? 'badge-green' : 'badge-red'}>{b.is_active ? 'เปิด' : 'ปิด'}</span>
              </div>
              {b.address && <p className="text-sm text-gray-500 mb-1">{b.address}</p>}
              {b.phone && <p className="text-sm text-gray-500">{b.phone}</p>}
              <button onClick={() => setModal(b)} className="mt-3 btn-secondary text-xs py-1 flex items-center gap-1 w-full justify-center">
                <Edit2 size={12} /> แก้ไข
              </button>
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <BranchModal branch={modal.id ? modal : null}
          onClose={() => setModal(null)} onSave={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}
