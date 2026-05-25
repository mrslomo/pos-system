import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { stockAPI } from '../services/api';

export default function StockScreen() {
  const [stock, setStock] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('pos_user').then(u => {
      if (u) { setUser(JSON.parse(u)); }
    });
  }, []);

  useEffect(() => {
    if (user) loadStock();
  }, [user, showLowOnly]);

  const loadStock = async () => {
    setLoading(true);
    try {
      const data = showLowOnly
        ? await stockAPI.lowStock({ branch_id: user?.branch_id })
        : await stockAPI.list({ branch_id: user?.branch_id });
      setStock(data);
    } finally { setLoading(false); setRefreshing(false); }
  };

  const filtered = stock.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || '').includes(search)
  );

  const renderItem = ({ item }) => {
    const isEmpty = item.total_stock <= 0;
    const isLow = item.total_stock <= item.min_stock;
    return (
      <View style={[styles.item, isEmpty && styles.itemEmpty, !isEmpty && isLow && styles.itemLow]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemBarcode}>{item.barcode || 'ไม่มี barcode'}</Text>
        </View>
        <View style={styles.stockInfo}>
          <Text style={styles.stockFront}>หน้าร้าน: {Number(item.front_stock).toFixed(3)}</Text>
          <Text style={styles.stockBack}>หลังบ้าน: {Number(item.back_stock).toFixed(3)}</Text>
          <Text style={[styles.stockTotal, isEmpty && { color: '#ef4444' }, !isEmpty && isLow && { color: '#f97316' }]}>
            รวม: {Number(item.total_stock).toFixed(3)} {item.unit}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="ค้นหาสินค้า..." />
        <TouchableOpacity onPress={() => setShowLowOnly(!showLowOnly)}
          style={[styles.filterBtn, showLowOnly && styles.filterBtnActive]}>
          <Text style={[styles.filterText, showLowOnly && { color: '#fff' }]}>ใกล้หมด</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2563eb" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStock(); }} />}
          ListEmptyComponent={<Text style={styles.empty}>{showLowOnly ? 'ไม่มีสินค้าใกล้หมด' : 'ไม่พบสินค้า'}</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  searchContainer: { flexDirection: 'row', padding: 12, gap: 8 },
  searchInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  filterBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' },
  filterBtnActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  filterText: { fontSize: 13, color: '#374151' },
  item: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: 'row', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  itemEmpty: { backgroundColor: '#fef2f2', borderLeftWidth: 3, borderLeftColor: '#ef4444' },
  itemLow: { backgroundColor: '#fff7ed', borderLeftWidth: 3, borderLeftColor: '#f97316' },
  itemName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  itemBarcode: { fontSize: 12, color: '#9ca3af', fontFamily: 'monospace' },
  stockInfo: { alignItems: 'flex-end' },
  stockFront: { fontSize: 12, color: '#6b7280' },
  stockBack: { fontSize: 12, color: '#6b7280' },
  stockTotal: { fontSize: 14, fontWeight: 'bold', color: '#16a34a', marginTop: 4 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 },
});
