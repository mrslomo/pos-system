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
  (err) => {
    if (err.response?.status === 401) {
      AsyncStorage.removeItem('pos_token');
      AsyncStorage.removeItem('pos_user');
    }
    return Promise.reject(err.response?.data || err);
  }
);

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

export const productAPI = {
  search: (params) => api.get('/products', { params }),
  byBarcode: (barcode, branch_id) => api.get(`/products/barcode/${barcode}`, { params: { branch_id } }),
};

export const salesAPI = {
  create: (data) => api.post('/sales', data),
  list: (params) => api.get('/sales', { params }),
  get: (id) => api.get(`/sales/${id}`),
};

export const heldBillAPI = {
  list: (params) => api.get('/held-bills', { params }),
  hold: (data) => api.post('/held-bills', data),
  recall: (id) => api.delete(`/held-bills/${id}/recall`),
  cancel: (id) => api.delete(`/held-bills/${id}`),
};

export const stockAPI = {
  lowStock: (params) => api.get('/stock/low-stock', { params }),
};

export const partnerAPI = {
  list: (params) => api.get('/partners', { params }),
  getPrice: (id, product_id) => api.get(`/partners/${id}/price/${product_id}`),
};

export const bankAccountAPI = {
  list: (params) => api.get('/bank-accounts', { params }),
};

export default api;
