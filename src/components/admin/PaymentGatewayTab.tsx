import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useToast } from '../ui/toast';

type GatewayProvider = 'none' | 'midtrans' | 'doku' | 'xendit' | 'tripay';
type GatewayChoice = 'midtrans' | 'doku' | 'custom';

interface PaymentEnvironment {
  provider: GatewayProvider;
  isProduction: boolean;
  serverKeyConfigured: boolean;
  clientKeyConfigured: boolean;
  dokuClientIdConfigured: boolean;
  dokuSecretKeyConfigured: boolean;
  xenditApiKeyConfigured: boolean;
  xenditCallbackTokenConfigured: boolean;
  tripayMerchantCode: string;
  tripayApiKeyConfigured: boolean;
  tripayPrivateKeyConfigured: boolean;
  tripayPaymentMethod: string;
  appUrlConfigured: boolean;
  webhookUrlConfigured: boolean;
  checkoutEnabled: boolean;
  webhookUrl: string;
}

interface ManualMethod {
  id: string;
  name: string;
  accountHolder?: string;
  serviceName?: string;
  accountNumber?: string;
  instructions: string;
  enabled: boolean;
}

const inputClass = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white';
const emptyManualMethod: ManualMethod = {
  id: '',
  name: '',
  accountHolder: '',
  serviceName: '',
  accountNumber: '',
  instructions: '',
  enabled: true,
};

