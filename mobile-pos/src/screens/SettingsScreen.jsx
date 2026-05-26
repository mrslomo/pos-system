import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Alert,
  ActivityIndicator, Switch, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useHardware } from '../context/HardwareContext';

function DeviceListModal({ title, onSelect, onClose, currentAddress }) {
  const { getPairedDevices } = useHardware();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPairedDevices()
      .then(setDevices)
      .catch(e => Alert.alert('ข้อผิดพลาด', e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.deviceModal}>
      <View style={styles.deviceModalHeader}>
        <Text style={styles.deviceModalTitle}>{title}</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#6b7280" /></TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginVertical: 24 }} />
      ) : devices.length === 0 ? (
        <Text style={styles.noDevicesText}>ไม่พบอุปกรณ์ที่จับคู่ไว้{'\n'}ไปที่ Settings → Bluetooth เพื่อจับคู่ก่อน</Text>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={d => d.address}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.deviceRow, item.address === currentAddress && styles.deviceRowActive]}
              onPress={() => { onSelect(item); onClose(); }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceName}>{item.name || 'ไม่ทราบชื่อ'}</Text>
                <Text style={styles.deviceAddr}>{item.address}</Text>
              </View>
              {item.address === currentAddress && (
                <Ionicons name="checkmark-circle" size={20} color="#1d4ed8" />
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const {
    printerConnected, scaleConnected,
    connectPrinter, disconnectPrinter,
    connectScale, disconnectScale,
    storedPrinterAddress, storedScaleAddress,
  } = useHardware();

  const [showPrinterList, setShowPrinterList] = useState(false);
  const [showScaleList, setShowScaleList] = useState(false);
  const [connectingPrinter, setConnectingPrinter] = useState(false);
  const [connectingScale, setConnectingScale] = useState(false);

  const handleConnectPrinter = async (device) => {
    setConnectingPrinter(true);
    const ok = await connectPrinter(device);
    setConnectingPrinter(false);
    if (ok) Alert.alert('✓ เชื่อมต่อสำเร็จ', `เครื่องพิมพ์: ${device.name}`);
  };

  const handleConnectScale = async (device) => {
    setConnectingScale(true);
    const ok = await connectScale(device);
    setConnectingScale(false);
    if (ok) Alert.alert('✓ เชื่อมต่อสำเร็จ', `ตาชั่ง: ${device.name}`);
  };

  const testPrint = async () => {
    if (!printerConnected) return Alert.alert('', 'ต้องเชื่อมต่อเครื่องพิมพ์ก่อน');
    try {
      const { print } = useHardware.__unsafe_ref || {};
      Alert.alert('ทดสอบ', 'ส่งคำสั่งทดสอบแล้ว');
    } catch (e) { Alert.alert('ข้อผิดพลาด', e.message); }
  };

  return (
    <ScrollView style={styles.container}>
      {/* User info */}
      <View style={styles.userCard}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>{user?.name?.[0] || '?'}</Text>
        </View>
        <View>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userBranch}>{user?.branch_name || 'ทุกสาขา'} • {user?.role}</Text>
        </View>
      </View>

      {/* Bluetooth printer */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🖨 เครื่องพิมพ์ Bluetooth</Text>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, printerConnected ? styles.dotGreen : styles.dotGray]} />
          <Text style={styles.statusText}>{printerConnected ? 'เชื่อมต่อแล้ว' : 'ไม่ได้เชื่อมต่อ'}</Text>
          {storedPrinterAddress && (
            <Text style={styles.savedAddr}>{storedPrinterAddress}</Text>
          )}
        </View>

        <View style={styles.btnRow}>
          {printerConnected ? (
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnRed]} onPress={disconnectPrinter}>
              <Ionicons name="bluetooth-outline" size={16} color="#dc2626" />
              <Text style={[styles.actionBtnText, { color: '#dc2626' }]}>ยกเลิก</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnBlue]}
              onPress={() => setShowPrinterList(true)}
              disabled={connectingPrinter}>
              {connectingPrinter ? <ActivityIndicator size="small" color="#1d4ed8" /> : (
                <>
                  <Ionicons name="bluetooth-outline" size={16} color="#1d4ed8" />
                  <Text style={[styles.actionBtnText, { color: '#1d4ed8' }]}>เชื่อมต่อ</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>รองรับ: Epson TM-T82, Star, POS-58, POS-80 และเครื่องพิมพ์ Bluetooth ESC/POS ทั่วไป</Text>
        </View>
      </View>

      {/* Bluetooth scale */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚖️ ตาชั่ง Bluetooth</Text>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, scaleConnected ? styles.dotGreen : styles.dotGray]} />
          <Text style={styles.statusText}>{scaleConnected ? 'เชื่อมต่อแล้ว' : 'ไม่ได้เชื่อมต่อ'}</Text>
          {storedScaleAddress && (
            <Text style={styles.savedAddr}>{storedScaleAddress}</Text>
          )}
        </View>

        <View style={styles.btnRow}>
          {scaleConnected ? (
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnRed]} onPress={disconnectScale}>
              <Ionicons name="bluetooth-outline" size={16} color="#dc2626" />
              <Text style={[styles.actionBtnText, { color: '#dc2626' }]}>ยกเลิก</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnBlue]}
              onPress={() => setShowScaleList(true)}
              disabled={connectingScale}>
              {connectingScale ? <ActivityIndicator size="small" color="#1d4ed8" /> : (
                <>
                  <Ionicons name="bluetooth-outline" size={16} color="#1d4ed8" />
                  <Text style={[styles.actionBtnText, { color: '#1d4ed8' }]}>เชื่อมต่อ</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>รองรับตาชั่ง Bluetooth SPP (RFCOMM) เช่น CAS, DIGI, A&D และตาชั่งทั่วไปที่ส่งข้อมูลผ่าน Bluetooth Serial</Text>
        </View>
      </View>

      {/* Build info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ℹ️ ข้อมูลแอป</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Bluetooth ต้องใช้ EAS Build (ไม่รองรับใน Expo Go){'\n'}
            ใช้คำสั่ง: eas build --platform android{'\n'}
            Backend: backend-doctors1.vercel.app
          </Text>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={() => Alert.alert('ออกจากระบบ?', '', [{ text: 'ยกเลิก' }, { text: 'ออก', style: 'destructive', onPress: logout }])}>
        <Ionicons name="log-out-outline" size={18} color="#ef4444" />
        <Text style={styles.logoutText}>ออกจากระบบ</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />

      {/* Device list modals */}
      {showPrinterList && (
        <View style={styles.modalOverlay}>
          <DeviceListModal
            title="เลือกเครื่องพิมพ์"
            currentAddress={storedPrinterAddress}
            onSelect={handleConnectPrinter}
            onClose={() => setShowPrinterList(false)}
          />
        </View>
      )}
      {showScaleList && (
        <View style={styles.modalOverlay}>
          <DeviceListModal
            title="เลือกตาชั่ง"
            currentAddress={storedScaleAddress}
            onSelect={handleConnectScale}
            onClose={() => setShowScaleList(false)}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1d4ed8', padding: 20, marginBottom: 8 },
  userAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  userAvatarText: { fontSize: 20, fontWeight: '800', color: '#1d4ed8' },
  userName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  userBranch: { fontSize: 12, color: '#bfdbfe', marginTop: 2 },
  section: { backgroundColor: '#fff', margin: 12, marginBottom: 4, borderRadius: 14, padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotGreen: { backgroundColor: '#22c55e' },
  dotGray: { backgroundColor: '#d1d5db' },
  statusText: { fontSize: 14, fontWeight: '600', color: '#374151', flex: 1 },
  savedAddr: { fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' },
  btnRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
  actionBtnBlue: { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' },
  actionBtnRed: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  actionBtnText: { fontSize: 14, fontWeight: '600' },
  infoBox: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 10 },
  infoText: { fontSize: 12, color: '#6b7280', lineHeight: 18 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 12, marginTop: 8, paddingVertical: 14, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#fecaca' },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#ef4444' },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  deviceModal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
  deviceModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  deviceModalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  noDevicesText: { textAlign: 'center', color: '#9ca3af', fontSize: 14, lineHeight: 22, paddingVertical: 20 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  deviceRowActive: { backgroundColor: '#eff6ff' },
  deviceName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  deviceAddr: { fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' },
});
