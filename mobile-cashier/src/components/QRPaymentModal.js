import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Dimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Speech from 'expo-speech';
import generatePayload from 'promptpay-qr';
import { bankAccountAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const { width: SW, height: SH } = Dimensions.get('window');
const QR_SIZE = Math.min(SW, SH) * 0.38;

export default function QRPaymentModal({ visible, amount, onConfirm, onCancel }) {
  const { user } = useAuth();
  const [promptpayId, setPromptpayId] = useState(null);
  const [accountName, setAccountName] = useState('');
  const [qrValue, setQrValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  const loadPromptpay = useCallback(async () => {
    setLoading(true);
    setConfirmed(false);
    try {
      const accounts = await bankAccountAPI.list({ branch_id: user.branch_id });
      const pp = (accounts || []).find(a =>
        a.account_type === 'promptpay' || a.bank_name?.toLowerCase().includes('promptpay') ||
        a.bank_name?.toLowerCase().includes('พร้อมเพย์')
      );
      if (pp) {
        const id = pp.account_number?.replace(/\D/g, '');
        setPromptpayId(id);
        setAccountName(pp.account_name || pp.bank_name || 'พร้อมเพย์');
        const payload = generatePayload(id, { amount: parseFloat(amount) });
        setQrValue(payload);
      } else {
        setPromptpayId(null);
        setQrValue('');
      }
    } catch {
      setPromptpayId(null);
      setQrValue('');
    } finally {
      setLoading(false);
    }
  }, [user.branch_id, amount]);

  useEffect(() => {
    if (visible) loadPromptpay();
    else { Speech.stop(); setConfirmed(false); }
  }, [visible, amount]);

  const handleConfirm = () => {
    setConfirmed(true);
    const amountText = Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2 });
    Speech.speak(`ได้รับเงินแล้ว จำนวน ${amountText} บาท`, {
      language: 'th-TH',
      rate: 0.9,
      pitch: 1.0,
    });
    setTimeout(() => onConfirm(), 400);
  };

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <View style={s.root}>
        {/* Left: QR */}
        <View style={s.qrPanel}>
          <Text style={s.scanLabel}>สแกนเพื่อชำระเงิน</Text>
          <Text style={s.scanSub}>Scan to Pay</Text>

          {loading ? (
            <View style={s.qrBox}>
              <ActivityIndicator size="large" color="#3b82f6" />
            </View>
          ) : !qrValue ? (
            <View style={s.qrBox}>
              <Text style={{ fontSize: 48 }}>⚠️</Text>
              <Text style={s.noQrTxt}>ไม่พบบัญชีพร้อมเพย์{'\n'}กรุณาตั้งค่าที่ QR รับเงิน</Text>
            </View>
          ) : (
            <View style={s.qrBox}>
              <View style={s.qrFrame}>
                <QRCode value={qrValue} size={QR_SIZE} backgroundColor="white" color="#1e3a5f" />
              </View>
              {accountName ? <Text style={s.accountName}>{accountName}</Text> : null}
              <View style={s.ppBadge}>
                <Text style={s.ppBadgeTxt}>🇹🇭 PromptPay</Text>
              </View>
            </View>
          )}
        </View>

        {/* Right: amount + actions */}
        <View style={s.rightPanel}>
          <View style={s.amountBox}>
            <Text style={s.amountLabel}>ยอดที่ต้องชำระ</Text>
            <Text style={s.amountValue}>฿{fmt(amount)}</Text>
          </View>

          <View style={s.steps}>
            {[
              { n: '1', txt: 'เปิด App ธนาคาร' },
              { n: '2', txt: 'สแกน QR Code' },
              { n: '3', txt: 'ยืนยันจำนวนเงิน' },
            ].map(step => (
              <View key={step.n} style={s.step}>
                <View style={s.stepNum}><Text style={s.stepNumTxt}>{step.n}</Text></View>
                <Text style={s.stepTxt}>{step.txt}</Text>
              </View>
            ))}
          </View>

          {confirmed ? (
            <View style={s.confirmedBox}>
              <Text style={{ fontSize: 48 }}>✅</Text>
              <Text style={s.confirmedTxt}>รับเงินแล้ว!</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm}>
                <Text style={s.confirmBtnTxt}>✓ ยืนยันรับเงินแล้ว</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
                <Text style={s.cancelBtnTxt}>← ย้อนกลับ</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, flexDirection: 'row', backgroundColor: '#0f172a',
  },

  // Left QR panel
  qrPanel: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#0f172a', padding: 24,
  },
  scanLabel: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  scanSub: { fontSize: 15, color: '#64748b', marginBottom: 28 },
  qrBox: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  qrFrame: {
    padding: 16, backgroundColor: '#fff', borderRadius: 20,
    shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 20,
    elevation: 20,
  },
  accountName: { color: '#93c5fd', fontSize: 14, marginTop: 4, fontWeight: '500' },
  ppBadge: { backgroundColor: '#1d4ed8', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  ppBadgeTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  noQrTxt: { color: '#94a3b8', textAlign: 'center', fontSize: 14, marginTop: 12, lineHeight: 22 },

  // Right panel
  rightPanel: {
    width: 320, backgroundColor: '#1e293b',
    justifyContent: 'center', padding: 28, gap: 20,
  },
  amountBox: {
    backgroundColor: '#0f172a', borderRadius: 20, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: '#334155',
  },
  amountLabel: { fontSize: 14, color: '#64748b', marginBottom: 8 },
  amountValue: { fontSize: 40, fontWeight: 'bold', color: '#fff', fontVariant: ['tabular-nums'] },

  steps: { gap: 14 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  stepNumTxt: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  stepTxt: { color: '#cbd5e1', fontSize: 14 },

  confirmBtn: {
    height: 58, backgroundColor: '#10b981', borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  confirmBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  cancelBtn: {
    height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#334155',
    justifyContent: 'center', alignItems: 'center',
  },
  cancelBtnTxt: { color: '#64748b', fontSize: 14 },

  confirmedBox: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  confirmedTxt: { fontSize: 26, fontWeight: 'bold', color: '#10b981' },
});
