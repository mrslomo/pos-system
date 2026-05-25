import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Alert, ActivityIndicator, ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { productAPI, salesAPI } from '../services/api';
import { io } from 'socket.io-client';

const SERVER_URL = 'https://YOUR_SERVER_URL'; // แก้ไข URL

export default function POSScreen() {
  const [user, setUser] = useState(null);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [discount, setDiscount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [scaleWeight, setScaleWeight] = useState(0);
  const [weightProduct, setWeightProduct] = useState(null);
  const [lastReceipt, setLastReceipt] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('pos_user').then(u => u && setUser(JSON.parse(u)));
    const socket = io(SERVER_URL);
    socket.on('scale-weight', ({ weight }) => setScaleWeight(weight));
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const data = await productAPI.search(search, user?.branch_id);
        setResults(data);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const addToCart = (product, quantity = 1) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + quantity } : i);
      }
      return [...prev, { product_id: product.id, name: product.name, unit_price: product.sell_price, cost_price: product.cost_price, quantity, unit: product.unit, is_weight: product.is_weight }];
    });
    setSearch(''); setResults([]);
  };

  const removeFromCart = (product_id) => setCart(prev => prev.filter(i => i.product_id !== product_id));

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const total = Math.max(0, subtotal - parseFloat(discount || 0));
  const change = paymentMethod === 'cash' ? Math.max(0, parseFloat(paymentAmount || 0) - total) : 0;

  const handleCheckout = async () => {
    if (!cart.length) { Alert.alert('ไม่มีสินค้า', 'กรุณาเพิ่มสินค้าก่อนชำระ'); return; }
    if (paymentMethod === 'cash' && parseFloat(paymentAmount || 0) < total) {
      Alert.alert('จำนวนเงินไม่ครบ', `ต้องจ่าย ฿${total.toFixed(2)}`); return;
    }
    setProcessing(true);
    try {
      const sale = await salesAPI.create({
        branch_id: user?.branch_id,
        items: cart.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price })),
        discount_amount: parseFloat(discount || 0),
        payment_method: paymentMethod,
        payment_amount: parseFloat(paymentAmount) || total,
      });
      setLastReceipt(sale);
      setCart([]); setDiscount('0'); setPaymentAmount('');
      Alert.alert('ชำระเงินสำเร็จ', `บิล: ${sale.receipt_number}\nยอด: ฿${Number(sale.total_amount).toFixed(2)}\nเงินทอน: ฿${Number(sale.change_amount).toFixed(2)}`);
    } catch (err) {
      Alert.alert('เกิดข้อผิดพลาด', err.error || 'ลองใหม่อีกครั้ง');
    } finally { setProcessing(false); }
  };

  const fmt = (n) => Number(n || 0).toFixed(2);

  return (
    <View style={styles.container}>
      {/* Scale indicator */}
      <View style={styles.scaleBar}>
        <Text style={styles.scaleText}>⚖️ น้ำหนัก: {scaleWeight.toFixed(3)} kg</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="ค้นหาสินค้าหรือสแกน Barcode..."
          returnKeyType="search"
        />
      </View>

      {/* Search results */}
      {results.length > 0 && (
        <View style={styles.dropdown}>
          {results.slice(0, 5).map(p => (
            <TouchableOpacity key={p.id} style={styles.dropdownItem}
              onPress={() => p.is_weight ? setWeightProduct(p) : addToCart(p)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dropdownName}>{p.name}</Text>
                <Text style={styles.dropdownSub}>สต๊อก: {p.front_stock} {p.unit}</Text>
              </View>
              <Text style={styles.dropdownPrice}>฿{fmt(p.sell_price)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Weight product */}
      {weightProduct && (
        <View style={styles.weightCard}>
          <Text style={styles.weightTitle}>{weightProduct.name}</Text>
          <Text style={styles.weightValue}>น้ำหนัก: {scaleWeight.toFixed(3)} kg</Text>
          <View style={styles.weightButtons}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setWeightProduct(null)}>
              <Text>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary}
              onPress={() => { addToCart(weightProduct, scaleWeight); setWeightProduct(null); }}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>เพิ่มในตะกร้า</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Cart */}
      <FlatList
        data={cart}
        keyExtractor={i => i.product_id.toString()}
        style={styles.cart}
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cartName}>{item.name}</Text>
              <Text style={styles.cartSub}>฿{fmt(item.unit_price)} × {item.is_weight ? item.quantity.toFixed(3) : item.quantity} {item.unit}</Text>
            </View>
            <Text style={styles.cartTotal}>฿{fmt(item.unit_price * item.quantity)}</Text>
            <TouchableOpacity onPress={() => removeFromCart(item.product_id)} style={styles.removeBtn}>
              <Text style={{ color: '#ef4444', fontSize: 18 }}>×</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyCart}>สแกน Barcode หรือค้นหาสินค้า</Text>}
      />

      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>ยอดรวม</Text>
          <Text style={styles.summaryValue}>฿{fmt(subtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>ส่วนลด</Text>
          <TextInput style={styles.discountInput} value={discount} onChangeText={setDiscount}
            keyboardType="numeric" placeholder="0" />
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>ยอดสุทธิ</Text>
          <Text style={styles.totalValue}>฿{fmt(total)}</Text>
        </View>

        <View style={styles.paymentMethods}>
          {[['cash','เงินสด'],['card','บัตร'],['promptpay','พร้อมเพย์']].map(([v,l]) => (
            <TouchableOpacity key={v} onPress={() => setPaymentMethod(v)}
              style={[styles.payBtn, paymentMethod === v && styles.payBtnActive]}>
              <Text style={[styles.payBtnText, paymentMethod === v && { color: '#fff' }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {paymentMethod === 'cash' && (
          <View>
            <TextInput style={styles.payInput} value={paymentAmount}
              onChangeText={setPaymentAmount} keyboardType="numeric" placeholder="จำนวนเงินที่รับ" />
            {paymentAmount ? (
              <Text style={[styles.changeText, change < 0 && { color: '#ef4444' }]}>
                เงินทอน: ฿{fmt(change)}
              </Text>
            ) : null}
          </View>
        )}

        <TouchableOpacity style={[styles.checkoutBtn, (!cart.length || processing) && styles.checkoutBtnDisabled]}
          onPress={handleCheckout} disabled={!cart.length || processing}>
          {processing ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.checkoutText}>ชำระเงิน ฿{fmt(total)}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scaleBar: { backgroundColor: '#eff6ff', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#bfdbfe' },
  scaleText: { color: '#1e40af', fontWeight: '600', fontSize: 13 },
  searchContainer: { padding: 12 },
  searchInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  dropdown: { position: 'absolute', top: 120, left: 12, right: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', zIndex: 100, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 8 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dropdownName: { fontSize: 14, fontWeight: '500' },
  dropdownSub: { fontSize: 12, color: '#9ca3af' },
  dropdownPrice: { fontSize: 14, fontWeight: 'bold', color: '#2563eb' },
  weightCard: { margin: 12, backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#bfdbfe' },
  weightTitle: { fontWeight: '600', fontSize: 15, color: '#1e40af', marginBottom: 4 },
  weightValue: { fontSize: 22, fontWeight: 'bold', color: '#2563eb', marginBottom: 10 },
  weightButtons: { flexDirection: 'row', gap: 8 },
  btnSecondary: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#e5e7eb', alignItems: 'center' },
  btnPrimary: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center' },
  cart: { flex: 1, paddingHorizontal: 12 },
  cartItem: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  cartName: { fontSize: 14, fontWeight: '600' },
  cartSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  cartTotal: { fontSize: 14, fontWeight: 'bold', color: '#2563eb', marginRight: 8 },
  removeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  emptyCart: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 40 },
  summary: { backgroundColor: '#fff', padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  summaryLabel: { color: '#6b7280', fontSize: 14 },
  summaryValue: { fontSize: 14 },
  discountInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, width: 80, textAlign: 'right', fontSize: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8 },
  totalLabel: { fontSize: 16, fontWeight: 'bold' },
  totalValue: { fontSize: 20, fontWeight: 'bold', color: '#2563eb' },
  paymentMethods: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  payBtn: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, alignItems: 'center' },
  payBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  payBtnText: { fontSize: 13, color: '#374151' },
  payInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, fontSize: 15 },
  changeText: { color: '#16a34a', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  checkoutBtn: { backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  checkoutBtnDisabled: { backgroundColor: '#9ca3af' },
  checkoutText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});
