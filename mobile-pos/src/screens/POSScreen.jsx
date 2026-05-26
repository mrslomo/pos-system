import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  Alert, ActivityIndicator, Modal, ScrollView, Keyboard, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useHardware } from '../context/HardwareContext';
import { productAPI, heldBillAPI, partnerAPI } from '../services/api';

const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

// ─── Product search result item ──────────────────────────────────────────
function ProductRow({ item, onAdd }) {
  const typeColor = { fresh: '#dcfce7', innards: '#fee2e2', processed: '#f3e8ff' };
  const typeLabel = { fresh: 'สด', innards: 'เครื่องใน', processed: 'แปรรูป' };
  return (
    <TouchableOpacity style={styles.productRow} onPress={() => onAdd(item)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.productMeta}>
          {item.product_type && (
            <View style={[styles.typeBadge, { backgroundColor: typeColor[item.product_type] || '#f3f4f6' }]}>
              <Text style={styles.typeBadgeText}>{typeLabel[item.product_type] || item.product_type}</Text>
            </View>
          )}
          {item.is_weight && <View style={styles.weightBadge}><Text style={styles.weightBadgeText}>ชั่งน้ำหนัก</Text></View>}
          <Text style={styles.barcodeText}>{item.barcode || ''}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.productPrice}>฿{fmt(item.sell_price)}</Text>
        <Text style={styles.productUnit}>{item.unit}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Cart item ──────────────────────────────────────────────────────────
function CartItem({ item, onQtyChange, onRemove, onPriceEdit }) {
  return (
    <View style={styles.cartItem}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cartName} numberOfLines={1}>{item.product_name}</Text>
        <TouchableOpacity onPress={() => onPriceEdit(item)}>
          <Text style={styles.cartPrice}>฿{fmt(item.unit_price)}/{item.is_weight ? 'kg' : item.unit}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.qtyRow}>
        <TouchableOpacity style={styles.qtyBtn} onPress={() => onQtyChange(item.product_id, parseFloat(item.quantity) - 1)}>
          <Text style={styles.qtyBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.qtyText}>{parseFloat(item.quantity).toFixed(item.is_weight ? 3 : 0)}</Text>
        <TouchableOpacity style={styles.qtyBtn} onPress={() => onQtyChange(item.product_id, parseFloat(item.quantity) + 1)}>
          <Text style={styles.qtyBtnText}>+</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.cartSubtotal}>฿{fmt(parseFloat(item.unit_price) * parseFloat(item.quantity))}</Text>
      <TouchableOpacity onPress={() => onRemove(item.product_id)} style={{ padding: 4, marginLeft: 4 }}>
        <Ionicons name="trash-outline" size={16} color="#ef4444" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Main POS Screen ─────────────────────────────────────────────────────
