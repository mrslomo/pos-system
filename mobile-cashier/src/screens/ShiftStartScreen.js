import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useShift } from '../context/ShiftContext';

const SHIFT_TYPES = [
  { key: 'morning',  label: 'เช้า',     sub: 'Morning',   emoji: '🌅' },
  { key: 'afternoon',label: 'บ่าย',     sub: 'Afternoon', emoji: '☀️' },
  { key: 'night',    label: 'ดึก',      sub: 'Night',     emoji: '🌙' },
  { key: 'fullday',  label: 'เต็มวัน',  sub: 'Full Day',  emoji: '📅' },
];

export default function ShiftStartScreen() {
  const { user, logout } = useAuth();
  const { openShift } = useShift();
  const [shiftType, setShiftType] = useState('morning');
  const [openingCash, setOpeningCash] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  const handleOpen = async () => {
    setLoading(true);
    try {
      await openShift({
        branch_id: user.branch_id,
        shift_type: shiftType,
        opening_cash: parseFloat(openingCash) || 0,
        notes: notes || null,
      });
    } catch (err) {
      Alert.alert('เปิดกะไม่สำเร็จ', err?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.container}>

        {/* Left: branding + time */}
        <View style={s.left}>
          <View style={s.logoWrap}>
            <Text style={s.logoEmoji}>🛒</Text>
          </View>
          <Text style={s.appName}>POS Cashier</Text>
          <Text style={s.timeText}>{timeStr}</Text>
          <Text style={s.dateText}>{dateStr}</Text>

          <View style={s.userCard}>
            <View style={s.avatar}>
              <Text style={s.avatarTxt}>{user?.name?.charAt(0)?.toUpperCase()}</Text>
            </View>
            <View>
              <Text style={s.userName}>{user?.name}</Text>
              <Text style={s.userBranch}>{user?.branch_name || 'สาขาหลัก'}</Text>
              <Text style={s.userRole}>{user?.role}</Text>
            </View>
          </View>

          <TouchableOpacity style={s.logoutBtn} onPress={logout}>
            <Text style={s.logoutTxt}>ออกจากระบบ</Text>
          </TouchableOpacity>
        </View>

        {/* Right: open shift form */}
        <View style={s.right}>
          <Text style={s.formTitle}>เปิดกะทำงานใหม่</Text>
          <Text style={s.formSub}>กรุณาเลือกกะและนับเงินเก๊ะก่อนเริ่มงาน</Text>

          {/* Shift type */}
          <Text style={s.label}>กะทำงาน</Text>
          <View style={s.shiftGrid}>
            {SHIFT_TYPES.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[s.shiftBtn, shiftType === t.key && s.shiftBtnOn]}
                onPress={() => setShiftType(t.key)}
              >
                <Text style={s.shiftEmoji}>{t.emoji}</Text>
                <Text style={[s.shiftLabel, shiftType === t.key && { color: '#fff' }]}>{t.label}</Text>
                <Text style={[s.shiftSub, shiftType === t.key && { color: '#bfdbfe' }]}>{t.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Opening cash */}
          <Text style={s.label}>เงินเก๊ะ (Opening Cash)</Text>
          <View style={s.cashRow}>
            <Text style={s.bahtSign}>฿</Text>
            <TextInput
              style={s.cashInput}
              value={openingCash}
              onChangeText={setOpeningCash}
              keyboardType="numeric"
              placeholder="0.00"
              selectTextOnFocus
            />
          </View>
          {openingCash !== '' && Number(openingCash) > 0 && (
            <Text style={s.cashHint}>เงินเก๊ะ ฿{fmt(openingCash)}</Text>
          )}

          {/* Notes */}
          <Text style={s.label}>หมายเหตุ (ถ้ามี)</Text>
          <TextInput
            style={s.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="..."
            multiline
            numberOfLines={2}
          />

          {/* Submit */}
          <TouchableOpacity
            style={[s.openBtn, loading && { opacity: 0.6 }]}
            onPress={handleOpen}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="large" />
              : <>
                  <Text style={s.openBtnEmoji}>▶</Text>
                  <Text style={s.openBtnTxt}>เปิดกะทำงาน</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const BLUE = '#1e3a5f';
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BLUE },
  container: { flex: 1, flexDirection: 'row' },

  left: { width: 280, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 12 },
  logoWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  logoEmoji: { fontSize: 38 },
  appName: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginTop: 4 },
  timeText: { fontSize: 42, fontWeight: 'bold', color: '#fff', fontVariant: ['tabular-nums'] },
  dateText: { fontSize: 13, color: '#93c5fd', textAlign: 'center' },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 14, width: '100%' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  userName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  userBranch: { color: '#93c5fd', fontSize: 12, marginTop: 1 },
  userRole: { color: '#64748b', fontSize: 11, marginTop: 1 },
  logoutBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  logoutTxt: { color: '#94a3b8', fontSize: 13 },

  right: { flex: 1, backgroundColor: '#f8fafc', borderTopLeftRadius: 28, borderBottomLeftRadius: 28, padding: 32 },
  formTitle: { fontSize: 26, fontWeight: 'bold', color: BLUE, marginBottom: 4 },
  formSub: { fontSize: 14, color: '#64748b', marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 8, marginTop: 16 },
  shiftGrid: { flexDirection: 'row', gap: 10 },
  shiftBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 2, borderColor: '#e2e8f0' },
  shiftBtnOn: { backgroundColor: BLUE, borderColor: BLUE },
  shiftEmoji: { fontSize: 22, marginBottom: 4 },
  shiftLabel: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  shiftSub: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  cashRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 14 },
  bahtSign: { fontSize: 20, color: '#64748b', marginRight: 6 },
  cashInput: { flex: 1, height: 52, fontSize: 24, fontWeight: 'bold', color: '#1e293b' },
  cashHint: { fontSize: 12, color: '#10b981', marginTop: 4 },
  notesInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, fontSize: 14, backgroundColor: '#fff', minHeight: 52, color: '#1e293b' },
  openBtn: { height: 60, backgroundColor: '#10b981', borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 24 },
  openBtnEmoji: { fontSize: 20, color: '#fff' },
  openBtnTxt: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});
