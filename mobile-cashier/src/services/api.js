import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://backend-doctors1.vercel.app/api';

const api = axios.create({ baseURL: API_URL, timeout: 15000 });

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
  search: (params) => api.get('/products/search', { params }),
  byBarcode: (barcode, branch_id) => api.get(`/products/barcode/${barcode}`, { params: { branch_id } }),
};

export const salesAPI = {
  create: (data) => api.post('/sales', data),
};

export const heldBillAPI = {
  list: (params) => api.get('/held-bills', { params }),
  hold: (data) => api.post('/held-bills', data),
  recall: (id) => api.delete(`/held-bills/${id}/recall`),
};

export const bankAccountAPI = {
  list: (params) => api.get('/bank-accounts', { params }),
};

export const shiftsAPI = {
  current: (branch_id) => api.get('/shifts/current', { params: { branch_id } }),
  open: (data) => api.post('/shifts', data),
  close: (id, data) => api.post(`/shifts/${id}/close`, data),
};

export const scaleAPI = {
  ports: () => api.get('/scale/ports'),
  connect: (data) => api.post('/scale/connect', data),
  weight: () => api.get('/scale/weight'),
};

export default api;
