import React, { useState, useEffect } from 'react';
import { reportAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';
import { th } from 'date-fns/locale';
import { Download, TrendingUp, TrendingDown } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ReportsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('daily');
  const [dailyData, setDailyData] = useState([]);
  const [profitData, setProfitData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      reportAPI.daily({ branch_id: user.branch_id, days: 30 }),
      reportAPI.profit({ branch_id: user.branch_id, from_date: dateRange.from, to_date: dateRange.to, group_by: 'day' }),
      reportAPI.summary({ branch_id: user.branch_id, from_date: dateRange.from, to_date: dateRange.to }),
    ]).then(([d, p, s]) => {
      setDailyData(d.reverse());
      setProfitData(p);
      setSummary(s.summary);
    }).finally(() => setLoading(false));
  }, [dateRange]);

  const handleExport = async (type) => {
    setExporting(true);
    try {
      const blob = await reportAPI.export({ branch_id: user.branch_id, from_date: dateRange.from, to_date: dateRange.to, type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${type}-${format(new Date(), 'yyyyMMdd')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export สำเร็จ');
    } catch { toast.error('Export ไม่สำเร็จ'); }
    finally { setExporting(false); }
  };

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0 });
  const fmt2 = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  const totalRevenue = dailyData.reduce((s, d) => s + Number(d.revenue || 0), 0);
  const totalProfit = dailyData.reduce((s, d) => s + Number(d.profit || 0), 0);
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">รายงาน</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => handleExport('sales')} disabled={exporting}
            className="btn-secondary text-sm flex items-center gap-1">
            <Download size={14} /> ยอดขาย
          </button>
          <button onClick={() => handleExport('profit')} disabled={exporting}
            className="btn-secondary text-sm flex items-center gap-1">
            <Download size={14} /> กำไรรายวัน
          </button>
          <button onClick={() => handleExport('products')} disabled={exporting}
            className="btn-secondary text-sm flex items-center gap-1">
            <Download size={14} /> สินค้าขายดี
          </button>
          <button onClick={() => handleExport('stock')} disabled={exporting}
            className="btn-secondary text-sm flex items-center gap-1">
            <Download size={14} /> สต๊อก
          </button>
        </div>
      </div>

      {/* Date range */}
      <div className="card flex items-center gap-4">
        <label className="text-sm text-gray-500">ช่วงวันที่:</label>
        <input type="date" value={dateRange.from} onChange={e => setDateRange(p => ({...p, from: e.target.value}))}
          className="input w-auto text-sm py-1.5" />
        <span className="text-gray-400">—</span>
        <input type="date" value={dateRange.to} onChange={e => setDateRange(p => ({...p, to: e.target.value}))}
          className="input w-auto text-sm py-1.5" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'ยอดขายรวม', value: `฿${fmt(totalRevenue)}`, color: 'text-blue-600' },
          { label: 'กำไรขั้นต้น', value: `฿${fmt(totalProfit)}`, color: 'text-green-600' },
          { label: 'อัตรากำไร', value: `${avgMargin}%`, color: 'text-purple-600' },
          { label: 'จำนวนบิล', value: `${fmt(summary?.total_bills || 0)} บิล`, color: 'text-orange-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card">
            <p className="text-sm text-gray-500 mb-1">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4">ยอดขายรายวัน (30 วัน)</h2>
          {loading ? <div className="h-52 flex items-center justify-center text-gray-400">กำลังโหลด...</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tickFormatter={d => format(new Date(d), 'd/M')} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v, n) => [`฿${fmt2(v)}`, n === 'revenue' ? 'ยอดขาย' : 'กำไร']}
                  labelFormatter={d => format(new Date(d), 'd MMM', { locale: th })} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[2,2,0,0]} name="revenue" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4">ยอดขาย & กำไร (แนวโน้ม)</h2>
          {loading ? <div className="h-52 flex items-center justify-center text-gray-400">กำลังโหลด...</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={profitData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" tickFormatter={d => format(new Date(d), 'd/M')} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v, n) => [`฿${fmt2(v)}`, n === 'revenue' ? 'ยอดขาย' : n === 'cost' ? 'ต้นทุน' : 'กำไร']}
                  labelFormatter={d => format(new Date(d), 'd MMM', { locale: th })} />
                <Legend formatter={n => n === 'revenue' ? 'ยอดขาย' : n === 'cost' ? 'ต้นทุน' : 'กำไร'} />
                <Bar yAxisId="left" dataKey="revenue" name="revenue" fill="#3b82f6" radius={[2,2,0,0]} opacity={0.8} />
                <Bar yAxisId="left" dataKey="cost" name="cost" fill="#f87171" radius={[2,2,0,0]} opacity={0.7} />
                <Line yAxisId="right" type="monotone" dataKey="profit" name="profit" stroke="#10b981" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Daily table */}
      <div className="card overflow-hidden p-0">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-gray-700">ตารางยอดขายรายวัน</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['วันที่','จำนวนบิล','ยอดขาย','ต้นทุน','กำไร','อัตรากำไร'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dailyData.map(d => {
                const margin = d.revenue > 0 ? (d.profit / d.revenue * 100).toFixed(1) : 0;
                return (
                  <tr key={d.date} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{format(new Date(d.date), 'd MMM yyyy', { locale: th })}</td>
                    <td className="px-4 py-2">{d.total_bills}</td>
                    <td className="px-4 py-2 font-semibold">฿{fmt2(d.revenue)}</td>
                    <td className="px-4 py-2 text-red-600">฿{fmt2(d.cost)}</td>
                    <td className="px-4 py-2 text-green-600 font-semibold">฿{fmt2(d.profit)}</td>
                    <td className="px-4 py-2">
                      <span className={`font-medium ${margin >= 20 ? 'text-green-600' : 'text-orange-500'}`}>{margin}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
