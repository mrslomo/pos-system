import React, { useState, useEffect } from 'react';
import { reportAPI, stockAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { TrendingUp, ShoppingCart, Package, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

function StatCard({ title, value, sub, icon: Icon, color }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [daily, setDaily] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    Promise.all([
      reportAPI.summary({ branch_id: user.branch_id, from_date: today, to_date: today }),
      reportAPI.daily({ branch_id: user.branch_id, days: 14 }),
      stockAPI.lowStock({ branch_id: user.branch_id }),
    ]).then(([s, d, ls]) => {
      setSummary(s.summary);
      setDaily(d.reverse());
      setLowStock(ls);
    }).finally(() => setLoading(false));
  }, []);

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-10 w-10 rounded-full border-b-2 border-blue-600" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm">{format(new Date(), 'EEEE d MMMM yyyy', { locale: th })}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="ยอดขายวันนี้" value={`฿${fmt(summary?.total_revenue)}`} icon={TrendingUp} color="bg-blue-500" />
        <StatCard title="กำไรขั้นต้น" value={`฿${fmt(summary?.gross_profit)}`} icon={TrendingUp} color="bg-green-500" />
        <StatCard title="จำนวนบิล" value={`${summary?.total_bills || 0} บิล`} icon={ShoppingCart} color="bg-purple-500" />
        <StatCard title="สินค้าใกล้หมด" value={`${lowStock.length} รายการ`} icon={AlertTriangle} color="bg-orange-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <h2 className="font-semibold text-gray-700 mb-4">ยอดขาย 14 วันย้อนหลัง</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={daily}>
              <defs>
                <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tickFormatter={d => format(new Date(d), 'd/M')} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `฿${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [`฿${fmt(v)}`, 'ยอดขาย']} labelFormatter={d => format(new Date(d), 'd MMM', { locale: th })} />
              <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#revenue)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-orange-500" />
            สินค้าใกล้หมด ({lowStock.length})
          </h2>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {lowStock.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">ไม่มีสินค้าใกล้หมด</p>
            ) : lowStock.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 truncate flex-1">{p.name}</span>
                <span className={`ml-2 font-semibold ${p.total_stock <= 0 ? 'text-red-600' : 'text-orange-500'}`}>
                  {p.total_stock} {p.unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
