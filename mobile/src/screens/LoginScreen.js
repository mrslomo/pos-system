import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('admin@pos.com');
  const [password, setPassword] = useState('admin1234');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { Alert.alert('กรุณากรอกข้อมูล'); return; }
    setLoading(true);
    try {
      const data = await authAPI.login({ email, password });
      await AsyncStorage.setItem('pos_token', data.token);
      await AsyncStorage.setItem('pos_user', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) {
      Alert.alert('เข้าสู่ระบบไม่สำเร็จ', err.error || 'กรุณาตรวจสอบอีเมลและรหัสผ่าน');
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>POS System</Text>
        <Text style={styles.subtitle}>เข้าสู่ระบบ</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail}
          placeholder="อีเมล" keyboardType="email-address" autoCapitalize="none" />
        <TextInput style={styles.input} value={password} onChangeText={setPassword}
          placeholder="รหัสผ่าน" secureTextEntry />
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>เข้าสู่ระบบ</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e40af', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 28, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1e40af', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, fontSize: 15 },
  button: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
