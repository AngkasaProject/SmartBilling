import React, { useEffect, useState } from 'react';
import { AppSettings } from '../../types';
import { StorageService } from '../../services/storage';
import { useToast } from '../ui/toast';
import {
  Activity,
  Building,
  Check,
  Copy,
  Database,
  Download,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  Sliders,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';

interface Props {
  settings: AppSettings;
  onRefreshSettings: () => void;
}

type SettingsSection = 'business' | 'billing' | 'reminders' | 'database' | 'security';

interface DatabaseInfo {
  dbPath: string;
  fileSizeKb: number | string;
  tables?: Array<{ name: string; count: number }>;
}

interface AdminUser {
  id: string;
  username: string;
  createdAt: string;
}

const settingsSections: Array<{ id: SettingsSection; label: string; description: string; icon: React.ElementType }> = [
  { id: 'business', label: 'Profil bisnis', description: 'Nama dan kontak pada invoice', icon: Building },
  { id: 'billing', label: 'Billing & voucher', description: 'Format kode voucher', icon: Sliders },
  { id: 'reminders', label: 'Pengingat otomatis', description: 'Jadwal notifikasi WhatsApp', icon: Activity },
  { id: 'database', label: 'Database & backup', description: 'Status dan pencadangan data', icon: Database },
  { id: 'security', label: 'Admin & keamanan', description: 'Akun dan kunci enkripsi', icon: ShieldCheck },
];

const inputClass = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';
const cardClass = 'rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6';

async function readJson<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result as T;
}

