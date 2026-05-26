import React, { useState, useEffect, useRef } from 'react';
import { productAPI, salesAPI, heldBillAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Minus, Trash2, Scale, X, Search, Printer, PauseCircle, PlayCircle, Clock } from 'lucide-react';
import { io } from 'socket.io-client';

export default function POSPage() {
  const { user } = useAuth();
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [scaleWeight, setScaleWeight] = useState(0);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [weightProduct, setWeightProduct] = useState(null);

  // Hold bill
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [heldBills, setHeldBills] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [holdNotes, setHoldNotes] = useState('');
  const [holdLoading, setHoldLoading] = useState(false);

  const searchRef = useRef(null);
  const barcodeRef = useRef('');
  const lastKeyTime = useRef(0);

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const total = Math.max(0, subtotal - discount);
  const change = paymentMethod === 'cash' ? Math.max(0, parseFloat(paymentAmount || 0) - total) : 0;

  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000');
    socket.on('scale-weight', ({ weight }) => setScaleWeight(weight));
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      productAPI.list({ q: search, branch_id: user.branch_id }).then(setSearchResults).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT' && document.activeElement !== searchRef.current) return;
      const now = Date.now();
      if (now - lastKeyTime.current > 100) barcodeRef.current = '';
      lastKeyTime.current = now;
      if (e.key === 'Enter' && barcodeRef.current.length >= 3) {
        handleBarcodeScanned(barcodeRef.current);
        barcodeRef.current = '';
      } else if (e.key.length === 1) {
        barcodeRef.current += e.key;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleBarcodeScanned = async (barcode) => {
    try {
      const product = await productAPI.byBarcode(barcode, user.branch_id);
      if (product.is_weight) { setWeightProduct(product); return; }
      addToCart(product, 1);
    } catch { toast.error(`ไม่พบสินค้า: ${barcode}`); }
  };

  const addToCart = (product, quantity = 1) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + quantity } : i);
      return [...prev, { product_id: product.id, name: product.name, barcode: product.barcode, unit_price: product.sell_price, cost_price: product.cost_price, quantity, unit: product.unit, is_weight: product.is_weight, image_url: product.image_url || null }];
    });
    setSearch(''); setSearchResults([]);
  };

  const addWeightItem = () => {
    if (!weightProduct || scaleWeight <= 0) return;
    addToCart(weightProduct, scaleWeight);
    setWeightProduct(null);
  };

  const updateQty = (product_id, delta) =>
    setCart(prev => prev.map(i => i.product_id === product_id ? { ...i, quantity: Math.max(0.001, i.quantity + delta) } : i).filter(i => i.quantity > 0));

  const removeItem = (product_id) => setCart(prev => prev.filter(i => i.product_id !== product_id));

  const clearCart = () => { setCart([]); setDiscount(0); setPaymentAmount(''); setCustomerName(''); };

  // ─── Hold Bill ───────────────────────────────────────────────────────────────
  const handleHold = async () => {
    if (!cart.length) return toast.error('ไม่มีสินค้าในตะกร้า');
    setHoldLoading(true);
    try {
      const held = await heldBillAPI.hold({
        branch_id: user.branch_id,
        cart_items: cart,
        discount,
        total_amount: total,
        customer_name: customerName || null,
        notes: holdNotes || null,
      });
      toast.success(`Hold บิล ${held.session_code} แล้ว`);
      clearCart();
      setShowHoldModal(false);
      setHoldNotes('');
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setHoldLoading(false); }
  };

  // ─── Recall Bill ─────────────────────────────────────────────────────────────
  const loadHeldBills = async () => {
    const bills = await heldBillAPI.list({ branch_id: user.branch_id });
    setHeldBills(bills);
    setShowRecallModal(true);
  };

  const handleRecall = async (id) => {
    if (cart.length > 0 && !window.confirm('ตะกร้าปัจจุบันจะถูกแทนที่ด้วยบิลที่ Hold ไว้ ยืนยัน?')) return;
    try {
      const held = await heldBillAPI.recall(id);
      const items = typeof held.cart_items === 'string' ? JSON.parse(held.cart_items) : held.cart_items;
      setCart(items);
      setDiscount(parseFloat(held.discount || 0));
      setCustomerName(held.customer_name || '');
      setShowRecallModal(false);
      toast.success(`เรียกบิล ${held.session_code} แล้ว`);
    } catch (err) { toast.error(err.error || 'บิลหมดอายุหรือไม่พบ'); }
  };

  const handleCancelHeld = async (id) => {
    if (!window.confirm('ยืนยันยกเลิกบิลที่ Hold ไว้?')) return;
    try {
      await heldBillAPI.cancel(id);
      setHeldBills(prev => prev.filter(b => b.id !== id));
      toast.success('ยกเลิกบิลแล้ว');
    } catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  // ─── Checkout ────────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (!cart.length) return toast.error('ไม่มีสินค้าในตะกร้า');
    if (paymentMethod === 'cash' && parseFloat(paymentAmount || 0) < total) return toast.error('รับเงินไม่ครบ');
    setProcessing(true);
    try {
      const sale = await salesAPI.create({
        branch_id: user.branch_id,
        items: cart.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price })),
        discount_amount: discount,
        payment_method: paymentMethod,
        payment_amount: parseFloat(paymentAmount) || total,
      });
      setLastReceipt(sale);
      clearCart();
      toast.success(`บิล ${sale.receipt_number} สำเร็จ`);
    } catch (err) { toast.error(err.error || 'เกิดข้อผิดพลาด'); }
    finally { setProcessing(false); }
  };

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  const remainingMins = (expiresAt) => {
    const diff = new Date(expiresAt) - new Date();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} นาที`;
    return `${Math.floor(mins / 60)} ชม. ${mins % 60} นาที`;
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Left */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search bar */}
        <div className="card mb-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                className="input pl-9" placeholder="ค้นหาสินค้า หรือสแกน Barcode..." autoFocus />
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm">
              <Scale size={15} className="text-blue-500" />
              <span className="font-mono font-bold">{scaleWeight.toFixed(3)} kg</span>
            </div>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 border rounded-lg overflow-hidden max-h-52 overflow-y-auto">
              {searchResults.map(p => (
                <button key={p.id} onClick={() => p.is_weight ? setWeightProduct(p) : addToCart(p)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 text-left border-b last:border-b-0">
                  {p.image_url
                    ? <img src={p.image_url} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                    : <div className="w-9 h-9 rounded bg-gray-100 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.barcode} | สต๊อก: {p.front_stock} {p.unit}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-blue-600">฿{fmt(p.sell_price)}</p>
                    {p.is_weight && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 rounded">ชั่งน้ำหนัก</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {weightProduct && (
          <div className="card mb-3 bg-blue-50 border-blue-200">
            <div className="flex items-center gap-3">
              <Scale size={20} className="text-blue-600" />
              <div className="flex-1">
                <p className="font-medium">{weightProduct.name}</p>
                <p className="text-sm text-gray-500">น้ำหนัก: <span className="font-bold text-blue-600">{scaleWeight.toFixed(3)} kg</span></p>
              </div>
              <button onClick={addWeightItem} disabled={scaleWeight <= 0} className="btn-primary text-sm">เพิ่มในตะกร้า</button>
              <button onClick={() => setWeightProduct(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
          </div>
        )}

        {/* Customer name (optional) */}
        {customerName && (
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
            <span className="text-yellow-700 font-medium">ลูกค้า: {customerName}</span>
            <button onClick={() => setCustomerName('')} className="ml-auto text-yellow-500 hover:text-yellow-700"><X size={14} /></button>
          </div>
        )}

        {/* Cart */}
        <div className="card flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-700">รายการ ({cart.length})</h2>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-600">ล้างตะกร้า</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <CartIcon size={40} className="mb-2 opacity-30" />
                <p className="text-sm">สแกน Barcode หรือค้นหาสินค้า</p>
              </div>
            ) : cart.map(item => (
              <div key={item.product_id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
                {item.image_url
                  ? <img src={item.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  : <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">฿{fmt(item.unit_price)}/{item.unit}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(item.product_id, item.is_weight ? -0.1 : -1)}
                    className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                    <Minus size={12} />
                  </button>
                  <span className="w-14 text-center text-sm font-mono">{item.is_weight ? item.quantity.toFixed(3) : item.quantity}</span>
                  <button onClick={() => updateQty(item.product_id, item.is_weight ? 0.1 : 1)}
                    className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                    <Plus size={12} />
                  </button>
                </div>
                <span className="text-sm font-bold w-20 text-right">฿{fmt(item.unit_price * item.quantity)}</span>
                <button onClick={() => removeItem(item.product_id)} className="text-red-400 hover:text-red-600 ml-1"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Summary */}
      <div className="w-72 flex flex-col gap-3">
        <div className="card flex-1 overflow-y-auto">
          <h2 className="font-semibold text-gray-700 mb-3">สรุปยอด</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">ยอดรวม</span><span>฿{fmt(subtotal)}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">ส่วนลด</span>
              <input type="number" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                className="w-24 text-right border rounded px-2 py-1 text-sm" min="0" />
            </div>
            <hr />
            <div className="flex justify-between text-lg font-bold">
              <span>ยอดสุทธิ</span>
              <span className="text-blue-600">฿{fmt(total)}</span>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-sm text-gray-500 mb-2">วิธีชำระเงิน</p>
            <div className="grid grid-cols-3 gap-2">
              {[['cash','เงินสด'],['card','บัตร'],['promptpay','พร้อมเพย์']].map(([v,l]) => (
                <button key={v} onClick={() => setPaymentMethod(v)}
                  className={`py-2 rounded-lg text-xs font-medium border transition-all ${paymentMethod === v ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === 'cash' && (
            <div className="mt-3">
              <label className="text-sm text-gray-500">รับเงิน</label>
              <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                className="input mt-1" placeholder="0.00" />
              {paymentAmount && (
                <div className="flex justify-between mt-2 text-sm">
                  <span className="text-gray-500">เงินทอน</span>
                  <span className={`font-bold ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>฿{fmt(change)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setShowHoldModal(true)} disabled={!cart.length}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium border-2 border-yellow-400 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            <PauseCircle size={16} /> Hold บิล
          </button>
          <button onClick={loadHeldBills}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium border-2 border-green-400 text-green-700 bg-green-50 hover:bg-green-100 transition-all">
            <PlayCircle size={16} /> เรียกบิล
          </button>
        </div>

        <button onClick={handleCheckout} disabled={!cart.length || processing}
          className="btn-success py-4 text-base font-bold w-full">
          {processing ? 'กำลังดำเนินการ...' : `ชำระเงิน ฿${fmt(total)}`}
        </button>

        {lastReceipt && (
          <div className="card bg-green-50 border-green-200 py-3">
            <div className="flex items-center gap-2 text-green-700 mb-1">
              <Printer size={14} />
              <span className="text-sm font-medium">บิลล่าสุด</span>
            </div>
            <p className="text-xs text-green-600 font-mono">{lastReceipt.receipt_number}</p>
            <p className="text-xs text-gray-500">฿{fmt(lastReceipt.total_amount)}</p>
          </div>
        )}
      </div>

      {/* ─── Hold Modal ─────────────────────────────── */}
      {showHoldModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-lg flex items-center gap-2"><PauseCircle size={18} className="text-yellow-500" /> Hold บิล</h2>
              <button onClick={() => setShowHoldModal(false)}><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-yellow-50 rounded-lg p-3 text-sm text-yellow-700">
                บิลจะถูก Hold ไว้ <span className="font-bold">24 ชั่วโมง</span> แล้วจะหมดอายุอัตโนมัติ
              </div>
              <div>
                <label className="label">ชื่อลูกค้า (ไม่บังคับ)</label>
                <input className="input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="เช่น คุณสมชาย" />
              </div>
              <div>
                <label className="label">หมายเหตุ</label>
                <input className="input" value={holdNotes} onChange={e => setHoldNotes(e.target.value)} placeholder="บันทึกเพิ่มเติม..." />
              </div>
              <div className="text-sm text-gray-500">
                รายการ {cart.length} อย่าง • ยอด ฿{fmt(total)}
              </div>
            </div>
            <div className="p-5 border-t flex gap-3">
              <button onClick={() => setShowHoldModal(false)} className="btn-secondary flex-1">ยกเลิก</button>
              <button onClick={handleHold} disabled={holdLoading} className="flex-1 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white font-medium text-sm disabled:opacity-50">
                {holdLoading ? 'กำลัง Hold...' : 'Hold บิล'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Recall Modal ───────────────────────────── */}
      {showRecallModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-lg flex items-center gap-2"><PlayCircle size={18} className="text-green-500" /> เรียกบิลที่ Hold ไว้</h2>
              <button onClick={() => setShowRecallModal(false)}><X size={20} /></button>
            </div>
            <div className="p-3 max-h-[60vh] overflow-y-auto">
              {heldBills.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <PauseCircle size={36} className="mx-auto mb-2 opacity-30" />
                  <p>ไม่มีบิลที่ Hold ไว้</p>
                </div>
              ) : heldBills.map(b => {
                const items = typeof b.cart_items === 'string' ? JSON.parse(b.cart_items) : b.cart_items;
                return (
                  <div key={b.id} className="border rounded-lg p-3 mb-2 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-yellow-600">{b.session_code}</span>
                          {b.customer_name && <span className="text-sm text-gray-600">— {b.customer_name}</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Clock size={11} /> หมดอายุใน {remainingMins(b.expires_at)} • Hold โดย: {b.held_by}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{items.length} รายการ • ฿{fmt(b.total_amount)}</p>
                        {b.notes && <p className="text-xs text-gray-400 mt-0.5">หมายเหตุ: {b.notes}</p>}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {items.slice(0,4).map((it, i) => (
                            <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{it.name}</span>
                          ))}
                          {items.length > 4 && <span className="text-xs text-gray-400">+{items.length - 4} อื่นๆ</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 ml-3">
                        <button onClick={() => handleRecall(b.id)}
                          className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg">
                          เรียกบิล
                        </button>
                        <button onClick={() => handleCancelHeld(b.id)}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-600 text-xs rounded-lg">
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CartIcon({ size, className }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
}
