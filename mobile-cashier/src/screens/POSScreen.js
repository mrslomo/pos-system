import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  Alert, Modal, ActivityIndicator, ScrollView, KeyboardAvoidingView,
  Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { productAPI, salesAPI, heldBillAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const PAYMENT = ['cash', 'transfer', 'credit'];
const PAY_LABEL = { cash: 'เงินสด', transfer: 'โอน', credit: 'เครดิต' };

export default function POSScreen() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState('');
  const [scanning, setScanning] = useState(false);
  const [camPerm, setCamPerm] = useState(null);
  const [payment, setPayment] = useState('cash');
  const [cashInput, setCashInput] = useState('');
  const [checkoutModal, setCheckoutModal] = useState(false);
  const [holdModal, setHoldModal] = useState(false);
  const [heldBills, setHeldBills] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounce = useRef(null);

  useEffect(() => {
    BarCodeScanner.requestPermissionsAsync().then(({ status }) => setCamPerm(status === 'granted'));
  }, []);

  const searchProducts = useCallback(async (q) => {
    if (!q || q.length < 1) { setResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await productAPI.search({ q, branch_id: user.branch_id, limit: 15 });
      setResults(res.products || res || []);
    } catch { setResults([]); }
    finally { setSearchLoading(false); }
  }, [user.branch_id]);

  const handleSearchChange = (text) => {
    setSearch(text);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => searchProducts(text), 300);
  };

  const handleBarcode = async ({ data }) => {
    setScanning(false);
    setSearch(data);
    try {
      const product = await productAPI.byBarcode(data, user.branch_id);
      if (product) addToCart(product);
    } catch {
      Alert.alert('ไม่พบสินค้า', `ไม่พบบาร์โค้ด: ${data}`);
    }
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.findIndex(i => i.id === product.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], qty: updated[existing].qty + 1 };
        return updated;
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        price: Number(product.selling_price || product.price || 0),
        cost: Number(product.cost_price || 0),
        barcode: product.barcode,
        image_url: product.image_url || null,
        unit: product.unit || '',
        qty: 1,
      }];
    });
    setSearch('');
    setResults([]);
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0));
  };

  const removeItem = (id) => setCart(prev => prev.filter(i => i.id !== id));

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmt = Math.min(subtotal, Math.max(0, parseFloat(discount) || 0));
  const total = subtotal - discountAmt;
  const change = Math.max(0, (parseFloat(cashInput) || 0) - total);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const items = cart.map(i => ({
        product_id: i.id,
        quantity: i.qty,
        unit_price: i.price,
        cost_price: i.cost,
        subtotal: i.price * i.qty,
      }));
      await salesAPI.create({
        branch_id: user.branch_id,
        items,
        subtotal,
        discount_amount: discountAmt,
        total_amount: total,
        payment_method: payment,
        payment_amount: payment === 'cash' ? (parseFloat(cashInput) || total) : total,
      });
      setCart([]);
      setDiscount('');
      setCashInput('');
      setCheckoutModal(false);
      Alert.alert('สำเร็จ', 'บันทึกการขายเรียบร้อย ✓');
    } catch (err) {
      Alert.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถบันทึกการขายได้');
    } finally {
      setSubmitting(false);
    }
  };

  const loadHeldBills = async () => {
    try {
      const bills = await heldBillAPI.list({ branch_id: user.branch_id });
      setHeldBills(bills || []);
    } catch { setHeldBills([]); }
  };

  const holdCurrentCart = async () => {
    if (cart.length === 0) return;
    try {
      await heldBillAPI.hold({
        branch_id: user.branch_id,
        items: cart.map(i => ({ product_id: i.id, product_name: i.name, quantity: i.qty, unit_price: i.price, cost_price: i.cost, subtotal: i.price * i.qty })),
        subtotal,
        discount_amount: discountAmt,
        total_amount: total,
      });
      setCart([]);
      Alert.alert('Hold บิล', 'บันทึก Hold บิลเรียบร้อย');
    } catch (err) {
      Alert.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถ Hold บิลได้');
    }
  };

  const recallBill = async (bill) => {
    try {
      const recalled = await heldBillAPI.recall(bill.id);
      const items = (recalled?.items || bill.items || []).map(i => ({
        id: i.product_id,
        name: i.product_name,
        price: Number(i.unit_price),
        cost: Number(i.cost_price || 0),
        barcode: i.barcode || '',
        unit: i.unit || '',
        qty: Number(i.quantity),
      }));
      setCart(items);
      setDiscount(String(recalled?.discount_amount || bill.discount_amount || ''));
      setHoldModal(false);
    } catch (err) {
      Alert.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถเรียกบิลได้');
    }
  };

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  if (scanning) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <BarCodeScanner style={{ flex: 1 }} onBarCodeScanned={handleBarcode} />
        <TouchableOpacity style={s.cancelScan} onPress={() => setScanning(false)}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>✕ ยกเลิก</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>หน้าขาย</Text>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.holdBtn} onPress={() => { loadHeldBills(); setHoldModal(true); }}>
              <Text style={s.holdBtnText}>Hold 📋</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar */}
        <View style={s.searchRow}>
          <TextInput
            style={s.searchInput}
            placeholder="ค้นหาสินค้า / บาร์โค้ด..."
            value={search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            onSubmitEditing={() => searchProducts(search)}
          />
          <TouchableOpacity style={s.scanBtn} onPress={() => camPerm ? setScanning(true) : Alert.alert('ไม่มีสิทธิ์', 'กรุณาอนุญาตการใช้กล้อง')}>
            <Text style={{ fontSize: 22 }}>📷</Text>
          </TouchableOpacity>
        </View>

        {/* Search results dropdown */}
        {(results.length > 0 || searchLoading) && (
          <View style={s.resultsBox}>
            {searchLoading ? (
              <ActivityIndicator style={{ padding: 12 }} color="#3b82f6" />
            ) : (
              <FlatList
                data={results}
                keyExtractor={i => String(i.id)}
                style={{ maxHeight: 220 }}
                keyboardShouldPersistTaps="always"
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.resultItem} onPress={() => addToCart(item)}>
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={s.resultImg} />
                    ) : (
                      <View style={[s.resultImg, { backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ fontSize: 18 }}>📦</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.resultName} numberOfLines={1}>{item.name}</Text>
                      <Text style={s.resultBarcode}>{item.barcode}</Text>
                    </View>
                    <Text style={s.resultPrice}>฿{fmt(item.selling_price || item.price)}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {/* Cart */}
        <FlatList
          data={cart}
          keyExtractor={i => String(i.id)}
          style={s.cart}
          ListEmptyComponent={
            <View style={s.emptyCart}>
              <Text style={{ fontSize: 40 }}>🛒</Text>
              <Text style={s.emptyText}>ยังไม่มีสินค้าในตะกร้า</Text>
              <Text style={s.emptyHint}>ค้นหาหรือสแกนบาร์โค้ดเพื่อเพิ่มสินค้า</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.cartItem}>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={s.cartImg} />
              ) : (
                <View style={[s.cartImg, { backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ fontSize: 14 }}>📦</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.cartName} numberOfLines={2}>{item.name}</Text>
                <Text style={s.cartPrice}>฿{fmt(item.price)}</Text>
              </View>
              <View style={s.qtyRow}>
                <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(item.id, -1)}>
                  <Text style={s.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={s.qtyText}>{item.qty}</Text>
                <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(item.id, 1)}>
                  <Text style={s.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.cartSubtotal}>฿{fmt(item.price * item.qty)}</Text>
              <TouchableOpacity onPress={() => removeItem(item.id)} style={{ paddingLeft: 8 }}>
                <Text style={{ color: '#ef4444', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        />

        {/* Footer: discount + total + checkout */}
        {cart.length > 0 && (
          <View style={s.footer}>
            <View style={s.discountRow}>
              <Text style={s.footerLabel}>ส่วนลด</Text>
              <TextInput
                style={s.discountInput}
                placeholder="0"
                value={discount}
                onChangeText={setDiscount}
                keyboardType="numeric"
              />
              <Text style={s.footerLabel}>฿</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>ยอดสุทธิ</Text>
              <Text style={s.totalValue}>฿{fmt(total)}</Text>
            </View>
            <View style={s.footerBtns}>
              <TouchableOpacity style={s.holdCartBtn} onPress={holdCurrentCart}>
                <Text style={s.holdCartBtnText}>Hold บิล</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.checkoutBtn} onPress={() => setCheckoutModal(true)}>
                <Text style={s.checkoutBtnText}>ชำระเงิน ฿{fmt(total)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Checkout Modal */}
      <Modal visible={checkoutModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>ชำระเงิน</Text>

            {/* Payment method */}
            <View style={s.payRow}>
              {PAYMENT.map(m => (
                <TouchableOpacity key={m} style={[s.payBtn, payment === m && s.payBtnActive]} onPress={() => setPayment(m)}>
                  <Text style={[s.payBtnText, payment === m && { color: '#fff' }]}>{PAY_LABEL[m]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.summaryBox}>
              <View style={s.summaryRow}><Text style={s.summaryLabel}>ยอดรวม</Text><Text>฿{fmt(subtotal)}</Text></View>
              {discountAmt > 0 && <View style={s.summaryRow}><Text style={s.summaryLabel}>ส่วนลด</Text><Text style={{ color: '#ef4444' }}>-฿{fmt(discountAmt)}</Text></View>}
              <View style={[s.summaryRow, { borderTopWidth: 1, borderColor: '#e2e8f0', paddingTop: 8, marginTop: 4 }]}>
                <Text style={[s.summaryLabel, { fontWeight: 'bold', fontSize: 18 }]}>ยอดสุทธิ</Text>
                <Text style={{ fontWeight: 'bold', fontSize: 22, color: '#1e293b' }}>฿{fmt(total)}</Text>
              </View>
            </View>

            {payment === 'cash' && (
              <>
                <Text style={s.inputLabel}>รับเงินมา</Text>
                <TextInput
                  style={s.cashInput}
                  value={cashInput}
                  onChangeText={setCashInput}
                  keyboardType="numeric"
                  placeholder={fmt(total)}
                />
                {cashInput !== '' && (
                  <View style={s.changeRow}>
                    <Text style={s.changeLabel}>เงินทอน</Text>
                    <Text style={[s.changeValue, { color: change >= 0 ? '#10b981' : '#ef4444' }]}>฿{fmt(change)}</Text>
                  </View>
                )}
              </>
            )}

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setCheckoutModal(false)}>
                <Text style={s.cancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, submitting && { opacity: 0.6 }]} onPress={handleCheckout} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.confirmBtnText}>ยืนยัน</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Held Bills Modal */}
      <Modal visible={holdModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={s.modalTitle}>บิลที่ Hold ไว้</Text>
              <TouchableOpacity onPress={() => setHoldModal(false)}>
                <Text style={{ fontSize: 20, color: '#64748b' }}>✕</Text>
              </TouchableOpacity>
            </View>
            {heldBills.length === 0 ? (
              <Text style={{ color: '#94a3b8', textAlign: 'center', paddingVertical: 24 }}>ไม่มีบิลที่ Hold ไว้</Text>
            ) : (
              <FlatList
                data={heldBills}
                keyExtractor={i => String(i.id)}
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.heldItem} onPress={() => recallBill(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.heldTitle}>{item.held_by_name || 'ไม่ระบุ'}</Text>
                      <Text style={s.heldSub}>{(item.items || []).length} รายการ · {new Date(item.created_at).toLocaleTimeString('th-TH')}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.heldTotal}>฿{fmt(item.total_amount)}</Text>
                      <Text style={{ color: '#3b82f6', fontSize: 12, marginTop: 4 }}>เรียกบิล →</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
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
  headerRight: { flexDirection: 'row', gap: 8 },
  holdBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  holdBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  searchRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  searchInput: { flex: 1, height: 44, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, fontSize: 15, backgroundColor: '#f8fafc' },
  scanBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  resultsBox: { backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0', elevation: 4, zIndex: 10 },
  resultItem: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  resultImg: { width: 40, height: 40, borderRadius: 8 },
  resultName: { fontSize: 14, fontWeight: '500', color: '#1e293b' },
  resultBarcode: { fontSize: 11, color: '#94a3b8' },
  resultPrice: { fontSize: 15, fontWeight: 'bold', color: '#3b82f6' },
  cart: { flex: 1, padding: 8 },
  emptyCart: { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyText: { fontSize: 16, color: '#64748b', marginTop: 12, fontWeight: '500' },
  emptyHint: { fontSize: 12, color: '#94a3b8', marginTop: 6 },
  cartItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 6, gap: 8, elevation: 1 },
  cartImg: { width: 36, height: 36, borderRadius: 8 },
  cartName: { fontSize: 13, fontWeight: '500', color: '#1e293b', flex: 1 },
  cartPrice: { fontSize: 11, color: '#64748b' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  qtyBtnText: { fontSize: 18, color: '#3b82f6', lineHeight: 22 },
  qtyText: { fontSize: 15, fontWeight: 'bold', color: '#1e293b', minWidth: 24, textAlign: 'center' },
  cartSubtotal: { fontSize: 14, fontWeight: 'bold', color: '#1e293b', minWidth: 70, textAlign: 'right' },
  footer: { backgroundColor: '#fff', padding: 16, borderTopWidth: 1, borderColor: '#e2e8f0', elevation: 8 },
  discountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  footerLabel: { fontSize: 14, color: '#64748b' },
  discountInput: { flex: 1, height: 36, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, fontSize: 15, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  totalLabel: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  totalValue: { fontSize: 26, fontWeight: 'bold', color: '#1e3a5f' },
  footerBtns: { flexDirection: 'row', gap: 10 },
  holdCartBtn: { flex: 0.4, height: 50, backgroundColor: '#f1f5f9', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  holdCartBtnText: { color: '#475569', fontWeight: '600' },
  checkoutBtn: { flex: 0.6, height: 50, backgroundColor: '#3b82f6', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  checkoutBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  cancelScan: { position: 'absolute', bottom: 48, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 30 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b', marginBottom: 16 },
  payRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  payBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  payBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  payBtnText: { fontWeight: '600', color: '#475569' },
  summaryBox: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { color: '#64748b', fontSize: 15 },
  inputLabel: { fontSize: 14, color: '#64748b', marginBottom: 6 },
  cashInput: { height: 50, borderWidth: 1.5, borderColor: '#3b82f6', borderRadius: 12, paddingHorizontal: 16, fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', padding: 12, borderRadius: 10, marginBottom: 16 },
  changeLabel: { fontSize: 15, color: '#064e3b' },
  changeValue: { fontSize: 22, fontWeight: 'bold' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, height: 50, backgroundColor: '#f1f5f9', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cancelBtnText: { color: '#64748b', fontWeight: '600', fontSize: 15 },
  confirmBtn: { flex: 1, height: 50, backgroundColor: '#10b981', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  heldItem: { flexDirection: 'row', padding: 14, borderBottomWidth: 1, borderColor: '#f1f5f9', alignItems: 'center' },
  heldTitle: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  heldSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  heldTotal: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
});
