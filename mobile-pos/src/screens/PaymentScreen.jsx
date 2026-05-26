import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  Modal, TextInput, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useHardware } from '../context/HardwareContext';
import { salesAPI, bankAccountAPI } from '../services/api';
import { buildReceipt } from '../utils/escpos';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

// PromptPay QR payload (EMVCo)
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}
function tlv(tag, value) { return `${tag}${String(value.length).padStart(2, '0')}${value}`; }
function buildPromptPayQR(number, amount) {
  const num = number.replace(/[^0-9]/g, '');
  let account;
  if (num.length === 10) account = '0066' + num.slice(1);
  else if (num.length === 13) account = num;
  else return null;
  const subTag = num.length === 10 ? '01' : '02';
  const merchantAccount = tlv('00', 'A000000677010111') + tlv(subTag, account);
  let payload = tlv('00', '01') + (amount ? '010211' : '010212') + tlv('29', merchantAccount) +
    tlv('52', '0000') + tlv('53', '764') +
    (amount ? tlv('54', parseFloat(amount).toFixed(2)) : '') +
    tlv('58', 'TH') + tlv('59', 'PromptPay') + tlv('60', 'Bangkok') + '6304';
  return payload + crc16(payload);
}

const PAYMENT_METHODS = [
  { key: 'cash', label: 'เงินสด', icon: 'cash-outline', color: '#059669' },
  { key: 'transfer', label: 'โอนเงิน', icon: 'phone-portrait-outline', color: '#2563eb' },
  { key: 'promptpay', label: 'พร้อมเพย์', icon: 'qr-code-outline', color: '#7c3aed' },
];

