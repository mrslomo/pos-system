import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator,
} from 'react-native';
import * as Print from 'expo-print';
import * as Speech from 'expo-speech';
import generatePayload from 'promptpay-qr';
import { bankAccountAPI, paymentNotifyAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

function qrUrl(data, size = 300) {
  const encoded = encodeURIComponent(data);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&ecc=M&margin=10`;
}

function buildReceiptHtml({ amount, promptpayId, accountName, branchName, qrData }) {
  const fmtTh = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const timeStr = new Date().toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const qrSrc = qrUrl(qrData, 320);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Sarabun', Arial, sans-serif; background: #fff; }
  .page { width: 80mm; margin: 0 auto; padding: 6mm 4mm; }
  .center { text-align: center; }
  .shop { font-size: 16pt; font-weight: bold; margin-bottom: 2mm; }
  .time { font-size: 9pt; color: #888; margin-bottom: 4mm; }
  .divider { border-top: 1px dashed #bbb; margin: 3mm 0; }
  .label { font-size: 10pt; color: #555; margin-bottom: 1mm; }
  .amount { font-size: 30pt; font-weight: bold; color: #1e3a5f; margin: 2mm 0; }
  .baht { font-size: 13pt; color: #64748b; margin-bottom: 4mm; }
  .qr-wrap { display: flex; justify-content: center; margin: 3mm 0; }
  .qr-wrap img { width: 65mm; height: 65mm; }
  .pp-id { font-size: 9pt; color: #475569; margin-top: 2mm; }
  .pp-name { font-size: 11pt; font-weight: bold; color: #1e293b; }
  .footer { font-size: 8pt; color: #999; margin-top: 4mm; }
  .pp-badge { display: inline-block; background: #1d4ed8; color: #fff; font-size: 9pt; font-weight: bold; padding: 1mm 3mm; border-radius: 2mm; margin: 2mm 0; }
</style>
</head>
<body>
<div class="page center">
  <div class="shop">${branchName || 'ร้านค้า'}</div>
  <div class="time">${timeStr}</div>
  <div class="divider"></div>
  <div class="label">ยอดที่ต้องชำระ</div>
  <div class="amount">${fmtTh(amount)}</div>
  <div class="baht">บาท</div>
  <div class="divider"></div>
  <div class="label">สแกนเพื่อชำระเงิน</div>
  <div class="pp-badge">PromptPay / พร้อมเพย์</div>
  <div class="qr-wrap">
    <img src="${qrSrc}" />
  </div>
  <div class="pp-name">${accountName || ''}</div>
  ${promptpayId ? `<div class="pp-id">${promptpayId}</div>` : ''}
  <div class="divider"></div>
  <div class="footer">กรุณาตรวจสอบยอดก่อนชำระ<br>Please verify amount before payment</div>
</div>
</body>
</html>`;
}

export default function QRPaymentModal({ visible, amount, onConfirm, onCancel }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [accountInfo, setAccountInfo] = useState(null);
  const [waitingPayment, setWaitingPayment] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);

  const pollRef = useRef(null);
  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = useCallback(() => {
    if (!user?.branch_id || !amount) return;
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await paymentNotifyAPI.pending(user.branch_id, amount);
        if (res?.found) {
          stopPolling();
          setAutoDetected(true);
          setWaitingPayment(false);
          handleAutoConfirm(res.notification?.bank_name);
        }
      } catch (_) {}
    }, 3000);
  }, [user?.branch_id, amount]);

  const handleAutoConfirm = (bankName) => {
    setConfirmed(true);
    const amountText = Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2 });
    const bankTxt = bankName ? ` จาก ${bankName}` : '';
    Speech.speak(`ได้รับเงินแล้ว จำนวน ${amountText} บาท${bankTxt}`, {
      language: 'th-TH', rate: 0.9, pitch: 1.0,
    });
    setTimeout(() => onConfirm(), 600);
  };

  const loadAndPrint = useCallback(async () => {
    setLoading(true);
    setPrinted(false);
    setConfirmed(false);
    setAutoDetected(false);
    setWaitingPayment(false);
    try {
      const accounts = await bankAccountAPI.list({ branch_id: user.branch_id });
      const pp = (accounts || []).find(a =>
        a.account_type === 'promptpay' ||
        a.bank_name?.toLowerCase().includes('promptpay') ||
        a.bank_name?.toLowerCase().includes('พร้อมเพย์')
      );
      setAccountInfo(pp || null);
      if (pp) {
        const id = pp.account_number?.replace(/\D/g, '');
        const qrData = generatePayload(id, { amount: parseFloat(amount) });
        await doPrint(qrData, id, pp.account_name || pp.bank_name, user.branch_name);
        setWaitingPayment(true);
        startPolling();
      }
    } catch (e) {
      console.warn('print error', e);
    } finally {
      setLoading(false);
    }
  }, [user.branch_id, user.branch_name, amount, startPolling]);

  const doPrint = async (qrData, promptpayId, accountName, branchName) => {
    setPrinting(true);
    try {
      const html = buildReceiptHtml({ amount, promptpayId, accountName, branchName, qrData });
      await Print.printAsync({ html });
      setPrinted(true);
    } finally {
      setPrinting(false);
    }
  };

  const handleReprint = async () => {
    if (!accountInfo) return;
    const id = accountInfo.account_number?.replace(/\D/g, '');
    const qrData = generatePayload(id, { amount: parseFloat(amount) });
    await doPrint(qrData, id, accountInfo.account_name || accountInfo.bank_name, user.branch_name);
  };

  useEffect(() => {
    if (visible) {
      loadAndPrint();
    } else {
      stopPolling();
      Speech.stop();
    }
    return () => stopPolling();
  }, [visible, amount]);

  const handleConfirm = () => {
    stopPolling();
    setConfirmed(true);
    const amountText = Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2 });
    Speech.speak(`ได้รับเงินแล้ว จำนวน ${amountText} บาท`, {
      language: 'th-TH', rate: 0.9, pitch: 1.0,
    });
    setTimeout(() => onConfirm(), 600);
  };

  const handleCancel = () => {
    stopPolling();
    onCancel();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={s.overlay}>
        <View style={s.card}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>ชำระผ่านพร้อมเพย์</Text>
            <TouchableOpacity onPress={handleCancel} style={s.closeBtn}>
              <Text style={s.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Amount */}
          <View style={s.amountBox}>
            <Text style={s.amountLabel}>ยอดที่ต้องชำระ</Text>
            <Text style={s.amountVal}>฿{fmt(amount)}</Text>
          </View>

          {/* Status */}
          <View style={s.statusBox}>
            {loading || printing ? (
              <View style={s.statusRow}>
                <ActivityIndicator color="#3b82f6" />
                <Text style={s.statusTxt}>
                  {loading ? 'กำลังเตรียมข้อมูล...' : 'กำลังส่งไปพิมพ์...'}
                </Text>
              </View>
            ) : !accountInfo ? (
              <View style={s.statusRow}>
                <Text style={{ fontSize: 20 }}>⚠️</Text>
                <Text style={[s.statusTxt, { color: '#ef4444' }]}>
                  ไม่พบบัญชีพร้อมเพย์{'\n'}ตั้งค่าได้ที่เมนู QR รับเงิน (หลังบ้าน)
                </Text>
              </View>
            ) : waitingPayment ? (
              <View style={s.statusRow}>
                <ActivityIndicator color="#f59e0b" size="small" />
                <Text style={[s.statusTxt, { color: '#92400e' }]}>
                  รอรับเงิน... (ตรวจสอบอัตโนมัติทุก 3 วิ)
                </Text>
              </View>
            ) : printed ? (
              <View style={s.statusRow}>
                <Text style={{ fontSize: 20 }}>✅</Text>
                <Text style={[s.statusTxt, { color: '#10b981' }]}>พิมพ์ QR เรียบร้อยแล้ว</Text>
              </View>
            ) : null}
          </View>

          {/* SMS tip */}
          {waitingPayment && (
            <View style={s.tipBox}>
              <Text style={s.tipTxt}>
                💡 ติดตั้งแอป SMS Notifier บนมือถือรับเงิน เพื่อยืนยันอัตโนมัติ
              </Text>
            </View>
          )}

          {/* Actions */}
          {!loading && !printing && (
            <View style={s.actions}>
              {accountInfo && (
                <TouchableOpacity style={s.reprintBtn} onPress={handleReprint} disabled={printing}>
                  <Text style={s.reprintTxt}>🖨 พิมพ์ใหม่</Text>
                </TouchableOpacity>
              )}
              {confirmed ? (
                <View style={s.confirmedBox}>
                  <Text style={s.confirmedTxt}>✅ รับเงินแล้ว!</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[s.confirmBtn, !printed && !accountInfo && { opacity: 0.5 }]}
                  onPress={handleConfirm}
                >
                  <Text style={s.confirmTxt}>✓ ยืนยันรับเงินแล้ว</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
                <Text style={s.cancelTxt}>← ย้อนกลับ</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: 400, elevation: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  closeBtn: { padding: 4 },
  closeTxt: { fontSize: 18, color: '#94a3b8' },
  amountBox: { backgroundColor: '#eff6ff', borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 16 },
  amountLabel: { fontSize: 13, color: '#64748b', marginBottom: 4 },
  amountVal: { fontSize: 36, fontWeight: 'bold', color: '#1e3a5f', fontVariant: ['tabular-nums'] },
  statusBox: { minHeight: 48, justifyContent: 'center', marginBottom: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f8fafc', borderRadius: 10, padding: 12 },
  statusTxt: { fontSize: 14, color: '#475569', flex: 1 },
  tipBox: { backgroundColor: '#fffbeb', borderRadius: 10, padding: 10, marginBottom: 10 },
  tipTxt: { fontSize: 12, color: '#92400e', lineHeight: 18 },
  actions: { gap: 10 },
  reprintBtn: { height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  reprintTxt: { color: '#3b82f6', fontWeight: '600', fontSize: 15 },
  confirmBtn: { height: 52, backgroundColor: '#10b981', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  confirmTxt: { color: '#fff', fontWeight: 'bold', fontSize: 17 },
  cancelBtn: { height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cancelTxt: { color: '#94a3b8', fontSize: 14 },
  confirmedBox: { height: 52, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 14 },
  confirmedTxt: { fontSize: 18, fontWeight: 'bold', color: '#10b981' },
});
