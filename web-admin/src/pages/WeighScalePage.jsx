import React, { useState, useEffect, useRef, useCallback } from 'react';
import { productAPI, partnerAPI, salesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Scale, Wifi, WifiOff, Search, Plus, Trash2, ShoppingCart, Settings, Printer, X, RefreshCw } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────
// Parse weight string from various scale protocols (DIGI, A&D, CAS, generic)
// Most scales send: "ST,GS,+  1.234 kg\r\n" or "  1.234\r\n" or "1234\r\n"
// ─────────────────────────────────────────────────────────────────
function parseWeightLine(str) {
  if (!str) return null;
  const clean = str.replace(/[\x00-\x08\x0b\x0e-\x1f\x7f]/g, '').trim();
  if (!clean) return null;

  const upper = clean.toUpperCase();
  const isUnstable = upper.includes('US') || upper.includes('UNSTABLE') || upper.includes('OL') || upper.includes('OVER');
  const isStable = !isUnstable;

  // Extract number: allow decimal, handle spaces inside numbers
  const m = clean.match(/([+\-]?\s*\d[\d\s]*\.?\d*)/);
  if (!m) return null;

  let val = parseFloat(m[1].replace(/\s/g, ''));
  if (isNaN(val)) return null;
  if (val < 0) val = 0;

  // Unit detection: grams vs kg
  const lower = clean.toLowerCase();
  const isGrams = (lower.includes(' g') || lower.endsWith('g')) &&
                  !lower.includes('kg') && !lower.includes('กก');
  if (isGrams && val > 0) val = val / 1000;

  return { value: val, stable: isStable, raw: clean };
}

const BAUD_RATES = [600, 1200, 2400, 4800, 9600, 19200, 38400];

const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

// ─────────────────────────────────────────────────────────────────

