import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import POSPage from './pages/POSPage';
import ProductsPage from './pages/ProductsPage';
import StockPage from './pages/StockPage';
import StockTransactionsPage from './pages/StockTransactionsPage';
import ReportsPage from './pages/ReportsPage';
import BranchesPage from './pages/BranchesPage';
import UsersPage from './pages/UsersPage';
import SalesHistoryPage from './pages/SalesHistoryPage';
import PartnersPage from './pages/PartnersPage';
import PurchaseBillsPage from './pages/PurchaseBillsPage';
import DeliveryBillsPage from './pages/DeliveryBillsPage';
import BulkStockPage from './pages/BulkStockPage';
import StockReturnPage from './pages/StockReturnPage';
import CreditHistoryPage from './pages/CreditHistoryPage';
import BankQRPage from './pages/BankQRPage';
import WeighScalePage from './pages/WeighScalePage';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="pos" element={<POSPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="stock/transactions" element={<StockTransactionsPage />} />
        <Route path="sales" element={<SalesHistoryPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="branches" element={<ProtectedRoute roles={['admin']}><BranchesPage /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute roles={['admin', 'manager']}><UsersPage /></ProtectedRoute>} />
        <Route path="partners" element={<PartnersPage />} />
        <Route path="purchase-bills" element={<PurchaseBillsPage />} />
        <Route path="delivery-bills" element={<DeliveryBillsPage />} />
        <Route path="bulk-stock" element={<BulkStockPage />} />
        <Route path="stock-returns" element={<StockReturnPage />} />
        <Route path="credit-history" element={<CreditHistoryPage />} />
        <Route path="bank-qr" element={<BankQRPage />} />
        <Route path="weigh" element={<WeighScalePage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <AppRoutes />
    </AuthProvider>
  );
}
