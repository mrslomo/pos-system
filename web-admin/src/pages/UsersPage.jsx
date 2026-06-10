import React, { useState, useEffect } from 'react';
import { userAPI, branchAPI } from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2 } from 'lucide-react';

const ROLES = { admin: 'ผู้ดูแลระบบ', manager: 'ผู้จัดการ', cashier: 'พนักงานขาย' };
const ROLE_COLORS = { admin: 'badge-red', manager: 'badge-blue', cashier: 'badge-green' };

function UserModal({ user, branches, onClose, onSave }) {
  const [form, setForm] = useState(user ? { ...user, password: '', pin: '' } : { name:'', email:'', password:'', pin:'', role:'cashier', branch_id:'', is_active:true });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = { ...form };
      if (!data.password) delete data.password;
      if (user?.id) { await userAPI.update(user.id, data); toast.success('อัปเดตผู้ใช้สำเร็จ'); }
      else { await userAPI.create(data); toast.success('เพิ่มผู้ใช้สำเร็จ'); }
      onSave();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  const f = (k) => ({ value: form[k] || '', onChange: (e) => setForm(p => ({...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value})) });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">{user?.id ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}</h2>
          <button onClick={onClose} className="text-xl text-gray-400 hover:text-gray-600">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ *</label>
            <input {...f('name')} required className="input" placeholder="ชื่อผู้ใช้" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
            <input {...f('email')} type="email" className="input" placeholder="user@example.com (ไม่บังคับ)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{user?.id ? 'รหัสผ่านใหม่ (เว้นว่างไม่เปลี่ยน)' : 'รหัสผ่าน *'}</label>
            <input {...f('password')} required={!user?.id} type="password" className="input" placeholder="••••••••" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">บทบาท</label>
              <select {...f('role')} className="input">
                {Object.entries(ROLES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สาขา</label>
              <select {...f('branch_id')} className="input">
                <option value="">-- ไม่ระบุ --</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              PIN (4-6 หลัก) — ใช้ล็อกอินที่หน้าร้าน
            </label>
            <input {...f('pin')} type="text" inputMode="numeric" maxLength={6} className="input font-mono tracking-widest text-center text-lg" placeholder="● ● ● ●" />
            <p className="text-xs text-gray-400 mt-0.5">{user?.has_pin ? 'มี PIN แล้ว — ใส่ใหม่เพื่อเปลี่ยน, เว้นว่างไม่เปลี่ยน' : 'ตั้ง PIN เพื่อให้พนักงานล็อกอินที่หน้าร้านได้'}</p>
          </div>
          {user?.id && (
            <label className="flex items-center gap-2">
              <input type="checkbox" {...f('is_active')} checked={form.is_active} />
              <span className="text-sm">เปิดใช้งาน</span>
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

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [u, b] = await Promise.all([userAPI.list(), branchAPI.list()]);
      setUsers(u); setBranches(b);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('ปิดการใช้งานผู้ใช้นี้?')) return;
    try { await userAPI.delete(id); toast.success('ปิดการใช้งานสำเร็จ'); load(); }
    catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">จัดการผู้ใช้งาน</h1>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> เพิ่มผู้ใช้
        </button>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['ชื่อ','อีเมล','บทบาท','สาขา','สถานะ',''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-gray-400">กำลังโหลด...</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{u.name}</td>
                <td className="px-4 py-2 text-gray-500">{u.email}</td>
                <td className="px-4 py-2"><span className={ROLE_COLORS[u.role]}>{ROLES[u.role]}</span></td>
                <td className="px-4 py-2 text-gray-500">{u.branch_name || '-'}</td>
                <td className="px-4 py-2"><span className={u.is_active ? 'badge-green' : 'badge-red'}>{u.is_active ? 'เปิด' : 'ปิด'}</span></td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => setModal(u)} className="p-1 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(u.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <UserModal user={modal.id ? modal : null} branches={branches}
          onClose={() => setModal(null)} onSave={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}
