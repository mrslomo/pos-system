import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('กรุณากรอกข้อมูล', 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      Alert.alert('เข้าสู่ระบบไม่สำเร็จ', err?.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.card}>
        <View style={s.logo}>
          <Text style={s.logoText}>🛒</Text>
        </View>
        <Text style={s.title}>POS Cashier</Text>
        <Text style={s.sub}>เข้าสู่ระบบสำหรับแคชเชียร์</Text>

        <TextInput
          style={s.input}
          placeholder="ชื่อผู้ใช้"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />
        <TextInput
          style={s.input}
          placeholder="รหัสผ่าน"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.btnText}>เข้าสู่ระบบ</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1e3a5f', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 380, alignItems: 'center', elevation: 8 },
  logo: { width: 72, height: 72, borderRadius: 20, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoText: { fontSize: 32 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  sub: { fontSize: 14, color: '#64748b', marginBottom: 28 },
  input: { width: '100%', height: 50, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 14, backgroundColor: '#f8fafc' },
  btn: { width: '100%', height: 50, backgroundColor: '#3b82f6', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
