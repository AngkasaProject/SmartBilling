import React, { useState } from 'react';
import { Customer, Invoice, AppSettings } from '../types';
import { StorageService } from '../services/storage';
import {
  Server,
  Users,
  CreditCard,
  Ticket,
  Smartphone,
  Search,
  Zap,
  RotateCcw,
  ShieldAlert,
  ChevronDown,
  CheckCircle2,
  Settings
} from 'lucide-react';

interface Props {
  currentView: 'admin' | 'voucher_portal' | 'hotspot_login' | 'customer_bill';
  onSelectView: (view: 'admin' | 'voucher_portal' | 'hotspot_login' | 'customer_bill') => void;
  adminTab: string;
  onSelectAdminTab: (tab: string) => void;
  customers: Customer[];
  invoices: Invoice[];
  settings: AppSettings;
  onRefreshData: () => void;
}

export const Navbar: React.FC<Props> = ({
  currentView,
  onSelectView,
  adminTab,
  onSelectAdminTab,
  customers,
  invoices,
  settings,
  onRefreshData,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ isolatedCount: number; expiringCount: number } | null>(null);

  const handleRunAutoIsolir = () => {
    setIsScanning(true);
    setScanResult(null);

    setTimeout(() => {
      const res = StorageService.runAutoIsolirScan();
      setIsScanning(false);
      setScanResult({
        isolatedCount: res.isolatedCount,
        expiringCount: res.expiringCount,
      });
      onRefreshData();

      setTimeout(() => {
        setScanResult(null);
      }, 5000);
    }, 800);
  };

  const handleResetData = () => {
    if (window.confirm('Reset data demo ke pengaturan awal? Semua perubahan akan dikembalikan ke data default.')) {
      StorageService.resetDefaults();
      onRefreshData();
    }
  };

  const isolatedCount = customers.filter(c => c.status === 'isolated').length;
  const activeCount = customers.filter(c => c.status === 'active').length;

  return (
    <header className="bg-slate-900/95 border-b border-slate-800 sticky top-0 z-40 backdrop-blur">
      {/* Top Main Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand Logo & Router Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-emerald-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-600/20 uppercase">
            {settings.brandName ? settings.brandName.charAt(0) : 'N'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-base tracking-tight">
                {settings.brandName || 'NETFLOW ISP'}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                MikroTik Cloud
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{settings.mikrotikHost} (Connected • 18% CPU)</span>
            </div>
          </div>
        </div>

        {/* View Switcher Bar (Admin, Beli Voucher, Login Hotspot, Cek Tagihan) */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto">
          <button
            onClick={() => onSelectView('admin')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
              currentView === 'admin'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>NOC & Admin Billing</span>
          </button>

          <button
            onClick={() => onSelectView('voucher_portal')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
              currentView === 'voucher_portal'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Ticket className="w-3.5 h-3.5 text-emerald-300" />
            <span>Beli Voucher Online</span>
          </button>

          <button
            onClick={() => onSelectView('hotspot_login')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
              currentView === 'hotspot_login'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Login Hotspot (Demo)</span>
          </button>

          <button
            onClick={() => onSelectView('customer_bill')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
              currentView === 'customer_bill'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Cek Tagihan Mandiri</span>
          </button>
        </div>

        {/* Action Controls & Auto-Isolir Scheduler */}
        <div className="flex items-center gap-2">
          {/* Quick Settings Shortcut */}
          <button
            onClick={() => {
              onSelectView('admin');
              onSelectAdminTab('settings');
            }}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition border border-slate-800"
            title="Buka Pengaturan Sistem (Settings)"
          >
            <Settings className="w-4 h-4 text-indigo-400" />
          </button>

          {/* Auto-Isolir Trigger */}
          <button
            onClick={handleRunAutoIsolir}
            disabled={isScanning}
            className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
            title="Scan jadwal jatuh tempo pelanggan dan aktifkan auto-isolir di MikroTik"
          >
            <Zap className={`w-3.5 h-3.5 text-rose-400 ${isScanning ? 'animate-bounce' : ''}`} />
            <span>{isScanning ? 'Memeriksa...' : 'Auto-Isolir'}</span>
          </button>

          <button
            onClick={handleResetData}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
            title="Reset Data Demo"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Auto-Isolir Notification Alert Bar if triggered */}
      {scanResult && (
        <div className="bg-rose-950/80 border-t border-rose-800/80 px-4 py-2 text-center text-xs text-rose-200 flex items-center justify-center gap-2 animate-fadeIn">
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <span>
            <b>Scheduler Selesai:</b> {scanResult.isolatedCount} pelanggan berhasil dialihkan ke isolir MikroTik,{' '}
            {scanResult.expiringCount} pelanggan mendekati jatuh tempo. Notifikasi WA otomatis dikirim!
          </span>
        </div>
      )}

      {/* Admin Sub-navigation tabs (only shown when in admin view) */}
      {currentView === 'admin' && (
        <div className="bg-slate-950/90 border-t border-slate-800/80 px-4 sm:px-6 py-2 overflow-x-auto">
          <div className="max-w-7xl mx-auto flex items-center gap-1.5 text-xs font-medium">
            {[
              { id: 'dashboard', label: 'Dashboard & Trafik', icon: Server },
              { id: 'customers', label: `Pelanggan PPPoE (${activeCount})`, icon: Users },
              { id: 'invoices', label: 'Tagihan & Invoice', icon: CreditCard },
              { id: 'vouchers', label: 'Voucher Hotspot & Cetak', icon: Ticket },
              { id: 'routers', label: 'Router MikroTik & Script', icon: Zap },
              { id: 'whatsapp', label: 'OpenWA Gateway', icon: CheckCircle2 },
              { id: 'docker', label: 'Docker & VPS Hosting', icon: Server },
              { id: 'settings', label: '⚙️ Pengaturan (Settings)', icon: Settings },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = adminTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectAdminTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-800 text-white font-bold border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
