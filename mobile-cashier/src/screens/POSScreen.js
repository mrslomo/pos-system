import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  Alert, Modal, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { productAPI, salesAPI, heldBillAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useShift } from '../context/ShiftContext';
import QRPaymentModal from '../components/QRPaymentModal';

const PAY_METHODS = [
  { key: 'cash', label: 'เงินสด' },
  { key: 'transfer', label: 'บัตร' },
  { key: 'promptpay', label: 'พร้อมเพย์' },
];

const SHIFT_LABEL = { morning: 'เช้า 🌅', afternoon: 'บ่าย ☀️', night: 'ดึก 🌙', fullday: 'เต็มวัน 📅' };

export default function POSScreen() {
  const { user, logout } = useAuth();
  const { shift, closeShift, refreshShift } = useShift();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState('0');
  const [payment, setPayment] = useState('cash');
  const [cashInput, setCashInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [holdModal, setHoldModal] = useState(false);
  const [heldBills, setHeldBills] = useState([]);
  const [closeShiftModal, setCloseShiftModal] = useState(false);
  const [qrModal, setQrModal] = useState(false);
  const [actualCash, setActualCash] = useState('');
  const [closingShift, setClosingShift] = useState(false);
  const [shiftSummary, setShiftSummary] = useState(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const debounce = useRef(null);

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  const searchProducts = useCallback(async (q) => {
    if (!q || q.length < 1) { setResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await productAPI.search({ q, branch_id: user.branch_id, limit: 20 });
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
      const i = prev.findIndex(x => x.id === product.id);
      if (i >= 0) {
        const u = [...prev];
        u[i] = { ...u[i], qty: u[i].qty + 1 };
        return u;
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        price: Number(product.selling_price || product.price || 0),
        cost: Number(product.cost_price || 0),
        barcode: product.barcode || '',
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

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmt = Math.min(subtotal, Math.max(0, parseFloat(discount) || 0));
  const total = subtotal - discountAmt;
  const change = Math.max(0, (parseFloat(cashInput) || 0) - total);

  const handleCheckout = async () => {
    if (cart.length === 0) { Alert.alert('ตะกร้าว่าง', 'กรุณาเพิ่มสินค้าก่อน'); return; }
    setSubmitting(true);
    try {
      await salesAPI.create({
        branch_id: user.branch_id,
        items: cart.map(i => ({ product_id: i.id, quantity: i.qty, unit_price: i.price, cost_price: i.cost, subtotal: i.price * i.qty })),
        subtotal,
        discount_amount: discountAmt,
        total_amount: total,
        payment_method: payment,
        payment_amount: payment === 'cash' ? (parseFloat(cashInput) || total) : total,
      });
      setCart([]);
      setDiscount('0');
      setCashInput('');
      Alert.alert('✓ สำเร็จ', 'บันทึกการขายเรียบร้อย');
    } catch (err) {
      Alert.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถบันทึกการขายได้');
    } finally { setSubmitting(false); }
  };

  const openCloseShift = async () => {
    try {
      const current = await refreshShift(user.branch_id, user.id);
      setShiftSummary(current);
      setActualCash('');
      setCloseShiftModal(true);
    } catch { setCloseShiftModal(true); }
  };

  const handleCloseShift = async () => {
    if (!actualCash) { Alert.alert('กรุณาใส่ยอดเงินจริง'); return; }
    setClosingShift(true);
    try {
      await closeShift(shift.id, parseFloat(actualCash));
    } catch (err) {
      Alert.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถปิดกะได้');
    } finally {
      setClosingShift(false);
      setCloseShiftModal(false);
    }
  };

  const holdCurrentCart = async () => {
    if (cart.length === 0) return;
    try {
      await heldBillAPI.hold({
        branch_id: user.branch_id,
        items: cart.map(i => ({ product_id: i.id, product_name: i.name, quantity: i.qty, unit_price: i.price, cost_price: i.cost, subtotal: i.price * i.qty })),
        subtotal, discount_amount: discountAmt, total_amount: total,
      });
      setCart([]);
      Alert.alert('Hold บิล', 'บันทึก Hold บิลเรียบร้อย');
    } catch (err) { Alert.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถ Hold บิลได้'); }
  };

  const loadHeldBills = async () => {
    try {
      const bills = await heldBillAPI.list({ branch_id: user.branch_id });
      setHeldBills(bills || []);
    } catch { setHeldBills([]); }
  };

  const recallBill = async (bill) => {
    try {
      const recalled = await heldBillAPI.recall(bill.id);
      const items = (recalled?.items || bill.items || []).map(i => ({
        id: i.product_id, name: i.product_name,
        price: Number(i.unit_price), cost: Number(i.cost_price || 0),
        unit: i.unit || '', qty: Number(i.quantity),
      }));
      setCart(items);
      setDiscount(String(recalled?.discount_amount || bill.discount_amount || '0'));
      setHoldModal(false);
    } catch (err) { Alert.alert('เกิดข้อผิดพลาด', err?.message || 'ไม่สามารถเรียกบิลได้'); }
  };

  if (scanning) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          style={{ flex: 1 }} facing="back"
          onBarcodeScanned={handleBarcode}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr', 'upc_a', 'upc_e'] }}
        />
        <TouchableOpacity style={s.cancelScan} onPress={() => setScanning(false)}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>✕ ยกเลิก</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---- RIGHT PANEL (summary + payment) ----
  const RightPanel = () => (
    <View style={s.rightPanel}>
      <Text style={s.panelTitle}>สรุปยอด</Text>

      {/* Cart items mini list */}
      <FlatList
        data={cart}
        keyExtractor={i => String(i.id)}
        style={s.miniCart}
        ListEmptyComponent={<Text style={s.emptyMini}>ยังไม่มีรายการ</Text>}
        renderItem={({ item }) => (
          <View style={s.miniItem}>
            <View style={{ flex: 1 }}>
              <Text style={s.miniName} numberOfLines={1}>{item.name}</Text>
              <Text style={s.miniSub}>฿{fmt(item.price)} × {item.qty}</Text>
            </View>
            <View style={s.miniQty}>
              <TouchableOpacity onPress={() => updateQty(item.id, -1)} style={s.qBtn}>
                <Text style={s.qBtnTxt}>−</Text>
              </TouchableOpacity>
              <Text style={s.qNum}>{item.qty}</Text>
              <TouchableOpacity onPress={() => updateQty(item.id, 1)} style={s.qBtn}>
                <Text style={s.qBtnTxt}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.miniTotal}>฿{fmt(item.price * item.qty)}</Text>
          </View>
        )}
      />

      {/* Totals */}
      <View style={s.summaryBox}>
        <View style={s.sumRow}>
          <Text style={s.sumLabel}>ยอดรวม</Text>
          <Text style={s.sumVal}>฿{fmt(subtotal)}</Text>
        </View>
        <View style={s.sumRow}>
          <Text style={s.sumLabel}>ส่วนลด</Text>
          <TextInput
            style={s.discInput}
            value={discount}
            onChangeText={setDiscount}
            keyboardType="numeric"
            selectTextOnFocus
          />
        </View>
        <View style={[s.sumRow, s.netRow]}>
          <Text style={s.netLabel}>ยอดสุทธิ</Text>
          <Text style={s.netVal}>฿{fmt(total)}</Text>
        </View>
      </View>

      {/* Payment method */}
      <Text style={s.sectionLabel}>วิธีชำระเงิน</Text>
      <View style={s.payRow}>
        {PAY_METHODS.map(m => (
          <TouchableOpacity key={m.key} style={[s.payBtn, payment === m.key && s.payBtnOn]}
            onPress={() => setPayment(m.key)}>
            <Text style={[s.payBtnTxt, payment === m.key && { color: '#fff' }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Cash received */}
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
              <Text style={s.changeLabel}>เงินทอน</Text>
              <Text style={[s.changeVal, { color: change >= 0 ? '#10b981' : '#ef4444' }]}>
                ฿{fmt(change)}
              </Text>
            </View>
          )}
        </>
      )}

      {/* Action buttons */}
      <View style={s.actionRow}>
        <TouchableOpacity style={s.holdBtn} onPress={holdCurrentCart} disabled={cart.length === 0}>
          <Text style={s.holdBtnTxt}>Hold บิล</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.recallBtn} onPress={() => { loadHeldBills(); setHoldModal(true); }}>
          <Text style={s.recallBtnTxt}>เรียกบิล</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[s.checkoutBtn, (cart.length === 0 || submitting) && { opacity: 0.5 }]}
        onPress={() => {
          if (cart.length === 0) return;
          if (payment === 'promptpay') setQrModal(true);
          else handleCheckout();
        }}
        disabled={cart.length === 0 || submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.checkoutTxt}>
              {payment === 'promptpay' ? '🔲 แสดง QR' : 'ชำระเงิน'} ฿{fmt(total)}
            </Text>
        }
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.container}>
        {/* LEFT: search + product results + cart */}
        <View style={s.leftPanel}>
          {/* Header */}
          <View style={s.topBar}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={s.topTitle}>หน้าขาย</Text>
              {shift && (
                <View style={s.shiftBadge}>
                  <Text style={s.shiftBadgeTxt}>กะ{SHIFT_LABEL[shift.shift_type] || shift.shift_type}</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {shift && (
                <TouchableOpacity style={s.closeShiftBtn} onPress={openCloseShift}>
                  <Text style={s.closeShiftTxt}>⏹ ปิดกะ</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={logout} style={s.logoutBtn}>
                <Text style={s.logoutTxt}>ออกระบบ</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search bar */}
          <View style={s.searchRow}>
            <TextInput
              style={s.searchInput}
              placeholder="ค้นหาสินค้า หรือสแกน Barcode..."
              value={search}
              onChangeText={handleSearchChange}
              returnKeyType="search"
            />
            <TouchableOpacity style={s.scanBtn} onPress={async () => {
              if (camPermission?.granted) setScanning(true);
              else { const { granted } = await requestCamPermission(); if (granted) setScanning(true); }
            }}>
              <Text style={{ fontSize: 20 }}>📷</Text>
            </TouchableOpacity>
          </View>

          {/* Search results */}
          {(results.length > 0 || searchLoading) ? (
            <View style={s.resultBox}>
              {searchLoading
                ? <ActivityIndicator style={{ padding: 12 }} color="#3b82f6" />
                : (
                  <FlatList
                    data={results}
                    keyExtractor={i => String(i.id)}
                    style={{ maxHeight: 220 }}
                    keyboardShouldPersistTaps="always"
                    renderItem={({ item }) => (
                      <TouchableOpacity style={s.resultItem} onPress={() => addToCart(item)}>
                        {item.image_url
                          ? <Image source={{ uri: item.image_url }} style={s.resultImg} />
                          : <View style={[s.resultImg, s.imgPlaceholder]}><Text>📦</Text></View>
                        }
                        <View style={{ flex: 1 }}>
                          <Text style={s.resultName} numberOfLines={1}>{item.name}</Text>
                          <Text style={s.resultCode}>{item.barcode}</Text>
                        </View>
                        <Text style={s.resultPrice}>฿{fmt(item.selling_price || item.price)}</Text>
                      </TouchableOpacity>
                    )}
                  />
                )
              }
            </View>
          ) : null}

          {/* Cart label */}
          <View style={s.cartHeader}>
            <Text style={s.cartHeaderTxt}>รายการ ({cart.length})</Text>
            {cart.length > 0 && (
              <TouchableOpacity onPress={() => setCart([])}>
                <Text style={{ color: '#ef4444', fontSize: 13 }}>ล้างทั้งหมด</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Cart list */}
          <FlatList
            data={cart}
            keyExtractor={i => String(i.id)}
            style={{ flex: 1 }}
            ListEmptyComponent={
              <View style={s.emptyCart}>
                <Text style={{ fontSize: 36 }}>🛒</Text>
                <Text style={s.emptyTxt}>สแกน Barcode หรือค้นหาสินค้า</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={s.cartItem}>
                {item.image_url
                  ? <Image source={{ uri: item.image_url }} style={s.cartImg} />
                  : <View style={[s.cartImg, s.imgPlaceholder]}><Text style={{ fontSize: 12 }}>📦</Text></View>
                }
                <View style={{ flex: 1 }}>
                  <Text style={s.cartName} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.cartPrice}>฿{fmt(item.price)} / {item.unit}</Text>
                </View>
                <View style={s.qtyCtrl}>
                  <TouchableOpacity onPress={() => updateQty(item.id, -1)} style={s.qBtn}>
                    <Text style={s.qBtnTxt}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.qNum}>{item.qty}</Text>
                  <TouchableOpacity onPress={() => updateQty(item.id, 1)} style={s.qBtn}>
                    <Text style={s.qBtnTxt}>+</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.cartSubtotal}>฿{fmt(item.price * item.qty)}</Text>
              </View>
            )}
          />
        </View>

        {/* RIGHT PANEL */}
        <RightPanel />
      </View>

      {/* PromptPay QR Modal */}
      <QRPaymentModal
        visible={qrModal}
        amount={total}
        onConfirm={() => { setQrModal(false); handleCheckout(); }}
        onCancel={() => setQrModal(false)}
      />

      {/* Close Shift Modal */}
      <Modal visible={closeShiftModal} animationType="fade" transparent>
        <View style={s.overlay}>
          <View style={[s.modalCard, { width: 420 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>⏹ ปิดกะทำงาน</Text>
              <TouchableOpacity onPress={() => setCloseShiftModal(false)}>
                <Text style={{ fontSize: 20, color: '#64748b' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Shift summary */}
            {shiftSummary && (
              <View style={s.shiftSumBox}>
                <View style={s.shiftSumRow}>
                  <Text style={s.shiftSumLabel}>ยอดขายรวม</Text>
                  <Text style={s.shiftSumVal}>฿{fmt(shiftSummary.total_sales)}</Text>
                </View>
                <View style={s.shiftSumRow}>
                  <Text style={s.shiftSumLabel}>เงินสด</Text>
                  <Text style={[s.shiftSumVal, { color: '#10b981' }]}>฿{fmt(shiftSummary.cash_sales)}</Text>
                </View>
                <View style={s.shiftSumRow}>
                  <Text style={s.shiftSumLabel}>โอน/บัตร</Text>
                  <Text style={[s.shiftSumVal, { color: '#3b82f6' }]}>฿{fmt(shiftSummary.transfer_sales)}</Text>
                </View>
                <View style={s.shiftSumRow}>
                  <Text style={s.shiftSumLabel}>จำนวนบิล</Text>
                  <Text style={s.shiftSumVal}>{shiftSummary.sale_count} บิล</Text>
                </View>
                <View style={[s.shiftSumRow, { borderTopWidth: 1, borderColor: '#e2e8f0', paddingTop: 8, marginTop: 4 }]}>
                  <Text style={s.shiftSumLabel}>เงินเก๊ะเปิดกะ</Text>
                  <Text style={s.shiftSumVal}>฿{fmt(shiftSummary.opening_cash)}</Text>
                </View>
                <View style={s.shiftSumRow}>
                  <Text style={[s.shiftSumLabel, { fontWeight: '600' }]}>เงินในลิ้นชัก (คาดการณ์)</Text>
                  <Text style={[s.shiftSumVal, { fontWeight: 'bold', color: '#1e3a5f' }]}>
                    ฿{fmt(Number(shiftSummary.opening_cash) + Number(shiftSummary.cash_sales))}
                  </Text>
                </View>
              </View>
            )}

            {/* Actual cash input */}
            <Text style={[s.sectionLabel, { marginTop: 14 }]}>นับเงินจริง (Actual Cash)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#3b82f6', borderRadius: 10, paddingHorizontal: 12, marginBottom: 8 }}>
              <Text style={{ fontSize: 18, color: '#64748b', marginRight: 6 }}>฿</Text>
              <TextInput
                style={{ flex: 1, height: 48, fontSize: 22, fontWeight: 'bold', color: '#1e293b' }}
                value={actualCash}
                onChangeText={setActualCash}
                keyboardType="numeric"
                placeholder="0.00"
                selectTextOnFocus
              />
            </View>

            {/* Difference */}
            {actualCash !== '' && shiftSummary && (() => {
              const expected = Number(shiftSummary.opening_cash) + Number(shiftSummary.cash_sales);
              const diff = parseFloat(actualCash) - expected;
              return (
                <View style={[s.changeRow, { marginBottom: 14, backgroundColor: diff >= 0 ? '#f0fdf4' : '#fef2f2' }]}>
                  <Text style={{ fontWeight: '600', color: diff >= 0 ? '#064e3b' : '#991b1b' }}>
                    {diff >= 0 ? '✓ เงินเกิน' : '⚠ เงินขาด'}
                  </Text>
                  <Text style={{ fontSize: 20, fontWeight: 'bold', color: diff >= 0 ? '#10b981' : '#ef4444' }}>
                    {diff >= 0 ? '+' : ''}฿{fmt(diff)}
                  </Text>
                </View>
              );
            })()}

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setCloseShiftModal(false)}>
                <Text style={{ color: '#64748b', fontWeight: '600' }}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, { backgroundColor: '#ef4444' }, closingShift && { opacity: 0.6 }]}
                onPress={handleCloseShift}
                disabled={closingShift}
              >
                {closingShift
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>ปิดกะ</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Held Bills Modal */}
      <Modal visible={holdModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={[s.modalCard, { maxHeight: '80%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>บิลที่ Hold ไว้</Text>
              <TouchableOpacity onPress={() => setHoldModal(false)}>
                <Text style={{ fontSize: 20, color: '#64748b' }}>✕</Text>
              </TouchableOpacity>
            </View>
            {heldBills.length === 0
              ? <Text style={{ color: '#94a3b8', textAlign: 'center', paddingVertical: 32 }}>ไม่มีบิลที่ Hold ไว้</Text>
              : (
                <FlatList
                  data={heldBills}
                  keyExtractor={i => String(i.id)}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={s.heldItem} onPress={() => recallBill(item)}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.heldName}>{item.held_by_name || 'ไม่ระบุ'}</Text>
                        <Text style={s.heldSub}>{(item.items || []).length} รายการ · {new Date(item.created_at).toLocaleTimeString('th-TH')}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.heldTotal}>฿{fmt(item.total_amount)}</Text>
                        <Text style={{ color: '#3b82f6', fontSize: 12, marginTop: 4 }}>เรียกบิล →</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )
            }
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

  // Left panel
  leftPanel: { flex: 1, flexDirection: 'column', backgroundColor: '#f1f5f9', minWidth: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: BLUE, paddingHorizontal: 16, paddingVertical: 10 },
  topTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  logoutBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6 },
  logoutTxt: { color: '#fff', fontSize: 12 },
  shiftBadge: { backgroundColor: '#10b981', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  shiftBadgeTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
  closeShiftBtn: { backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  closeShiftTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  shiftSumBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 4 },
  shiftSumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  shiftSumLabel: { fontSize: 13, color: '#64748b' },
  shiftSumVal: { fontSize: 14, fontWeight: '600', color: '#1e293b' },

  searchRow: { flexDirection: 'row', padding: 10, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  searchInput: { flex: 1, height: 44, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, fontSize: 15, backgroundColor: '#f8fafc' },
  scanBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },

  resultBox: { backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0', elevation: 4, zIndex: 10 },
  resultItem: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  resultImg: { width: 40, height: 40, borderRadius: 8 },
  imgPlaceholder: { backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  resultName: { fontSize: 14, fontWeight: '500', color: '#1e293b' },
  resultCode: { fontSize: 11, color: '#94a3b8' },
  resultPrice: { fontSize: 15, fontWeight: 'bold', color: '#3b82f6' },

  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  cartHeaderTxt: { fontSize: 13, fontWeight: '600', color: '#475569' },
  emptyCart: { alignItems: 'center', paddingTop: 48 },
  emptyTxt: { color: '#94a3b8', marginTop: 10, fontSize: 14 },
  cartItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 8, marginTop: 6, borderRadius: 10, padding: 10, gap: 8, elevation: 1 },
  cartImg: { width: 36, height: 36, borderRadius: 8 },
  cartName: { fontSize: 13, fontWeight: '500', color: '#1e293b' },
  cartPrice: { fontSize: 11, color: '#64748b', marginTop: 2 },
  qtyCtrl: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qBtn: { width: 28, height: 28, borderRadius: 7, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  qBtnTxt: { fontSize: 17, color: '#3b82f6', lineHeight: 21 },
  qNum: { fontSize: 15, fontWeight: 'bold', color: '#1e293b', minWidth: 22, textAlign: 'center' },
  cartSubtotal: { fontSize: 14, fontWeight: 'bold', color: '#1e293b', minWidth: 68, textAlign: 'right' },

  // Right panel
  rightPanel: { width: 340, backgroundColor: '#fff', borderLeftWidth: 1, borderColor: '#e2e8f0', padding: 14, flexDirection: 'column' },
  panelTitle: { fontSize: 16, fontWeight: 'bold', color: BLUE, marginBottom: 8 },

  miniCart: { flex: 1, maxHeight: 220 },
  emptyMini: { color: '#94a3b8', textAlign: 'center', paddingVertical: 16, fontSize: 13 },
  miniItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#f1f5f9', gap: 6 },
  miniName: { fontSize: 12, fontWeight: '500', color: '#1e293b' },
  miniSub: { fontSize: 11, color: '#94a3b8' },
  miniQty: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  miniTotal: { fontSize: 12, fontWeight: 'bold', color: '#1e293b', minWidth: 56, textAlign: 'right' },

  summaryBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, marginTop: 6 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sumLabel: { fontSize: 13, color: '#64748b' },
  sumVal: { fontSize: 13, color: '#1e293b' },
  netRow: { borderTopWidth: 1, borderColor: '#e2e8f0', paddingTop: 6, marginTop: 2 },
  netLabel: { fontSize: 16, fontWeight: 'bold', color: BLUE },
  netVal: { fontSize: 20, fontWeight: 'bold', color: BLUE },
  discInput: { width: 80, height: 30, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, paddingHorizontal: 8, fontSize: 14, textAlign: 'right', backgroundColor: '#fff' },

  sectionLabel: { fontSize: 12, color: '#64748b', marginTop: 10, marginBottom: 4 },
  payRow: { flexDirection: 'row', gap: 6 },
  payBtn: { flex: 1, height: 36, borderRadius: 8, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  payBtnOn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  payBtnTxt: { fontSize: 12, fontWeight: '600', color: '#475569' },

  cashInput: { height: 40, borderWidth: 1.5, borderColor: '#3b82f6', borderRadius: 8, paddingHorizontal: 10, fontSize: 18, fontWeight: 'bold', marginTop: 2 },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f0fdf4', padding: 8, borderRadius: 8, marginTop: 6 },
  changeLabel: { fontSize: 13, color: '#064e3b' },
  changeVal: { fontSize: 16, fontWeight: 'bold' },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  holdBtn: { flex: 1, height: 40, backgroundColor: '#fef9c3', borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#fde047' },
  holdBtnTxt: { color: '#854d0e', fontWeight: '600', fontSize: 13 },
  recallBtn: { flex: 1, height: 40, backgroundColor: '#eff6ff', borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#bfdbfe' },
  recallBtnTxt: { color: '#1d4ed8', fontWeight: '600', fontSize: 13 },
  checkoutBtn: { height: 50, backgroundColor: '#10b981', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  checkoutTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Camera
  cancelScan: { position: 'absolute', bottom: 48, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 30 },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  heldItem: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderColor: '#f1f5f9', alignItems: 'center' },
  heldName: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  heldSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  heldTotal: { fontSize: 15, fontWeight: 'bold', color: '#1e293b' },
});