export const PaymentGatewayTab: React.FC = () => {
  const { toast, confirm } = useToast();
  const [environment, setEnvironment] = useState<PaymentEnvironment | null>(null);
  const [choice, setChoice] = useState<GatewayChoice>('midtrans');
  const [disableAutomatic, setDisableAutomatic] = useState(false);
  const [customProvider, setCustomProvider] = useState<'xendit' | 'tripay'>('xendit');
  const [isProduction, setIsProduction] = useState(false);
  const [serverKey, setServerKey] = useState('');
  const [clientKey, setClientKey] = useState('');
  const [dokuClientId, setDokuClientId] = useState('');
  const [dokuSecretKey, setDokuSecretKey] = useState('');
  const [xenditApiKey, setXenditApiKey] = useState('');
  const [xenditCallbackToken, setXenditCallbackToken] = useState('');
  const [tripayMerchantCode, setTripayMerchantCode] = useState('');
  const [tripayApiKey, setTripayApiKey] = useState('');
  const [tripayPrivateKey, setTripayPrivateKey] = useState('');
  const [tripayPaymentMethod, setTripayPaymentMethod] = useState('QRIS');
  const [error, setError] = useState('');
  const [savingGateway, setSavingGateway] = useState(false);
  const [methods, setMethods] = useState<ManualMethod[]>([]);
  const [timeoutMinutes, setTimeoutMinutes] = useState(60);
  const [savingManual, setSavingManual] = useState(false);
  const [manualError, setManualError] = useState('');
  const [methodDialogOpen, setMethodDialogOpen] = useState(false);
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [methodDraft, setMethodDraft] = useState<ManualMethod>(emptyManualMethod);

  useEffect(() => {
    Promise.all([fetch('/api/payment/config'), fetch('/api/payment/manual-options')])
      .then(async ([paymentResponse, manualResponse]) => {
        const [payment, manual] = await Promise.all([paymentResponse.json(), manualResponse.json()]);
        if (!paymentResponse.ok) throw new Error(payment.error || `HTTP ${paymentResponse.status}`);
        if (!manualResponse.ok) throw new Error(manual.error || `HTTP ${manualResponse.status}`);
        setEnvironment(payment);
        setChoice(payment.provider === 'doku' ? 'doku' : payment.provider === 'xendit' || payment.provider === 'tripay' ? 'custom' : 'midtrans');
        setDisableAutomatic(payment.provider === 'none');
        if (payment.provider === 'xendit' || payment.provider === 'tripay') setCustomProvider(payment.provider);
        setIsProduction(Boolean(payment.isProduction));
        setTripayMerchantCode(payment.tripayMerchantCode || '');
        setTripayPaymentMethod(payment.tripayPaymentMethod || 'QRIS');
        if (Array.isArray(manual.manualPaymentMethods)) {
          setMethods(manual.manualPaymentMethods.map((method: ManualMethod) => ({
            ...method,
            accountHolder: method.accountHolder || method.serviceName || '',
          })));
        }
        setTimeoutMinutes(manual.manualTimeoutMinutes || 60);
      })
      .catch(fetchError => {
        const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
        setError(message);
        toast('Gagal memuat konfigurasi pembayaran', 'error', message);
      });
  }, []);

  const selectedProvider: GatewayProvider = disableAutomatic
    ? 'none'
    : choice === 'custom' ? customProvider : choice;

  const saveGateway = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingGateway(true);
    setError('');
    try {
      const response = await fetch('/api/payment/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          isProduction,
          ...(selectedProvider === 'midtrans' ? { serverKey, clientKey } : {}),
          ...(selectedProvider === 'doku' ? { dokuClientId, dokuSecretKey } : {}),
          ...(selectedProvider === 'xendit' ? { xenditApiKey, xenditCallbackToken } : {}),
          ...(selectedProvider === 'tripay' ? {
            tripayMerchantCode,
            tripayApiKey,
            tripayPrivateKey,
            tripayPaymentMethod,
          } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setEnvironment(result);
      setServerKey('');
      setClientKey('');
      setDokuClientId('');
      setDokuSecretKey('');
      setXenditApiKey('');
      setXenditCallbackToken('');
      setTripayApiKey('');
      setTripayPrivateKey('');
      toast(
        selectedProvider === 'none' ? 'Gateway otomatis dinonaktifkan' : 'Gateway otomatis berhasil disimpan',
        'success',
        selectedProvider === 'none'
          ? 'Metode pembayaran manual tetap tersedia.'
          : `Gateway ${selectedProvider.toUpperCase()} sekarang aktif.`,
      );
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
      toast('Gagal menyimpan gateway', 'error', message);
    } finally {
      setSavingGateway(false);
    }
  };

  const saveManualOptions = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingManual(true);
    setManualError('');
    try {
      const response = await fetch('/api/payment/manual-options', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualPaymentMethods: methods, manualTimeoutMinutes: timeoutMinutes }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setMethods(result.manualPaymentMethods);
      setTimeoutMinutes(result.manualTimeoutMinutes);
      const disabledCount = Array.isArray(result.disabledIncompleteMethodIds)
        ? result.disabledIncompleteMethodIds.length
        : 0;
      toast(
        disabledCount ? 'Pengaturan disimpan dengan penyesuaian' : 'Pengaturan pembayaran manual disimpan',
        disabledCount ? 'info' : 'success',
        disabledCount
          ? `${disabledCount} metode dinonaktifkan karena metode, nomor rekening/akun, atas nama, atau catatan belum lengkap.`
          : undefined,
      );
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setManualError(message);
      toast('Gagal menyimpan pengaturan pembayaran', 'error', message);
    } finally {
      setSavingManual(false);
    }
  };

  const persistManualMethods = async (nextMethods: ManualMethod[]) => {
    setSavingManual(true);
    setManualError('');
    try {
      const response = await fetch('/api/payment/manual-options', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualPaymentMethods: nextMethods, manualTimeoutMinutes: timeoutMinutes }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setMethods(result.manualPaymentMethods);
      setTimeoutMinutes(result.manualTimeoutMinutes);
      const disabledCount = Array.isArray(result.disabledIncompleteMethodIds)
        ? result.disabledIncompleteMethodIds.length
        : 0;
      toast(
        disabledCount ? 'Metode pembayaran disimpan dengan penyesuaian' : 'Metode pembayaran disimpan',
        disabledCount ? 'info' : 'success',
        disabledCount
          ? `${disabledCount} metode lama dinonaktifkan karena metode, nomor rekening/akun, atas nama, atau catatan belum lengkap. Edit metode tersebut untuk mengaktifkannya kembali.`
          : undefined,
      );
      return true;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setManualError(message);
      toast('Gagal menyimpan metode pembayaran', 'error', message);
      return false;
    } finally {
      setSavingManual(false);
    }
  };

  const openMethodDialog = (method?: ManualMethod) => {
    setManualError('');
    setEditingMethodId(method?.id || null);
    setMethodDraft(method ? { ...method } : { ...emptyManualMethod });
    setMethodDialogOpen(true);
  };

  const saveManualMethod = async (event: React.FormEvent) => {
    event.preventDefault();
    const method = {
      ...methodDraft,
      id: editingMethodId || `manual-${Date.now().toString(36)}`,
      name: methodDraft.name.trim(),
      accountHolder: methodDraft.accountHolder?.trim() || '',
      serviceName: undefined,
      accountNumber: methodDraft.accountNumber?.trim() || '',
      instructions: methodDraft.instructions.trim(),
    };
    const nextMethods = editingMethodId
      ? methods.map(item => item.id === editingMethodId ? method : item)
      : [...methods, method];
    if (await persistManualMethods(nextMethods)) setMethodDialogOpen(false);
  };

  const toggleManualMethod = async (method: ManualMethod) => {
    await persistManualMethods(methods.map(item =>
      item.id === method.id ? { ...item, enabled: !item.enabled } : item
    ));
  };

  const deleteManualMethod = async (method: ManualMethod) => {
    const accepted = await confirm(
      'Hapus metode pembayaran?',
      `Metode "${method.name}" akan dihapus dan tidak lagi tersedia untuk pelanggan.`,
      true,
    );
    if (!accepted) return;
    await persistManualMethods(methods.filter(item => item.id !== method.id));
  };

  const chooseCard = (nextChoice: GatewayChoice) => {
    setChoice(nextChoice);
    setDisableAutomatic(false);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" />
          <div>
            <h2 className="text-lg font-black text-white">Gateway Pembayaran Otomatis</h2>
            <p className="mt-1 text-xs text-slate-400">
              Pembayaran manual tetap tersedia. Gateway otomatis adalah addon: aktifkan maksimal satu, atau nonaktifkan semuanya.
            </p>
          </div>
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">{error}</p>}

        <form onSubmit={saveGateway} className="mt-5 space-y-5">
          <div className="grid gap-3 lg:grid-cols-3">
            {([
              { id: 'midtrans', title: 'Midtrans', tag: 'OPSI 1', description: 'Snap Pop-up & Core API. Cukup masukkan Server Key; Client Key opsional.' },
              { id: 'doku', title: 'DOKU Payment', tag: 'OPSI 2', description: 'DOKU Checkout. Cukup masukkan Client ID dan Secret Key.' },
              { id: 'custom', title: 'Custom Gateway', tag: 'OPSI 3', description: 'Adapter gateway tambahan seperti Xendit dan Tripay dengan kredensial khusus provider.' },
            ] as const).map(card => {
              const selected = !disableAutomatic && choice === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => chooseCard(card.id)}
                  aria-pressed={selected}
                  className={`min-h-40 rounded-2xl border p-5 text-left transition ${
                    selected
                      ? 'border-indigo-500 bg-indigo-950/40 ring-2 ring-indigo-500'
                      : 'border-slate-700 bg-slate-950/70 hover:border-slate-500'
                  }`}
                >
                  <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold ${
                    card.id === 'midtrans' ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                      : card.id === 'doku' ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  }`}>{card.tag}</span>
                  <span className="float-right mt-1 h-3.5 w-3.5 rounded-full border border-slate-500 text-center">
                    {selected && <span className="mx-auto mt-[3px] block h-1.5 w-1.5 rounded-full bg-indigo-300" />}
                  </span>
                  <span className="mt-3 block text-sm font-bold text-white">{card.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-400">{card.description}</span>
                  {selected && <span className="mt-3 block border-t border-indigo-400/20 pt-2 text-[11px] font-semibold text-indigo-300">Terpilih sebagai gateway otomatis aktif</span>}
                </button>
              );
            })}
          </div>

          <label className="flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={disableAutomatic}
              onChange={event => {
                setDisableAutomatic(event.target.checked);
              }}
              className="mt-0.5"
            />
            <span>
              <b>Nonaktifkan seluruh gateway otomatis</b>
              <span className="mt-1 block text-slate-400">Hanya gunakan metode pembayaran manual yang dikonfigurasi di bawah. Metode manual tetap aktif saat gateway otomatis dipilih.</span>
            </span>
          </label>

          {!disableAutomatic && (
            <>
              <div className="flex flex-wrap gap-4 text-xs text-slate-300">
                <label className="flex items-center gap-2">
                  <input type="radio" name="payment-mode" checked={!isProduction} onChange={() => setIsProduction(false)} />
                  Sandbox / Uji coba
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="payment-mode" checked={isProduction} onChange={() => setIsProduction(true)} />
                  Production / Live
                </label>
              </div>

              {choice === 'custom' && (
                <label className="block max-w-md text-xs font-semibold text-slate-300">
                  Provider Custom
                  <select value={customProvider} onChange={event => setCustomProvider(event.target.value as 'xendit' | 'tripay')} className={inputClass}>
                    <option value="xendit">Xendit</option>
                    <option value="tripay">Tripay</option>
                  </select>
                </label>
              )}

              {selectedProvider === 'midtrans' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-slate-300">Server Key {environment?.serverKeyConfigured && <span className="text-emerald-300">(tersimpan; kosongkan untuk mempertahankan)</span>}
                    <input type="password" autoComplete="new-password" value={serverKey} onChange={event => setServerKey(event.target.value)} placeholder={environment?.serverKeyConfigured ? 'Kredensial tersimpan' : 'Server Key'} className={inputClass} />
                  </label>
                  <label className="text-xs text-slate-300">Client Key (opsional)
                    <input type="password" autoComplete="new-password" value={clientKey} onChange={event => setClientKey(event.target.value)} placeholder={environment?.clientKeyConfigured ? 'Kredensial tersimpan' : 'Client Key'} className={inputClass} />
                  </label>
                </div>
              )}
              {selectedProvider === 'doku' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-slate-300">Client ID
                    <input type="text" autoComplete="off" value={dokuClientId} onChange={event => setDokuClientId(event.target.value)} placeholder={environment?.dokuClientIdConfigured ? 'Kredensial tersimpan' : 'Client ID'} className={inputClass} />
                  </label>
                  <label className="text-xs text-slate-300">Secret Key
                    <input type="password" autoComplete="new-password" value={dokuSecretKey} onChange={event => setDokuSecretKey(event.target.value)} placeholder={environment?.dokuSecretKeyConfigured ? 'Kredensial tersimpan' : 'Secret Key'} className={inputClass} />
                  </label>
                </div>
              )}
              {selectedProvider === 'xendit' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-slate-300">Xendit Secret API Key
                    <input type="password" autoComplete="new-password" value={xenditApiKey} onChange={event => setXenditApiKey(event.target.value)} placeholder={environment?.xenditApiKeyConfigured ? 'Kredensial tersimpan' : 'xnd_development_... atau xnd_production_...'} className={inputClass} />
                  </label>
                  <label className="text-xs text-slate-300">Xendit Callback Verification Token
                    <input type="password" autoComplete="new-password" value={xenditCallbackToken} onChange={event => setXenditCallbackToken(event.target.value)} placeholder={environment?.xenditCallbackTokenConfigured ? 'Kredensial tersimpan' : 'Callback verification token'} className={inputClass} />
                  </label>
                </div>
              )}
              {selectedProvider === 'tripay' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-slate-300">Merchant Code
                    <input type="text" value={tripayMerchantCode} onChange={event => setTripayMerchantCode(event.target.value)} placeholder="Merchant Code" className={inputClass} />
                  </label>
                  <label className="text-xs text-slate-300">API Key
                    <input type="password" autoComplete="new-password" value={tripayApiKey} onChange={event => setTripayApiKey(event.target.value)} placeholder={environment?.tripayApiKeyConfigured ? 'Kredensial tersimpan' : 'API Key'} className={inputClass} />
                  </label>
                  <label className="text-xs text-slate-300">Private Key
                    <input type="password" autoComplete="new-password" value={tripayPrivateKey} onChange={event => setTripayPrivateKey(event.target.value)} placeholder={environment?.tripayPrivateKeyConfigured ? 'Kredensial tersimpan' : 'Private Key'} className={inputClass} />
                  </label>
                  <label className="text-xs text-slate-300">Kode metode pembayaran Tripay
                    <input type="text" value={tripayPaymentMethod} onChange={event => setTripayPaymentMethod(event.target.value.toUpperCase())} placeholder="QRIS" className={inputClass} />
                  </label>
                </div>
              )}
            </>
          )}

          {environment?.webhookUrl && !disableAutomatic && (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs">
              <p className="font-bold text-white">Callback / Webhook URL</p>
              <code className="mt-2 block break-all text-emerald-300">{environment.webhookUrl}</code>
              {selectedProvider === 'midtrans' && <a href="https://dashboard.midtrans.com/" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-indigo-300">Dashboard Midtrans <ExternalLink className="h-3 w-3" /></a>}
              {selectedProvider === 'doku' && <a href="https://dashboard.doku.com/" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-indigo-300">Dashboard DOKU <ExternalLink className="h-3 w-3" /></a>}
              {selectedProvider === 'xendit' && <p className="mt-2 text-slate-400">Atur callback ini pada Xendit dan salin Verification Token ke kolom konfigurasi.</p>}
              {selectedProvider === 'tripay' && <p className="mt-2 text-slate-400">Daftarkan URL ini sebagai Callback URL pada dashboard Tripay.</p>}
            </div>
          )}

          {(!environment?.appUrlConfigured && !disableAutomatic) && (
            <p className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-950/30 p-3 text-xs text-amber-100">
              <AlertCircle className="h-4 w-4 shrink-0" /> Atur APP_URL publik HTTPS di environment server sebagai alamat Portal untuk tautan dan redirect pelanggan.
            </p>
          )}
          {environment?.appUrlConfigured && !environment.webhookUrlConfigured && !disableAutomatic && (
            <p className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-950/30 p-3 text-xs text-amber-100">
              <AlertCircle className="h-4 w-4 shrink-0" /> Atur PAYMENT_WEBHOOK_URL ke endpoint publik SmartBilling, misalnya https://billing.domain-anda/api/payment/webhook. Gateway otomatis nonaktif sampai URL webhook dikonfigurasi.
            </p>
          )}
          {environment?.checkoutEnabled && !disableAutomatic && (
            <p className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Checkout {environment.provider.toUpperCase()} aktif. Pembayaran manual tetap tersedia.</p>
          )}
          <button type="submit" disabled={savingGateway} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {savingGateway ? 'Menyimpan...' : disableAutomatic ? 'Nonaktifkan Gateway Otomatis' : 'Simpan & Aktifkan Addon Ini'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
        <h2 className="text-lg font-black text-white">Pembayaran Manual (Selalu Tersedia)</h2>
        <p className="mt-2 text-xs text-slate-400">Transfer bank, e-wallet, dan QRIS statis tetap tersedia sebagai metode dasar meskipun gateway otomatis aktif atau dinonaktifkan. Operator memverifikasi pembayaran sebelum menyetujui invoice atau mengaktifkan voucher.</p>
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">Metode tersimpan</h3>
              <p className="mt-1 text-xs text-slate-400">{methods.length} dari 8 metode</p>
            </div>
            <button
              type="button"
              onClick={() => openMethodDialog()}
              disabled={savingManual || methods.length >= 8}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Tambah pembayaran
            </button>
          </div>

          {methods.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-6 text-center">
              <CreditCard className="mx-auto h-6 w-6 text-slate-500" />
              <p className="mt-2 text-sm font-semibold text-slate-300">Belum ada metode pembayaran manual</p>
              <p className="mt-1 text-xs text-slate-500">Tambahkan rekening bank, e-wallet, QRIS statis, atau cara pembayaran lainnya.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {methods.map(method => (
                <article key={method.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-sm font-bold text-white">{method.name}</h4>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          method.enabled
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}>{method.enabled ? 'Aktif' : 'Nonaktif'}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => openMethodDialog(method)} disabled={savingManual} aria-label={`Edit ${method.name}`} title="Edit metode" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => void deleteManualMethod(method)} disabled={savingManual} aria-label={`Hapus ${method.name}`} title="Hapus metode" className="rounded-lg p-2 text-slate-400 hover:bg-rose-950 hover:text-rose-300 disabled:opacity-50">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 break-all text-sm font-medium text-slate-200">{method.accountNumber || 'Nomor rekening/akun belum diisi'}</p>
                  {method.accountHolder && <p className="mt-1 text-xs text-slate-400">Atas nama: <span className="font-semibold text-slate-300">{method.accountHolder}</span></p>}
                  {method.instructions && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500">{method.instructions}</p>}
                  <button
                    type="button"
                    onClick={() => void toggleManualMethod(method)}
                    disabled={savingManual}
                    className={`mt-4 text-xs font-semibold disabled:opacity-50 ${method.enabled ? 'text-amber-300 hover:text-amber-200' : 'text-emerald-300 hover:text-emerald-200'}`}
                  >
                    {method.enabled ? 'Nonaktifkan metode' : 'Aktifkan metode'}
                  </button>
                </article>
              ))}
            </div>
          )}

          <form onSubmit={saveManualOptions} className="flex flex-wrap items-end gap-3 border-t border-slate-800 pt-4">
            <label className="block w-full max-w-xs text-xs text-slate-300">Batas waktu pembayaran manual (menit)
              <input required type="number" min={1} max={1440} value={timeoutMinutes} onChange={event => setTimeoutMinutes(Number(event.target.value))} className={inputClass} />
            </label>
            <button type="submit" disabled={savingManual} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50">
              {savingManual ? 'Menyimpan...' : 'Simpan pengaturan'}
            </button>
          </form>
          {manualError && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">{manualError}</p>}
        </div>
      </section>

      {methodDialogOpen && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !savingManual) setMethodDialogOpen(false);
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="manual-method-dialog-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="manual-method-dialog-title" className="text-lg font-bold text-white">{editingMethodId ? 'Edit metode pembayaran' : 'Tambah metode pembayaran'}</h2>
                <p className="mt-1 text-xs text-slate-400">Masukkan detail yang akan ditampilkan kepada pelanggan.</p>
              </div>
              <button type="button" onClick={() => setMethodDialogOpen(false)} disabled={savingManual} aria-label="Tutup dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={saveManualMethod} className="mt-5 space-y-4">
              <label className="block text-xs font-medium text-slate-300">Metode
                <input required maxLength={64} autoFocus value={methodDraft.name} onChange={event => setMethodDraft(current => ({ ...current, name: event.target.value }))} placeholder="Contoh: BCA, DANA, QRIS" className={inputClass} />
              </label>
              <label className="block text-xs font-medium text-slate-300">Nomor / rekening
                <input required maxLength={500} value={methodDraft.accountNumber || ''} onChange={event => setMethodDraft(current => ({ ...current, accountNumber: event.target.value }))} placeholder="Nomor rekening, nomor e-wallet, atau URL QRIS" className={inputClass} />
              </label>
              <label className="block text-xs font-medium text-slate-300">Atas nama
                <input required maxLength={100} value={methodDraft.accountHolder || ''} onChange={event => setMethodDraft(current => ({ ...current, accountHolder: event.target.value }))} placeholder="Nama pemilik rekening/akun" className={inputClass} />
              </label>
              <label className="block text-xs font-medium text-slate-300">Catatan
                <textarea required maxLength={1000} rows={4} value={methodDraft.instructions} onChange={event => setMethodDraft(current => ({ ...current, instructions: event.target.value }))} placeholder="Contoh: Transfer sesuai nominal, lalu kirim bukti pembayaran." className={inputClass} />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={methodDraft.enabled} onChange={event => setMethodDraft(current => ({ ...current, enabled: event.target.checked }))} />
                Aktifkan metode setelah disimpan
              </label>
              {manualError && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">{manualError}</p>}
              <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
                <button type="button" onClick={() => setMethodDialogOpen(false)} disabled={savingManual} className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50">Batal</button>
                <button type="submit" disabled={savingManual} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
                  {savingManual ? 'Menyimpan...' : editingMethodId ? 'Simpan perubahan' : 'Tambah metode'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