export default function POSScreen({ navigation }) {
  const { user } = useAuth();
  const { items, discount, setDiscount, addItem, updateQty, updatePrice, removeItem, clearCart, loadCart, subtotal, total } = useCart();
  const { printerConnected, print, openCashDrawer } = useHardware();

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [cameraPermission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Hold bill modal
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdNote, setHoldNote] = useState('');
  const [holdLoading, setHoldLoading] = useState(false);

  // Recall modal
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [heldBills, setHeldBills] = useState([]);
  const [recallLoading, setRecallLoading] = useState(false);

  // Price edit modal
  const [priceEditItem, setPriceEditItem] = useState(null);
  const [priceEditValue, setPriceEditValue] = useState('');

  // Discount modal
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountInput, setDiscountInput] = useState('');

  const searchTimer = useRef(null);

  // Search products
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!search.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await productAPI.search({ search, branch_id: user.branch_id, limit: 15 });
        setSearchResults(Array.isArray(r) ? r : (r.products || []));
      } catch {}
      setSearching(false);
    }, 250);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const handleAddProduct = useCallback((product) => {
    addItem(product);
    setSearch('');
    setSearchResults([]);
    Keyboard.dismiss();
  }, [addItem]);

  const handleBarcodeScan = useCallback(async ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setShowScanner(false);
    try {
      const product = await productAPI.byBarcode(data, user.branch_id);
      if (product) {
        addItem(product);
      } else {
        Alert.alert('ไม่พบสินค้า', `บาร์โค้ด: ${data}`);
      }
    } catch {
      Alert.alert('ไม่พบสินค้า', `บาร์โค้ด: ${data}`);
    }
    setTimeout(() => setScanned(false), 2000);
  }, [scanned, addItem, user.branch_id]);

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) return Alert.alert('ไม่ได้รับอนุญาต', 'ต้องอนุญาตให้ใช้กล้อง');
    }
    setScanned(false);
    setShowScanner(true);
  };

  // Hold bill
  const handleHold = async () => {
    if (!items.length) return Alert.alert('', 'ไม่มีรายการในตะกร้า');
    setHoldLoading(true);
    try {
      await heldBillAPI.hold({
        branch_id: user.branch_id,
        user_id: user.id,
        cart_items: items,
        discount,
        total_amount: total,
        notes: holdNote,
      });
      clearCart();
      setShowHoldModal(false);
      setHoldNote('');
      Alert.alert('✓ Hold บิลสำเร็จ', 'บิลถูก hold ไว้แล้ว สามารถเรียกคืนได้ภายใน 24 ชั่วโมง');
    } catch (err) {
      Alert.alert('เกิดข้อผิดพลาด', err.error || 'ไม่สามารถ hold บิลได้');
    } finally { setHoldLoading(false); }
  };

  // Recall held bills
  const openRecallModal = async () => {
    setRecallLoading(true);
    setShowRecallModal(true);
    try {
      const bills = await heldBillAPI.list({ branch_id: user.branch_id });
      setHeldBills(Array.isArray(bills) ? bills : (bills.bills || []));
    } catch {}
    setRecallLoading(false);
  };

  const handleRecall = async (bill) => {
    try {
      const recalled = await heldBillAPI.recall(bill.id);
      const cartData = recalled.cart_items || bill.cart_items || [];
      loadCart(cartData, parseFloat(bill.discount || 0));
      setShowRecallModal(false);
    } catch (err) {
      Alert.alert('เกิดข้อผิดพลาด', err.error || 'ไม่สามารถเรียกบิลได้');
    }
  };

  const remainingMins = (exp) => {
    const diff = new Date(exp) - new Date();
    return Math.max(0, Math.floor(diff / 60000));
  };

  // Go to payment
  const goToPayment = () => {
    if (!items.length) return Alert.alert('', 'ไม่มีรายการในตะกร้า');
    navigation.navigate('Payment');
  };

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#9ca3af" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาสินค้าหรือ barcode..."
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {searching && <ActivityIndicator size="small" color="#3b82f6" />}
        </View>
        <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
          <Ionicons name="barcode-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Product search results */}
      {searchResults.length > 0 && (
        <View style={styles.searchDropdown}>
          <FlatList
            data={searchResults}
            keyExtractor={i => String(i.id)}
            renderItem={({ item }) => <ProductRow item={item} onAdd={handleAddProduct} />}
            style={{ maxHeight: 260 }}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      )}

      {/* Cart */}
      <FlatList
        data={items}
        keyExtractor={i => String(i.product_id)}
        style={styles.cartList}
        contentContainerStyle={{ paddingBottom: 8 }}
        ListEmptyComponent={
          <View style={styles.emptyCart}>
            <Ionicons name="cart-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>ยังไม่มีสินค้าในตะกร้า</Text>
          </View>
        }
        renderItem={({ item }) => (
          <CartItem
            item={item}
            onQtyChange={updateQty}
            onRemove={removeItem}
            onPriceEdit={(it) => { setPriceEditItem(it); setPriceEditValue(String(it.unit_price)); }}
          />
        )}
      />

      {/* Bottom summary */}
      <View style={styles.bottomPanel}>
        <View style={styles.summaryRow}>
          <TouchableOpacity onPress={() => { setDiscountInput(String(discount)); setShowDiscountModal(true); }} style={styles.discountBtn}>
            <Text style={styles.discountBtnText}>ส่วนลด {discount > 0 ? `฿${fmt(discount)}` : ''}</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.subtotalText}>รวม ฿{fmt(subtotal)}</Text>
            <Text style={styles.totalText}>สุทธิ ฿{fmt(total)}</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          {/* Hold */}
          <TouchableOpacity style={styles.holdBtn} onPress={() => setShowHoldModal(true)}>
            <Ionicons name="pause-circle-outline" size={18} color="#d97706" />
            <Text style={styles.holdBtnText}>Hold</Text>
          </TouchableOpacity>
          {/* Recall */}
          <TouchableOpacity style={styles.recallBtn} onPress={openRecallModal}>
            <Ionicons name="refresh-outline" size={18} color="#059669" />
            <Text style={styles.recallBtnText}>เรียกบิล</Text>
          </TouchableOpacity>
          {/* Clear */}
          <TouchableOpacity style={styles.clearBtn} onPress={() => { if (items.length) Alert.alert('ล้างตะกร้า?', '', [{ text: 'ยกเลิก' }, { text: 'ล้าง', onPress: clearCart }]); }}>
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
          {/* Pay */}
          <TouchableOpacity style={styles.payBtn} onPress={goToPayment}>
            <Text style={styles.payBtnText}>ชำระเงิน  ฿{fmt(total)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Barcode scanner modal ── */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarcodeScan}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr'] }}
          />
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.scanHint}>จ่อกล้องไปที่บาร์โค้ด</Text>
          </View>
          <TouchableOpacity style={styles.closeScanBtn} onPress={() => setShowScanner(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Hold modal ── */}
      <Modal visible={showHoldModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Hold บิล</Text>
            <Text style={styles.modalSub}>{items.length} รายการ • ฿{fmt(total)}</Text>
            <TextInput
              style={[styles.input, { marginTop: 12 }]}
              placeholder="หมายเหตุ (ไม่บังคับ)"
              value={holdNote}
              onChangeText={setHoldNote}
              placeholderTextColor="#9ca3af"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowHoldModal(false)}>
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleHold} disabled={holdLoading}>
                {holdLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalConfirmText}>Hold บิล</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Recall modal ── */}
      <Modal visible={showRecallModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.modalTitle}>บิลที่ Hold ไว้</Text>
              <TouchableOpacity onPress={() => setShowRecallModal(false)}>
                <Ionicons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>
            {recallLoading ? (
              <ActivityIndicator size="large" color="#3b82f6" style={{ marginVertical: 20 }} />
            ) : heldBills.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#9ca3af', paddingVertical: 20 }}>ไม่มีบิลที่ Hold ไว้</Text>
            ) : (
              <ScrollView>
                {heldBills.map(bill => (
                  <TouchableOpacity key={bill.id} style={styles.heldBillRow} onPress={() => handleRecall(bill)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heldBillCode}>{bill.session_code}</Text>
                      <Text style={styles.heldBillMeta}>
                        {bill.user_name} • เหลือ {remainingMins(bill.expires_at)} นาที
                        {bill.notes ? ` • ${bill.notes}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.heldBillAmt}>฿{fmt(bill.total_amount)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Price edit modal ── */}
      <Modal visible={!!priceEditItem} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>แก้ไขราคา</Text>
            <Text style={styles.modalSub}>{priceEditItem?.product_name}</Text>
            <TextInput
              style={[styles.input, { marginTop: 12, textAlign: 'right', fontSize: 22, fontWeight: '700' }]}
              value={priceEditValue}
              onChangeText={setPriceEditValue}
              keyboardType="decimal-pad"
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setPriceEditItem(null)}>
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={() => {
                const p = parseFloat(priceEditValue);
                if (!isNaN(p) && p >= 0 && priceEditItem) {
                  updatePrice(priceEditItem.product_id, p);
                }
                setPriceEditItem(null);
              }}>
                <Text style={styles.modalConfirmText}>บันทึก</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Discount modal ── */}
      <Modal visible={showDiscountModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>ส่วนลด</Text>
            <TextInput
              style={[styles.input, { marginTop: 12, textAlign: 'right', fontSize: 22, fontWeight: '700' }]}
              value={discountInput}
              onChangeText={setDiscountInput}
              keyboardType="decimal-pad"
              placeholder="0"
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowDiscountModal(false)}>
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={() => {
                setDiscount(parseFloat(discountInput) || 0);
                setShowDiscountModal(false);
              }}>
                <Text style={styles.modalConfirmText}>ตกลง</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  searchRow: { flexDirection: 'row', padding: 10, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  scanBtn: { width: 44, height: 44, backgroundColor: '#3b82f6', borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  searchDropdown: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', elevation: 4, zIndex: 10 },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  productName: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  productMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  typeBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  typeBadgeText: { fontSize: 10, fontWeight: '600' },
  weightBadge: { backgroundColor: '#dbeafe', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  weightBadgeText: { fontSize: 10, color: '#1d4ed8', fontWeight: '600' },
  barcodeText: { fontSize: 10, color: '#9ca3af', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  productPrice: { fontSize: 14, fontWeight: '700', color: '#2563eb' },
  productUnit: { fontSize: 11, color: '#9ca3af' },
  cartList: { flex: 1 },
  emptyCart: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9ca3af', marginTop: 12, fontSize: 14 },
  cartItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 10, marginTop: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, elevation: 1 },
  cartName: { fontSize: 13, fontWeight: '600', color: '#111827', maxWidth: 120 },
  cartPrice: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 8 },
  qtyBtn: { width: 28, height: 28, backgroundColor: '#eff6ff', borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
  qtyBtnText: { fontSize: 18, color: '#2563eb', lineHeight: 22 },
  qtyText: { fontSize: 14, fontWeight: '700', color: '#111827', minWidth: 32, textAlign: 'center' },
  cartSubtotal: { fontSize: 14, fontWeight: '700', color: '#1d4ed8', minWidth: 68, textAlign: 'right' },
  bottomPanel: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  discountBtn: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  discountBtnText: { fontSize: 13, color: '#c2410c', fontWeight: '600' },
  subtotalText: { fontSize: 12, color: '#6b7280' },
  totalText: { fontSize: 18, fontWeight: '800', color: '#111827' },
  actionRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  holdBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10 },
  holdBtnText: { fontSize: 13, color: '#d97706', fontWeight: '600' },
  recallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 10 },
  recallBtnText: { fontSize: 13, color: '#059669', fontWeight: '600' },
  clearBtn: { padding: 10, backgroundColor: '#fef2f2', borderRadius: 10, borderWidth: 1, borderColor: '#fecaca' },
  payBtn: { flex: 1, backgroundColor: '#1d4ed8', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  payBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  scanOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 250, height: 150, borderWidth: 2, borderColor: '#3b82f6', borderRadius: 12, backgroundColor: 'transparent' },
  scanHint: { color: '#fff', marginTop: 16, fontSize: 14, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  closeScanBtn: { position: 'absolute', top: 50, right: 20, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 30 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalSub: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  input: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb', alignItems: 'center' },
  modalCancelText: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
  modalConfirm: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#1d4ed8', alignItems: 'center' },
  modalConfirmText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  heldBillRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  heldBillCode: { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
  heldBillMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  heldBillAmt: { fontSize: 15, fontWeight: '700', color: '#111827' },
});
