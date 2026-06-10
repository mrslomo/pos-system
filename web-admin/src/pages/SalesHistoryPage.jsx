import React, { useState, useEffect } from 'react';
import { salesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Printer } from 'lucide-react';

export default function SalesHistoryPage() {
  const { user } = useAuth();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({
    from_date: format(new Date(), 'yyyy-MM-dd'),
    to_date: format(new Date(), 'yyyy-MM-dd'),
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await salesAPI.list({ branch_id: user.branch_id, ...filters });
      setSales(data);
    } finally { setLoading(false); }
  };

  const loadDetail = async (id) => {
    const data = await salesAPI.get(id);
    setSelected(data);
  };

  useEffect(() => { load(); }, [filters]);

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const PAYMENT_LABELS = { cash: 'เงินสด', card: 'บัตร', promptpay: 'พร้อมเพย์', konlakrueng: 'คนละครึ่ง', split: 'ชำระผสม' };

  const printReceipt = (sale) => {
    const fmtB = (n) => `฿${Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2})}`;
    const w = window.open('', '_blank', 'width=340,height=700');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบเสร็จ</title>
    <style>
      @page{margin:0;size:80mm auto}*{box-sizing:border-box}
      body{font-family:'Courier New',monospace;width:80mm;margin:0 auto;padding:8px 6px;font-size:13px;color:#000}
      .c{text-align:center}.b{font-weight:bold}.lg{font-size:16px}
      .dash{border-top:1px dashed #000;margin:6px 0}
      .row{display:flex;justify-content:space-between;margin:2px 0}
      .sub{font-size:11px;color:#555;margin-left:8px;margin-bottom:3px}
      .ttl{font-weight:bold;font-size:15px}
      @media print{button{display:none}}
    </style></head><body>
    <div class="c b lg">POS SYSTEM</div>
    <div class="c">สาขาหลัก</div>
    <div class="c" style="font-size:11px;color:#666">${new Date(sale.created_at).toLocaleString('th-TH')}</div>
    <div class="dash"></div>
    <div class="row"><span>เลขที่:</span><span class="b">${sale.receipt_number}</span></div>
    <div class="row"><span>พนักงาน:</span><span>${sale.cashier_name||'-'}</span></div>
    <div class="dash"></div>
    ${(sale.items||[]).map(it=>`
      <div class="row"><span style="flex:1">${it.product_name}</span><span>${fmtB(it.subtotal)}</span></div>
      <div class="sub">${Number(it.quantity).toFixed(3)} × ${fmtB(it.unit_price)}</div>
    `).join('')}
    <div class="dash"></div>
    <div class="row"><span>ยอดรวม</span><span>${fmtB(sale.subtotal||sale.total_amount)}</span></div>
    ${Number(sale.discount_amount)>0?`<div class="row"><span>ส่วนลด</span><span>-${fmtB(sale.discount_amount)}</span></div>`:''}
    <div class="row ttl"><span>ยอดสุทธิ</span><span>${fmtB(sale.total_amount)}</span></div>
    <div class="dash"></div>
    <div class="row"><span>${PAYMENT_LABELS[sale.payment_method]||sale.payment_method}</span><span>${fmtB(sale.payment_amount)}</span></div>
    ${Number(sale.change_amount)>0?`<div class="row"><span>เงินทอน</span><span>${fmtB(sale.change_amount)}</span></div>`:''}
    ${sale.notes&&sale.payment_method==='split'?`<div style="font-size:11px;color:#555;margin-top:2px">${sale.notes}</div>`:''}
    <div class="dash"></div>
    <div class="c" style="margin-top:8px">ขอบคุณที่ใช้บริการ</div>
    <br><br>
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),800)}</script>
    </body></html>`);
    w.document.close();
  };

  const totalRevenue = sales.reduce((s, sale) => s + Number(sale.total_amount || 0), 0);

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">ประวัติการขาย</h1>
          <div className="text-sm text-gray-500">ยอดรวม: <span className="font-bold text-blue-600">฿{fmt(totalRevenue)}</span></div>
        </div>

        <div className="card mb-4">
          <div className="flex gap-3">
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
          </div>
        </div>

        <div className="card overflow-hidden p-0 flex-1">
          <div className="overflow-y-auto h-full">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b sticky top-0">
                <tr>
                  {['เลขที่ใบเสร็จ','เวลา','พนักงาน','รายการ','ส่วนลด','ยอดสุทธิ','ชำระ','เงินทอน'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={8} className="py-10 text-center text-gray-400">กำลังโหลด...</td></tr>
                ) : sales.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-gray-400">ไม่มีข้อมูล</td></tr>
                ) : sales.map(s => (
                  <tr key={s.id} onClick={() => loadDetail(s.id)}
                    className={`hover:bg-blue-50 cursor-pointer ${selected?.id === s.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2 font-mono text-xs text-blue-600">{s.receipt_number}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{format(new Date(s.created_at), 'HH:mm:ss')}</td>
                    <td className="px-3 py-2 text-xs">{s.cashier_name}</td>
                    <td className="px-3 py-2 text-center">{s.item_count}</td>
                    <td className="px-3 py-2 text-red-500">-฿{fmt(s.discount_amount)}</td>
                    <td className="px-3 py-2 font-bold text-blue-600">฿{fmt(s.total_amount)}</td>
                    <td className="px-3 py-2 text-xs">{PAYMENT_LABELS[s.payment_method] || s.payment_method}</td>
                    <td className="px-3 py-2 text-green-600">฿{fmt(s.change_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <div className="w-72 flex-shrink-0">
          <div className="card h-full overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">รายละเอียดบิล</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => printReceipt(selected)}
                  className="flex items-center gap-1 text-xs px-2 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  <Printer size={12} /> ปริ้น
                </button>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
            </div>
            <div className="space-y-1 text-sm mb-3">
              <div className="flex justify-between"><span className="text-gray-500">เลขที่:</span><span className="font-mono text-xs">{selected.receipt_number}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">วันเวลา:</span><span className="text-xs">{format(new Date(selected.created_at), 'dd/MM/yyyy HH:mm')}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">พนักงาน:</span><span>{selected.cashier_name}</span></div>
            </div>
            <hr className="my-2" />
            <div className="space-y-1 mb-3">
              {(selected.items || []).map((item, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <div>
                    <p className="text-gray-700">{item.product_name}</p>
                    <p className="text-gray-400">{Number(item.quantity).toFixed(3)} × ฿{Number(item.unit_price).toLocaleString('th-TH')}</p>
                  </div>
                  <span className="font-medium">฿{Number(item.subtotal).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
            <hr className="my-2" />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">ยอดรวม:</span><span>฿{Number(selected.subtotal).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between text-red-500"><span>ส่วนลด:</span><span>-฿{Number(selected.discount_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between text-lg font-bold"><span>ยอดสุทธิ:</span><span className="text-blue-600">฿{Number(selected.total_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