function PrintSlipModal({ item, onClose }) {
  const handlePrint = () => {
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>ใบชั่ง</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
        body { font-family: 'Sarabun', sans-serif; text-align: center; padding: 16px; width: 80mm; }
        .big { font-size: 28px; font-weight: bold; margin: 8px 0; }
        .line { border-top: 1px dashed #000; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; font-size: 14px; margin: 4px 0; }
        .total { font-size: 22px; font-weight: bold; }
        @media print { button { display: none; } }
      </style></head><body>
      <p style="font-size:12px; color:#666;">${new Date().toLocaleString('th-TH')}</p>
      <p class="big">${item.product_name}</p>
      <div class="line"></div>
      <div class="row"><span>น้ำหนัก</span><span>${item.weight.toFixed(3)} kg</span></div>
      <div class="row"><span>ราคา/kg</span><span>฿${fmt(item.price_per_unit)}</span></div>
      ${item.partner_name ? `<div class="row"><span>คู่ค้า</span><span>${item.partner_name}</span></div>` : ''}
      <div class="line"></div>
      <p class="total">฿ ${fmt(item.total)}</p>
      <button onclick="window.print()" style="margin-top:12px; padding:6px 16px;">พิมพ์</button>
      <script>window.onload = () => window.print();</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xs">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">ใบชั่ง</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="text-center font-bold text-lg">{item.product_name}</div>
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">น้ำหนัก</span>
              <span className="font-mono font-bold">{item.weight.toFixed(3)} kg</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">ราคา/kg</span>
              <span className="font-medium">฿{fmt(item.price_per_unit)}</span>
            </div>
            {item.partner_name && (
              <div className="flex justify-between">
                <span className="text-gray-500">คู่ค้า</span>
                <span className="text-orange-600">{item.partner_name}</span>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between font-bold text-base">
              <span>รวม</span>
              <span className="text-blue-600">฿{fmt(item.total)}</span>
            </div>
          </div>
        </div>
        <div className="p-4 border-t flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">ปิด</button>
          <button onClick={handlePrint} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Printer size={14} /> พิมพ์ใบชั่ง
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WeighScalePage() {
  const { user } = useAuth();

  // Scale state
  const [port, setPort] = useState(null);
  const [connected, setConnected] = useState(false);
  const [weight, setWeight] = useState(0);
  const [stable, setStable] = useState(false);
  const [rawLine, setRawLine] = useState('');
  const [baudRate, setBaudRate] = useState(9600);
  const [showSettings, setShowSettings] = useState(false);
  const readerRef = useRef(null);
  const portRef = useRef(null);

  // Product state
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Mode + partner
  const [mode, setMode] = useState('retail');
  const [partners, setPartners] = useState([]);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [partnerPrice, setPartnerPrice] = useState(null);
  const [loadingPrice, setLoadingPrice] = useState(false);

  // Session
  const [sessionItems, setSessionItems] = useState([]);
  const [printSlip, setPrintSlip] = useState(null);
  const [creatingSale, setCreatingSale] = useState(false);

  const hasSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

  useEffect(() => {
    partnerAPI.list({ branch_id: user.branch_id })
      .then(r => setPartners(Array.isArray(r) ? r : (r.partners || [])))
      .catch(() => {});
  }, []);

  // Product search (only is_weight products)
  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await productAPI.all({ search: productSearch, limit: 15 });
        const prods = Array.isArray(r) ? r : (r.products || []);
        setProductResults(prods.filter(p => p.is_weight));
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [productSearch]);

  // Partner price lookup
  useEffect(() => {
    if (mode === 'wholesale' && selectedPartner && selectedProduct) {
      setLoadingPrice(true);
      partnerAPI.getPrice(selectedPartner.id, selectedProduct.id)
        .then(r => setPartnerPrice(r?.special_price != null ? parseFloat(r.special_price) : null))
        .catch(() => setPartnerPrice(null))
        .finally(() => setLoadingPrice(false));
    } else {
      setPartnerPrice(null);
    }
  }, [mode, selectedPartner?.id, selectedProduct?.id]);

  const activePrice = (mode === 'wholesale' && partnerPrice !== null)
    ? partnerPrice
    : parseFloat(selectedProduct?.sell_price || 0);

  const totalPrice = weight * activePrice;

  // ─── Scale connection ────────────────────────────────────────
  const readLoop = useCallback(async (p) => {
    let buffer = '';
    const decoder = new TextDecoder();
    try {
      const reader = p.readable.getReader();
      readerRef.current = reader;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/[\r\n]+/);
        buffer = parts.pop();
        for (const line of parts) {
          const parsed = parseWeightLine(line);
          if (parsed) {
            setWeight(parsed.value);
            setStable(parsed.stable);
            setRawLine(parsed.raw);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        toast.error('การเชื่อมต่อขาด');
      }
    } finally {
      readerRef.current = null;
      setConnected(false);
      setPort(null);
      portRef.current = null;
    }
  }, []);

  const connectScale = async () => {
    if (!hasSerial) {
      toast.error('ต้องใช้ Chrome หรือ Edge เพื่อเชื่อมต่อ Serial Port');
      return;
    }
    try {
      const p = await navigator.serial.requestPort();
      await p.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
      portRef.current = p;
      setPort(p);
      setConnected(true);
      toast.success('เชื่อมต่อตาชั่งสำเร็จ');
      readLoop(p);
    } catch (err) {
      if (err.name !== 'NotSelectedError') {
        toast.error('เชื่อมต่อล้มเหลว: ' + (err.message || 'ไม่ทราบสาเหตุ'));
      }
    }
  };

  const disconnectScale = async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
      }
      if (portRef.current) {
        await portRef.current.close();
      }
    } catch {}
    setPort(null);
    portRef.current = null;
    setConnected(false);
    setWeight(0);
    setStable(false);
    toast('ยกเลิกการเชื่อมต่อแล้ว');
  };

  // Manual weight input (for testing without scale)
  const [manualWeight, setManualWeight] = useState('');
  const applyManual = () => {
    const v = parseFloat(manualWeight);
    if (!isNaN(v) && v >= 0) { setWeight(v); setStable(true); }
    setManualWeight('');
  };

  // ─── Actions ────────────────────────────────────────────────
  const selectProduct = (p) => {
    setSelectedProduct(p);
    setProductSearch('');
    setProductResults([]);
  };

  const addToSession = () => {
    if (!selectedProduct) return toast.error('เลือกสินค้าก่อน');
    if (weight <= 0) return toast.error('น้ำหนักต้องมากกว่า 0');
    const item = {
      id: Date.now(),
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      weight,
      price_per_unit: activePrice,
      total: totalPrice,
      mode,
      partner_name: mode === 'wholesale' ? selectedPartner?.name : null,
    };
    setSessionItems(prev => [...prev, item]);
    setPrintSlip(item);
  };

  const removeItem = (id) => setSessionItems(prev => prev.filter(i => i.id !== id));

  const sessionTotal = sessionItems.reduce((s, i) => s + i.total, 0);

  const createSale = async () => {
    if (!sessionItems.length) return toast.error('ยังไม่มีรายการ');
    setCreatingSale(true);
    try {
      await salesAPI.create({
        branch_id: user.branch_id,
        items: sessionItems.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: parseFloat(i.weight.toFixed(3)),
          unit_price: i.price_per_unit,
          cost_price: 0,
        })),
        payment_method: 'cash',
        payment_amount: sessionTotal,
        notes: 'จากระบบชั่งน้ำหนัก',
      });
      toast.success('สร้างบิลขายสำเร็จ');
      setSessionItems([]);
    } catch (err) {
      toast.error(err.error || 'เกิดข้อผิดพลาด');
    } finally { setCreatingSale(false); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ชั่งน้ำหนัก</h1>
          <p className="text-gray-500 text-sm">เชื่อมต่อตาชั่งผ่าน USB Serial Port</p>
        </div>
        <button onClick={() => setShowSettings(true)} className="btn-secondary flex items-center gap-2 text-sm">
          <Settings size={14} /> ตั้งค่า Baud Rate
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Left column: Scale + Product ────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Scale panel */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                <Scale size={16} className="text-blue-600" /> ตาชั่ง
                <span className="text-xs text-gray-400 font-normal">({baudRate} baud)</span>
              </h2>
              <div className="flex items-center gap-2">
                {connected
                  ? <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />เชื่อมต่อแล้ว</span>
                  : <span className="flex items-center gap-1 text-xs text-gray-400"><span className="w-2 h-2 rounded-full bg-gray-300" />ไม่ได้เชื่อมต่อ</span>}
                {connected
                  ? <button onClick={disconnectScale} className="text-xs py-1 px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1"><WifiOff size={12} /> ยกเลิก</button>
                  : <button onClick={connectScale} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"><Wifi size={12} /> เชื่อมต่อ</button>}
              </div>
            </div>

            {/* Big display */}
            <div className={`rounded-2xl p-6 text-center select-none transition-colors ${connected ? 'bg-gray-900' : 'bg-gray-100'}`}>
              <div
                className={`font-mono font-bold leading-none tracking-tight transition-all ${connected ? (stable ? 'text-green-400' : 'text-yellow-400') : 'text-gray-400'}`}
                style={{ fontSize: '80px' }}>
                {weight.toFixed(3)}
              </div>
              <div className={`text-3xl font-mono font-semibold mt-1 ${connected ? 'text-gray-400' : 'text-gray-400'}`}>kg</div>

              {connected && (
                <div className={`mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ${stable ? 'bg-green-800 text-green-300' : 'bg-yellow-800 text-yellow-300 animate-pulse'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${stable ? 'bg-green-400' : 'bg-yellow-400'}`} />
                  {stable ? 'น้ำหนักนิ่ง' : 'กำลังชั่ง...'}
                </div>
              )}

              {!connected && !hasSerial && (
                <div className="mt-3 text-xs text-gray-400 bg-yellow-50 rounded-lg p-2 text-yellow-700">
                  ต้องใช้ Chrome หรือ Edge เวอร์ชันใหม่ (Web Serial API)
                </div>
              )}
            </div>

            {/* Raw data + manual input */}
            <div className="mt-3 flex gap-2 items-center">
              {rawLine && <p className="text-xs text-gray-400 font-mono flex-1 truncate">Raw: {rawLine}</p>}
              <div className="flex gap-1 ml-auto">
                <input
                  type="number" step="0.001" min="0"
                  value={manualWeight}
                  onChange={e => setManualWeight(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && applyManual()}
                  className="input text-sm py-1 w-28 text-right"
                  placeholder="ใส่ kg เอง"
                />
                <button onClick={applyManual} className="btn-secondary text-xs py-1 px-2 flex items-center gap-1">
                  <RefreshCw size={12} /> ตั้ง
                </button>
              </div>
            </div>
          </div>

          {/* Product & pricing */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">สินค้าและราคา</h2>
              {/* Mode toggle */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button onClick={() => setMode('retail')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${mode === 'retail' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>
                  ราคาปกติ
                </button>
                <button onClick={() => setMode('wholesale')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${mode === 'wholesale' ? 'bg-white shadow text-orange-600' : 'text-gray-500'}`}>
                  ราคาส่ง
                </button>
              </div>
            </div>

            {mode === 'wholesale' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เลือกคู่ค้า</label>
                <select
                  value={selectedPartner?.id || ''}
                  onChange={e => setSelectedPartner(partners.find(p => String(p.id) === e.target.value) || null)}
                  className="input">
                  <option value="">-- เลือกคู่ค้า --</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            {/* Product search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ค้นหาสินค้า (เฉพาะสินค้าชั่งน้ำหนัก)
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  className="input pl-8"
                  placeholder="ชื่อสินค้าหรือ barcode..."
                />
              </div>
              {productResults.length > 0 && (
                <div className="border rounded-lg mt-1 max-h-44 overflow-y-auto bg-white shadow-sm z-10 relative">
                  {productResults.length === 0 && (
                    <p className="px-3 py-3 text-sm text-gray-400 text-center">ไม่พบสินค้าชั่งน้ำหนัก</p>
                  )}
                  {productResults.map(p => (
                    <button key={p.id} onClick={() => selectProduct(p)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 text-left border-b last:border-0 text-sm">
                      {p.image_url
                        ? <img src={p.image_url} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                        : <div className="w-9 h-9 rounded bg-gray-100 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-900">{p.name}</span>
                        <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 rounded">
                          {p.product_type === 'fresh' ? 'ของสด' : p.product_type === 'innards' ? 'เครื่องใน' : 'แปรรูป'}
                        </span>
                      </div>
                      <span className="text-blue-600 font-semibold flex-shrink-0">฿{fmt(p.sell_price)}/kg</span>
                    </button>
                  ))}
                </div>
              )}
              {productSearch.trim() && productResults.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">ไม่พบสินค้าชั่งน้ำหนัก — ตรวจสอบว่าสินค้าเปิดใช้งาน "ชั่งน้ำหนัก" ในระบบ</p>
              )}
            </div>

            {/* Price calculator */}
            {selectedProduct ? (
              <div className={`rounded-xl p-4 border-2 ${mode === 'wholesale' ? 'border-orange-200 bg-orange-50' : 'border-blue-100 bg-blue-50'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3 flex-1">
                    {selectedProduct.image_url && (
                      <img src={selectedProduct.image_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 shadow-sm" />
                    )}
                  <div>
                    <p className="font-bold text-gray-900 text-base">{selectedProduct.name}</p>
                    {mode === 'wholesale' && selectedPartner && (
                      <p className="text-xs mt-0.5">
                        {loadingPrice ? (
                          <span className="text-gray-400">กำลังโหลดราคาส่ง...</span>
                        ) : partnerPrice !== null ? (
                          <span className="text-orange-600 font-medium">ราคาส่ง: ฿{fmt(partnerPrice)}/kg ({selectedPartner.name})</span>
                        ) : (
                          <span className="text-gray-500">ใช้ราคาปกติ (ไม่พบราคาส่งพิเศษ)</span>
                        )}
                      </p>
                    )}
                  </div>
                  </div>
                  <button onClick={() => setSelectedProduct(null)} className="text-gray-400 hover:text-red-500 text-xl leading-none mt-0.5 flex-shrink-0">×</button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div className="bg-white rounded-xl p-3 shadow-sm">
                    <p className="text-xs text-gray-400 mb-1">น้ำหนัก</p>
                    <p className="font-bold text-xl font-mono text-gray-900">{weight.toFixed(3)}</p>
                    <p className="text-xs text-gray-400">kg</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 shadow-sm">
                    <p className="text-xs text-gray-400 mb-1">ราคา/kg</p>
                    <p className={`font-bold text-xl ${mode === 'wholesale' && partnerPrice !== null ? 'text-orange-600' : 'text-blue-600'}`}>
                      ฿{fmt(activePrice)}
                    </p>
                  </div>
                  <div className={`rounded-xl p-3 shadow-sm ${totalPrice > 0 ? (mode === 'wholesale' ? 'bg-orange-500' : 'bg-blue-600') + ' text-white' : 'bg-white'}`}>
                    <p className={`text-xs mb-1 ${totalPrice > 0 ? 'opacity-70' : 'text-gray-400'}`}>รวม</p>
                    <p className="font-bold text-xl">฿{fmt(totalPrice)}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={addToSession}
                    disabled={weight <= 0}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm disabled:opacity-40 transition-all ${mode === 'wholesale' ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                  >
                    <Plus size={15} /> เพิ่มลงรายการ
                  </button>
                  {weight > 0 && activePrice > 0 && (
                    <button
                      onClick={() => setPrintSlip({ product_name: selectedProduct.name, weight, price_per_unit: activePrice, total: totalPrice, partner_name: mode === 'wholesale' ? selectedPartner?.name : null })}
                      className="p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
                      title="พิมพ์ใบชั่ง"
                    >
                      <Printer size={15} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center text-gray-400">
                <Scale size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">ค้นหาและเลือกสินค้าเพื่อคำนวณราคา</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right column: Session list ────────── */}
        <div className="card flex flex-col min-h-64">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <ShoppingCart size={16} className="text-blue-600" /> รายการ
            {sessionItems.length > 0 && (
              <span className="ml-1 text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5">{sessionItems.length}</span>
            )}
          </h2>

          {sessionItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center py-10">
              <div className="text-gray-400">
                <ShoppingCart size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">ยังไม่มีรายการ</p>
                <p className="text-xs mt-0.5">ชั่งสินค้าแล้วกด "เพิ่มลงรายการ"</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto">
                {sessionItems.map((item, idx) => (
                  <div key={item.id} className="bg-gray-50 rounded-xl p-2.5 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">{idx+1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate leading-tight">{item.product_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.weight.toFixed(3)} kg × ฿{fmt(item.price_per_unit)}
                          {item.partner_name && <span className="ml-1 text-orange-600">[{item.partner_name}]</span>}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                        <span className="font-bold text-blue-600">฿{fmt(item.total)}</span>
                        <div className="flex gap-1">
                          <button onClick={() => setPrintSlip(item)} className="text-gray-400 hover:text-gray-600" title="พิมพ์ใบชั่ง"><Printer size={12} /></button>
                          <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600" title="ลบ"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t mt-3 pt-3 space-y-3">
                <div className="flex justify-between font-bold text-base">
                  <span className="text-gray-700">รวมทั้งหมด</span>
                  <span className="text-blue-700">฿{fmt(sessionTotal)}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { if (confirm('ล้างรายการทั้งหมด?')) setSessionItems([]); }}
                    className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-red-500 hover:bg-red-50 font-medium"
                  >
                    ล้างรายการ
                  </button>
                  <button
                    onClick={createSale}
                    disabled={creatingSale}
                    className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {creatingSale ? 'กำลังสร้าง...' : 'สร้างบิลขาย'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold flex items-center gap-2"><Settings size={16} /> ตั้งค่าตาชั่ง</h2>
              <button onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Baud Rate (ความเร็วสื่อสาร)</label>
                <select value={baudRate} onChange={e => setBaudRate(parseInt(e.target.value))} className="input">
                  {BAUD_RATES.map(b => (
                    <option key={b} value={b}>{b} {b === 9600 ? '(ค่าปกติ)' : b === 1200 ? '(ตาชั่งเก่า)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                <p><strong>วิธีเชื่อมต่อ:</strong></p>
                <p>1. เสียบสาย USB/Serial จากตาชั่งเข้าคอมพิวเตอร์</p>
                <p>2. ตั้ง Baud Rate ให้ตรงกับตาชั่ง (ดูที่คู่มือหรือหน้าจอตาชั่ง)</p>
                <p>3. กดปุ่ม "เชื่อมต่อ" แล้วเลือก COM Port</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3 text-xs text-yellow-800">
                <strong>หมายเหตุ:</strong> ต้องใช้ Google Chrome หรือ Microsoft Edge เวอร์ชัน 89 ขึ้นไป
                เปิดใช้งานผ่าน HTTPS หรือ localhost เท่านั้น
              </div>
            </div>
            <div className="p-4 border-t">
              <button onClick={() => setShowSettings(false)} className="btn-primary w-full">บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* Print slip modal */}
      {printSlip && <PrintSlipModal item={printSlip} onClose={() => setPrintSlip(null)} />}
    </div>
  );
}
