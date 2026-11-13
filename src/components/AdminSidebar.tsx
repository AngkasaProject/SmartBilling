import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Moon,
  PanelLeft,
  Server,
  Settings,
  Sun,
  Ticket,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { AppSettings, RouterConfig } from '../types';
import { StorageService } from '../services/storage';
import { useTheme } from './ui/theme';
import { Button } from './ui/button';
import { settingsSections } from './admin/settingsSections';
import type { SettingsSection } from './admin/settingsSections';

interface Props {
  adminTab: string;
  username: string;
  onSelectAdminTab: (tab: string) => void;
  settings: AppSettings;
  onRefreshData: () => void;
  onLogout: () => void;
  isCollapsed: boolean;
  isMobileMenuOpen: boolean;
  onMobileMenuOpenChange: (open: boolean) => void;
  settingsSection: SettingsSection;
  onSelectSettingsSection: (section: SettingsSection) => void;
}

const navigationSections = [
  {
    label: 'Workspace',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Operasional',
    items: [
      { id: 'customers', label: 'Pelanggan PPPoE', icon: Users },
      { id: 'vouchers', label: 'Voucher Hotspot', icon: Ticket },
      { id: 'finance', label: 'Keuangan', icon: CreditCard },
    ],
  },
  {
    label: 'Integrasi',
    items: [
      { id: 'routers', label: 'Router MikroTik', icon: Server },
      { id: 'whatsapp', label: 'WhatsApp API', icon: MessageSquare },
      { id: 'payment', label: 'Pembayaran', icon: CreditCard },
    ],
  },
  {
    label: 'Sistem',
    items: [{ id: 'settings', label: 'Pengaturan', icon: Settings }],
  },
];

