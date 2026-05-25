import React, { useState, useEffect, useRef, useCallback } from 'react';
import { productAPI, salesAPI, scaleAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Scan, Plus, Minus, Trash2, Scale, CreditCard, Banknote, X, Search, Printer } from 'lucide-react';
import { io } from 'socket.io-client';

export default function POSPage() {
  const { user } = useAuth();
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [barcodeBuffer, setBarcodeBuffer] = useState('');
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [scaleWeight, setScaleWeight] = useState(0);
  const [showPayment, setShowPayment] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [weightProduct, setWeightProduct] = useState(null);
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
      productAPI.list({ q: search, branch_id: user.branch_id })
        .then(setSearchResults).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  // Hardware barcode scanner (HID - keyboard events)
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
      if (product.is_weight) {
        setWeightProduct(product);
        return;
      }
      addToCart(product, 1);
    } catch {
      toast.error(`ไม่พบสินค้า: ${barcode}`);
    }
  };

  const addToCart = (product, quantity = 1) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i => i.product_id === product.id
          ? { ...i, quantity: i.quantity + quantity }
          : i
        );
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        barcode: product.barcode,
        unit_price: product.sell_price,
        cost_price: product.cost_price,
        quantity,
        unit: product.unit,
        is_weight: product.is_weight,
        front_stock: product.front_stock,
      }];
    });
    setSearch('');
    setSearchResults([]);
  };

  const addWeightItem = () => {
    if (!weightProduct || scaleWeight <= 0) return;
    addToCart(weightProduct, scaleWeight);
    setWeightProduct(null);
  };

  const updateQty = (product_id, delta) => {
    setCart(prev => prev.map(i => i.product_id === product_id
      ? { ...i, quantity: Math.max(0.001, i.quantity + delta) }
      : i
    ).filter(i => i.quantity > 0));
  };

  const removeItem = (product_id) => setCart(prev => prev.filter(i => i.product_id !== product_id));

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
      setCart([]);
      setDiscount(0);
      setPaymentAmount('');
      setShowPayment(false);
      toast.success(`บิล ${sale.receipt_number} สำเร็จ`);
    } catch (err) {
      toast.error(err.error || 'เกิดข้อผิดพลาด');
    } finally {
      setProcessing(false);
    }
  };

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Left: Product search */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="card mb-4">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                className="input pl-9" placeholder="ค้นหาสินค้า หรือสแกน barcode..." autoFocus />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm">
              <Scale size={16} className="text-blue-500" />
              <span className="font-mono font-bold">{scaleWeight.toFixed(3)} kg</span>
            </div>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 border rounded-lg overflow-hidden max-h-56 overflow-y-auto">
              {searchResults.map(p => (
                <button key={p.id} onClick={() => p.is_weight ? setWeightProduct(p) : addToCart(p)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 text-left border-b last:border-b-0">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.barcode} | สต๊อก: {p.front_stock} {p.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-600">฿{fmt(p.sell_price)}</p>
                    {p.is_weight && <span className="text-xs badge-blue">ชั่งน้ำหนัก</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {weightProduct && (
          <div className="card mb-4 bg-blue-50 border-blue-200">
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

        {/* Cart */}
        <div className="card flex-1 overflow-hidden flex flex-col">
          <h2 className="font-semibold text-gray-700 mb-3">รายการสินค้า ({cart.length} รายการ)</h2>
          <div className="flex-1 overflow-y-auto space-y-1">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <ShoppingCart size={40} className="mb-2 opacity-30" />
                <p className="text-sm">สแกน Barcode หรือค้นหาสินค้า</p>
              </div>
            ) : cart.map(item => (
              <div key={item.product_id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
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
                <button onClick={() => removeItem(item.product_id)} className="text-red-400 hover:text-red-600 ml-1">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Summary */}
      <div className="w-72 flex flex-col gap-4">
        <div className="card flex-1">
          <h2 className="font-semibold text-gray-700 mb-4">สรุปยอด</h2>
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
              {paymentAmount && <div className="flex justify-between mt-2 text-sm">
                <span className="text-gray-500">เงินทอน</span>
                <span className={`font-bold ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>฿{fmt(change)}</span>
              </div>}
            </div>
          )}
        </div>

        <button onClick={handleCheckout} disabled={!cart.length || processing}
          className="btn-success py-4 text-base font-bold w-full">
          {processing ? 'กำลังดำเนินการ...' : `ชำระเงิน ฿${fmt(total)}`}
        </button>

        {lastReceipt && (
          <div className="card bg-green-50 border-green-200">
            <div className="flex items-center gap-2 text-green-700 mb-1">
              <Printer size={14} />
              <span className="text-sm font-medium">บิลล่าสุด</span>
            </div>
            <p className="text-xs text-green-600">{lastReceipt.receipt_number}</p>
            <p className="text-xs text-gray-500">฿{fmt(lastReceipt.total_amount)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ShoppingCart({ size, className }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
}
