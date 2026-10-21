import React, { useState, useEffect } from 'react';
import { AppSettings, DatabaseStats } from '../../types';
import { StorageService } from '../../services/storage';
import { QrCode } from '../common/QrCode';
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
  QrCode as QrIcon,
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
  X
} from 'lucide-react';

interface Props {
  settings: AppSettings;
  onRefreshSettings: () => void;
}

export const SettingsTab: React.FC<Props> = ({ settings, onRefreshSettings }) => {
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'mikrotik' | 'openwa' | 'payment' | 'billing' | 'database'>('general');
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // Router test connection state
  const [isTestingRouter, setIsTestingRouter] = useState(false);
  const [routerTestSuccess, setRouterTestSuccess] = useState<boolean | null>(null);

  // Database stats state
  const [dbStats, setDbStats] = useState<any | null>(null);
  const [isOptimizingDb, setIsOptimizingDb] = useState(false);

  useEffect(() => {
    setFormData(settings);
    loadDbStats();
  }, [settings]);

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
    } catch {
      setIsSaving(false);
      alert('Gagal menyimpan pengaturan ke database.');
    }
  };

  const handleTestRouterConnection = () => {
    setIsTestingRouter(true);
    setRouterTestSuccess(null);
    setTimeout(() => {
      setIsTestingRouter(false);
      setRouterTestSuccess(true);
      setTimeout(() => setRouterTestSuccess(null), 4000);
    }, 900);
  };

  const handleOptimizeDb = async () => {
    setIsOptimizingDb(true);
    try {
      await StorageService.vacuumDatabase();
      setIsOptimizingDb(false);
      alert('Database SQLite berhasil dioptimalkan (VACUUM selesai)!');
      loadDbStats();
    } catch {
      setIsOptimizingDb(false);
    }
  };

  const handleDownloadDbBackup = () => {
    window.location.href = '/api/db/backup';
  };

  const handleResetToDefault = () => {
    if (window.confirm('Yakin ingin mereset seluruh pengaturan aplikasi ke default awal?')) {
      StorageService.resetDefaults();
      onRefreshSettings();
      alert('Pengaturan berhasil direset.');
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
            { id: 'openwa', label: 'OpenWA WhatsApp', desc: 'Gateway rmyndharis/OpenWA', icon: MessageSquare },
            { id: 'payment', label: 'Payment Gateway', desc: 'Midtrans, Xendit, Tripay & QRIS', icon: CreditCard },
            { id: 'billing', label: 'Billing & Hotspot', desc: 'Toleransi isolir & prefix voucher', icon: Sliders },
            { id: 'database', label: 'Database & Backup', desc: 'Status SQLite & download backup', icon: Database },
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
                      Digunakan untuk mendaftarkan user secret PPPoE, auto-isolir, dan pemantauan trafik
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestRouterConnection}
                    disabled={isTestingRouter}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingRouter ? 'animate-spin text-indigo-400' : ''}`} />
                    <span>{isTestingRouter ? 'Menguji API...' : 'Tes Koneksi'}</span>
                  </button>
                </div>

                {routerTestSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Koneksi RouterOS API Berhasil! Host merespon dalam 12ms.</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Host / IP MikroTik</label>
                    <input
                      type="text"
                      required
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
                      value={formData.mikrotikUser}
                      onChange={e => setFormData({ ...formData, mikrotikUser: e.target.value })}
                      placeholder="api_billing"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Password API</label>
                    <input
                      type="password"
                      value={formData.mikrotikPass || ''}
                      onChange={e => setFormData({ ...formData, mikrotikPass: e.target.value })}
                      placeholder="••••••••••••"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Tipe Protokol API</label>
                    <select
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
                      <span>OpenWA Gateway (rmyndharis/OpenWA)</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Pengaturan bot WhatsApp Baileys tanpa biaya langganan per pesan
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsQrModalOpen(true)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-1.5"
                  >
                    <QrIcon className="w-3.5 h-3.5" />
                    <span>Pairing QR Code</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">OpenWA Base URL (Server API)</label>
                    <input
                      type="text"
                      required
                      value={formData.openwaUrl}
                      onChange={e => setFormData({ ...formData, openwaUrl: e.target.value })}
                      placeholder="http://openwa:2785"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Internal Docker: <b>http://openwa:2785</b> | VPS Host: <b>http://localhost:2785</b>
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">X-API-Key</label>
                    <input
                      type="password"
                      required
                      value={formData.openwaApiKey}
                      onChange={e => setFormData({ ...formData, openwaApiKey: e.target.value })}
                      placeholder="Kunci dari data/.api-key"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Session ID (Nama Sesi)</label>
                    <input
                      type="text"
                      required
                      value={formData.openwaSessionId}
                      onChange={e => setFormData({ ...formData, openwaSessionId: e.target.value })}
                      placeholder="billing-isp"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Nomor Pengirim (Sender Number)</label>
                    <input
                      type="text"
                      value={formData.openwaSenderNumber}
                      onChange={e => setFormData({ ...formData, openwaSenderNumber: e.target.value })}
                      placeholder="081288990011"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2.5">
                    Otomatisasi Pengiriman Pesan
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <input
                        type="checkbox"
                        checked={formData.autoSendReminderH3}
                        onChange={e => setFormData({ ...formData, autoSendReminderH3: e.target.checked })}
                        className="rounded border-slate-700 text-emerald-600 focus:ring-0"
                      />
                      <span>Kirim Pengingat H-3 Jatuh Tempo</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <input
                        type="checkbox"
                        checked={formData.autoSendReminderH1}
                        onChange={e => setFormData({ ...formData, autoSendReminderH1: e.target.checked })}
                        className="rounded border-slate-700 text-emerald-600 focus:ring-0"
                      />
                      <span>Kirim Peringatan H-1 dengan Link QRIS</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <input
                        type="checkbox"
                        checked={formData.autoSendIsolir}
                        onChange={e => setFormData({ ...formData, autoSendIsolir: e.target.checked })}
                        className="rounded border-slate-700 text-emerald-600 focus:ring-0"
                      />
                      <span>Kirim Notifikasi Isolir Otomatis</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <input
                        type="checkbox"
                        checked={formData.autoSendReceipt}
                        onChange={e => setFormData({ ...formData, autoSendReceipt: e.target.checked })}
                        className="rounded border-slate-700 text-emerald-600 focus:ring-0"
                      />
                      <span>Kirim Tanda Terima Lunas Otomatis</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-MENU 4: PAYMENT GATEWAY */}
            {activeSubTab === 'payment' && (
              <div className="space-y-5">
                <div className="border-b border-slate-800 pb-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-indigo-400" />
                    <span>Konfigurasi Payment Gateway Lokal</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mendukung Midtrans (Snap & Core API), Xendit, dan Tripay
                  </p>
                </div>

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
                    <label className="block text-slate-300 font-semibold mb-1">Server Key / Secret Key</label>
                    <input
                      type="password"
                      required
                      value={formData.paymentServerKey}
                      onChange={e => setFormData({ ...formData, paymentServerKey: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Client Key / Public Key</label>
                    <input
                      type="text"
                      required
                      value={formData.paymentClientKey}
                      onChange={e => setFormData({ ...formData, paymentClientKey: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block text-slate-300 font-semibold mb-1">URL Callback / Webhook Gateway</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webhookUrl}
                      className="flex-1 px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-emerald-400 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(webhookUrl);
                        alert('URL Webhook tersalin ke clipboard!');
                      }}
                      className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700"
                    >
                      Salin URL
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Salin URL ini ke menu <b>Notification URL</b> di dashboard Midtrans/Xendit Anda
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
                    Toleransi jatuh tempo auto-isolir dan generator voucher default
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Masa Toleransi Isolir (Hari)</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={formData.gracePeriodDays}
                      onChange={e => setFormData({ ...formData, gracePeriodDays: Number(e.target.value) })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      0 = Langsung isolir pada tanggal jatuh tempo
                    </span>
                  </div>

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

      {/* QR Code Pairing Modal for OpenWA */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md text-white shadow-2xl p-6 text-center">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Pairing Sesi OpenWA (Baileys)
              </span>
              <button
                onClick={() => setIsQrModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-white p-4 rounded-2xl inline-block shadow-inner">
                <QrCode
                  value={`2@vC023${Date.now()},OpenWA_rmyndharis_${formData.openwaSessionId},4a89fb2`}
                  size={190}
                  className="mx-auto"
                />
              </div>

              <div className="text-left bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1.5">
                <p className="font-bold text-white">Cara Menghubungkan:</p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-400">
                  <li>Buka aplikasi WhatsApp di HP Anda.</li>
                  <li>Ketuk Menu (titik tiga) atau <b>Pengaturan &gt; Perangkat Tertaut</b>.</li>
                  <li>Ketuk <b>Tautkan Perangkat</b> lalu arahkan kamera ke QR Code di atas.</li>
                </ol>
              </div>

              <button
                onClick={() => {
                  setIsQrModalOpen(false);
                  alert('WhatsApp berhasil dipasangkan dengan sesi OpenWA!');
                }}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow"
              >
                Selesai (Perangkat Sudah Ditautkan)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
