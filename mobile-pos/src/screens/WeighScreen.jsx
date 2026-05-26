import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useHardware } from '../context/HardwareContext';
import { productAPI, partnerAPI } from '../services/api';
import { buildWeighSlip } from '../utils/escpos';

const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

export default function WeighScreen({ navigation }) {
  const { user } = useAuth();
  const { addItem } = useCart();
  const { scaleConnected, weight, weightStable, print, printerConnected } = useHardware();

  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [mode, setMode] = useState('retail');
  const [partners, setPartners] = useState([]);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [partnerPrice, setPartnerPrice] = useState(null);

  const [manualWeight, setManualWeight] = useState('');
  const [displayWeight, setDisplayWeight] = useState(0);

  const [sessionItems, setSessionItems] = useState([]);

  useEffect(() => {
    partnerAPI.list({ branch_id: user.branch_id })
      .then(r => setPartners(Array.isArray(r) ? r : (r.partners || [])))
      .catch(() => {});
  }, []);

  // Use scale weight or manual
  useEffect(() => {
    if (scaleConnected) setDisplayWeight(weight);
  }, [weight, scaleConnected]);

  // Product search
  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await productAPI.search({ search: productSearch, branch_id: user.branch_id, limit: 15 });
        const prods = Array.isArray(r) ? r : (r.products || []);
        setProductResults(prods.filter(p => p.is_weight));
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [productSearch]);

  // Partner price
  useEffect(() => {
    if (mode === 'wholesale' && selectedPartner && selectedProduct) {
      partnerAPI.getPrice(selectedPartner.id, selectedProduct.id)
        .then(r => setPartnerPrice(r?.special_price != null ? parseFloat(r.special_price) : null))
        .catch(() => setPartnerPrice(null));
    } else {
      setPartnerPrice(null);
    }
  }, [mode, selectedPartner?.id, selectedProduct?.id]);

  const activePrice = (mode === 'wholesale' && partnerPrice !== null)
    ? partnerPrice : parseFloat(selectedProduct?.sell_price || 0);

  const totalPrice = displayWeight * activePrice;

  const applyManualWeight = () => {
    const v = parseFloat(manualWeight);
    if (!isNaN(v) && v >= 0) {
      setDisplayWeight(v);
      setManualWeight('');
    }
  };

  const addToSession = () => {
    if (!selectedProduct) return Alert.alert('', 'เลือกสินค้าก่อน');
    if (displayWeight <= 0) return Alert.alert('', 'น้ำหนักต้องมากกว่า 0');
    setSessionItems(prev => [...prev, {
      id: Date.now(),
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      weight: displayWeight,
      price_per_unit: activePrice,
      total: totalPrice,
      partner_name: mode === 'wholesale' ? selectedPartner?.name : null,
    }]);
  };

  const addToCart = (item) => {
    addItem({
      id: item.product_id,
      name: item.product_name,
      sell_price: item.price_per_unit,
      unit: 'kg',
      is_weight: true,
      cost_price: 0,
      product_type: selectedProduct?.product_type,
    }, item.weight, item.price_per_unit);
    Alert.alert('✓ เพิ่มลงตะกร้า', `${item.product_name} ${item.weight.toFixed(3)} kg = ฿${fmt(item.total)}`);
  };

  const printWeighSlip = async (item) => {
    if (!printerConnected) return Alert.alert('', 'ไม่ได้เชื่อมต่อเครื่องพิมพ์');
    try {
      const slip = buildWeighSlip({
        storeName: user.branch_name || 'POS System',
        productName: item.product_name,
        weight: item.weight,
        pricePerKg: item.price_per_unit,
        total: item.total,
        partnerName: item.partner_name,
      });
      await print(slip);
    } catch (err) {
      Alert.alert('พิมพ์ไม่สำเร็จ', err.message);
    }
  };

  const sessionTotal = sessionItems.reduce((s, i) => s + i.total, 0);

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Weight display */}
      <View style={[styles.scaleDisplay, scaleConnected && styles.scaleDisplayConnected]}>
        <Text style={styles.weightNumber}>{displayWeight.toFixed(3)}</Text>
        <Text style={styles.weightUnit}>kg</Text>
        {scaleConnected && (
          <View style={[styles.stableChip, weightStable ? styles.stableChipGreen : styles.stableChipYellow]}>
            <Text style={styles.stableChipText}>{weightStable ? '● นิ่ง' : '● กำลังชั่ง...'}</Text>
          </View>
        )}
        {!scaleConnected && (
          <TouchableOpacity style={styles.goSettingsBtn} onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="bluetooth-outline" size={14} color="#3b82f6" />
            <Text style={styles.goSettingsText}>เชื่อมต่อตาชั่ง</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Manual weight */}
      <View style={styles.manualRow}>
        <TextInput
          style={styles.manualInput}
          placeholder="ใส่น้ำหนักเอง (kg)"
          placeholderTextColor="#9ca3af"
          value={manualWeight}
          onChangeText={setManualWeight}
          keyboardType="decimal-pad"
          onSubmitEditing={applyManualWeight}
        />
        <TouchableOpacity style={styles.manualBtn} onPress={applyManualWeight}>
          <Ionicons name="checkmark" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Mode toggle */}
      <View style={styles.modeRow}>
        {[{ key: 'retail', label: 'ราคาปกติ' }, { key: 'wholesale', label: 'ราคาส่ง' }].map(m => (
          <TouchableOpacity key={m.key} style={[styles.modeBtn, mode === m.key && styles.modeBtnActive]} onPress={() => setMode(m.key)}>
            <Text style={[styles.modeBtnText, mode === m.key && styles.modeBtnTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Partner select */}
      {mode === 'wholesale' && (
        <View style={styles.section}>
          <Text style={styles.label}>คู่ค้า</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {partners.map(p => (
                <TouchableOpacity key={p.id} style={[styles.partnerChip, selectedPartner?.id === p.id && styles.partnerChipActive]} onPress={() => setSelectedPartner(p)}>
                  <Text style={[styles.partnerChipText, selectedPartner?.id === p.id && { color: '#1d4ed8' }]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Product search */}
      <View style={styles.section}>
        <Text style={styles.label}>สินค้าชั่งน้ำหนัก</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#9ca3af" style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาชื่อสินค้า..."
            placeholderTextColor="#9ca3af"
            value={productSearch}
            onChangeText={setProductSearch}
          />
        </View>
        {productResults.map(p => (
          <TouchableOpacity key={p.id} style={styles.productRow} onPress={() => { setSelectedProduct(p); setProductSearch(''); setProductResults([]); }}>
            <Text style={styles.productName}>{p.name}</Text>
            <Text style={styles.productPrice}>฿{fmt(p.sell_price)}/kg</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Calculator card */}
      {selectedProduct && (
        <View style={styles.calcCard}>
          <Text style={styles.calcProductName}>{selectedProduct.name}</Text>
          {mode === 'wholesale' && partnerPrice !== null && (
            <Text style={styles.partnerPriceText}>ราคาส่ง {selectedPartner?.name}: ฿{fmt(partnerPrice)}/kg</Text>
          )}
          <View style={styles.calcRow}>
            <View style={styles.calcBox}>
              <Text style={styles.calcLabel}>น้ำหนัก</Text>
              <Text style={styles.calcValue}>{displayWeight.toFixed(3)}</Text>
              <Text style={styles.calcUnit}>kg</Text>
            </View>
            <Text style={styles.calcMul}>×</Text>
            <View style={styles.calcBox}>
              <Text style={styles.calcLabel}>ราคา/kg</Text>
              <Text style={[styles.calcValue, { color: mode === 'wholesale' && partnerPrice !== null ? '#ea580c' : '#1d4ed8' }]}>฿{fmt(activePrice)}</Text>
            </View>
            <Text style={styles.calcMul}>=</Text>
            <View style={[styles.calcBox, styles.calcTotal]}>
              <Text style={[styles.calcLabel, { color: '#bfdbfe' }]}>รวม</Text>
              <Text style={styles.calcTotalValue}>฿{fmt(totalPrice)}</Text>
            </View>
          </View>

          <View style={styles.actionBtns}>
            <TouchableOpacity style={styles.addSessionBtn} onPress={addToSession}>
              <Ionicons name="list-outline" size={16} color="#fff" />
              <Text style={styles.addSessionText}>เพิ่มรายการ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addCartBtn} onPress={() => {
              if (!selectedProduct || displayWeight <= 0) return;
              addToCart({ id: Date.now(), product_id: selectedProduct.id, product_name: selectedProduct.name, weight: displayWeight, price_per_unit: activePrice, total: totalPrice, partner_name: mode === 'wholesale' ? selectedPartner?.name : null });
            }}>
              <Ionicons name="cart-outline" size={16} color="#1d4ed8" />
              <Text style={styles.addCartText}>ใส่ตะกร้า</Text>
            </TouchableOpacity>
            {printerConnected && (
              <TouchableOpacity style={styles.printBtn} onPress={() => printWeighSlip({ product_name: selectedProduct.name, weight: displayWeight, price_per_unit: activePrice, total: totalPrice, partner_name: mode === 'wholesale' ? selectedPartner?.name : null })}>
                <Ionicons name="print-outline" size={16} color="#059669" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Session list */}
      {sessionItems.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>รายการในชุด ({sessionItems.length})</Text>
          {sessionItems.map((item, idx) => (
            <View key={item.id} style={styles.sessionItem}>
              <Text style={styles.sessionNum}>{idx + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sessionName}>{item.product_name}</Text>
                <Text style={styles.sessionMeta}>{item.weight.toFixed(3)} kg × ฿{fmt(item.price_per_unit)}{item.partner_name ? ` [${item.partner_name}]` : ''}</Text>
              </View>
              <Text style={styles.sessionAmt}>฿{fmt(item.total)}</Text>
              <View style={{ gap: 4 }}>
                <TouchableOpacity onPress={() => addToCart(item)}><Ionicons name="cart-outline" size={16} color="#3b82f6" /></TouchableOpacity>
                {printerConnected && <TouchableOpacity onPress={() => printWeighSlip(item)}><Ionicons name="print-outline" size={16} color="#059669" /></TouchableOpacity>}
                <TouchableOpacity onPress={() => setSessionItems(p => p.filter(i => i.id !== item.id))}><Ionicons name="trash-outline" size={16} color="#ef4444" /></TouchableOpacity>
              </View>
            </View>
          ))}
          <View style={styles.sessionFooter}>
            <Text style={styles.sessionTotalLabel}>รวมทั้งหมด</Text>
            <Text style={styles.sessionTotalAmt}>฿{fmt(sessionTotal)}</Text>
          </View>
          <TouchableOpacity style={styles.clearSessionBtn} onPress={() => Alert.alert('ล้างรายการ?', '', [{ text: 'ยกเลิก' }, { text: 'ล้าง', onPress: () => setSessionItems([]) }])}>
            <Text style={styles.clearSessionText}>ล้างรายการ</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scaleDisplay: { backgroundColor: '#1e293b', margin: 12, borderRadius: 20, padding: 24, alignItems: 'center' },
  scaleDisplayConnected: { backgroundColor: '#0f172a' },
  weightNumber: { fontSize: 72, fontWeight: '900', color: '#e2e8f0', fontVariant: ['tabular-nums'], lineHeight: 80 },
  weightUnit: { fontSize: 28, color: '#64748b', fontWeight: '600', marginTop: -4 },
  stableChip: { marginTop: 10, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  stableChipGreen: { backgroundColor: '#14532d' },
  stableChipYellow: { backgroundColor: '#713f12' },
  stableChipText: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },
  goSettingsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  goSettingsText: { color: '#60a5fa', fontSize: 13 },
  manualRow: { flexDirection: 'row', marginHorizontal: 12, gap: 8, marginBottom: 8 },
  manualInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#111827' },
  manualBtn: { width: 44, backgroundColor: '#3b82f6', borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  modeRow: { flexDirection: 'row', marginHorizontal: 12, gap: 8, marginBottom: 4 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#eff6ff', borderWidth: 1.5, borderColor: '#bfdbfe' },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  modeBtnTextActive: { color: '#1d4ed8' },
  section: { backgroundColor: '#fff', margin: 12, marginTop: 6, borderRadius: 14, padding: 14 },
  label: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  productRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  productName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  productPrice: { fontSize: 13, fontWeight: '600', color: '#2563eb' },
  calcCard: { backgroundColor: '#fff', margin: 12, marginTop: 6, borderRadius: 14, padding: 16 },
  calcProductName: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  partnerPriceText: { fontSize: 12, color: '#ea580c', marginBottom: 10, fontWeight: '600' },
  calcRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  calcBox: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 10, padding: 10, alignItems: 'center' },
  calcLabel: { fontSize: 10, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase' },
  calcValue: { fontSize: 16, fontWeight: '800', color: '#111827' },
  calcUnit: { fontSize: 10, color: '#9ca3af' },
  calcMul: { fontSize: 18, color: '#d1d5db', fontWeight: '700' },
  calcTotal: { backgroundColor: '#1d4ed8', flex: 1.2 },
  calcTotalValue: { fontSize: 16, fontWeight: '900', color: '#fff' },
  actionBtns: { flexDirection: 'row', gap: 8 },
  addSessionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1d4ed8', borderRadius: 10, paddingVertical: 12 },
  addSessionText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  addCartBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#eff6ff', borderWidth: 1.5, borderColor: '#bfdbfe', borderRadius: 10, paddingVertical: 12 },
  addCartText: { color: '#1d4ed8', fontWeight: '700', fontSize: 14 },
  printBtn: { width: 44, backgroundColor: '#ecfdf5', borderWidth: 1.5, borderColor: '#a7f3d0', borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  partnerChip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f3f4f6', borderRadius: 20, borderWidth: 1.5, borderColor: 'transparent' },
  partnerChipActive: { borderColor: '#1d4ed8', backgroundColor: '#eff6ff' },
  partnerChipText: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  sectionHeader: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 8 },
  sessionItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sessionNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#1d4ed8', color: '#fff', textAlign: 'center', fontSize: 12, fontWeight: '700', lineHeight: 22 },
  sessionName: { fontSize: 13, fontWeight: '600', color: '#111827' },
  sessionMeta: { fontSize: 11, color: '#6b7280' },
  sessionAmt: { fontSize: 14, fontWeight: '700', color: '#1d4ed8', minWidth: 70, textAlign: 'right' },
  sessionFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4 },
  sessionTotalLabel: { fontSize: 14, fontWeight: '700', color: '#374151' },
  sessionTotalAmt: { fontSize: 16, fontWeight: '800', color: '#1d4ed8' },
  clearSessionBtn: { marginTop: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, alignItems: 'center' },
  clearSessionText: { color: '#ef4444', fontSize: 13, fontWeight: '600' },
});
