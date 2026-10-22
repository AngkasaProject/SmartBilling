import React, { useState, useEffect } from 'react';
import { AppSettings, DatabaseStats } from '../../types';
import { StorageService } from '../../services/storage';
import { useToast } from '../ui/toast';
import {
  Settings,
  Building,
  Server,
  MessageSquare,
  CreditCard,
  Sliders,
  Database,
  Save,
  Check,
  RefreshCw,
  Download,
  AlertTriangle,
  ShieldCheck,
  ExternalLink,
  Wifi,
  Phone,
  Mail,
  MapPin,
  Lock,
  Globe,
  Terminal,
  Zap,
  Users,
  KeyRound,
  Copy,
  Trash2,
} from 'lucide-react';

interface Props {
  settings: AppSettings;
  onRefreshSettings: () => void;
}

export const SettingsTab: React.FC<Props> = ({ settings, onRefreshSettings }) => {
  const { toast, confirm: confirmAction } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'mikrotik' | 'openwa' | 'payment' | 'billing' | 'database' | 'security'>('general');
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Router test connection state
  const [isTestingRouter, setIsTestingRouter] = useState(false);
  const [routerTestSuccess, setRouterTestSuccess] = useState<boolean | null>(null);
  const [routerTestMessage, setRouterTestMessage] = useState('');

  // Database stats state
  const [dbStats, setDbStats] = useState<any | null>(null);
  const [isOptimizingDb, setIsOptimizingDb] = useState(false);
  const [routerManagedByEnvironment, setRouterManagedByEnvironment] = useState(false);
  const [adminUsers, setAdminUsers] = useState<Array<{ id: string; username: string; createdAt: string }>>([]);
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [encryptionKeySource, setEncryptionKeySource] = useState<'environment' | 'generated' | ''>('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [envLoginConfigured, setEnvLoginConfigured] = useState(false);

  useEffect(() => {
    setFormData(settings);
    loadDbStats();
    void loadSecuritySettings();
  }, [settings]);

  const readJson = async (response: Response) => {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  };

  const loadSecuritySettings = async () => {
    try {
      const [routerResponse, usersResponse, keyResponse, authResponse] = await Promise.all([
        fetch('/api/mikrotik/config'),
        fetch('/api/admin/users'),
        fetch('/api/security/encryption-key'),
        fetch('/api/auth/status'),
      ]);
      const [router, users, keyInfo, auth] = await Promise.all([
        readJson(routerResponse),
        readJson(usersResponse),
        readJson(keyResponse),
        readJson(authResponse),
      ]);
      setRouterManagedByEnvironment(router.managedByEnvironment);
      setAdminUsers(users.users);
      setEncryptionKey(keyInfo.key);
      setEncryptionKeySource(keyInfo.source);
      setEnvLoginConfigured(auth.envLoginConfigured);
      setSecurityError('');
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleAddAdmin = async () => {
    setSecurityError('');
    setSecurityMessage('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newAdminUsername, password: newAdminPassword }),
      });
      await readJson(response);
      setNewAdminUsername('');
      setNewAdminPassword('');
      setSecurityMessage('Akun admin berhasil dibuat.');
      await loadSecuritySettings();
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDeleteAdmin = async (user: { id: string; username: string }) => {
    if (!await confirmAction('Hapus akun admin?', `Akun ${user.username} akan dihapus dan sesi aktifnya dicabut.`, true)) return;
    setSecurityError('');
    setSecurityMessage('');
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      await readJson(response);
      setSecurityMessage(`Akun ${user.username} dihapus.`);
      await loadSecuritySettings();
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRotateEncryptionKey = async () => {
    if (!await confirmAction('Rotasi kunci enkripsi?', 'Semua kredensial router tersimpan akan dienkripsi ulang. Simpan kunci baru untuk pemulihan backup.', true)) return;
    setSecurityError('');
    setSecurityMessage('');
    try {
      const response = await fetch('/api/security/encryption-key/rotate', { method: 'POST' });
      const result = await readJson(response);
      setEncryptionKey(result.key);
      setEncryptionKeySource(result.source);
      setSecurityMessage('Kunci berhasil dibuat ulang dan kredensial router dienkripsi ulang.');
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : String(error));
    }
  };

  const loadDbStats = async () => {
    const stats = await StorageService.getDbStats();
    setDbStats(stats);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await StorageService.saveSettings(formData);
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      onRefreshSettings();
      loadDbStats();
    } catch (error) {
      setIsSaving(false);
      toast('Gagal menyimpan pengaturan', 'error', error instanceof Error ? error.message : String(error));
    }
  };

  const handleTestRouterConnection = async () => {
    setIsTestingRouter(true);
    setRouterTestSuccess(null);
    setRouterTestMessage('');
    try {
      const response = await fetch('/api/mikrotik/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Environment MikroTik',
          host: formData.mikrotikHost,
          port: formData.mikrotikPort,
          username: formData.mikrotikUser,
          apiType: formData.mikrotikApiType,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setRouterTestSuccess(true);
      setRouterTestMessage(`${result.router.name} • RouterOS ${result.router.rosVersion} • CPU ${result.router.cpuLoad}% • uptime ${result.router.uptime}`);
    } catch (error) {
      setRouterTestSuccess(false);
      setRouterTestMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsTestingRouter(false);
    }
  };

  const handleOptimizeDb = async () => {
    setIsOptimizingDb(true);
    try {
      await StorageService.vacuumDatabase();
      setIsOptimizingDb(false);
      toast('Database SQLite berhasil dioptimalkan (VACUUM selesai).', 'success');
      loadDbStats();
    } catch (error) {
      setIsOptimizingDb(false);
      toast('Gagal mengoptimalkan database', 'error', error instanceof Error ? error.message : String(error));
    }
  };

  const handleDownloadDbBackup = () => {
    window.location.href = '/api/db/backup';
  };

  const handleResetToDefault = async () => {
    if (await confirmAction('Reset pengaturan?', 'Semua pengaturan aplikasi akan dikembalikan ke nilai awal.', true)) {
      StorageService.resetDefaults();
      onRefreshSettings();
      toast('Pengaturan berhasil direset.', 'success');
    }
  };

  const webhookUrl = `${window.location.origin}/api/payment/webhook`;

  return (
    <div className="space-y-6">
      {/* Settings Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 shrink-0">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Pengaturan Sistem (Settings)</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Semua konfigurasi tersimpan secara persisten di database <b>SQLite (/app/data/billing.sqlite)</b> siap Docker.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center gap-2"
            >
              {saveSuccess ? <Check className="w-4 h-4 text-white" /> : <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />}
              <span>{isSaving ? 'Menyimpan...' : saveSuccess ? 'Tersimpan di SQLite!' : 'Simpan Semua Pengaturan'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Settings Body with Vertical Sub-Navigation Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
        {/* Sub-menu Navigation Sidebar (1 col) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-xl space-y-1">
          {[
            { id: 'general', label: 'Umum & Branding', desc: 'Nama aplikasi, logo & kontak', icon: Building },
            { id: 'mikrotik', label: 'MikroTik RouterOS', desc: 'Host, API port & kredensial', icon: Server },
            { id: 'openwa', label: 'WhatsApp API', desc: 'Pilih Fonnte atau OpenWA', icon: MessageSquare },
            { id: 'billing', label: 'Billing & Hotspot', desc: 'Toleransi isolir & prefix voucher', icon: Sliders },
            { id: 'database', label: 'Database & Backup', desc: 'Status SQLite & download backup', icon: Database },
            { id: 'security', label: 'Admin & Keamanan', desc: 'Akun admin dan kunci enkripsi', icon: ShieldCheck },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`w-full text-left p-3 rounded-xl transition flex items-start gap-3 ${
                  isActive
                    ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/20'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <div className="truncate">
                  <div className="text-xs font-semibold">{tab.label}</div>
                  <div className={`text-[10px] truncate ${isActive ? 'text-indigo-100' : 'text-slate-500'}`}>
                    {tab.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Sub-menu Content Forms (3 cols) */}
        <div className="md:col-span-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSaveSettings} className="space-y-6">
            {/* SUB-MENU 1: UMUM & BRANDING */}
            {activeSubTab === 'general' && (
              <div className="space-y-5">
                <div className="border-b border-slate-800 pb-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Building className="w-5 h-5 text-indigo-400" />
                    <span>Identitas Aplikasi & Branding ISP</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Nama dan kontak ini akan muncul di dashboard, invoice cetak, dan portal pembelian voucher
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Nama Aplikasi</label>
                    <input
                      type="text"
                      required
                      value={formData.appName}
                      onChange={e => setFormData({ ...formData, appName: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Nama Brand / Singkatan ISP</label>
                    <input
                      type="text"
                      required
                      value={formData.brandName}
                      onChange={e => setFormData({ ...formData, brandName: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Nama Perusahaan Resmi (PT / CV)</label>
                    <input
                      type="text"
                      value={formData.companyName}
                      onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Slogan / Tagline</label>
                    <input
                      type="text"
                      value={formData.tagline}
                      onChange={e => setFormData({ ...formData, tagline: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block text-slate-300 font-semibold mb-1">Alamat Kantor / NOC</label>
                  <input
                    type="text"
                    value={formData.officeAddress}
                    onChange={e => setFormData({ ...formData, officeAddress: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">No. WhatsApp CS</label>
                    <input
                      type="text"
                      value={formData.phoneContact}
                      onChange={e => setFormData({ ...formData, phoneContact: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Email Billing / NOC</label>
                    <input
                      type="email"
                      value={formData.emailContact}
                      onChange={e => setFormData({ ...formData, emailContact: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">SSID WiFi Default</label>
                    <input
                      type="text"
                      value={formData.defaultSsid}
                      onChange={e => setFormData({ ...formData, defaultSsid: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SUB-MENU 2: MIKROTIK ROUTEROS */}
            {activeSubTab === 'mikrotik' && (
              <div className="space-y-5">
                <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Server className="w-5 h-5 text-indigo-400" />
                      <span>Koneksi MikroTik RouterOS API</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Digunakan untuk membaca router serta mengelola secret dan konfigurasi PPPoE melalui RouterOS API.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestRouterConnection}
                    disabled={isTestingRouter || !routerManagedByEnvironment}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingRouter ? 'animate-spin text-indigo-400' : ''}`} />
                    <span>{isTestingRouter ? 'Menguji API...' : 'Tes Koneksi'}</span>
                  </button>
                </div>

                {routerManagedByEnvironment && (
                  <p className="text-xs text-amber-200 bg-amber-950/40 border border-amber-500/30 rounded-xl p-3">
                    Pengaturan koneksi router utama berasal dari environment server dan terkunci di sini. Gunakan tab Router MikroTik untuk menambahkan router lain dari panel.
                  </p>
                )}

                {routerTestSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>{routerTestMessage}</span>
                  </div>
                )}
                {routerTestSuccess === false && (
                  <div role="alert" className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">{routerTestMessage}</div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Host / IP MikroTik</label>
                    <input
                      type="text"
                      required
                      disabled={routerManagedByEnvironment}
                      value={formData.mikrotikHost}
                      onChange={e => setFormData({ ...formData, mikrotikHost: e.target.value })}
                      placeholder="103.180.12.5 atau 192.168.88.1"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Port API</label>
                    <input
                      type="number"
                      required
                      disabled={routerManagedByEnvironment}
                      value={formData.mikrotikPort}
                      onChange={e => setFormData({ ...formData, mikrotikPort: Number(e.target.value) })}
                      placeholder="8728"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Username API</label>
                    <input
                      type="text"
                      required
                      disabled={routerManagedByEnvironment}
                      value={formData.mikrotikUser}
                      onChange={e => setFormData({ ...formData, mikrotikUser: e.target.value })}
                      placeholder="api_billing"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Password API (server .env)</label>
                    <input
                      type="password"
                      value=""
                      readOnly
                      placeholder="Dikelola di MIKROTIK_PASS"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Tipe Protokol API</label>
                    <select
                      disabled={routerManagedByEnvironment}
                      value={formData.mikrotikApiType}
                      onChange={e => setFormData({ ...formData, mikrotikApiType: e.target.value as any })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="api">RouterOS API Standard (Port 8728)</option>
                      <option value="api-ssl">RouterOS API-SSL Terenkripsi (Port 8729)</option>
                      <option value="rest">RouterOS v7 REST API (HTTP/HTTPS)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Timeout Koneksi (Detik)</label>
                    <input
                      type="number"
                      disabled={routerManagedByEnvironment}
                      value={formData.mikrotikTimeoutSec}
                      onChange={e => setFormData({ ...formData, mikrotikTimeoutSec: Number(e.target.value) })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SUB-MENU 3: OPENWA WHATSAPP */}
            {activeSubTab === 'openwa' && (
              <div className="space-y-5">
                <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-emerald-400" />
                      <span>Provider WhatsApp Eksternal</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Pengaturan bot WhatsApp Baileys tanpa biaya langganan per pesan
                    </p>
                  </div>
                </div>
                <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-500/20 rounded-lg p-3">
                  Pilih Fonnte atau OpenWA di menu WhatsApp. SmartBilling hanya mengirim request ke REST API; setiap provider berjalan dan dikelola secara terpisah.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">OpenWA Base URL (Server API)</label>
                    <input
                      type="text"
                      value={formData.openwaUrl}
                      readOnly
                      placeholder="URL instalasi OpenWA eksternal"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Atur base URL OpenWA dan API key di environment server. Fonnte menggunakan FONNTE_TOKEN.
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">X-API-Key</label>
                    <input
                      type="password"
                      value=""
                      disabled
                      placeholder="Set OPENWA_API_KEY di .env server"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Session ID (Nama Sesi)</label>
                    <input
                      type="text"
                      value={formData.openwaSessionId}
                      readOnly
                      placeholder="billing-isp"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Nomor Pengirim (Sender Number)</label>
                    <input
                      type="text"
                      value={formData.openwaSenderNumber}
                      readOnly
                      placeholder="Dikelola melalui environment server"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2.5">
                    Otomatisasi Pengiriman Pesan
                  </span>
                  <label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={formData.autoSendReminderH1}
                      onChange={event => setFormData({ ...formData, autoSendReminderH1: event.target.checked })}
                      className="mt-0.5 accent-indigo-500"
                    />
                    <span>
                      <b className="text-white">Kirim pengingat PPPoE otomatis H-1</b>
                      <span className="mt-1 block text-[11px] text-slate-500">
                        Server memeriksa invoice belum lunas dan mengirim tautan pembayaran khusus melalui WhatsApp satu hari sebelum jatuh tempo. Pastikan APP_URL dan provider WhatsApp aktif.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* SUB-MENU 4: PAYMENT GATEWAY */}
            {activeSubTab === 'payment' && (
              <div className="space-y-5">
                <div className="border-b border-slate-800 pb-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-indigo-400" />
                    <span>Pilihan Provider Pembayaran</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pilihan ini belum mengaktifkan transaksi checkout.
                  </p>
                </div>
                <p role="status" className="text-xs text-amber-300 bg-amber-950/40 border border-amber-500/20 rounded-lg p-3">
                  Pembuatan transaksi dan verifikasi webhook belum tersedia. Endpoint callback yang ditampilkan mengembalikan HTTP 501; jangan daftarkan sebagai webhook provider.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Provider Gateway</label>
                    <select
                      value={formData.paymentProvider}
                      onChange={e => setFormData({ ...formData, paymentProvider: e.target.value as any })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="midtrans">Midtrans (Snap & Core API)</option>
                      <option value="xendit">Xendit Invoice</option>
                      <option value="tripay">Tripay Closed Payment</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Mode Lingkungan</label>
                    <div className="flex items-center gap-3 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="isProd"
                          checked={!formData.paymentIsProduction}
                          onChange={() => setFormData({ ...formData, paymentIsProduction: false })}
                          className="text-indigo-600"
                        />
                        <span>Sandbox (Uji Coba)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="isProd"
                          checked={formData.paymentIsProduction}
                          onChange={() => setFormData({ ...formData, paymentIsProduction: true })}
                          className="text-indigo-600"
                        />
                        <span className="text-emerald-400 font-semibold">Production (Live)</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Server Key / Secret Key (belum digunakan)</label>
                    <input
                      type="password"
                      value=""
                      disabled
                      placeholder="Checkout belum diaktifkan"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Client Key / Public Key (belum digunakan)</label>
                    <input
                      type="text"
                      value=""
                      disabled
                      placeholder="Checkout belum diaktifkan"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block text-slate-300 font-semibold mb-1">URL Callback (belum aktif)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webhookUrl}
                      className="flex-1 px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-emerald-400 font-mono text-xs"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Jangan daftarkan URL ini ke dashboard provider sebelum implementasi webhook tersedia.
                  </span>
                </div>
              </div>
            )}

            {/* SUB-MENU 5: BILLING & HOTSPOT DEFAULTS */}
            {activeSubTab === 'billing' && (
              <div className="space-y-5">
                <div className="border-b border-slate-800 pb-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-indigo-400" />
                    <span>Konfigurasi Siklus Billing & Format Voucher</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Format kode voucher default
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Prefix Kode Voucher</label>
                    <input
                      type="text"
                      value={formData.defaultVoucherPrefix}
                      onChange={e => setFormData({ ...formData, defaultVoucherPrefix: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">Contoh: NET-</span>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Panjang Karakter Angka Acak</label>
                    <input
                      type="number"
                      min={4}
                      max={8}
                      value={formData.voucherLength}
                      onChange={e => setFormData({ ...formData, voucherLength: Number(e.target.value) })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">Default: 5 karakter (e.g. NET-73921)</span>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-MENU 6: DATABASE SQLITE & BACKUP */}
            {activeSubTab === 'database' && (
              <div className="space-y-5">
                <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Database className="w-5 h-5 text-indigo-400" />
                      <span>Manajemen Database SQLite Persistent</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Penyimpanan lokal di dalam volume Docker <code>billing_data:/app/data</code>
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    SQLITE 3 ACTIVE
                  </span>
                </div>

                {dbStats && (
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Lokasi Berkas Database:</span>
                      <span className="text-white font-bold">{dbStats.dbPath}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Ukuran Berkas di Disk:</span>
                      <span className="text-emerald-400 font-bold">{dbStats.fileSizeKb} KB</span>
                    </div>

                    <div className="pt-2 border-t border-slate-800">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2 font-sans">
                        Statistik Tabel Database
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {dbStats.tables?.map((t: any) => (
                          <div key={t.name} className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex justify-between">
                            <span className="text-slate-400 text-[11px]">{t.name}:</span>
                            <span className="text-indigo-400 font-bold">{t.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleDownloadDbBackup}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow transition flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Backup Database (.sqlite)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOptimizeDb}
                    disabled={isOptimizingDb}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <Zap className={`w-4 h-4 text-amber-400 ${isOptimizingDb ? 'animate-spin' : ''}`} />
                    <span>{isOptimizingDb ? 'Mengoptimalkan...' : 'Optimize SQLite (VACUUM)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetToDefault}
                    className="px-4 py-2.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>Reset Data ke Awal</span>
                  </button>
                </div>
              </div>
            )}

            {activeSubTab === 'security' && (
              <div className="space-y-6">
                <div className="border-b border-slate-800 pb-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-indigo-400" />
                    <span>Akun Administrator & Kunci Enkripsi</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Akun database memakai password hashing; kredensial router dienkripsi dengan kunci aplikasi.</p>
                </div>

                {envLoginConfigured && (
                  <p className="text-xs text-amber-200 bg-amber-950/40 border border-amber-500/30 rounded-xl p-3">
                    Kredensial login utama dikelola oleh ADMIN_USERNAME dan ADMIN_PASSWORD di environment server. Ubah nilai tersebut melalui konfigurasi deployment lalu restart aplikasi.
                  </p>
                )}

                {securityError && <p role="alert" className="text-xs text-rose-200 bg-rose-950/40 border border-rose-500/30 rounded-lg p-3">{securityError}</p>}
                {securityMessage && <p role="status" className="text-xs text-emerald-200 bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-3">{securityMessage}</p>}

                <section className="space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-indigo-400" />Akun admin tambahan</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      value={newAdminUsername}
                      onChange={event => setNewAdminUsername(event.target.value)}
                      minLength={3}
                      maxLength={64}
                      placeholder="Username (3-64 karakter)"
                      className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs"
                    />
                    <input
                      type="password"
                      value={newAdminPassword}
                      onChange={event => setNewAdminPassword(event.target.value)}
                      minLength={12}
                      maxLength={256}
                      placeholder="Password (minimal 12 karakter)"
                      className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs"
                    />
                    <button
                      type="button"
                      disabled={newAdminUsername.trim().length < 3 || newAdminPassword.length < 12}
                      onClick={handleAddAdmin}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs disabled:opacity-50"
                    >
                      Tambah Admin
                    </button>
                  </div>
                  <div className="space-y-2">
                    {adminUsers.map(user => (
                      <div key={user.id} className="flex items-center justify-between gap-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                        <div>
                          <div className="text-sm font-bold text-white">{user.username}</div>
                          <div className="text-[10px] text-slate-500">Dibuat {new Date(user.createdAt).toLocaleString('id-ID')}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAdmin(user)}
                          className="p-2 text-rose-300 hover:text-white hover:bg-rose-900/50 rounded-lg"
                          aria-label={`Hapus admin ${user.username}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {adminUsers.length === 0 && <p className="text-xs text-slate-500">Login admin saat ini berasal dari environment; tidak ada akun admin SQLite.</p>}
                  </div>
                </section>

                <section className="space-y-3 pt-5 border-t border-slate-800">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-400" />Kunci enkripsi aplikasi</h4>
                  <p className="text-xs text-slate-400">Simpan salinan kunci ini di tempat aman untuk memulihkan kredensial MikroTik dari backup. Jangan membagikannya.</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      readOnly
                      value={encryptionKey}
                      className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-emerald-300 text-xs font-mono"
                    />
                    <button
                      type="button"
                      disabled={!encryptionKey}
                      onClick={() => void navigator.clipboard.writeText(encryptionKey).then(() => setSecurityMessage('Kunci disalin ke clipboard.')).catch(error => setSecurityError(error instanceof Error ? error.message : String(error)))}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5" /> Salin
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className={`text-xs ${encryptionKeySource === 'environment' ? 'text-amber-300' : 'text-emerald-300'}`}>
                      Sumber: {encryptionKeySource === 'environment' ? 'APP_ENCRYPTION_KEY (.env), dikelola environment' : 'Dibuat otomatis dan disimpan di data/router-secrets.key'}
                    </span>
                    <button
                      type="button"
                      disabled={encryptionKeySource === 'environment'}
                      onClick={() => void handleRotateEncryptionKey()}
                      className="px-3 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-xs font-bold disabled:opacity-40"
                    >
                      Buat Ulang Kunci
                    </button>
                  </div>
                </section>
              </div>
            )}

            {/* Bottom Form Save Button */}
            <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 font-bold text-white text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-2"
              >
                {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                <span>{isSaving ? 'Menyimpan...' : saveSuccess ? 'Tersimpan di SQLite!' : 'Simpan Pengaturan'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  );
};
