import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, PermissionsAndroid, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SmsListener from 'react-native-android-sms-listener';
import { parseSms } from '../services/smsParser';
import { sendPaymentNotify } from '../services/api';

const MAX_LOG = 50;

export default function HomeScreen() {
  const [branchId, setBranchId] = useState('');
  const [savedBranchId, setSavedBranchId] = useState('');
  const [listening, setListening] = useState(false);
  const [logs, setLogs] = useState([]);
  const [permGranted, setPermGranted] = useState(false);
  const listenerRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    loadSettings();
    requestPermissions();
    return () => stopListener();
  }, []);

  const loadSettings = async () => {
    const saved = await AsyncStorage.getItem('branch_id');
    if (saved) {
      setBranchId(saved);
      setSavedBranchId(saved);
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        PermissionsAndroid.PERMISSIONS.READ_SMS,
      ]);
      const ok =
        granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED;
      setPermGranted(ok);
      if (!ok) {
        addLog({ type: 'error', text: 'ไม่ได้รับสิทธิ์ SMS — ไปอนุญาตใน Settings > Apps ด้วยตนเอง' });
      }
    } catch (e) {
      addLog({ type: 'error', text: `Permission error: ${e.message}` });
    }
  };

  const addLog = (entry) => {
    setLogs(prev => [
      { ...entry, time: new Date().toLocaleTimeString('th-TH'), id: Date.now() },
      ...prev.slice(0, MAX_LOG - 1),
    ]);
  };

  const startListener = () => {
    if (!savedBranchId) {
      Alert.alert('กรุณาบันทึก Branch ID ก่อน');
      return;
    }
    if (listenerRef.current) return;

    listenerRef.current = SmsListener.addListener(async ({ originatingAddress, body }) => {
      addLog({ type: 'sms', text: `SMS จาก ${originatingAddress}: ${body?.substring(0, 80)}` });

      const parsed = parseSms(originatingAddress, body);
      if (!parsed) {
        addLog({ type: 'skip', text: 'ข้ามข้อความนี้ (ไม่ใช่รับเงิน)' });
        return;
      }

      addLog({
        type: 'found',
        text: `พบการโอน ${parsed.bank_name} ฿${parsed.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
      });

      try {
        await sendPaymentNotify({
          branch_id: parseInt(savedBranchId),
          amount: parsed.amount,
          bank_name: parsed.bank_name,
          message: parsed.message,
        });
        addLog({ type: 'sent', text: `ส่งแจ้งเตือนไปยัง POS แล้ว (branch ${savedBranchId})` });
      } catch (e) {
        addLog({ type: 'error', text: `ส่งไม่สำเร็จ: ${e.message}` });
      }
    });

    setListening(true);
    addLog({ type: 'info', text: `เริ่มฟัง SMS (Branch ID: ${savedBranchId})` });
  };

  const stopListener = () => {
    if (listenerRef.current) {
      listenerRef.current.remove();
      listenerRef.current = null;
    }
    setListening(false);
  };

  const saveBranchId = async () => {
    const trimmed = branchId.trim();
    if (!trimmed || isNaN(parseInt(trimmed))) {
      Alert.alert('Branch ID ต้องเป็นตัวเลข');
      return;
    }
    await AsyncStorage.setItem('branch_id', trimmed);
    setSavedBranchId(trimmed);
    Alert.alert('บันทึกแล้ว', `Branch ID: ${trimmed}`);
    if (listening) {
      stopListener();
      addLog({ type: 'info', text: 'หยุดฟัง SMS (Branch ID เปลี่ยน — กด Start อีกครั้ง)' });
    }
  };

  const testNotify = async () => {
    if (!savedBranchId) { Alert.alert('บันทึก Branch ID ก่อน'); return; }
    const testAmount = 99.00;
    addLog({ type: 'info', text: `ทดสอบส่งแจ้งเตือน ฿${testAmount}...` });
    try {
      await sendPaymentNotify({
        branch_id: parseInt(savedBranchId),
        amount: testAmount,
        bank_name: 'TEST',
        message: 'Test notification from SMS Notifier app',
      });
      addLog({ type: 'sent', text: `ส่งทดสอบสำเร็จ! ฿${testAmount} → Branch ${savedBranchId}` });
    } catch (e) {
      addLog({ type: 'error', text: `ส่งทดสอบไม่สำเร็จ: ${e.message}` });
    }
  };

  const getLogColor = (type) => {
    switch (type) {
      case 'sms':   return '#1e40af';
      case 'found': return '#065f46';
      case 'sent':  return '#10b981';
      case 'skip':  return '#78716c';
      case 'error': return '#dc2626';
      case 'info':  return '#6d28d9';
      default:      return '#374151';
    }
  };

  const getLogIcon = (type) => {
    switch (type) {
      case 'sms':   return '📱';
      case 'found': return '💰';
      case 'sent':  return '✅';
      case 'skip':  return '⏭';
      case 'error': return '❌';
      case 'info':  return 'ℹ️';
      default:      return '•';
    }
  };

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>SMS Payment Notifier</Text>
        <Text style={s.headerSub}>แจ้งเตือน POS เมื่อรับเงินผ่าน PromptPay</Text>
      </View>

      {/* Permission warning */}
      {!permGranted && (
        <View style={s.warnBox}>
          <Text style={s.warnTxt}>⚠️ ยังไม่ได้รับสิทธิ์อ่าน SMS — ไปที่ Settings {'>'} Apps {'>'} SMS Notifier {'>'} Permissions</Text>
          <TouchableOpacity style={s.warnBtn} onPress={requestPermissions}>
            <Text style={s.warnBtnTxt}>ขอสิทธิ์อีกครั้ง</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Config */}
      <View style={s.configCard}>
        <Text style={s.configLabel}>Branch ID (จากหลังบ้าน POS)</Text>
        <View style={s.configRow}>
          <TextInput
            style={s.configInput}
            value={branchId}
            onChangeText={setBranchId}
            placeholder="เช่น 1"
            keyboardType="number-pad"
          />
          <TouchableOpacity style={s.saveBtn} onPress={saveBranchId}>
            <Text style={s.saveBtnTxt}>บันทึก</Text>
          </TouchableOpacity>
        </View>
        {savedBranchId ? (
          <Text style={s.savedHint}>✓ ใช้งาน Branch ID: {savedBranchId}</Text>
        ) : null}
      </View>

      {/* Controls */}
      <View style={s.controls}>
        <TouchableOpacity
          style={[s.mainBtn, listening ? s.stopBtn : s.startBtn, !permGranted && { opacity: 0.4 }]}
          onPress={listening ? stopListener : startListener}
          disabled={!permGranted}
        >
          <Text style={s.mainBtnTxt}>
            {listening ? '⏹  หยุดฟัง SMS' : '▶  เริ่มฟัง SMS'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.testBtn} onPress={testNotify}>
          <Text style={s.testBtnTxt}>🧪 ทดสอบส่งแจ้งเตือน</Text>
        </TouchableOpacity>
      </View>

      {/* Status indicator */}
      <View style={[s.statusBar, { backgroundColor: listening ? '#dcfce7' : '#f1f5f9' }]}>
        <View style={[s.dot, { backgroundColor: listening ? '#10b981' : '#94a3b8' }]} />
        <Text style={[s.statusTxt, { color: listening ? '#065f46' : '#64748b' }]}>
          {listening ? 'กำลังฟัง SMS อยู่...' : 'หยุดฟัง SMS'}
        </Text>
      </View>

      {/* Log */}
      <Text style={s.logTitle}>บันทึกกิจกรรม</Text>
      <ScrollView ref={scrollRef} style={s.logScroll} contentContainerStyle={{ paddingBottom: 20 }}>
        {logs.length === 0 ? (
          <Text style={s.emptyLog}>ยังไม่มีกิจกรรม</Text>
        ) : (
          logs.map(log => (
            <View key={log.id} style={s.logRow}>
              <Text style={s.logTime}>{log.time}</Text>
              <Text style={[s.logText, { color: getLogColor(log.type) }]}>
                {getLogIcon(log.type)} {log.text}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#1e3a5f', paddingTop: 52, paddingBottom: 20, paddingHorizontal: 20 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerSub: { fontSize: 13, color: '#93c5fd', marginTop: 4 },

  warnBox: { margin: 12, backgroundColor: '#fef3c7', borderRadius: 12, padding: 14 },
  warnTxt: { fontSize: 13, color: '#92400e', marginBottom: 8, lineHeight: 20 },
  warnBtn: { alignSelf: 'flex-start', backgroundColor: '#f59e0b', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  warnBtnTxt: { color: '#fff', fontWeight: '600', fontSize: 13 },

  configCard: { margin: 12, backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 2 },
  configLabel: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 10 },
  configRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  configInput: { flex: 1, height: 44, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  saveBtn: { height: 44, paddingHorizontal: 20, backgroundColor: '#1e3a5f', borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  saveBtnTxt: { color: '#fff', fontWeight: '600', fontSize: 15 },
  savedHint: { fontSize: 12, color: '#10b981', marginTop: 8 },

  controls: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, marginBottom: 10 },
  mainBtn: { flex: 1, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  startBtn: { backgroundColor: '#10b981' },
  stopBtn: { backgroundColor: '#ef4444' },
  mainBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 17 },
  testBtn: { height: 52, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderColor: '#6d28d9', justifyContent: 'center', alignItems: 'center' },
  testBtnTxt: { color: '#6d28d9', fontWeight: '600', fontSize: 14 },

  statusBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, borderRadius: 10, padding: 10, marginBottom: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusTxt: { fontSize: 14, fontWeight: '500' },

  logTitle: { fontSize: 13, fontWeight: '700', color: '#475569', paddingHorizontal: 14, marginBottom: 6 },
  logScroll: { flex: 1, paddingHorizontal: 12 },
  emptyLog: { textAlign: 'center', color: '#94a3b8', marginTop: 20, fontSize: 14 },
  logRow: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6, elevation: 1 },
  logTime: { fontSize: 11, color: '#94a3b8', marginBottom: 2 },
  logText: { fontSize: 13, lineHeight: 18 },
});
