import React, { useState } from 'react';
import { AppSettings, RouterConfig } from '../types';
import { StorageService } from '../services/storage';
import {
  CreditCard,
  LogOut,
  MessageSquare,
  Server,
  Settings,
  Ticket,
  TrendingUp,
  Sun,
  Users,
  Wifi,
  Zap,
  Moon,
} from 'lucide-react';
import { useTheme } from './ui/theme';
import { Button } from './ui/button';

interface Props {
  adminTab: string;
  onSelectAdminTab: (tab: string) => void;
  settings: AppSettings;
  username: string;
  onRefreshData: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<Props> = ({
  adminTab,
  onSelectAdminTab,
  settings,
  username,
  onRefreshData,
  onLogout,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');

  const handleCheckRouterStatus = async () => {
    setIsScanning(true);
    setScanMessage('');
    try {
      const response = await fetch('/api/mikrotik/routers');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      StorageService.saveRouters(result.routers);
      onRefreshData();
      setScanMessage(`${result.routers.filter((router: RouterConfig) => router.status === 'connected').length} / ${result.routers.length} router terhubung`);
    } catch (error) {
      setScanMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsScanning(false);
    }
  };

  const navTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Server },
    { id: 'revenue', label: 'Pendapatan', icon: TrendingUp },
    { id: 'customers', label: 'Pelanggan PPPoE', icon: Users },
    { id: 'invoices', label: 'Tagihan', icon: CreditCard },
    { id: 'vouchers', label: 'Voucher Hotspot', icon: Ticket },
    { id: 'routers', label: 'Router MikroTik', icon: Zap },
    { id: 'whatsapp', label: 'WhatsApp API', icon: MessageSquare },
    { id: 'payment', label: 'Pembayaran', icon: CreditCard },
    { id: 'settings', label: 'Pengaturan', icon: Settings },
  ];

  return (
    <header className="bg-card/95 text-card-foreground border-b border-border sticky top-0 z-40 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-emerald-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-600/20 uppercase">
            {(settings.brandName || settings.appName || 'S').charAt(0)}
          </div>
          <div>
            <div className="font-extrabold text-foreground text-base tracking-tight">{settings.brandName || settings.appName}</div>
            <div className="text-[11px] text-muted-foreground">Admin: {username}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            aria-label={`Aktifkan mode ${theme === 'dark' ? 'terang' : 'gelap'}`}
            title={`Mode ${theme === 'dark' ? 'terang' : 'gelap'}`}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCheckRouterStatus}
            disabled={isScanning}
          >
            <Zap className={`w-3.5 h-3.5 ${isScanning ? 'animate-bounce' : ''}`} />
            <span>{isScanning ? 'Memuat...' : 'Status Router'}</span>
          </Button>
          <a
            href="/portal"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            <Wifi className="h-3.5 w-3.5" />
            Portal
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar
          </Button>
        </div>
      </div>

      {scanMessage && (
        <div role="status" className="border-t border-border px-4 py-2 text-center text-xs text-foreground">
          {scanMessage}
        </div>
      )}

      <nav aria-label="Navigasi admin" className="bg-background/90 border-t border-border px-4 sm:px-6 py-2 overflow-x-auto">
        <div className="max-w-7xl mx-auto flex min-w-max items-center gap-1.5 text-xs font-medium">
          {navTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onSelectAdminTab(id)}
              aria-current={adminTab === id ? 'page' : undefined}
              className={`px-3 py-2 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                adminTab === id
                  ? 'bg-secondary text-secondary-foreground font-bold border border-border shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${adminTab === id ? 'text-primary' : ''}`} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
};
