import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pos_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pos_token');
      localStorage.removeItem('pos_user');
      window.location.href = '/login';
    }
    return Promise.reject(err.response?.data || err);
  }
);

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
};

export const productAPI = {
  list: (params) => api.get('/products/search', { params }),
  all: (params) => api.get('/products', { params }),
  byBarcode: (barcode, branch_id) => api.get(`/products/barcode/${barcode}`, { params: { branch_id } }),
  get: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
};

export const categoryAPI = {
  list: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
};

export const stockAPI = {
  list: (params) => api.get('/stock', { params }),
  lowStock: (params) => api.get('/stock/low-stock', { params }),
  transactions: (params) => api.get('/stock/transactions', { params }),
  stockIn: (data) => api.post('/stock/in', data),
  stockOut: (data) => api.post('/stock/out', data),
  transfer: (data) => api.post('/stock/transfer', data),
  adjust: (data) => api.put('/stock/adjust', data),
};

export const salesAPI = {
  create: (data) => api.post('/sales', data),
  list: (params) => api.get('/sales', { params }),
  get: (id) => api.get(`/sales/${id}`),
};

export const reportAPI = {
  summary: (params) => api.get('/reports/summary', { params }),
  daily: (params) => api.get('/reports/daily', { params }),
  weekly: (params) => api.get('/reports/weekly', { params }),
  profit: (params) => api.get('/reports/profit', { params }),
  export: (params) => api.get('/reports/export', { params, responseType: 'blob' }),
};

export const branchAPI = {
  list: () => api.get('/branches'),
  get: (id) => api.get(`/branches/${id}`),
  create: (data) => api.post('/branches', data),
  update: (id, data) => api.put(`/branches/${id}`, data),
};

export const userAPI = {
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

export const scaleAPI = {
  ports: () => api.get('/scale/ports'),
  connect: (data) => api.post('/scale/connect', data),
  weight: () => api.get('/scale/weight'),
};

export const partnerAPI = {
  list: (params) => api.get('/partners', { params }),
  get: (id) => api.get(`/partners/${id}`),
  create: (data) => api.post('/partners', data),
  update: (id, data) => api.put(`/partners/${id}`, data),
  addPrice: (id, data) => api.post(`/partners/${id}/prices`, data),
  removePrice: (id, product_id, unit) => api.delete(`/partners/${id}/prices/${product_id}${unit ? `?unit=${encodeURIComponent(unit)}` : ''}`),
  getPrice: (id, product_id) => api.get(`/partners/${id}/price/${product_id}`),
};

export const purchaseBillAPI = {
  list: (params) => api.get('/purchase-bills', { params }),
  get: (id) => api.get(`/purchase-bills/${id}`),
  create: (data) => api.post('/purchase-bills', data),
  cancel: (id) => api.delete(`/purchase-bills/${id}`),
};

export const deliveryBillAPI = {
  list: (params) => api.get('/delivery-bills', { params }),
  get: (id) => api.get(`/delivery-bills/${id}`),
  create: (data) => api.post('/delivery-bills', data),
  updatePayment: (id, status, paid_amount) => api.patch(`/delivery-bills/${id}/payment`, { payment_status: status, paid_amount }),
};

export const heldBillAPI = {
  list: (params) => api.get('/held-bills', { params }),
  summary: (params) => api.get('/held-bills/summary', { params }),
  hold: (data) => api.post('/held-bills', data),
  recall: (id) => api.delete(`/held-bills/${id}/recall`),
  cancel: (id) => api.delete(`/held-bills/${id}`),
};

export const stockReturnAPI = {
  list: (params) => api.get('/stock-returns', { params }),
  get: (id) => api.get(`/stock-returns/${id}`),
  create: (data) => api.post('/stock-returns', data),
};

export const bankAccountAPI = {
  list: (params) => api.get('/bank-accounts', { params }),
  create: (data) => api.post('/bank-accounts', data),
  update: (id, data) => api.put(`/bank-accounts/${id}`, data),
  delete: (id) => api.delete(`/bank-accounts/${id}`),
};

export const bulkStockAPI = {
  items: (params) => api.get('/bulk-stock/items', { params }),
  createItem: (data) => api.post('/bulk-stock/items', data),
  updateItem: (id, data) => api.put(`/bulk-stock/items/${id}`, data),
  deleteItem: (id) => api.delete(`/bulk-stock/items/${id}`),
  adjustItem: (id, data) => api.post(`/bulk-stock/items/${id}/adjust`, data),
  history: (id) => api.get(`/bulk-stock/items/${id}/history`),
  stockIn: (data) => api.post('/bulk-stock/stock-in', data),
  processingList: (params) => api.get('/bulk-stock/processing', { params }),
  processingGet: (id) => api.get(`/bulk-stock/processing/${id}`),
  processingCreate: (data) => api.post('/bulk-stock/processing', data),
  processingDelete: (id) => api.delete(`/bulk-stock/processing/${id}`),
  costAnalysis: (params) => api.get('/bulk-stock/cost-analysis', { params }),
  labReceipts: (params) => api.get('/bulk-stock/lab-receipts', { params }),
};

export const uploadAPI = {
  // accepts base64 string (data:image/...), returns { url, public_id }
  upload: (base64) => api.post('/uploads', { image: base64 }),
};

export default api;