export const SettingsTab: React.FC<Props> = ({ settings, onRefreshSettings }) => {
  const { toast, confirm } = useToast();
  const [section, setSection] = useState<SettingsSection>('business');
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [databaseInfo, setDatabaseInfo] = useState<DatabaseInfo | null>(null);
  const [loadingDatabase, setLoadingDatabase] = useState(false);
  const [optimizingDatabase, setOptimizingDatabase] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loadingSecurity, setLoadingSecurity] = useState(false);
  const [envLoginConfigured, setEnvLoginConfigured] = useState(false);
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [encryptionKeySource, setEncryptionKeySource] = useState<'environment' | 'generated' | ''>('');
  const [portalSessionSecretConfigured, setPortalSessionSecretConfigured] = useState(false);
  const [portalSessionSecret, setPortalSessionSecret] = useState('');
  const [showPortalSessionSecret, setShowPortalSessionSecret] = useState(false);
  const [loadingPortalSessionSecret, setLoadingPortalSessionSecret] = useState(false);

  useEffect(() => setFormData(settings), [settings]);

  const loadDatabaseInfo = async () => {
    setLoadingDatabase(true);
    try {
      const stats = await StorageService.getDbStats();
      setDatabaseInfo(stats);
    } catch (error) {
      toast('Gagal memuat status database', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingDatabase(false);
    }
  };

  const loadSecurityInfo = async () => {
    setLoadingSecurity(true);
    try {
      const [usersResponse, keyResponse, authResponse, portalSessionResponse] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/security/encryption-key'),
        fetch('/api/auth/status'),
        fetch('/api/security/portal-session-secret'),
      ]);
      const [users, key, auth, portalSession] = await Promise.all([
        readJson<{ users: AdminUser[] }>(usersResponse),
        readJson<{ key: string; source: 'environment' | 'generated' }>(keyResponse),
        readJson<{ envLoginConfigured: boolean }>(authResponse),
        readJson<{ configured: boolean }>(portalSessionResponse),
      ]);
      setAdminUsers(users.users);
      setEncryptionKey(key.key);
      setEncryptionKeySource(key.source);
      setEnvLoginConfigured(auth.envLoginConfigured);
      setPortalSessionSecretConfigured(portalSession.configured);
    } catch (error) {
      toast('Gagal memuat pengaturan keamanan', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingSecurity(false);
    }
  };

  useEffect(() => {
    void loadDatabaseInfo();
    void loadSecurityInfo();
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setFormData(current => ({ ...current, [key]: value }));
  };

  const hasChanges = JSON.stringify({ ...formData, updatedAt: settings.updatedAt }) !== JSON.stringify(settings);

  const saveSettings = async () => {
    if (!formData.appName.trim() || !formData.brandName.trim()) {
      toast('Nama aplikasi dan nama brand wajib diisi', 'error');
      return;
    }
    if (!/^[A-Z0-9-]{0,12}$/i.test(formData.defaultVoucherPrefix)) {
      toast('Format prefix voucher tidak valid', 'error', 'Gunakan maksimal 12 huruf, angka, atau tanda hubung.');
      return;
    }
    if (!Number.isInteger(formData.voucherLength) || formData.voucherLength < 4 || formData.voucherLength > 8) {
      toast('Panjang kode voucher tidak valid', 'error', 'Pilih jumlah angka antara 4 sampai 8.');
      return;
    }
    setSaving(true);
    try {
      const saved = await StorageService.saveSettings(formData);
      setFormData(saved);
      onRefreshSettings();
      toast('Pengaturan berhasil disimpan', 'success');
    } catch (error) {
      toast('Gagal menyimpan pengaturan', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const addAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newAdminUsername, password: newAdminPassword }),
      });
      await readJson(response);
      setNewAdminUsername('');
      setNewAdminPassword('');
      toast('Akun admin berhasil ditambahkan', 'success');
      await loadSecurityInfo();
    } catch (error) {
      toast('Gagal menambahkan akun admin', 'error', error instanceof Error ? error.message : String(error));
    }
  };

  const deleteAdmin = async (user: AdminUser) => {
    if (!await confirm('Hapus akun admin?', `Akun ${user.username} akan dihapus dan sesi aktifnya dicabut.`, true)) return;
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      await readJson(response);
      toast('Akun admin dihapus', 'success', user.username);
      await loadSecurityInfo();
    } catch (error) {
      toast('Gagal menghapus akun admin', 'error', error instanceof Error ? error.message : String(error));
    }
  };

  const rotateEncryptionKey = async () => {
    if (!await confirm(
      'Buat ulang kunci enkripsi?',
      'Kredensial tersimpan akan dienkripsi ulang. Simpan kunci baru untuk pemulihan database dari backup.',
      true,
    )) return;
    try {
      const response = await fetch('/api/security/encryption-key/rotate', { method: 'POST' });
      const result = await readJson<{ key: string; source: 'environment' | 'generated' }>(response);
      setEncryptionKey(result.key);
      setEncryptionKeySource(result.source);
      toast('Kunci enkripsi berhasil diperbarui', 'success');
    } catch (error) {
      toast('Gagal memperbarui kunci enkripsi', 'error', error instanceof Error ? error.message : String(error));
    }
  };

  const optimizeDatabase = async () => {
    setOptimizingDatabase(true);
    try {
      const result = await StorageService.vacuumDatabase();
      toast('Database berhasil dioptimalkan', 'success', result.message);
      await loadDatabaseInfo();
    } catch (error) {
      toast('Gagal mengoptimalkan database', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setOptimizingDatabase(false);
    }
  };

  const copyEncryptionKey = async () => {
    try {
      await navigator.clipboard.writeText(encryptionKey);
      toast('Kunci disalin ke clipboard', 'success');
    } catch (error) {
      toast('Gagal menyalin kunci', 'error', error instanceof Error ? error.message : String(error));
    }
  };

  const revealPortalSessionSecret = async () => {
    setLoadingPortalSessionSecret(true);
    try {
      const response = await fetch('/api/security/portal-session-secret?reveal=true');
      const result = await readJson<{ configured: boolean; secret: string | null }>(response);
      setPortalSessionSecret(result.secret || '');
      setShowPortalSessionSecret(Boolean(result.secret));
      setPortalSessionSecretConfigured(result.configured);
      if (!result.secret) toast('Secret sesi portal belum dibuat', 'info');
    } catch (error) {
      toast('Gagal memuat secret sesi portal', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingPortalSessionSecret(false);
    }
  };

  const generatePortalSessionSecret = async () => {
    if (portalSessionSecretConfigured && !await confirm(
      'Buat ulang secret sesi portal?',
      'Portal harus diperbarui dengan secret baru. Sesi pelanggan yang sudah ada tidak akan berlaku lagi.',
      true,
    )) return;
    setLoadingPortalSessionSecret(true);
    try {
      const response = await fetch('/api/security/portal-session-secret', { method: 'POST' });
      const result = await readJson<{ configured: boolean; secret: string }>(response);
      setPortalSessionSecret(result.secret);
      setPortalSessionSecretConfigured(result.configured);
      setShowPortalSessionSecret(true);
      toast(
        portalSessionSecretConfigured ? 'Secret sesi portal diperbarui' : 'Secret sesi portal berhasil dibuat',
        'success',
        'Portal internal langsung menggunakan secret tersimpan. Salin ke PORTAL_SESSION_SECRET hanya jika aplikasi Portal terpisah masih digunakan.',
      );
    } catch (error) {
      toast('Gagal membuat secret sesi portal', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingPortalSessionSecret(false);
    }
  };

  const copyPortalSessionSecret = async () => {
    try {
      let secret = portalSessionSecret;
      if (!secret) {
        const response = await fetch('/api/security/portal-session-secret?reveal=true');
        const result = await readJson<{ configured: boolean; secret: string | null }>(response);
        secret = result.secret || '';
        setPortalSessionSecret(secret);
        setPortalSessionSecretConfigured(result.configured);
      }
      if (!secret) throw new Error('Secret belum dibuat');
      await navigator.clipboard.writeText(secret);
      toast('Secret sesi portal disalin', 'success');
    } catch (error) {
      toast('Gagal menyalin secret sesi portal', 'error', error instanceof Error ? error.message : String(error));
    }
  };

  const sampleVoucherCode = `${formData.defaultVoucherPrefix || ''}${'7'.repeat(Math.max(4, Math.min(8, formData.voucherLength || 5)))}`;

  return (
    <div className="space-y-6">
      <section className={`${cardClass} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Preferensi aplikasi</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">Pengaturan</h1>
          <p className="mt-1 text-sm text-muted-foreground">Atur profil bisnis, format voucher, pengingat, backup, dan keamanan. Konfigurasi router, WhatsApp, dan gateway tersedia di menu masing-masing.</p>
        </div>
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={!hasChanges || saving}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Activity className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Menyimpan...' : 'Simpan perubahan'}
        </button>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav aria-label="Bagian pengaturan" className={`${cardClass} space-y-1 p-2`}>
          {settingsSections.map(item => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block text-xs font-bold">{item.label}</span>
                  <span className={`mt-1 block text-[10px] ${active ? 'opacity-80' : ''}`}>{item.description}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className={`${cardClass} min-w-0 space-y-6`}>
          {section === 'business' && (
            <>
              <header className="border-b border-border pb-4">
                <h2 className="text-lg font-bold">Profil bisnis & tampilan invoice</h2>
                <p className="mt-1 text-sm text-muted-foreground">Identitas ini ditampilkan pada dashboard, invoice, dan portal pelanggan.</p>
              </header>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold">Nama aplikasi
                  <input required maxLength={80} value={formData.appName} onChange={event => updateSetting('appName', event.target.value)} className={inputClass} />
                </label>
                <label className="text-xs font-semibold">Nama brand
                  <input required maxLength={80} value={formData.brandName} onChange={event => updateSetting('brandName', event.target.value)} className={inputClass} />
                </label>
                <label className="text-xs font-semibold">Nama perusahaan
                  <input maxLength={120} value={formData.companyName} onChange={event => updateSetting('companyName', event.target.value)} className={inputClass} />
                </label>
                <label className="text-xs font-semibold">Tagline
                  <input maxLength={120} value={formData.tagline} onChange={event => updateSetting('tagline', event.target.value)} className={inputClass} />
                </label>
                <label className="text-xs font-semibold">Simbol mata uang
                  <input required maxLength={5} value={formData.currencySymbol} onChange={event => updateSetting('currencySymbol', event.target.value)} className={inputClass} />
                </label>
                <label className="text-xs font-semibold">Zona waktu
                  <select value={formData.timezone} onChange={event => updateSetting('timezone', event.target.value)} className={inputClass}>
                    <option value="Asia/Jakarta">WIB — Asia/Jakarta</option>
                    <option value="Asia/Makassar">WITA — Asia/Makassar</option>
                    <option value="Asia/Jayapura">WIT — Asia/Jayapura</option>
                    <option value="UTC">UTC</option>
                  </select>
                  <span className="mt-1 block font-normal text-muted-foreground">Dipakai untuk menampilkan waktu batas pembayaran pada notifikasi.</span>
                </label>
                <label className="text-xs font-semibold">Format jam
                  <select value={formData.timeFormat} onChange={event => updateSetting('timeFormat', event.target.value as AppSettings['timeFormat'])} className={inputClass}>
                    <option value="24h">24 jam (13.45)</option>
                    <option value="12h">12 jam (01.45 PM)</option>
                  </select>
                  <span className="mt-1 block font-normal text-muted-foreground">Format waktu pada pesan WhatsApp pembayaran.</span>
                </label>
                <label className="text-xs font-semibold"><span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Nomor kontak</span>
                  <input type="tel" maxLength={32} value={formData.phoneContact} onChange={event => updateSetting('phoneContact', event.target.value)} className={inputClass} />
                </label>
                <label className="text-xs font-semibold"><span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email kontak</span>
                  <input type="email" maxLength={254} value={formData.emailContact} onChange={event => updateSetting('emailContact', event.target.value)} className={inputClass} />
                </label>
                <label className="text-xs font-semibold sm:col-span-2"><span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Alamat kantor</span>
                  <textarea rows={3} maxLength={300} value={formData.officeAddress} onChange={event => updateSetting('officeAddress', event.target.value)} className={inputClass} />
                </label>
              </div>
              <div className="rounded-xl border border-border bg-muted/60 p-4 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Pratinjau nama invoice</p>
                <p className="mt-1">{formData.companyName || formData.brandName || formData.appName}{formData.tagline ? ` · ${formData.tagline}` : ''}</p>
                <p className="mt-1">{[formData.phoneContact, formData.emailContact, formData.officeAddress].filter(Boolean).join(' · ') || 'Tambahkan kontak untuk ditampilkan pada invoice.'}</p>
              </div>
            </>
          )}

          {section === 'billing' && (
            <>
              <header className="border-b border-border pb-4">
                <h2 className="text-lg font-bold">Format kode voucher baru</h2>
                <p className="mt-1 text-sm text-muted-foreground">Dipakai untuk pesanan voucher portal yang dibuat setelah pengaturan disimpan. Kode yang sudah diterbitkan tidak berubah.</p>
              </header>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold">Prefix kode
                  <input maxLength={12} pattern="[A-Za-z0-9-]*" value={formData.defaultVoucherPrefix} onChange={event => updateSetting('defaultVoucherPrefix', event.target.value.toUpperCase())} className={`${inputClass} font-mono`} />
                  <span className="mt-1 block font-normal text-muted-foreground">Huruf, angka, dan tanda hubung; boleh dikosongkan.</span>
                </label>
                <label className="text-xs font-semibold">Panjang angka acak
                  <input type="number" required min={4} max={8} value={formData.voucherLength} onChange={event => updateSetting('voucherLength', Number(event.target.value))} className={`${inputClass} font-mono`} />
                  <span className="mt-1 block font-normal text-muted-foreground">Pilih antara 4 sampai 8 digit.</span>
                </label>
              </div>
              <div className="rounded-xl border border-border bg-muted/60 p-4">
                <p className="text-xs font-semibold text-muted-foreground">Contoh kode yang akan diterbitkan</p>
                <code className="mt-2 block text-lg font-bold tracking-wider text-primary">{sampleVoucherCode}</code>
              </div>
              <section className="space-y-3 border-t border-border pt-5">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold"><KeyRound className="h-4 w-4 text-primary" /> Secret sesi SmartBilling Portal</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Secret terenkripsi ini digunakan untuk menandatangani sesi Portal internal. Salin ke <code>PORTAL_SESSION_SECRET</code> hanya jika aplikasi Portal terpisah masih digunakan.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type={showPortalSessionSecret ? 'text' : 'password'}
                    readOnly
                    value={portalSessionSecret}
                    placeholder={portalSessionSecretConfigured ? 'Secret tersimpan secara aman' : 'Secret belum dibuat'}
                    aria-label="Secret sesi portal"
                    className={`${inputClass} min-w-0 flex-1 font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => showPortalSessionSecret ? setShowPortalSessionSecret(false) : void revealPortalSessionSecret()}
                    disabled={!portalSessionSecretConfigured || loadingPortalSessionSecret}
                    className="rounded-xl border border-border bg-secondary px-4 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50"
                  >
                    {loadingPortalSessionSecret ? 'Memuat...' : showPortalSessionSecret ? 'Sembunyikan' : 'Tampilkan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyPortalSessionSecret()}
                    disabled={!portalSessionSecretConfigured || loadingPortalSessionSecret}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50"
                  >
                    <Copy className="h-4 w-4" /> Salin
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Status: {portalSessionSecretConfigured ? 'secret sudah dibuat' : 'belum dikonfigurasi'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void generatePortalSessionSecret()}
                    disabled={loadingPortalSessionSecret}
                    className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    {portalSessionSecretConfigured ? 'Buat ulang secret' : 'Generate secret'}
                  </button>
                </div>
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                  Secret ini berbeda dari secret tautan pembayaran. Jangan bagikan atau masukkan ke variabel <code>NEXT_PUBLIC_*</code>. Jika dibuat ulang, samakan nilainya di Billing dan Portal.
                </p>
              </section>
            </>
          )}

          {section === 'reminders' && (
            <>
              <header className="border-b border-border pb-4">
                <h2 className="text-lg font-bold">Notifikasi tagihan otomatis</h2>
                <p className="mt-1 text-sm text-muted-foreground">Atur pengingat jatuh tempo serta pemberitahuan invoice dibatalkan setelah masa tenggang.</p>
              </header>
              <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-4">
                <input type="checkbox" checked={formData.autoSendReminderH1} onChange={event => updateSetting('autoSendReminderH1', event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                <span>
                  <span className="block text-sm font-semibold">Aktifkan notifikasi invoice otomatis</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Kirim pengingat H-1 dan pemberitahuan WhatsApp saat invoice dibatalkan setelah 7 hari masa tenggang. Secret PPPoE tetap tidak diubah otomatis.</span>
                </span>
              </label>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-foreground">
                Pastikan provider dan kredensial WhatsApp telah diatur di menu WhatsApp API. Tautan pelanggan memerlukan URL aplikasi publik yang benar.
              </div>
            </>
          )}

          {section === 'database' && (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-bold">Database & backup</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Pantau ukuran SQLite, simpan backup, atau optimalkan ruang database.</p>
                </div>
                <button type="button" onClick={() => void loadDatabaseInfo()} disabled={loadingDatabase} className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                  {loadingDatabase ? 'Memuat...' : 'Muat ulang'}
                </button>
              </header>
              {databaseInfo ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border bg-background p-4">
                      <p className="text-xs text-muted-foreground">Ukuran database</p>
                      <p className="mt-1 text-xl font-bold">{Number(databaseInfo.fileSizeKb).toLocaleString('id-ID')} KB</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-4">
                      <p className="text-xs text-muted-foreground">Lokasi penyimpanan</p>
                      <p className="mt-1 break-all font-mono text-xs">{databaseInfo.dbPath}</p>
                    </div>
                  </div>
                  {databaseInfo.tables?.length ? (
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Jumlah data per tabel</h3>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {databaseInfo.tables.map(table => (
                          <div key={table.name} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs">
                            <span className="truncate text-muted-foreground">{table.name}</span>
                            <span className="ml-3 font-bold">{Number(table.count).toLocaleString('id-ID')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : <p className="text-sm text-muted-foreground">{loadingDatabase ? 'Memuat status database...' : 'Statistik database belum tersedia.'}</p>}
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <a href="/api/db/backup" download className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90">
                  <Download className="h-4 w-4" /> Unduh backup SQLite
                </a>
                <button type="button" onClick={() => void optimizeDatabase()} disabled={optimizingDatabase} className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5 text-xs font-bold hover:bg-muted disabled:opacity-50">
                  <Zap className={`h-4 w-4 ${optimizingDatabase ? 'animate-spin' : ''}`} />
                  {optimizingDatabase ? 'Mengoptimalkan...' : 'Optimalkan database'}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Simpan backup file database dan kunci enkripsi di lokasi aman yang terpisah dari server.</p>
            </>
          )}

          {section === 'security' && (
            <>
              <header className="border-b border-border pb-4">
                <h2 className="text-lg font-bold">Akun admin & kunci enkripsi</h2>
                <p className="mt-1 text-sm text-muted-foreground">Kelola akses dashboard dan kunci yang melindungi kredensial router tersimpan.</p>
              </header>
              {envLoginConfigured && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                  Login utama dikelola melalui ADMIN_USERNAME dan ADMIN_PASSWORD pada environment server.
                </p>
              )}
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4 text-primary" /> Akun admin tambahan</h3>
                <form onSubmit={addAdmin} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input required minLength={3} maxLength={64} value={newAdminUsername} onChange={event => setNewAdminUsername(event.target.value)} placeholder="Username" className={inputClass} />
                  <input required type="password" minLength={12} maxLength={256} value={newAdminPassword} onChange={event => setNewAdminPassword(event.target.value)} placeholder="Password (minimal 12 karakter)" className={inputClass} />
                  <button type="submit" disabled={newAdminUsername.trim().length < 3 || newAdminPassword.length < 12} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">Tambah admin</button>
                </form>
                {loadingSecurity ? <p className="text-xs text-muted-foreground">Memuat daftar admin...</p> : (
                  <div className="space-y-2">
                    {adminUsers.map(user => (
                      <div key={user.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                        <div>
                          <p className="text-sm font-semibold">{user.username}</p>
                          <p className="text-[10px] text-muted-foreground">Dibuat {new Date(user.createdAt).toLocaleString('id-ID')}</p>
                        </div>
                        <button type="button" onClick={() => void deleteAdmin(user)} aria-label={`Hapus admin ${user.username}`} className="rounded-lg p-2 text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {!adminUsers.length && <p className="text-xs text-muted-foreground">Tidak ada akun admin lokal yang tercatat.</p>}
                  </div>
                )}
              </section>
              <section className="space-y-3 border-t border-border pt-5">
                <h3 className="flex items-center gap-2 text-sm font-bold"><KeyRound className="h-4 w-4 text-amber-500" /> Kunci enkripsi aplikasi</h3>
                <p className="text-xs text-muted-foreground">Cadangkan kunci ini bersama database untuk memulihkan kredensial terenkripsi.</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input type="password" readOnly value={encryptionKey} aria-label="Kunci enkripsi" className={`${inputClass} min-w-0 flex-1 font-mono`} />
                  <button type="button" disabled={!encryptionKey} onClick={() => void copyEncryptionKey()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50">
                    <Copy className="h-4 w-4" /> Salin
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Sumber: {encryptionKeySource === 'environment' ? 'APP_ENCRYPTION_KEY (environment)' : 'data/router-secrets.key'}</p>
                  <button type="button" disabled={encryptionKeySource === 'environment'} onClick={() => void rotateEncryptionKey()} className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">
                    Buat ulang kunci
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {section !== 'database' && section !== 'security' && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={!hasChanges || saving}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : <><Check className="h-4 w-4" /> Simpan bagian ini</>}
          </button>
        </div>
      )}
    </div>
  );
};
