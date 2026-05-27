import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  Alert, ActivityIndicator, Modal, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { productAPI, salesAPI, scaleAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function WeighScreen() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [weight, setWeight] = useState('');
  const [manualWeight, setManualWeight] = useState('');
  const [scaleConnected, setScaleConnected] = useState(false);
  const [cart, setCart] = useState([]);
  const [checkoutModal, setCheckoutModal] = useState(false);
  const [payment, setPayment] = useState('cash');
  const [cashInput, setCashInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => () => {
    clearInterval(pollRef.current);
    clearTimeout(debounceRef.current);
  }, []);

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  const searchProducts = async (q) => {
    if (!q || q.length < 1) { setResults([]); return; }
    try {
      const res = await productAPI.search({ q, branch_id: user.branch_id, limit: 15 });
      setResults(res.products || res || []);
    } catch { setResults([]); }
  };

  const handleSearch = (text) => {
    setSearch(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchProducts(text), 300);
  };

  const selectProduct = (p) => {
    setSelectedProduct(p);
    setSearch(p.name);
    setResults([]);
  };

  const connectScale = async () => {
    try {
      const ports = await scaleAPI.ports();
      if (!ports || ports.length === 0) { Alert.alert('ไม่พบพอร์ต', 'ไม่พบเครื่องชั่งที่เชื่อมต่ออยู่'); return; }
      await scaleAPI.connect({ port: ports[0].path, baud_rate: 9600 });
      setScaleConnected(true);
      pollRef.current = setInterval(async () => {
        try {
          const data = await scaleAPI.weight();
          if (data?.weight !== undefined) setWeight(String(data.weight));
        } catch {}
      }, 500);
    } catch (err) {
      Alert.alert('เชื่อมต่อไม่สำเร็จ', err?.message || 'ไม่สามารถเชื่อมต่อเครื่องชั่งได้');
    }
  };

  const disconnectScale = () => {
    clearInterval(pollRef.current);
    setScaleConnected(false);
    setWeight('');
  };

  const effectiveWeight = parseFloat(weight) || parseFloat(manualWeight) || 0;
  const unitPrice = Number(selectedProduct?.selling_price || selectedProduct?.price || 0);
  const lineTotal = effectiveWeight * unitPrice;

  const addToCart = () => {
    if (!selectedProduct) { Alert.alert('กรุณาเลือกสินค้า'); return; }
    if (effectiveWeight <= 0) { Alert.alert('กรุณาใส่น้ำหนัก'); return; }
    setCart(prev => [...prev, {
      id: Date.now(),
      product_id: selectedProduct.id,
      name: selectedProduct.name,
      price: unitPrice,
      cost: Number(selectedProduct.cost_price || 0),
      weight: effectiveWeight,
      subtotal: lineTotal,
    }]);
    setWeight('');
    setManualWeight('');
    setSelectedProduct(null);
    setSearch('');
  };

  const removeCart = (id) => setCart(prev => prev.filter(i => i.id !== id));
  const total = cart.reduce((s, i) => s + i.subtotal, 0);
  const change = Math.max(0, (parseFloat(cashInput) || 0) - total);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      await salesAPI.create({
        branch_id: user.branch_id,
        items: cart.map(i => ({ product_id: i.product_id, quantity: i.weight, unit_price: i.price, cost_price: i.cost, subtotal: i.subtotal })),
        subtotal: total, discount_amount: 0, total_amount: total,
        payment_method: payment,
        payment_amount: payment === 'cash' ? (parseFloat(cashInput) || total) : total,
      });
      setCart([]);
      setCashInput('');
      setCheckoutModal(false);
      Alert.alert('✓ สำเร็จ', 'บันทึกการขายเรียบร้อย');
    } catch (err) {
      Alert.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถบันทึกการขายได้');
    } finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.container}>

        {/* LEFT: weight display + product search + cart */}
        <View style={s.left}>
          {/* Top bar */}
          <View style={s.topBar}>
            <Text style={s.topTitle}>ชั่งน้ำหนัก</Text>
            <TouchableOpacity
              style={[s.scaleBtn, scaleConnected && { backgroundColor: '#10b981' }]}
              onPress={scaleConnected ? disconnectScale : connectScale}
            >
              <Text style={s.scaleBtnTxt}>{scaleConnected ? '⚖️ เชื่อมต่อแล้ว' : '⚖️ เชื่อมต่อตาชั่ง'}</Text>
            </TouchableOpacity>
          </View>

          {/* Weight + search row */}
          <View style={s.topSection}>
            {/* Weight display */}
            <View style={s.weightBox}>
              <Text style={s.weightLabel}>น้ำหนัก</Text>
              <View style={s.weightRow}>
                <Text style={[s.weightVal, !scaleConnected && { color: '#94a3b8' }]}>
                  {scaleConnected ? (weight || '0.000') : (manualWeight || '0.000')}
                </Text>
                <Text style={s.weightUnit}>กก.</Text>
              </View>
              {!scaleConnected && (
                <TextInput
                  style={s.manualInput}
                  placeholder="ใส่น้ำหนักเอง"
                  value={manualWeight}
                  onChangeText={setManualWeight}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
              )}
            </View>

            {/* Product search */}
            <View style={{ flex: 1 }}>
              <TextInput
                style={s.searchInput}
                placeholder="ค้นหาสินค้า..."
                value={search}
                onChangeText={handleSearch}
              />
              {results.length > 0 && (
                <View style={s.resultBox}>
                  <FlatList
                    data={results}
                    keyExtractor={i => String(i.id)}
                    style={{ maxHeight: 160 }}
                    keyboardShouldPersistTaps="always"
                    renderItem={({ item }) => (
                      <TouchableOpacity style={s.resultItem} onPress={() => selectProduct(item)}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.resultName} numberOfLines={1}>{item.name}</Text>
                          <Text style={s.resultSub}>฿{fmt(item.selling_price || item.price)}/กก.</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}
              {selectedProduct && (
                <View style={s.selectedCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.selName} numberOfLines={1}>{selectedProduct.name}</Text>
                    <Text style={s.selSub}>฿{fmt(unitPrice)}/กก. × {effectiveWeight.toFixed(3)} กก. = ฿{fmt(lineTotal)}</Text>
                  </View>
                  <TouchableOpacity style={s.addBtn} onPress={addToCart}>
                    <Text style={s.addBtnTxt}>+ เพิ่ม</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Cart */}
          <View style={s.cartHeader}>
            <Text style={s.cartHeaderTxt}>รายการ ({cart.length})</Text>
            {cart.length > 0 && (
              <TouchableOpacity onPress={() => setCart([])}>
                <Text style={{ color: '#ef4444', fontSize: 13 }}>ล้างทั้งหมด</Text>
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={cart}
            keyExtractor={i => String(i.id)}
            style={{ flex: 1 }}
            ListEmptyComponent={
              <View style={s.emptyCart}>
                <Text style={{ fontSize: 30 }}>⚖️</Text>
                <Text style={s.emptyTxt}>เพิ่มสินค้าเพื่อเริ่มต้น</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={s.cartItem}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cartName} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.cartSub}>{item.weight.toFixed(3)} กก. × ฿{fmt(item.price)}</Text>
                </View>
                <Text style={s.cartTotal}>฿{fmt(item.subtotal)}</Text>
                <TouchableOpacity onPress={() => removeCart(item.id)} style={{ paddingLeft: 12 }}>
                  <Text style={{ color: '#ef4444', fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>

        {/* RIGHT: summary + checkout */}
        <View style={s.right}>
          <Text style={s.panelTitle}>สรุปยอด</Text>

          <View style={s.summaryBox}>
            <View style={s.sumRow}>
              <Text style={s.sumLabel}>จำนวนรายการ</Text>
              <Text style={s.sumVal}>{cart.length} รายการ</Text>
            </View>
            <View style={[s.sumRow, s.netRow]}>
              <Text style={s.netLabel}>ยอดรวม</Text>
              <Text style={s.netVal}>฿{fmt(total)}</Text>
            </View>
          </View>

          <Text style={s.sectionLabel}>วิธีชำระเงิน</Text>
          <View style={s.payRow}>
            {[{ key: 'cash', label: 'เงินสด' }, { key: 'transfer', label: 'โอน' }].map(m => (
              <TouchableOpacity key={m.key} style={[s.payBtn, payment === m.key && s.payBtnOn]}
                onPress={() => setPayment(m.key)}>
                <Text style={[s.payBtnTxt, payment === m.key && { color: '#fff' }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {payment === 'cash' && (
            <>
              <Text style={s.sectionLabel}>รับเงิน</Text>
              <TextInput
                style={s.cashInput}
                value={cashInput}
                onChangeText={setCashInput}
                keyboardType="numeric"
                placeholder="0.00"
                selectTextOnFocus
              />
              {cashInput !== '' && Number(cashInput) > 0 && (
                <View style={s.changeRow}>
                  <Text style={{ color: '#064e3b', fontSize: 13 }}>เงินทอน</Text>
                  <Text style={{ fontWeight: 'bold', fontSize: 18, color: change >= 0 ? '#10b981' : '#ef4444' }}>฿{fmt(change)}</Text>
                </View>
              )}
            </>
          )}

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            style={[s.checkoutBtn, (cart.length === 0 || submitting) && { opacity: 0.5 }]}
            onPress={() => cart.length > 0 && setCheckoutModal(true)}
            disabled={cart.length === 0}
          >
            <Text style={s.checkoutTxt}>ชำระเงิน ฿{fmt(total)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Checkout confirm modal */}
      <Modal visible={checkoutModal} animationType="fade" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>ยืนยันการชำระเงิน</Text>
            <View style={s.confirmRow}>
              <Text style={{ fontSize: 16, color: '#64748b' }}>ยอดสุทธิ</Text>
              <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#1e3a5f' }}>฿{fmt(total)}</Text>
            </View>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setCheckoutModal(false)}>
                <Text style={{ color: '#64748b', fontWeight: '600' }}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, submitting && { opacity: 0.6 }]} onPress={handleCheckout} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>ยืนยัน</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const BLUE = '#1e3a5f';
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1f5f9' },
  container: { flex: 1, flexDirection: 'row' },

  left: { flex: 1, flexDirection: 'column', minWidth: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: BLUE, paddingHorizontal: 16, paddingVertical: 10 },
  topTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  scaleBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  scaleBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },

  topSection: { flexDirection: 'row', gap: 12, padding: 10, backgroundColor: BLUE, alignItems: 'flex-start' },
  weightBox: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 10, minWidth: 140 },
  weightLabel: { color: '#93c5fd', fontSize: 11, marginBottom: 2 },
  weightRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  weightVal: { fontSize: 36, fontWeight: 'bold', color: '#fff', fontVariant: ['tabular-nums'] },
  weightUnit: { fontSize: 16, color: '#93c5fd' },
  manualInput: { marginTop: 6, width: 120, height: 36, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 10, fontSize: 18, color: '#fff', textAlign: 'center', fontWeight: 'bold' },

  searchInput: { height: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 10, paddingHorizontal: 12, fontSize: 14, backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' },
  resultBox: { position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: '#fff', borderRadius: 10, elevation: 8, zIndex: 20 },
  resultItem: { padding: 10, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  resultName: { fontSize: 14, fontWeight: '500', color: '#1e293b' },
  resultSub: { fontSize: 11, color: '#94a3b8' },

  selectedCard: { flexDirection: 'row', alignItems: 'center', marginTop: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 10, gap: 8 },
  selName: { fontSize: 13, fontWeight: '600', color: '#fff' },
  selSub: { fontSize: 11, color: '#93c5fd', marginTop: 2 },
  addBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  cartHeaderTxt: { fontSize: 13, fontWeight: '600', color: '#475569' },
  emptyCart: { alignItems: 'center', paddingTop: 32 },
  emptyTxt: { color: '#94a3b8', marginTop: 8, fontSize: 13 },
  cartItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 8, marginTop: 6, borderRadius: 10, padding: 12, elevation: 1 },
  cartName: { fontSize: 14, fontWeight: '500', color: '#1e293b' },
  cartSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  cartTotal: { fontSize: 14, fontWeight: 'bold', color: '#1e293b', minWidth: 80, textAlign: 'right' },

  // Right panel
  right: { width: 300, backgroundColor: '#fff', borderLeftWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  panelTitle: { fontSize: 16, fontWeight: 'bold', color: BLUE, marginBottom: 10 },
  summaryBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 12 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sumLabel: { fontSize: 13, color: '#64748b' },
  sumVal: { fontSize: 13, color: '#1e293b' },
  netRow: { borderTopWidth: 1, borderColor: '#e2e8f0', paddingTop: 8, marginTop: 2 },
  netLabel: { fontSize: 16, fontWeight: 'bold', color: BLUE },
  netVal: { fontSize: 22, fontWeight: 'bold', color: BLUE },
  sectionLabel: { fontSize: 12, color: '#64748b', marginTop: 12, marginBottom: 4 },
  payRow: { flexDirection: 'row', gap: 8 },
  payBtn: { flex: 1, height: 38, borderRadius: 8, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  payBtnOn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  payBtnTxt: { fontSize: 13, fontWeight: '600', color: '#475569' },
  cashInput: { height: 44, borderWidth: 1.5, borderColor: '#3b82f6', borderRadius: 8, paddingHorizontal: 10, fontSize: 20, fontWeight: 'bold', marginTop: 2 },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', padding: 10, borderRadius: 8, marginTop: 8 },
  checkoutBtn: { height: 50, backgroundColor: '#10b981', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  checkoutTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modal: { backgroundColor: '#fff', borderRadius: 20, padding: 28, width: 340 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 16 },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalBtns: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, height: 48, backgroundColor: '#f1f5f9', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  confirmBtn: { flex: 1, height: 48, backgroundColor: '#10b981', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
});
