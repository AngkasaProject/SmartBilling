import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppSettings, RouterConfig } from '../types';
import { StorageService } from '../services/storage';
import {
  CreditCard,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Server,
  Settings,
  Ticket,
  Sun,
  Users,
  Wifi,
  Zap,
  Moon,
  Menu,
  X,
} from 'lucide-react';
import { useTheme } from './ui/theme';
import { Button } from './ui/button';

interface Props {
  adminTab: string;
  onSelectAdminTab: (tab: string) => void;
  settings: AppSettings;
  onRefreshData: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<Props> = ({
  adminTab,
  onSelectAdminTab,
  settings,
  onRefreshData,
  onLogout,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSettingsExpanded, setIsMobileSettingsExpanded] = useState(false);

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
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Pelanggan PPPoE', icon: Users },
    { id: 'vouchers', label: 'Voucher Hotspot', icon: Ticket },
    { id: 'finance', label: 'Keuangan', icon: CreditCard },
    { id: 'settings', label: 'Pengaturan', icon: Settings },
  ];
  const settingsTabs = [
    { id: 'settings', label: 'Umum', icon: Settings },
    { id: 'routers', label: 'Router MikroTik', icon: Server },
    { id: 'whatsapp', label: 'WhatsApp API', icon: MessageSquare },
    { id: 'payment', label: 'Pembayaran', icon: CreditCard },
  ];
  const settingsTabIds = settingsTabs.map(tab => tab.id);
  const isSettingsPage = settingsTabIds.includes(adminTab);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  const selectTab = (tab: string) => {
    onSelectAdminTab(tab);
    setIsMobileMenuOpen(false);
  };

