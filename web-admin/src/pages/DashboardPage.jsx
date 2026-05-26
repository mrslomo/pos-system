import React, { useState, useEffect, useCallback } from 'react';
import { reportAPI, stockAPI, heldBillAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  ComposedChart, Bar, Line, BarChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, ShoppingCart, AlertTriangle, PauseCircle, Package, BarChart3 } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { th } from 'date-fns/locale';

const PERIODS = [
  { key: 'today', label: 'วันนี้' },
  { key: '7d', label: '7 วัน' },
  { key: '30d', label: '30 วัน' },
];

function StatCard({ title, value, sub, icon: Icon, color }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('today');
  const [summary, setSummary] = useState(null);
  const [dailyData, setDailyData] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [heldSummary, setHeldSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  const loadData = useCallback(async () => {
    setLoading(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    try {
      if (period === 'today') {
        const [s, ls, hs] = await Promise.all([
          reportAPI.summary({ branch_id: user.branch_id, from_date: today, to_date: today }),
          stockAPI.lowStock({ branch_id: user.branch_id }),
          heldBillAPI.summary({ branch_id: user.branch_id }),
        ]);
        setSummary(s);
        setDailyData([]);
        setLowStock(ls);
        setHeldSummary(hs);
      } else {
        const days = period === '7d' ? 7 : 30;
        const from = format(subDays(new Date(), days - 1), 'yyyy-MM-dd');
        const [s, d, ls, hs] = await Promise.all([
          reportAPI.summary({ branch_id: user.branch_id, from_date: from, to_date: today }),
          reportAPI.daily({ branch_id: user.branch_id, days }),
          stockAPI.lowStock({ branch_id: user.branch_id }),
          heldBillAPI.summary({ branch_id: user.branch_id }),
        ]);
        setSummary(s);
        setDailyData(d.reverse());
        setLowStock(ls);
        setHeldSummary(hs);
      }
    } finally {
      setLoading(false);
    }
  }, [period, user.branch_id]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalRevenue = period === 'today'
    ? Number(summary?.summary?.total_revenue || 0)
    : dailyData.reduce((s, d) => s + Number(d.revenue || 0), 0);
  const totalProfit = period === 'today'
    ? Number(summary?.summary?.gross_profit || 0)
    : dailyData.reduce((s, d) => s + Number(d.profit || 0), 0);
  const totalBills = period === 'today'
    ? Number(summary?.summary?.total_bills || 0)
    : dailyData.reduce((s, d) => s + Number(d.total_bills || 0), 0);
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm">{format(new Date(), 'EEEE d MMMM yyyy', { locale: th })}</p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === p.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="ยอดขาย" value={`฿${fmt(totalRevenue)}`} icon={TrendingUp} color="bg-blue-500" />
        <StatCard
          title="กำไรขั้นต้น"
          value={`฿${fmt(totalProfit)}`}
          sub={`Margin ${margin}%`}
          icon={BarChart3}
          color={totalProfit >= 0 ? 'bg-green-500' : 'bg-red-500'}
        />
        <StatCard title="จำนวนบิล" value={`${totalBills} บิล`} icon={ShoppingCart} color="bg-purple-500" />
        <StatCard
          title="สินค้าใกล้หมด"
          value={`${lowStock.length} รายการ`}
          icon={AlertTriangle}
          color={lowStock.length > 0 ? 'bg-orange-500' : 'bg-gray-400'}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-10 w-10 rounded-full border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main chart */}
            <div className="card lg:col-span-2">
              {period === 'today' ? (
                <>
                  <h2 className="font-semibold text-gray-700 mb-4">ยอดขายรายชั่วโมง (วันนี้)</h2>
                  {(summary?.hourly || []).length === 0 ? (
                    <div className="h-56 flex items-center justify-center text-gray-400 text-sm">ยังไม่มีข้อมูลการขายวันนี้</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={summary.hourly} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v) => [`฿${fmt(v)}`, 'ยอดขาย']} labelFormatter={h => `${h}:00 น.`} />
                        <Bar dataKey="revenue" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </>
              ) : (
                <>
                  <h2 className="font-semibold text-gray-700 mb-4">
                    ยอดขาย & กำไร {period === '7d' ? '7 วัน' : '30 วัน'}ย้อนหลัง
                  </h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={dailyData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tickFormatter={d => format(new Date(d), 'd/M')} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(v, n) => [`฿${fmt(v)}`, n === 'revenue' ? 'ยอดขาย' : 'กำไร']}
                        labelFormatter={d => format(new Date(d), 'd MMM', { locale: th })}
                      />
                      <Legend formatter={n => n === 'revenue' ? 'ยอดขาย' : 'กำไร'} />
                      <Bar yAxisId="left" dataKey="revenue" fill="#3b82f6" radius={[3, 3, 0, 0]} opacity={0.85} name="revenue" />
                      <Line yAxisId="right" type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} dot={false} name="profit" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </>
              )}
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-4">
              {period === 'today' && (summary?.top_products || []).length > 0 ? (
                <div className="card flex-1">
                  <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Package size={16} className="text-blue-500" />
                    สินค้าขายดีวันนี้
                  </h2>
                  <div className="space-y-2.5">
                    {summary.top_products.slice(0, 5).map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-gray-400 w-4 flex-shrink-0">{i + 1}</span>
                          <span className="text-gray-700 truncate">{p.name}</span>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <span className="font-semibold text-blue-600">฿{fmt(p.total_revenue)}</span>
                          <span className="text-gray-400 text-xs block">{Number(p.total_qty || 0).toFixed(0)} ชิ้น</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : heldSummary?.total > 0 ? (
                <div className="card border-l-4 border-l-yellow-400">
                  <h2 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <PauseCircle size={16} className="text-yellow-500" />
                    Hold บิล ({heldSummary.total} บิล)
                  </h2>
                  <div className="space-y-1">
                    {(heldSummary.by_user || []).map((u, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 truncate">{u.user_name || 'ไม่ระบุ'}</span>
                        <span className="font-semibold text-yellow-600">{u.count} บิล</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="card flex-1">
                <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-orange-500" />
                  สินค้าใกล้หมด ({lowStock.length})
                </h2>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {lowStock.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">ไม่มีสินค้าใกล้หมด</p>
                  ) : lowStock.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 truncate flex-1">{p.name}</span>
                      <span className={`ml-2 font-semibold flex-shrink-0 ${p.total_stock <= 0 ? 'text-red-600' : 'text-orange-500'}`}>
                        {p.total_stock} {p.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Top products table for multi-day periods */}
          {period !== 'today' && (summary?.top_products || []).length > 0 && (
            <div className="card overflow-hidden p-0">
              <div className="px-4 py-3 border-b">
                <h2 className="font-semibold text-gray-700">
                  สินค้าขายดี Top 10 ({period === '7d' ? '7 วัน' : '30 วัน'}ย้อนหลัง)
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['#', 'สินค้า', 'จำนวน', 'ยอดขาย', 'กำไรขั้นต้น'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summary.top_products.slice(0, 10).map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-400 font-bold text-xs">{i + 1}</td>
                        <td className="px-4 py-2 font-medium text-gray-800">{p.name}</td>
                        <td className="px-4 py-2 text-gray-600">{Number(p.total_qty || 0).toFixed(0)}</td>
                        <td className="px-4 py-2 font-semibold text-blue-600">฿{fmt(p.total_revenue)}</td>
                        <td className="px-4 py-2 font-semibold text-green-600">฿{fmt(p.gross_profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
