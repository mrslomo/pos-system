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
  const [polling, setPolling] = useState(false);
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

  const startScalePoll = () => {
    setPolling(true);
    pollRef.current = setInterval(async () => {
      try {
        const data = await scaleAPI.weight();
        if (data?.weight !== undefined) setWeight(String(data.weight));
      } catch {
        // scale disconnected or error
      }
    }, 500);
  };

  const connectScale = async () => {
    try {
      const ports = await scaleAPI.ports();
      if (!ports || ports.length === 0) {
        Alert.alert('ไม่พบพอร์ต', 'ไม่พบเครื่องชั่งที่เชื่อมต่ออยู่');
        return;
      }
      await scaleAPI.connect({ port: ports[0].path, baud_rate: 9600 });
      setScaleConnected(true);
      startScalePoll();
    } catch (err) {
      Alert.alert('เชื่อมต่อไม่สำเร็จ', err?.message || 'ไม่สามารถเชื่อมต่อเครื่องชั่งได้');
    }
  };

  const disconnectScale = () => {
    clearInterval(pollRef.current);
    setPolling(false);
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
      image_url: selectedProduct.image_url || null,
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
        items: cart.map(i => ({
          product_id: i.product_id,
          quantity: i.weight,
          unit_price: i.price,
          cost_price: i.cost,
          subtotal: i.subtotal,
        })),
        subtotal: total,
        discount_amount: 0,
        total_amount: total,
        payment_method: payment,
        payment_amount: payment === 'cash' ? (parseFloat(cashInput) || total) : total,
      });
      setCart([]);
      setCashInput('');
      setCheckoutModal(false);
      Alert.alert('สำเร็จ', 'บันทึกการขายเรียบร้อย ✓');
    } catch (err) {
      Alert.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถบันทึกการขายได้');
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>ชั่งน้ำหนัก</Text>
        <TouchableOpacity
          style={[s.scaleBtn, scaleConnected && { backgroundColor: '#10b981' }]}
          onPress={scaleConnected ? disconnectScale : connectScale}
        >
          <Text style={s.scaleBtnText}>{scaleConnected ? '⚖️ เชื่อมต่อแล้ว' : '⚖️ เชื่อมต่อตาชั่ง'}</Text>
        </TouchableOpacity>
      </View>

      {/* Weight display */}
      <View style={s.weightCard}>
        <Text style={s.weightLabel}>น้ำหนัก</Text>
        <View style={s.weightDisplay}>
          <Text style={[s.weightValue, { color: scaleConnected ? '#1e3a5f' : '#94a3b8' }]}>
            {scaleConnected ? (weight || '0.000') : '—'}
          </Text>
          <Text style={s.weightUnit}>กก.</Text>
        </View>

        {/* Manual input */}
        {!scaleConnected && (
          <View style={s.manualRow}>
            <TextInput
              style={s.manualInput}
              placeholder="ใส่น้ำหนักเอง..."
              value={manualWeight}
              onChangeText={setManualWeight}
              keyboardType="numeric"
            />
            <Text style={s.manualUnit}>กก.</Text>
          </View>
        )}
      </View>

      {/* Product search */}
      <View style={s.searchBox}>
        <TextInput
          style={s.searchInput}
          placeholder="ค้นหาสินค้า..."
          value={search}
          onChangeText={handleSearch}
        />
      </View>
      {results.length > 0 && (
        <View style={s.resultBox}>
          <FlatList
            data={results}
            keyExtractor={i => String(i.id)}
            style={{ maxHeight: 180 }}
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => (
              <TouchableOpacity style={s.resultItem} onPress={() => selectProduct(item)}>
                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={s.resultImg} />
                ) : (
                  <View style={[s.resultImg, { backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text>📦</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.resultName} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.resultSub}>{item.unit} · ฿{fmt(item.selling_price || item.price)}/กก.</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Selected product + add button */}
      {selectedProduct && (
        <View style={s.selectedCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.selectedName} numberOfLines={1}>{selectedProduct.name}</Text>
            <Text style={s.selectedPrice}>฿{fmt(unitPrice)}/กก. × {effectiveWeight.toFixed(3)} กก.</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.lineTotal}>฿{fmt(lineTotal)}</Text>
            <TouchableOpacity style={s.addBtn} onPress={addToCart}>
              <Text style={s.addBtnText}>+ เพิ่ม</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Cart */}
      <FlatList
        data={cart}
        keyExtractor={i => String(i.id)}
        style={s.cart}
        ListHeaderComponent={cart.length > 0 ? <Text style={s.cartHeader}>ตะกร้า</Text> : null}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 32 }}>
            <Text style={{ color: '#94a3b8', fontSize: 14 }}>เพิ่มสินค้าเพื่อเริ่มต้น</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.cartItem}>
            <View style={{ flex: 1 }}>
              <Text style={s.cartName} numberOfLines={1}>{item.name}</Text>
              <Text style={s.cartSub}>{item.weight.toFixed(3)} กก. × ฿{fmt(item.price)}</Text>
            </View>
            <Text style={s.cartSubtotal}>฿{fmt(item.subtotal)}</Text>
            <TouchableOpacity onPress={() => removeCart(item.id)} style={{ paddingLeft: 10 }}>
              <Text style={{ color: '#ef4444', fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Footer */}
      {cart.length > 0 && (
        <View style={s.footer}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>ยอดรวม</Text>
            <Text style={s.totalValue}>฿{fmt(total)}</Text>
          </View>
          <TouchableOpacity style={s.checkoutBtn} onPress={() => setCheckoutModal(true)}>
            <Text style={s.checkoutBtnText}>ชำระเงิน ฿{fmt(total)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Checkout Modal */}
      <Modal visible={checkoutModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>ชำระเงิน</Text>
            <View style={s.payRow}>
              {['cash', 'transfer'].map(m => (
                <TouchableOpacity key={m} style={[s.payBtn, payment === m && s.payActive]} onPress={() => setPayment(m)}>
                  <Text style={[{ color: '#475569', fontWeight: '600' }, payment === m && { color: '#fff' }]}>
                    {m === 'cash' ? 'เงินสด' : 'โอน'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.summaryRow}>
              <Text style={{ fontSize: 18, color: '#64748b' }}>ยอดสุทธิ</Text>
              <Text style={{ fontSize: 26, fontWeight: 'bold' }}>฿{fmt(total)}</Text>
            </View>
            {payment === 'cash' && (
              <>
                <TextInput
                  style={s.cashInput}
                  placeholder={`รับเงิน ฿${fmt(total)}`}
                  value={cashInput}
                  onChangeText={setCashInput}
                  keyboardType="numeric"
                />
                {cashInput !== '' && (
                  <View style={s.changeRow}>
                    <Text>เงินทอน</Text>
                    <Text style={{ fontWeight: 'bold', fontSize: 20, color: change >= 0 ? '#10b981' : '#ef4444' }}>฿{fmt(change)}</Text>
                  </View>
                )}
              </>
            )}
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#1e3a5f' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  scaleBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  scaleBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  weightCard: { backgroundColor: '#1e3a5f', paddingHorizontal: 24, paddingBottom: 20, alignItems: 'center' },
  weightLabel: { color: '#93c5fd', fontSize: 13, marginBottom: 4 },
  weightDisplay: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  weightValue: { fontSize: 56, fontWeight: 'bold', color: '#fff', fontVariant: ['tabular-nums'] },
  weightUnit: { fontSize: 22, color: '#93c5fd', marginBottom: 4 },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, width: '100%', maxWidth: 240 },
  manualInput: { flex: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, fontSize: 20, color: '#fff', textAlign: 'center', fontWeight: 'bold' },
  manualUnit: { color: '#93c5fd', fontSize: 16 },
  searchBox: { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  searchInput: { height: 44, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, fontSize: 15, backgroundColor: '#f8fafc' },
  resultBox: { backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0', elevation: 4 },
  resultItem: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  resultImg: { width: 36, height: 36, borderRadius: 8 },
  resultName: { fontSize: 14, fontWeight: '500', color: '#1e293b' },
  resultSub: { fontSize: 11, color: '#94a3b8' },
  selectedCard: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#bfdbfe' },
  selectedName: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  selectedPrice: { fontSize: 12, color: '#64748b', marginTop: 2 },
  lineTotal: { fontSize: 18, fontWeight: 'bold', color: '#1e3a5f', marginBottom: 8 },
  addBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  cartHeader: { fontSize: 13, fontWeight: '600', color: '#64748b', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  cart: { flex: 1 },
  cartItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 6, borderRadius: 10, padding: 12, elevation: 1, gap: 8 },
  cartName: { fontSize: 14, fontWeight: '500', color: '#1e293b' },
  cartSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  cartSubtotal: { fontSize: 15, fontWeight: 'bold', color: '#1e293b', minWidth: 80, textAlign: 'right' },
  footer: { backgroundColor: '#fff', padding: 16, borderTopWidth: 1, borderColor: '#e2e8f0' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  totalLabel: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  totalValue: { fontSize: 26, fontWeight: 'bold', color: '#1e3a5f' },
  checkoutBtn: { height: 50, backgroundColor: '#3b82f6', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  checkoutBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b', marginBottom: 16 },
  payRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  payBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  payActive: { backgroundColor: '#3b82f6' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cashInput: { height: 50, borderWidth: 1.5, borderColor: '#3b82f6', borderRadius: 12, paddingHorizontal: 16, fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f0fdf4', padding: 12, borderRadius: 10, marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, height: 50, backgroundColor: '#f1f5f9', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  confirmBtn: { flex: 1, height: 50, backgroundColor: '#10b981', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
});