  const mobileNavButtonClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition ${
      active
        ? 'bg-primary/10 font-semibold text-primary'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  return (
    <>
    <header className="bg-card/95 text-card-foreground border-b border-border sticky top-0 z-40 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-2 py-3 sm:gap-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 overflow-hidden rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-emerald-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-600/20 uppercase">
            {settings.brandIconDataUrl
              ? <img src={settings.brandIconDataUrl} alt="" className="h-full w-full bg-white object-contain p-0.5" />
              : (settings.brandName || settings.appName || 'S').charAt(0)}
          </div>
          <div className="min-w-0">
            {settings.brandMainLogoDataUrl || settings.brandLogoDataUrl
              ? <img src={settings.brandMainLogoDataUrl || settings.brandLogoDataUrl} alt={settings.brandName || settings.appName} className="h-9 w-32 max-w-[34vw] object-contain object-left dark:invert sm:h-10 sm:w-44 sm:max-w-[42vw] sm:object-left" />
              : <div className="truncate font-extrabold text-foreground text-sm sm:text-base tracking-tight">{settings.brandName || settings.appName}</div>}
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-1.5 sm:gap-2 md:flex">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={toggleTheme}
            aria-label={`Aktifkan mode ${theme === 'dark' ? 'terang' : 'gelap'}`}
            title={`Mode ${theme === 'dark' ? 'terang' : 'gelap'}`}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="hidden lg:inline-flex"
            onClick={handleCheckRouterStatus}
            disabled={isScanning}
          >
            <Zap className={`w-3.5 h-3.5 ${isScanning ? 'animate-bounce' : ''}`} />
            <span>{isScanning ? 'Memuat...' : 'Status Router'}</span>
          </Button>
          <a
            href="/portal"
            aria-label="Buka Portal"
            title="Buka Portal"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border text-xs font-medium text-foreground transition hover:bg-muted sm:w-auto sm:px-3"
          >
            <Wifi className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Portal</span>
          </a>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 shrink-0 px-0 sm:w-auto sm:px-3"
            onClick={onLogout}
            aria-label="Keluar"
            title="Keluar"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Keluar</span>
          </Button>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 md:hidden"
          onClick={() => {
            setIsMobileSettingsExpanded(isSettingsPage);
            setIsMobileMenuOpen(true);
          }}
          aria-label="Buka menu navigasi"
          aria-expanded={isMobileMenuOpen}
          aria-controls="admin-mobile-sidebar"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      {scanMessage && (
        <div role="status" className="hidden border-t border-border px-4 py-2 text-center text-xs text-foreground md:block">
          {scanMessage}
        </div>
      )}

      <nav aria-label="Navigasi admin" className="hidden md:block bg-background/90 border-t border-border px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex w-max min-w-full items-center justify-center gap-1 overflow-x-auto py-2 text-xs font-medium">
          {navTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => selectTab(id)}
              aria-current={adminTab === id || (id === 'settings' && isSettingsPage) ? 'page' : undefined}
              className={`px-3 py-2 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                adminTab === id || (id === 'settings' && isSettingsPage)
                  ? 'bg-secondary text-secondary-foreground font-bold border border-border shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${adminTab === id ? 'text-primary' : ''}`} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        {isSettingsPage && (
          <div className="max-w-7xl mx-auto flex w-max min-w-full items-center justify-center gap-1 overflow-x-auto border-t border-border/70 py-1.5" aria-label="Menu Pengaturan">
            {settingsTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => selectTab(id)}
                aria-current={adminTab === id ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition ${
                  adminTab === id
                    ? 'bg-primary/10 font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </nav>
    </header>
    {isMobileMenuOpen && createPortal(
      <div className="fixed inset-0 z-[100] h-[100dvh] md:hidden">
        <button
          type="button"
          aria-label="Tutup menu navigasi"
          onClick={() => setIsMobileMenuOpen(false)}
          className="absolute inset-0 h-full w-full bg-black/60"
        />
        <aside
          id="admin-mobile-sidebar"
          role="dialog"
          aria-modal="true"
          aria-label="Menu navigasi admin"
          className="absolute inset-y-0 left-0 flex h-full w-[min(19rem,85vw)] flex-col border-r border-border bg-card text-card-foreground shadow-2xl"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-emerald-500 text-lg font-black uppercase text-white">
              {settings.brandIconDataUrl
                ? <img src={settings.brandIconDataUrl} alt="" className="h-full w-full bg-white object-contain p-0.5" />
                  : (settings.brandName || settings.appName || 'S').charAt(0)}
              </div>
              <div className="min-w-0">
              {settings.brandMainLogoDataUrl || settings.brandLogoDataUrl
                ? <img src={settings.brandMainLogoDataUrl || settings.brandLogoDataUrl} alt={settings.brandName || settings.appName} className="h-9 w-40 max-w-[42vw] object-contain object-left dark:invert" />
                : <div className="truncate text-sm font-bold">{settings.brandName || settings.appName}</div>}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(false)} aria-label="Tutup menu">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            <p className="px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Menu utama</p>
            <div className="space-y-1">
              {navTabs.filter(tab => tab.id !== 'settings').map(({ id, label, icon: Icon }) => {
                const active = adminTab === id || (id === 'settings' && isSettingsPage);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectTab(id)}
                    aria-current={active ? 'page' : undefined}
                    className={mobileNavButtonClass(active)}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (!isSettingsPage) {
                      setIsMobileSettingsExpanded(true);
                      onSelectAdminTab('settings');
                    } else {
                      setIsMobileSettingsExpanded(expanded => !expanded);
                    }
                  }}
                  aria-expanded={isMobileSettingsExpanded}
                  aria-controls="admin-mobile-settings-submenu"
                  aria-current={isSettingsPage ? 'page' : undefined}
                  className={`${mobileNavButtonClass(isSettingsPage)} justify-between`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Settings className="h-4 w-4 shrink-0" />
                    <span>Pengaturan</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isMobileSettingsExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isMobileSettingsExpanded && (
                  <div id="admin-mobile-settings-submenu" className="ml-5 mt-1 space-y-1 border-l border-border pl-2">
                    {settingsTabs.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => selectTab(id)}
                        aria-current={adminTab === id ? 'page' : undefined}
                        className={`${mobileNavButtonClass(adminTab === id)} py-2.5 pl-3 text-xs`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 space-y-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {scanMessage && <p role="status" className="px-2 text-xs text-muted-foreground">{scanMessage}</p>}
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              Aktifkan mode {theme === 'dark' ? 'terang' : 'gelap'}
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-start"
              onClick={() => void handleCheckRouterStatus()}
              disabled={isScanning}
            >
              <Zap className={`h-4 w-4 ${isScanning ? 'animate-bounce' : ''}`} />
              {isScanning ? 'Memuat status router...' : 'Periksa status router'}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <a
                href="/portal"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                <Wifi className="h-4 w-4" />
                Portal
              </a>
              <Button variant="outline" className="justify-center" onClick={onLogout}>
                <LogOut className="h-4 w-4" />
                Keluar
              </Button>
            </div>
            {scanMessage && <p role="status" className="px-2 pt-2 text-xs text-muted-foreground">{scanMessage}</p>}
          </div>
        </aside>
      </div>,
      document.body
    )}
    </>
  );
};