export const AdminSidebar: React.FC<Props> = ({
  adminTab,
  username,
  onSelectAdminTab,
  settings,
  onRefreshData,
  onLogout,
  isCollapsed,
  isMobileMenuOpen,
  onMobileMenuOpenChange,
  settingsSection,
  onSelectSettingsSection,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [isSettingsSubmenuOpen, setIsSettingsSubmenuOpen] = useState(adminTab === 'settings');
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [approvalCounts, setApprovalCounts] = useState<{ invoice: number; voucher: number }>({ invoice: 0, voucher: 0 });
  const [approvalCountError, setApprovalCountError] = useState('');
  const brandName = settings.brandName || settings.appName || 'SmartBilling';

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const refreshApprovalCounts = async () => {
      try {
        const response = await fetch('/api/admin/payment-requests/counts', { cache: 'no-store' });
        const result: unknown = await response.json();
        if (!response.ok) {
          const error = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
            ? result.error
            : `HTTP ${response.status}`;
          throw new Error(error);
        }
        if (
          !result ||
          typeof result !== 'object' ||
          !('invoice' in result) ||
          !('voucher' in result) ||
          typeof result.invoice !== 'number' ||
          typeof result.voucher !== 'number' ||
          !Number.isInteger(result.invoice) ||
          !Number.isInteger(result.voucher) ||
          result.invoice < 0 ||
          result.voucher < 0
        ) {
          throw new Error('Jumlah persetujuan yang diterima tidak valid');
        }
        if (active) {
          setApprovalCounts({ invoice: result.invoice, voucher: result.voucher });
          setApprovalCountError('');
        }
      } catch (error) {
        if (active) {
          setApprovalCountError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (active) timer = window.setTimeout(() => void refreshApprovalCounts(), 10000);
      }
    };

    void refreshApprovalCounts();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  const handleCheckRouterStatus = async () => {
    setIsScanning(true);
    setScanMessage('');
    try {
      const response = await fetch('/api/mikrotik/routers');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      if (!Array.isArray(result.routers)) throw new Error('Daftar router tidak valid');
      StorageService.saveRouters(result.routers);
      onRefreshData();
      setScanMessage(
        `${result.routers.filter((router: RouterConfig) => router.status === 'connected').length} / ${result.routers.length} router terhubung`,
      );
    } catch (error) {
      setScanMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onMobileMenuOpenChange(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen, onMobileMenuOpenChange]);

  const selectTab = (tab: string) => {
    onSelectAdminTab(tab);
    if (tab !== 'settings') setIsSettingsSubmenuOpen(false);
    onMobileMenuOpenChange(false);
  };

  useEffect(() => {
    if (adminTab === 'settings') setIsSettingsSubmenuOpen(true);
  }, [adminTab]);

  const renderNavigation = (compact = false) => (
    <nav aria-label="Navigasi admin" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      {navigationSections.map(section => (
        <div key={section.label} className="mb-5 last:mb-0">
          {!compact && (
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {section.label}
            </p>
          )}
          <div className="space-y-1">
            {section.items.map(({ id, label, icon: Icon }) => {
              const active = adminTab === id;
              const pendingCount = id === 'finance'
                ? approvalCounts.invoice
                : id === 'vouchers'
                  ? approvalCounts.voucher
                  : 0;
              const accessibleLabel = pendingCount
                ? `${label}, ${pendingCount} persetujuan tertunda`
                : label;
              if (id === 'settings') {
                return (
                  <div key={id}>
                    <button
                      type="button"
                      title={compact ? label : undefined}
                      onClick={() => {
                        if (adminTab !== 'settings') {
                          onSelectAdminTab('settings');
                          setIsSettingsSubmenuOpen(true);
                        } else {
                          setIsSettingsSubmenuOpen(open => !open);
                        }
                      }}
                      aria-current={active ? 'page' : undefined}
                      aria-expanded={!compact && isSettingsSubmenuOpen}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        compact ? 'justify-center px-0' : ''
                      } ${
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!compact && (
                        <>
                          <span className="flex-1 truncate">{label}</span>
                          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isSettingsSubmenuOpen ? 'rotate-180' : ''}`} />
                        </>
                      )}
                    </button>
                    {!compact && isSettingsSubmenuOpen && (
                      <div className="ml-4 mt-1 space-y-1 border-l border-border pl-2">
                        {settingsSections.map(({ id: sectionId, label: sectionLabel, description, icon: SectionIcon }) => {
                          const sectionActive = adminTab === 'settings' && settingsSection === sectionId;
                          return (
                            <button
                              key={sectionId}
                              type="button"
                              onClick={() => {
                                onSelectAdminTab('settings');
                                onSelectSettingsSection(sectionId);
                                onMobileMenuOpenChange(false);
                              }}
                              aria-current={sectionActive ? 'page' : undefined}
                              className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                sectionActive
                                  ? 'bg-accent text-accent-foreground'
                                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                              }`}
                            >
                              <SectionIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-medium">{sectionLabel}</span>
                                <span className="mt-0.5 block truncate text-[10px] opacity-75">{description}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <button
                  key={id}
                  type="button"
                  title={compact ? accessibleLabel : undefined}
                  onClick={() => selectTab(id)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={accessibleLabel}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    compact ? 'justify-center px-0' : ''
                  } ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <span className="relative grid h-5 w-5 shrink-0 place-items-center">
                    <Icon className="h-4 w-4" />
                    {compact && pendingCount > 0 && (
                      <span className="absolute -right-2 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-white">
                        {pendingCount > 99 ? '99+' : pendingCount}
                      </span>
                    )}
                  </span>
                  {!compact && (
                    <>
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {pendingCount > 0 && (
                        <span className="grid min-h-5 min-w-5 shrink-0 place-items-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-none text-white">
                          {pendingCount > 99 ? '99+' : pendingCount}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const renderActions = (compact = false) => (
    <div className="space-y-1 border-t border-border p-3">
      {scanMessage && (
        <p
          role="status"
          title={compact ? scanMessage : undefined}
          className={`px-2 py-1 text-[11px] text-muted-foreground ${compact ? 'truncate text-center' : ''}`}
        >
          {scanMessage}
        </p>
      )}
      {approvalCountError && (
        <p
          role="status"
          title={compact ? `Jumlah persetujuan tidak dapat dimuat: ${approvalCountError}` : undefined}
          className={`px-2 py-1 text-[10px] leading-relaxed text-destructive ${compact ? 'truncate text-center' : ''}`}
        >
          {compact ? 'Notif gagal dimuat' : `Jumlah persetujuan tidak dapat dimuat: ${approvalCountError}`}
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        className={`w-full ${compact ? 'justify-center px-0' : 'justify-start'}`}
        onClick={toggleTheme}
        title={compact ? `Aktifkan mode ${theme === 'dark' ? 'terang' : 'gelap'}` : undefined}
        aria-label={`Aktifkan mode ${theme === 'dark' ? 'terang' : 'gelap'}`}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
        {!compact && <span>Mode {theme === 'dark' ? 'terang' : 'gelap'}</span>}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className={`w-full ${compact ? 'justify-center px-0' : 'justify-start'}`}
        onClick={() => void handleCheckRouterStatus()}
        disabled={isScanning}
        aria-label="Periksa status router"
        title={compact ? 'Periksa status router' : undefined}
      >
        <Zap className={`h-4 w-4 shrink-0 ${isScanning ? 'animate-bounce' : ''}`} />
        {!compact && <span>{isScanning ? 'Memeriksa router...' : 'Status router'}</span>}
      </Button>
      <a
        href="/portal"
        title={compact ? 'Buka Portal' : undefined}
        className={`flex min-h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
          compact ? 'justify-center px-0' : ''
        }`}
      >
        <Wifi className="h-4 w-4 shrink-0" />
        {!compact && <span>Portal</span>}
      </a>
      <Button
        type="button"
        variant="ghost"
        className={`w-full ${compact ? 'justify-center px-0' : 'justify-start'}`}
        onClick={onLogout}
        aria-label="Keluar"
        title={compact ? 'Keluar' : undefined}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!compact && <span>Keluar</span>}
      </Button>
    </div>
  );

  const renderBrand = (compact = false) => (
    <div
      title={brandName}
      className={`flex min-w-0 items-center ${compact ? 'justify-center' : ''}`}
    >
      {settings.brandMainLogoDataUrl || settings.brandLogoDataUrl ? (
        <img
          src={settings.brandMainLogoDataUrl || settings.brandLogoDataUrl}
          alt={brandName}
          className={`max-w-full object-contain dark:invert ${compact ? 'h-8 w-12 object-center' : 'h-10 w-48 object-left'}`}
        />
      ) : (
        <p className={`truncate font-semibold tracking-tight ${compact ? 'text-xs' : 'text-sm'}`}>
          {brandName}
        </p>
      )}
    </div>
  );

  const renderUser = (compact = false) => (
    <div
      title={compact ? username : undefined}
      className={`flex min-w-0 items-center gap-3 rounded-lg border border-border bg-background/70 p-2.5 ${compact ? 'justify-center px-0' : ''}`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-foreground">
        {Array.from(username)[0]?.toUpperCase() || 'A'}
      </span>
      {!compact && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{username}</span>
          <span className="block text-[10px] text-muted-foreground">Administrator</span>
        </span>
      )}
    </div>
  );

  return (
    <>
      <aside
        aria-label="Sidebar admin"
        className={`sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-border bg-card text-card-foreground transition-[width] duration-200 md:flex ${
          isCollapsed ? 'w-[4.5rem]' : 'w-64'
        }`}
      >
        <div className={`flex h-16 shrink-0 items-center border-b border-border px-3 ${isCollapsed ? 'justify-center' : ''}`}>
          {renderBrand(isCollapsed)}
        </div>
        {renderNavigation(isCollapsed)}
        <div className="shrink-0">
          <div className="px-3 pb-3">{renderUser(isCollapsed)}</div>
          {renderActions(isCollapsed)}
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => onMobileMenuOpenChange(true)}
          aria-label="Buka menu navigasi"
          aria-expanded={isMobileMenuOpen}
          aria-controls="admin-mobile-sidebar"
          title="Buka menu navigasi"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
        {renderBrand()}
      </header>

      {isMobileMenuOpen && createPortal(
        <div className="fixed inset-0 z-[100] md:hidden">
          <button
            type="button"
            aria-label="Tutup menu navigasi"
            onClick={() => onMobileMenuOpenChange(false)}
            className="absolute inset-0 h-full w-full bg-black/60"
          />
          <aside
            id="admin-mobile-sidebar"
            role="dialog"
            aria-modal="true"
            aria-label="Menu navigasi admin"
            className="absolute inset-y-0 left-0 flex h-full w-[min(19rem,85vw)] flex-col border-r border-border bg-card text-card-foreground shadow-2xl"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
              {renderBrand()}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onMobileMenuOpenChange(false)}
                aria-label="Tutup menu"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {renderNavigation()}
            <div className="shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="px-3 pb-3">{renderUser()}</div>
              {renderActions()}
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
};
