import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { reportAPI } from '../services/api';

export default function ReportScreen() {
  const [summary, setSummary] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('pos_user').then(u => { if (u) setUser(JSON.parse(u)); });
  }, []);

  useEffect(() => { if (user) loadReport(); }, [user]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await reportAPI.summary({ branch_id: user?.branch_id, from_date: today, to_date: today });
      setSummary(data.summary);
      setTopProducts(data.top_products || []);
    } finally { setLoading(false); setRefreshing(false); }
  };

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  if (loading && !refreshing) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#2563eb" />;

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadReport(); }} />}>
      <Text style={styles.header}>รายงานวันนี้</Text>

      <View style={styles.statsGrid}>
        {[
          { label: 'ยอดขาย', value: `฿${fmt(summary?.total_revenue)}`, color: '#2563eb' },
          { label: 'กำไรขั้นต้น', value: `฿${fmt(summary?.gross_profit)}`, color: '#16a34a' },
          { label: 'จำนวนบิล', value: `${summary?.total_bills || 0}`, color: '#7c3aed' },
        ].map(({ label, value, color }) => (
          <View key={label} style={styles.statCard}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={[styles.statValue, { color }]}>{value}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionHeader}>สินค้าขายดี 10 อันดับ</Text>
      {topProducts.map((p, i) => (
        <View key={p.name} style={styles.productItem}>
          <View style={styles.rank}><Text style={styles.rankText}>{i + 1}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.productName}>{p.name}</Text>
            <Text style={styles.productSub}>ขายไป {Number(p.total_qty).toFixed(3)} หน่วย</Text>
          </View>
          <Text style={styles.productRevenue}>฿{fmt(p.total_revenue)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  header: { fontSize: 22, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: '30%', backgroundColor: '#fff', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 3 },
  statLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: 'bold' },
  sectionHeader: { fontSize: 17, fontWeight: '600', color: '#374151', marginBottom: 10 },
  productItem: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 13, fontWeight: 'bold', color: '#1d4ed8' },
  productName: { fontSize: 14, fontWeight: '500' },
  productSub: { fontSize: 12, color: '#9ca3af' },
  productRevenue: { fontSize: 14, fontWeight: 'bold', color: '#2563eb' },
});