export default function PaymentScreen({ navigation }) {
  const { user } = useAuth();
  const { items, discount, subtotal, total, clearCart } = useCart();
  const { printerConnected, print, openCashDrawer } = useHardware();

  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashInput, setCashInput] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBank, setSelectedBank] = useState(null);
  const [loading, setLoading] = useState(false);

  const cashAmount = parseFloat(cashInput) || 0;
  const change = paymentMethod === 'cash' ? Math.max(0, cashAmount - total) : 0;

  useEffect(() => {
    bankAccountAPI.list({ branch_id: user.branch_id })
      .then(r => {
        const list = r.accounts || r || [];
        setBankAccounts(list);
        if (list.length > 0) setSelectedBank(list[0]);
      }).catch(() => {});
  }, []);

  const handleConfirmPayment = async () => {
    if (paymentMethod === 'cash' && cashAmount < total) {
      return Alert.alert('รับเงินไม่พอ', `ต้องรับอย่างน้อย ฿${fmt(total)}`);
    }
    setLoading(true);
    try {
      const sale = await salesAPI.create({
        branch_id: user.branch_id,
        items: items.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: parseFloat(i.quantity),
          unit_price: parseFloat(i.unit_price),
          cost_price: parseFloat(i.cost_price || 0),
        })),
        subtotal,
        discount_amount: discount,
        total_amount: total,
        payment_method: paymentMethod,
        payment_amount: paymentMethod === 'cash' ? cashAmount : total,
        change_amount: change,
      });

      // Print receipt if printer connected
      if (printerConnected) {
        try {
          const receipt = buildReceipt({
            storeName: user.branch_name || 'POS System',
            receiptNumber: sale.receipt_number,
            items,
            subtotal,
            discount,
            total,
            paymentMethod,
            paymentAmount: paymentMethod === 'cash' ? cashAmount : total,
            change,
            cashierName: user.name,
            date: new Date().toLocaleString('th-TH'),
          });
          await print(receipt);
          if (paymentMethod === 'cash') await openCashDrawer();
        } catch (printErr) {
          console.warn('Print error:', printErr);
        }
      }

      clearCart();
      Alert.alert('✓ ชำระเงินสำเร็จ', `เลขที่บิล: ${sale.receipt_number}\nเงินทอน: ฿${fmt(change)}`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      Alert.alert('เกิดข้อผิดพลาด', err.error || 'ไม่สามารถบันทึกการขายได้');
    } finally { setLoading(false); }
  };

  // Quick cash buttons
  const quickAmounts = [total, Math.ceil(total / 100) * 100, Math.ceil(total / 50) * 50 + 50, 500, 1000].filter((v, i, a) => a.indexOf(v) === i && v >= total).slice(0, 4);

  const qrPayload = selectedBank?.account_type === 'promptpay' && selectedBank.promptpay_number
    ? buildPromptPayQR(selectedBank.promptpay_number, total)
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ชำระเงิน</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={{ flex: 1 }}>
        {/* Order summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>สรุปรายการ</Text>
          {items.map((item, i) => (
            <View key={i} style={styles.summaryRow}>
              <Text style={styles.summaryName} numberOfLines={1}>{item.product_name}</Text>
              <Text style={styles.summaryQty}>×{parseFloat(item.quantity).toFixed(item.is_weight ? 3 : 0)}</Text>
              <Text style={styles.summaryAmt}>฿{fmt(parseFloat(item.unit_price) * parseFloat(item.quantity))}</Text>
            </View>
          ))}
          <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 6, paddingTop: 6 }]}>
            <Text style={{ flex: 1, color: '#6b7280', fontSize: 13 }}>รวม</Text>
            <Text style={{ fontSize: 13, color: '#111827' }}>฿{fmt(subtotal)}</Text>
          </View>
          {discount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={{ flex: 1, color: '#dc2626', fontSize: 13 }}>ส่วนลด</Text>
              <Text style={{ fontSize: 13, color: '#dc2626' }}>-฿{fmt(discount)}</Text>
            </View>
          )}
          <View style={styles.totalBig}>
            <Text style={styles.totalLabel}>ยอดชำระ</Text>
            <Text style={styles.totalAmount}>฿{fmt(total)}</Text>
          </View>
        </View>

        {/* Payment method */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>วิธีชำระเงิน</Text>
          <View style={styles.methodRow}>
            {PAYMENT_METHODS.map(m => (
              <TouchableOpacity
                key={m.key}
                style={[styles.methodBtn, paymentMethod === m.key && { borderColor: m.color, backgroundColor: m.color + '12' }]}
                onPress={() => setPaymentMethod(m.key)}>
                <Ionicons name={m.icon} size={22} color={paymentMethod === m.key ? m.color : '#9ca3af'} />
                <Text style={[styles.methodLabel, paymentMethod === m.key && { color: m.color }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Cash input */}
        {paymentMethod === 'cash' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>รับเงิน</Text>
            <TextInput
              style={styles.cashInput}
              value={cashInput}
              onChangeText={setCashInput}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#d1d5db"
            />
            <View style={styles.quickRow}>
              {quickAmounts.map(a => (
                <TouchableOpacity key={a} style={styles.quickBtn} onPress={() => setCashInput(String(a))}>
                  <Text style={styles.quickBtnText}>฿{fmt(a)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {cashAmount >= total && (
              <View style={styles.changeBox}>
                <Text style={styles.changeLabel}>เงินทอน</Text>
                <Text style={styles.changeAmount}>฿{fmt(change)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Transfer / PromptPay QR */}
        {(paymentMethod === 'transfer' || paymentMethod === 'promptpay') && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ช่องทางรับเงิน</Text>
            {bankAccounts.length === 0 ? (
              <Text style={{ color: '#9ca3af', textAlign: 'center', paddingVertical: 12 }}>
                ยังไม่มีบัญชีรับเงิน — ตั้งค่าใน Web Admin → QR รับเงิน
              </Text>
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {bankAccounts.map(acc => (
                      <TouchableOpacity
                        key={acc.id}
                        style={[styles.bankChip, selectedBank?.id === acc.id && styles.bankChipActive]}
                        onPress={() => setSelectedBank(acc)}>
                        <Text style={[styles.bankChipText, selectedBank?.id === acc.id && { color: '#1d4ed8' }]}>
                          {acc.account_label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                {selectedBank && (
                  <View style={styles.bankDetail}>
                    {qrPayload ? (
                      <View style={{ alignItems: 'center', marginBottom: 12 }}>
                        <QRCode value={qrPayload} size={180} />
                        <Text style={styles.qrHint}>PromptPay — สแกนเพื่อชำระ ฿{fmt(total)}</Text>
                      </View>
                    ) : null}
                    {selectedBank.bank_name && <Text style={{ color: '#4b5563', fontSize: 14, textAlign: 'center' }}>{selectedBank.bank_name}</Text>}
                    {selectedBank.account_number && <Text style={styles.bankAccNum}>{selectedBank.account_number}</Text>}
                    {selectedBank.promptpay_number && !qrPayload && <Text style={styles.bankAccNum}>📱 {selectedBank.promptpay_number}</Text>}
                    <Text style={{ color: '#374151', fontWeight: '600', textAlign: 'center', marginTop: 4 }}>{selectedBank.account_name}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Confirm button */}
      <View style={styles.confirmArea}>
        <TouchableOpacity
          style={[styles.confirmBtn, (loading || (paymentMethod === 'cash' && cashAmount < total)) && styles.confirmBtnDisabled]}
          onPress={handleConfirmPayment}
          disabled={loading || (paymentMethod === 'cash' && cashAmount < total)}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.confirmText}>ยืนยันชำระเงิน  ฿{fmt(total)}</Text>
              </>}
        </TouchableOpacity>
        {printerConnected && (
          <Text style={{ textAlign: 'center', fontSize: 11, color: '#059669', marginTop: 6 }}>
            🖨 เครื่องพิมพ์เชื่อมต่อแล้ว — จะพิมพ์ใบเสร็จอัตโนมัติ
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  section: { backgroundColor: '#fff', marginTop: 8, marginHorizontal: 12, borderRadius: 14, padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  summaryName: { flex: 1, fontSize: 13, color: '#374151' },
  summaryQty: { fontSize: 12, color: '#9ca3af', marginRight: 8, minWidth: 36, textAlign: 'right' },
  summaryAmt: { fontSize: 13, color: '#111827', minWidth: 72, textAlign: 'right' },
  totalBig: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 2, borderTopColor: '#1d4ed8', marginTop: 8, paddingTop: 10 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#374151' },
  totalAmount: { fontSize: 28, fontWeight: '900', color: '#1d4ed8' },
  methodRow: { flexDirection: 'row', gap: 8 },
  methodBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 2, borderColor: '#e5e7eb', gap: 4 },
  methodLabel: { fontSize: 12, fontWeight: '600', color: '#9ca3af' },
  cashInput: { fontSize: 40, fontWeight: '900', color: '#111827', textAlign: 'right', borderBottomWidth: 2, borderBottomColor: '#e5e7eb', paddingBottom: 8, marginBottom: 12 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#eff6ff', borderRadius: 8, borderWidth: 1, borderColor: '#bfdbfe' },
  quickBtnText: { fontSize: 13, fontWeight: '700', color: '#1d4ed8' },
  changeBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 10, padding: 14, marginTop: 12 },
  changeLabel: { fontSize: 15, color: '#059669', fontWeight: '600' },
  changeAmount: { fontSize: 22, fontWeight: '900', color: '#059669' },
  bankChip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f3f4f6', borderRadius: 20, borderWidth: 1.5, borderColor: 'transparent' },
  bankChipActive: { borderColor: '#1d4ed8', backgroundColor: '#eff6ff' },
  bankChipText: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  bankDetail: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 16 },
  bankAccNum: { fontSize: 17, fontWeight: '700', color: '#111827', textAlign: 'center', fontFamily: 'monospace', marginTop: 4 },
  qrHint: { fontSize: 12, color: '#7c3aed', marginTop: 8, fontWeight: '600' },
  confirmArea: { backgroundColor: '#fff', padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1d4ed8', borderRadius: 14, paddingVertical: 16, gap: 8 },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
