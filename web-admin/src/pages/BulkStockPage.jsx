import React, { useState, useEffect } from 'react';
import { bulkStockAPI, productAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Search, ChevronRight, X, Scissors, PackagePlus, TrendingDown, TrendingUp, BarChart2 } from 'lucide-react';

const today = () => new Date().toISOString().split('T')[0];
const fmt = (n, d = 2) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: d });

// ─── Tab: สต๊อกใหญ่ ───────────────────────────────────────────────────────────
function BulkItemsTab({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showStockIn, setShowStockIn] = useState(null);
  const [showEditCost, setShowEditCost] = useState(null); // bulk_item to edit cost
  const [editCostValue, setEditCostValue] = useState('');
  const [form, setForm] = useState({ name: '', unit: 'kg', category: '', min_qty: 0, notes: '' });
  const [stockInForm, setStockInForm] = useState({ quantity: '', cost_per_unit: '', supplier_name: '', reference: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = () => { setLoading(true); bulkStockAPI.items({ branch_id: user.branch_id }).then(setItems).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name) return toast.error('ต้องระบุชื่อ');
    setSaving(true);
    try {
      await bulkStockAPI.createItem({ ...form, branch_id: user.branch_id });
      toast.success('เพิ่มรายการสำเร็จ'); setShowCreate(false); setForm({ name: '', unit: 'kg', category: '', min_qty: 0, notes: '' }); load();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); } finally { setSaving(false); }
  };

  const handleEditCost = async () => {
    if (!editCostValue || parseFloat(editCostValue) <= 0) return toast.error('ระบุราคาต้นทุนที่ถูกต้อง');
    setSaving(true);
    try {
      await bulkStockAPI.updateItem(showEditCost.id, {
        name: showEditCost.name,
        unit: showEditCost.unit || 'kg',
        category: showEditCost.category || '',
        min_qty: showEditCost.min_qty || 0,
        notes: showEditCost.notes || '',
        is_active: showEditCost.is_active !== false,
        cost_per_unit: parseFloat(editCostValue),
      });
      toast.success(`แก้ไขต้นทุน ${showEditCost.name} เป็น ฿${editCostValue}/kg`);
      setShowEditCost(null); setEditCostValue(''); load();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); } finally { setSaving(false); }
  };

  const handleStockIn = async () => {
    if (!stockInForm.quantity || !stockInForm.cost_per_unit) return toast.error('ระบุจำนวนและราคา');
    setSaving(true);
    try {
      await bulkStockAPI.stockIn({ bulk_item_id: showStockIn.id, ...stockInForm });
      toast.success('รับสต๊อกสำเร็จ'); setShowStockIn(null); setStockInForm({ quantity: '', cost_per_unit: '', supplier_name: '', reference: '', notes: '' }); load();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> เพิ่มรายการ</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? <p className="text-gray-400 col-span-3 text-center py-10">กำลังโหลด...</p>
          : items.length === 0 ? <p className="text-gray-400 col-span-3 text-center py-10">ยังไม่มีรายการ</p>
          : items.map(item => (
          <div key={item.id} className={`card border-l-4 ${parseFloat(item.current_qty) <= parseFloat(item.min_qty) ? 'border-l-red-400' : 'border-l-blue-400'}`}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="text-xs text-gray-400">{item.category || 'ไม่มีหมวดหมู่'}</p>
              </div>
              {parseFloat(item.current_qty) <= parseFloat(item.min_qty) && (
                <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">สต๊อกต่ำ</span>
              )}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">คงเหลือ</span><span className="font-bold text-lg text-blue-600">{fmt(item.current_qty, 3)} {item.unit}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">ต้นทุน/{item.unit}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">฿{fmt(item.cost_per_unit)}</span>
                  <button onClick={() => { setShowEditCost(item); setEditCostValue(String(item.cost_per_unit)); }}
                    className="text-xs text-orange-600 hover:text-orange-700 underline">แก้ไข</button>
                </div>
              </div>
              <div className="flex justify-between"><span className="text-gray-500">มูลค่าสต๊อก</span><span className="font-medium">฿{fmt(parseFloat(item.current_qty) * parseFloat(item.cost_per_unit))}</span></div>
            </div>
            <button onClick={() => setShowStockIn(item)} className="btn-primary text-sm w-full mt-3 flex items-center justify-center gap-1">
              <PackagePlus size={14} /> รับสต๊อก
            </button>
          </div>
        ))}
      </div>

      {/* Create */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b"><h2 className="font-semibold text-lg">เพิ่มรายการสต๊อกใหญ่</h2><button onClick={() => setShowCreate(false)}><X size={20} /></button></div>
            <div className="p-5 space-y-3">
              <div><label className="label">ชื่อวัตถุดิบ *</label><input className="input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="เช่น หมูสามชั้น" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">หน่วย</label><input className="input" value={form.unit} onChange={e => setForm(f => ({...f, unit: e.target.value}))} placeholder="kg" /></div>
                <div><label className="label">หมวดหมู่</label><input className="input" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))} /></div>
              </div>
              <div><label className="label">แจ้งเตือนเมื่อต่ำกว่า</label><input type="number" className="input" value={form.min_qty} onChange={e => setForm(f => ({...f, min_qty: parseFloat(e.target.value)||0}))} /></div>
              <div><label className="label">หมายเหตุ</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} /></div>
            </div>
            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">ยกเลิก</button>
              <button onClick={handleCreate} disabled={saving} className="btn-primary">{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Cost */}
      {showEditCost && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-lg">แก้ไขต้นทุน — {showEditCost.name}</h2>
              <button onClick={() => setShowEditCost(null)}><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-yellow-50 rounded-lg p-3 text-sm text-yellow-800">
                ต้นทุนปัจจุบัน: <strong>฿{fmt(showEditCost.cost_per_unit)}/{showEditCost.unit}</strong>
                <br /><span className="text-xs">การแก้ไขจะมีผลกับการคำนวณซอยสต๊อกครั้งต่อไป</span>
              </div>
              <div>
                <label className="label">ต้นทุนใหม่ต่อ{showEditCost.unit} (฿) *</label>
                <input type="number" className="input" value={editCostValue}
                  onChange={e => setEditCostValue(e.target.value)}
                  placeholder="0.00" step="0.01" min="0" autoFocus />
              </div>
            </div>
            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={() => setShowEditCost(null)} className="btn-secondary">ยกเลิก</button>
              <button onClick={handleEditCost} disabled={saving} className="btn-primary">{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Stock In */}
      {showStockIn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-lg">รับสต๊อก — {showStockIn.name}</h2>
              <button onClick={() => setShowStockIn(null)}><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">จำนวน ({showStockIn.unit}) *</label><input type="number" className="input" value={stockInForm.quantity} onChange={e => setStockInForm(f => ({...f, quantity: e.target.value}))} placeholder="0.000" step="0.001" /></div>
                <div><label className="label">ราคาต่อ{showStockIn.unit} *</label><input type="number" className="input" value={stockInForm.cost_per_unit} onChange={e => setStockInForm(f => ({...f, cost_per_unit: e.target.value}))} placeholder="0.00" step="0.01" /></div>
              </div>
              {stockInForm.quantity && stockInForm.cost_per_unit && (
                <div className="bg-blue-50 rounded-lg p-3 text-sm">
                  <p className="text-gray-600">ต้นทุนรวม: <span className="font-bold text-blue-600">฿{fmt(parseFloat(stockInForm.quantity) * parseFloat(stockInForm.cost_per_unit))}</span></p>
                </div>
              )}
              <div><label className="label">ผู้ขาย/แหล่งที่มา</label><input className="input" value={stockInForm.supplier_name} onChange={e => setStockInForm(f => ({...f, supplier_name: e.target.value}))} /></div>
              <div><label className="label">อ้างอิง (เลขบิล/ใบส่งของ)</label><input className="input" value={stockInForm.reference} onChange={e => setStockInForm(f => ({...f, reference: e.target.value}))} /></div>
              <div><label className="label">หมายเหตุ</label><textarea className="input" rows={2} value={stockInForm.notes} onChange={e => setStockInForm(f => ({...f, notes: e.target.value}))} /></div>
            </div>
            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={() => setShowStockIn(null)} className="btn-secondary">ยกเลิก</button>
              <button onClick={handleStockIn} disabled={saving} className="btn-primary">{saving ? 'กำลังบันทึก...' : 'รับสต๊อก'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: ซอยสต๊อก ────────────────────────────────────────────────────────────
function ProcessingTab({ user }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [viewProc, setViewProc] = useState(null);
  const [bulkItems, setBulkItems] = useState([]);
  const [allProducts, setAllProducts] = useState([]);

  // Form
  const [selectedBulk, setSelectedBulk] = useState(null);
  const [inputQty, setInputQty] = useState('');
  const [outputs, setOutputs] = useState([{ output_name: '', quantity: '', unit: 'kg', product_id: '', sell_price: '' }]);
  const [procNotes, setProcNotes] = useState('');
  const [spoiledQty, setSpoiledQty] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => { setLoading(true); bulkStockAPI.processingList({ branch_id: user.branch_id }).then(setList).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => {
    load();
    bulkStockAPI.items({ branch_id: user.branch_id }).then(setBulkItems).catch(() => {});
    productAPI.all({ limit: 500 }).then(r => setAllProducts(Array.isArray(r) ? r : r.products || [])).catch(() => {});
  }, []);

  const addOutput = () => setOutputs(prev => [...prev, { output_name: '', quantity: '', unit: 'kg', product_id: '', sell_price: '' }]);
  const updateOutput = (i, field, val) => setOutputs(prev => prev.map((o, idx) => idx === i ? { ...o, [field]: val } : o));
  const removeOutput = (i) => setOutputs(prev => prev.filter((_, idx) => idx !== i));

  const totalOutput = outputs.reduce((s, o) => s + (parseFloat(o.quantity) || 0), 0);
  const spoiledQtyNum = parseFloat(spoiledQty) || 0;
  const wasteQty = Math.max(0, (parseFloat(inputQty) || 0) - totalOutput - spoiledQtyNum);
  const wastePct = parseFloat(inputQty) > 0 ? ((wasteQty + spoiledQtyNum) / parseFloat(inputQty) * 100).toFixed(1) : 0;
  const totalInputCost = selectedBulk ? parseFloat(selectedBulk.cost_per_unit || 0) * (parseFloat(inputQty) || 0) : 0;

  const handleCreate = async () => {
    if (!selectedBulk || !inputQty || outputs.some(o => !o.output_name || !o.quantity)) return toast.error('กรุณากรอกข้อมูลให้ครบ');
    setSaving(true);
    try {
      const allOutputs = [...outputs.map(o => ({ ...o, quantity: parseFloat(o.quantity), product_id: o.product_id || null, sell_price: parseFloat(o.sell_price) || 0 }))];
      if (spoiledQtyNum > 0) allOutputs.push({ output_name: 'สินค้าเสื่อม', quantity: spoiledQtyNum, unit: selectedBulk.unit || 'kg', product_id: null, sell_price: 0 });
      await bulkStockAPI.processingCreate({ bulk_item_id: selectedBulk.id, input_qty: parseFloat(inputQty), outputs: allOutputs, notes: procNotes, branch_id: user.branch_id });
      toast.success('บันทึกการซอยสำเร็จ');
      setShowCreate(false); setSelectedBulk(null); setInputQty(''); setOutputs([{ output_name: '', quantity: '', unit: 'kg', product_id: '', sell_price: '' }]); setProcNotes(''); setSpoiledQty('');
      load();
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); } finally { setSaving(false); }
  };

  const handleView = async (id) => {
    const r = await bulkStockAPI.processingGet(id);
    setViewProc(r);
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Scissors size={16} /> บันทึกการซอย</button>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>{['เลขการซอย','วันที่','วัตถุดิบ','นำเข้า','ผลผลิต','เสื่อม','ต้นทุนรวม',''].map(h => <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">กำลังโหลด...</td></tr>
              : list.length === 0 ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">ยังไม่มีรายการ</td></tr>
              : list.map(p => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-purple-600 font-medium">{p.process_number}</td>
                <td className="px-4 py-3">{new Date(p.created_at).toLocaleDateString('th-TH')}</td>
                <td className="px-4 py-3">{p.bulk_item_name}</td>
                <td className="px-4 py-3">{fmt(p.input_qty, 3)} {p.unit}</td>
                <td className="px-4 py-3 text-green-600">{fmt(p.total_output_qty, 3)} {p.unit}</td>
                <td className="px-4 py-3">
                  <span className={`font-medium ${parseFloat(p.waste_pct) > 10 ? 'text-red-600' : 'text-orange-500'}`}>
                    {fmt(p.waste_qty, 3)} ({p.waste_pct}%)
                  </span>
                </td>
                <td className="px-4 py-3">฿{fmt(p.total_input_cost)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleView(p.id)} className="text-xs px-2 py-1 bg-purple-50 text-purple-600 rounded hover:bg-purple-100 flex items-center gap-1">
                    <ChevronRight size={12} /> ดูรายละเอียด
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Processing */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between p-5 border-b"><h2 className="font-semibold text-lg">บันทึกการซอยสต๊อก</h2><button onClick={() => setShowCreate(false)}><X size={20} /></button></div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">วัตถุดิบ (สต๊อกใหญ่) *</label>
                  <select className="input" value={selectedBulk?.id || ''} onChange={e => setSelectedBulk(bulkItems.find(b => b.id === parseInt(e.target.value)) || null)}>
                    <option value="">-- เลือก --</option>
                    {bulkItems.map(b => <option key={b.id} value={b.id}>{b.name} (คงเหลือ: {fmt(b.current_qty, 3)} {b.unit}, ต้นทุน: ฿{fmt(b.cost_per_unit)}/{b.unit})</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">จำนวนที่นำเข้าซอย ({selectedBulk?.unit || 'หน่วย'}) *</label>
                  <input type="number" className="input" value={inputQty} onChange={e => setInputQty(e.target.value)} placeholder="0.000" step="0.001" />
                </div>
              </div>

              {/* สินค้าเสื่อม */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">สินค้าเสื่อม ({selectedBulk?.unit || 'kg'})</label>
                  <input type="number" className="input" value={spoiledQty}
                    onChange={e => setSpoiledQty(e.target.value)}
                    placeholder="0.000" step="0.001" min="0" />
                  <p className="text-xs text-gray-400 mt-0.5">สินค้าที่เสีย/เน่า ก่อนหรือระหว่างซอย</p>
                </div>
                <div />
              </div>

              {selectedBulk && inputQty && (
                <div className="grid grid-cols-4 gap-3 bg-gray-50 rounded-lg p-3 text-sm">
                  <div><p className="text-gray-500">ต้นทุนรวม</p><p className="font-bold text-blue-600">฿{fmt(totalInputCost)}</p></div>
                  <div><p className="text-gray-500">ผลผลิตรวม</p><p className="font-bold text-green-600">{fmt(totalOutput, 3)} {selectedBulk.unit}</p></div>
                  <div><p className="text-gray-500">สินค้าเสื่อม</p><p className={`font-bold ${spoiledQtyNum > 0 ? 'text-orange-500' : 'text-gray-400'}`}>{fmt(spoiledQtyNum, 3)} {selectedBulk.unit}</p></div>
                  <div><p className="text-gray-500">ซอยออก</p><p className={`font-bold ${wasteQty > 0 ? 'text-red-600' : 'text-gray-600'}`}>{fmt(wasteQty, 3)} {selectedBulk.unit}</p></div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">ส่วนที่ได้จากการซอย *</label>
                  <button onClick={addOutput} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"><Plus size={14} /> เพิ่มส่วน</button>
                </div>
                <div className="space-y-2">
                  {outputs.map((o, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <input className="input col-span-3 text-sm" placeholder="ชื่อส่วน เช่น เนื้อ" value={o.output_name} onChange={e => updateOutput(i, 'output_name', e.target.value)} />
                      <input type="number" className="input col-span-2 text-sm" placeholder="จำนวน" value={o.quantity} onChange={e => updateOutput(i, 'quantity', e.target.value)} step="0.001" />
                      <input className="input col-span-1 text-sm" placeholder="หน่วย" value={o.unit} onChange={e => updateOutput(i, 'unit', e.target.value)} />
                      <select className="input col-span-3 text-sm" value={o.product_id} onChange={e => updateOutput(i, 'product_id', e.target.value)}>
                        <option value="">-- สินค้า (ไม่บังคับ) --</option>
                        {allProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input type="number" className="input col-span-2 text-sm" placeholder="ราคาขาย" value={o.sell_price} onChange={e => updateOutput(i, 'sell_price', e.target.value)} step="0.01" />
                      <button onClick={() => removeOutput(i)} className="col-span-1 text-red-400 hover:text-red-600 flex justify-center"><X size={14} /></button>
                    </div>
                  ))}
                </div>
                {selectedBulk && inputQty && outputs.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    ต้นทุนจะถูกจัดสรรตามสัดส่วนน้ำหนักผลผลิต (ต้นทุนรวม ÷ น้ำหนักผลผลิตรวม)
                  </div>
                )}
              </div>
              <div><label className="label">หมายเหตุ</label><textarea className="input" rows={2} value={procNotes} onChange={e => setProcNotes(e.target.value)} /></div>
            </div>
            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">ยกเลิก</button>
              <button onClick={handleCreate} disabled={saving} className="btn-primary flex items-center gap-2">{saving ? 'กำลังบันทึก...' : <><Scissors size={16} /> บันทึกการซอย</>}</button>
            </div>
          </div>
        </div>
      )}

      {/* View Processing */}
      {viewProc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between p-5 border-b">
              <div><h2 className="font-semibold text-lg">{viewProc.process_number}</h2><p className="text-sm text-gray-500">{viewProc.bulk_item_name} • {new Date(viewProc.created_at).toLocaleDateString('th-TH')}</p></div>
              <button onClick={() => setViewProc(null)}><X size={20} /></button>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-4 gap-3 mb-4 bg-gray-50 rounded-lg p-3 text-sm">
                <div><p className="text-gray-500">นำเข้าซอย</p><p className="font-bold">{fmt(viewProc.input_qty, 3)} {viewProc.unit}</p></div>
                <div><p className="text-gray-500">ผลผลิตรวม</p><p className="font-bold text-green-600">{fmt(viewProc.total_output_qty, 3)} {viewProc.unit}</p></div>
                <div><p className="text-gray-500">เสื่อม</p><p className="font-bold text-red-500">{fmt(viewProc.waste_qty, 3)} ({viewProc.waste_pct}%)</p></div>
                <div><p className="text-gray-500">ต้นทุนรวม</p><p className="font-bold text-blue-600">฿{fmt(viewProc.total_input_cost)}</p></div>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-3 py-2">ส่วนที่ได้</th><th className="text-right px-3 py-2">จำนวน</th><th className="text-right px-3 py-2">ต้นทุนที่จัดสรร</th><th className="text-right px-3 py-2">ต้นทุน/หน่วย</th><th className="text-right px-3 py-2">ราคาขาย</th></tr></thead>
                <tbody>
                  {(viewProc.outputs || []).map((o, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-3 py-2">{o.output_name}</td>
                      <td className="text-right px-3 py-2">{fmt(o.quantity, 3)} {o.unit}</td>
                      <td className="text-right px-3 py-2">฿{fmt(o.allocated_cost)}</td>
                      <td className="text-right px-3 py-2">฿{fmt(o.cost_per_unit, 4)}</td>
                      <td className="text-right px-3 py-2 text-green-600">฿{fmt(o.sell_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: ต้นทุน/กำไร ────────────────────────────────────────────────────────
function CostAnalysisTab({ user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; });
  const [dateTo, setDateTo] = useState(today());

  const load = () => {
    setLoading(true);
    bulkStockAPI.costAnalysis({ branch_id: user.branch_id, date_from: dateFrom, date_to: dateTo })
      .then(setData).catch(() => toast.error('โหลดข้อมูลล้มเหลว')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="flex gap-3 items-end mb-4 flex-wrap">
        <div><label className="label">จาก</label><input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><label className="label">ถึง</label><input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        <button onClick={load} className="btn-primary">วิเคราะห์</button>
      </div>

      {loading && <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>}
      {data && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'รายได้รวม', value: `฿${fmt(data.summary.revenue)}`, color: 'text-green-600', icon: TrendingUp },
              { label: 'ต้นทุนรวม', value: `฿${fmt(data.summary.cost)}`, color: 'text-red-500', icon: TrendingDown },
              { label: 'กำไรสุทธิ', value: `฿${fmt(data.summary.profit)}`, color: parseFloat(data.summary.profit) >= 0 ? 'text-blue-600' : 'text-red-600', icon: BarChart2 },
              { label: 'Margin', value: `${data.summary.margin_pct}%`, color: 'text-purple-600', icon: BarChart2 },
            ].map(card => (
              <div key={card.label} className="card text-center">
                <card.icon size={20} className={`${card.color} mx-auto mb-1`} />
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top products */}
            <div className="card">
              <h3 className="font-semibold mb-3">สินค้ากำไรสูงสุด</h3>
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left py-1">สินค้า</th><th className="text-right py-1">ยอดขาย</th><th className="text-right py-1">กำไร</th><th className="text-right py-1">%</th></tr></thead>
                <tbody>
                  {data.top_products.slice(0,10).map((p, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="py-1.5">{p.name}</td>
                      <td className="text-right text-gray-500">฿{fmt(p.revenue)}</td>
                      <td className="text-right font-medium text-green-600">฿{fmt(p.profit)}</td>
                      <td className="text-right">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${parseFloat(p.margin_pct) > 20 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{p.margin_pct}%</span>
                      </td>
                    </tr>
                  ))}
                  {data.top_products.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-gray-400">ไม่มีข้อมูล</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Waste summary */}
            <div className="card">
              <h3 className="font-semibold mb-3">สรุปการสูญเสียจากการซอย</h3>
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left py-1">วัตถุดิบ</th><th className="text-right py-1">นำเข้า</th><th className="text-right py-1">เสื่อม</th><th className="text-right py-1">% เฉลี่ย</th></tr></thead>
                <tbody>
                  {data.waste_summary.map((w, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="py-1.5">{w.name}</td>
                      <td className="text-right text-gray-500">{fmt(w.total_input, 3)}</td>
                      <td className="text-right text-red-500">{fmt(w.total_waste, 3)}</td>
                      <td className="text-right">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${parseFloat(w.avg_waste_pct) > 10 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{w.avg_waste_pct}%</span>
                      </td>
                    </tr>
                  ))}
                  {data.waste_summary.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-gray-400">ไม่มีข้อมูล</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Revenue breakdown */}
          <div className="card">
            <h3 className="font-semibold mb-3">สรุปรายได้แยกช่องทาง</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center p-3 bg-blue-50 rounded-lg"><p className="text-gray-500">POS (หน้าร้าน)</p><p className="text-xl font-bold text-blue-600">฿{fmt(data.summary.pos_revenue)}</p></div>
              <div className="text-center p-3 bg-green-50 rounded-lg"><p className="text-gray-500">บิลออก (ค้าส่ง)</p><p className="text-xl font-bold text-green-600">฿{fmt(data.summary.delivery_revenue)}</p></div>
              <div className="text-center p-3 bg-orange-50 rounded-lg"><p className="text-gray-500">ต้นทุนซื้อเข้า</p><p className="text-xl font-bold text-orange-600">฿{fmt(data.summary.total_purchase)}</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BulkStockPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('stock');
  const tabs = [
    { key: 'stock', label: 'สต๊อกใหญ่' },
    { key: 'processing', label: 'ซอยสต๊อก' },
    { key: 'cost', label: 'ต้นทุน/กำไร' },
  ];
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">สต๊อกใหญ่ & การซอย</h1>
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'stock' && <BulkItemsTab user={user} />}
      {tab === 'processing' && <ProcessingTab user={user} />}
      {tab === 'cost' && <CostAnalysisTab user={user} />}
    </div>
  );
}
