import React, { useState, useEffect } from 'react';
import { stockAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';

const TYPE_LABELS = { in: 'รับเข้า', out: 'จ่ายออก', sale: 'ขาย', transfer: 'โอน', adjustment: 'ปรับยอด' };
const TYPE_COLORS = { in: 'badge-green', out: 'badge-red', sale: 'badge-blue', transfer: 'badge-yellow', adjustment: 'bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-medium' };

export default function StockTransactionsPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from_date: format(new Date(), 'yyyy-MM-dd'), to_date: format(new Date(), 'yyyy-MM-dd'), type: '' });

  const load = async () => {
    setLoading(true);
    try {
      const data = await stockAPI.transactions({ branch_id: user.branch_id, ...filters });
      setTransactions(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filters]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">ความเคลื่อนไหวสต๊อก</h1>

      <div className="card mb-4">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">จากวันที่</label>
            <input type="date" value={filters.from_date}
              onChange={e => setFilters(p => ({...p, from_date: e.target.value}))}
              className="input text-sm py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ถึงวันที่</label>
            <input type="date" value={filters.to_date}
              onChange={e => setFilters(p => ({...p, to_date: e.target.value}))}
              className="input text-sm py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ประเภท</label>
            <select value={filters.type} onChange={e => setFilters(p => ({...p, type: e.target.value}))} className="input text-sm py-1.5">
              <option value="">ทั้งหมด</option>
              {Object.entries(TYPE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['วันเวลา','สินค้า','ประเภท','จาก','ไปยัง','จำนวน','ก่อน','หลัง','หมายเหตุ','ผู้ดำเนินการ'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={10} className="py-10 text-center text-gray-400">กำลังโหลด...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={10} className="py-10 text-center text-gray-400">ไม่มีข้อมูล</td></tr>
              ) : transactions.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {format(new Date(t.created_at), 'dd/MM HH:mm')}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{t.product_name}</p>
                    <p className="text-xs text-gray-400">{t.unit}</p>
                  </td>
                  <td className="px-3 py-2"><span className={TYPE_COLORS[t.type]}>{TYPE_LABELS[t.type]}</span></td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{t.from_location === 'front' ? 'หน้าร้าน' : t.from_location === 'back' ? 'หลังบ้าน' : '-'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{t.to_location === 'front' ? 'หน้าร้าน' : t.to_location === 'back' ? 'หลังบ้าน' : '-'}</td>
                  <td className="px-3 py-2 font-mono font-semibold">{Number(t.quantity).toFixed(3)}</td>
                  <td className="px-3 py-2 font-mono text-gray-400 text-xs">{t.before_qty ? Number(t.before_qty).toFixed(3) : '-'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{t.after_qty ? Number(t.after_qty).toFixed(3) : '-'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 max-w-[120px] truncate">{t.notes || '-'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{t.user_name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
