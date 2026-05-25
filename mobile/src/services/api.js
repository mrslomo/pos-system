import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://YOUR_SERVER_URL/api'; // แก้ไข URL ของ server

const api = axios.create({ baseURL: API_URL, timeout: 10000 });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('pos_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => Promise.reject(err.response?.data || err)
);

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

export const productAPI = {
  byBarcode: (barcode, branch_id) => api.get(`/products/barcode/${barcode}`, { params: { branch_id } }),
  search: (q, branch_id) => api.get('/products/search', { params: { q, branch_id } }),
};

export const salesAPI = {
  create: (data) => api.post('/sales', data),
  list: (params) => api.get('/sales', { params }),
};

export const stockAPI = {
  list: (params) => api.get('/stock', { params }),
  lowStock: (params) => api.get('/stock/low-stock', { params }),
};

export const reportAPI = {
  summary: (params) => api.get('/reports/summary', { params }),
};

export default api;
