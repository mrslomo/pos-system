import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen({ onLogout }) {
  const [user, setUser] = useState(null);
  const [serverUrl, setServerUrl] = useState('');
  const [scalePort, setScalePort] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('pos_user').then(u => u && setUser(JSON.parse(u)));
    AsyncStorage.getItem('server_url').then(u => u && setServerUrl(u));
    AsyncStorage.getItem('scale_port').then(p => p && setScalePort(p));
  }, []);

  const saveSettings = async () => {
    await AsyncStorage.setItem('server_url', serverUrl);
    await AsyncStorage.setItem('scale_port', scalePort);
    Alert.alert('บันทึกแล้ว', 'กรุณาเปิดแอปใหม่เพื่อให้การตั้งค่ามีผล');
  };

  const handleLogout = async () => {
    Alert.alert('ออกจากระบบ', 'ยืนยันการออกจากระบบ?', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ออกจากระบบ', style: 'destructive', onPress: async () => {
        await AsyncStorage.multiRemove(['pos_token', 'pos_user']);
        onLogout?.();
      }},
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      {user && (
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.name?.charAt(0)}</Text>
          </View>
          <View>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            <Text style={styles.userRole}>{user.role} • {user.branch_name || 'ไม่ระบุสาขา'}</Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>การตั้งค่าเซิร์ฟเวอร์</Text>
        <Text style={styles.label}>URL ของ API Server</Text>
        <TextInput style={styles.input} value={serverUrl} onChangeText={setServerUrl}
          placeholder="https://your-server.com/api" autoCapitalize="none" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>เครื่องชั่งน้ำหนัก</Text>
        <Text style={styles.label}>Serial Port (เช่น /dev/ttyUSB0)</Text>
        <TextInput style={styles.input} value={scalePort} onChangeText={setScalePort}
          placeholder="/dev/ttyUSB0" autoCapitalize="none" />
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}>
        <Text style={styles.saveBtnText}>บันทึกการตั้งค่า</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutBtnText}>ออกจากระบบ</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  userCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 3 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  userName: { fontSize: 17, fontWeight: '600' },
  userEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  userRole: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 12 },
  label: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  saveBtn: { backgroundColor: '#2563eb', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  logoutBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ef4444', borderRadius: 12, padding: 14, alignItems: 'center' },
  logoutBtnText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
});
