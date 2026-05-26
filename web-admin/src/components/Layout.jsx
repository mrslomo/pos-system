import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse, BarChart3,
  GitBranch, Users, History, Menu, X, LogOut, ChevronDown, Bell,
  FileInput, FileOutput, Layers, Handshake, TrendingUp,
  RotateCcw, CreditCard, QrCode, Scale, ClipboardList, AlarmClock
} from 'lucide-react';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/pos', label: 'หน้าขาย (POS)', icon: ShoppingCart },
  { to: '/weigh', label: 'ชั่งน้ำหนัก', icon: Scale },
  { to: '/products', label: 'สินค้า', icon: Package },
  { to: '/stock', label: 'สต๊อก', icon: Warehouse },
  { to: '/stock/transactions', label: 'ความเคลื่อนไหวสต๊อก', icon: History },
  { to: '/stock-count', label: 'นับสต๊อกรายวัน', icon: ClipboardList },
  { divider: true, label: 'ซื้อ-ขาย' },
  { to: '/purchase-bills', label: 'บิลเข้า', icon: FileInput },
  { to: '/delivery-bills', label: 'บิลออก (ค้าส่ง)', icon: FileOutput },
  { to: '/partners', label: 'คู่ค้า', icon: Handshake },
  { to: '/stock-returns', label: 'คืนสต๊อก', icon: RotateCcw },
  { to: '/credit-history', label: 'ประวัติค้างจ่าย', icon: CreditCard },
  { divider: true, label: 'วัตถุดิบ' },
  { to: '/bulk-stock', label: 'สต๊อกใหญ่ & ซอย', icon: Layers },
  { divider: true, label: 'รายงาน' },
  { to: '/sales', label: 'ประวัติการขาย', icon: History },
  { to: '/reports', label: 'รายงาน', icon: BarChart3 },
  { divider: true, label: 'พนักงาน' },
  { to: '/shifts', label: 'กะทำงาน', icon: AlarmClock },
  { divider: true, label: 'ระบบ' },
  { to: '/bank-qr', label: 'QR รับเงิน', icon: QrCode },
  { to: '/branches', label: 'สาขา', icon: GitBranch, roles: ['admin'] },
  { to: '/users', label: 'ผู้ใช้งาน', icon: Users, roles: ['admin', 'manager'] },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const visibleNav = nav.filter(item => item.divider || !item.roles || item.roles.includes(user?.role));

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-gray-900 text-white flex flex-col transition-all duration-300 flex-shrink-0`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          {sidebarOpen && <span className="text-lg font-bold text-white">POS System</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 rounded hover:bg-gray-700 text-gray-300">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {visibleNav.map((item, idx) => {
            if (item.divider) return sidebarOpen ? (
              <div key={idx} className="px-4 pt-3 pb-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{item.label}</p>
              </div>
            ) : <div key={idx} className="mx-3 my-1 border-t border-gray-700" />;
            const { to, label, icon: Icon, exact } = item;
            return (
              <NavLink key={to} to={to} end={exact}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`
                }>
                <Icon size={18} className="flex-shrink-0" />
                {sidebarOpen && <span className="truncate">{label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-700">
          {sidebarOpen && (
            <div className="mb-2 px-1">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-gray-400">{user?.branch_name || 'ทุกสาขา'}</p>
            </div>
          )}
          <button onClick={handleLogout}
            className="flex items-center gap-2 text-gray-300 hover:text-red-400 text-sm w-full px-1 py-1">
            <LogOut size={16} />
            {sidebarOpen && 'ออกจากระบบ'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div />
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user?.branch_name}</span>
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
              {user?.name?.charAt(0)}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
