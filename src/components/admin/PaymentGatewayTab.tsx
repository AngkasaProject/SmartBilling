import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink } from 'lucide-react';

interface PaymentEnvironment {
  provider: string;
  isProduction: boolean;
  serverKeyConfigured: boolean;
  clientKeyConfigured: boolean;
  appUrlConfigured: boolean;
  checkoutEnabled: boolean;
  webhookUrl: string;
}

interface ManualMethod {
  id: string;
  name: string;
  serviceName?: string;
  accountNumber?: string;
  instructions: string;
  enabled: boolean;
}

const initialMethods: ManualMethod[] = [
  { id: 'bank-transfer', name: 'Transfer Bank', serviceName: 'BRI', accountNumber: '090549609604', instructions: '', enabled: false },
  { id: 'dana', name: 'DANA', serviceName: 'DANA', accountNumber: '', instructions: '', enabled: false },
  { id: 'qris-manual', name: 'QRIS Manual', serviceName: 'QRIS', accountNumber: '', instructions: '', enabled: false },
];

export const PaymentGatewayTab: React.FC = () => {
  const [environment, setEnvironment] = useState<PaymentEnvironment | null>(null);
  const [error, setError] = useState('');
  const [methods, setMethods] = useState<ManualMethod[]>(initialMethods);
  const [timeoutMinutes, setTimeoutMinutes] = useState(60);
  const [savingManual, setSavingManual] = useState(false);
  const [manualMessage, setManualMessage] = useState('');

  useEffect(() => {
    Promise.all([fetch('/api/payment/config'), fetch('/api/payment/manual-options')])
      .then(async ([paymentResponse, manualResponse]) => {
        const [payment, manual] = await Promise.all([paymentResponse.json(), manualResponse.json()]);
        if (!paymentResponse.ok) throw new Error(payment.error || `HTTP ${paymentResponse.status}`);
        if (!manualResponse.ok) throw new Error(manual.error || `HTTP ${manualResponse.status}`);
        setEnvironment(payment);
        if (Array.isArray(manual.manualPaymentMethods)) {
          setMethods(manual.manualPaymentMethods.length ? manual.manualPaymentMethods : initialMethods);
        }
        setTimeoutMinutes(manual.manualTimeoutMinutes || 60);
      })
      .catch(fetchError => setError(fetchError instanceof Error ? fetchError.message : String(fetchError)));
  }, []);

  const saveManualOptions = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingManual(true);
    setError('');
    setManualMessage('');
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
      setManualMessage('Metode pembayaran manual berhasil disimpan.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingManual(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-400" /> Pembayaran Invoice
            </h2>
            <p className="mt-2 text-xs text-slate-400 max-w-2xl">
              Checkout pelanggan menggunakan Midtrans Snap. Kunci rahasia dan mode pembayaran hanya dikelola melalui environment server.
            </p>
          </div>
          {environment && (
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
              environment.checkoutEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            }`}>
              {environment.checkoutEnabled ? 'CHECKOUT AKTIF' : 'BELUM DIKONFIGURASI'}
            </span>
          )}
        </div>

        {error && <p role="alert" className="mt-4 p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-200">{error}</p>}
        {environment && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4">
              <p className="text-slate-400">Provider</p>
              <p className="mt-1 font-bold text-white">{environment.provider}</p>
            </div>
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4">
              <p className="text-slate-400">Mode</p>
              <p className={`mt-1 font-bold ${environment.isProduction ? 'text-emerald-300' : 'text-amber-300'}`}>
                {environment.isProduction ? 'Production' : 'Sandbox'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4">
              <p className="text-slate-400">Server key</p>
              <p className={`mt-1 font-bold ${environment.serverKeyConfigured ? 'text-emerald-300' : 'text-rose-300'}`}>
                {environment.serverKeyConfigured ? 'Tersedia di server' : 'MIDTRANS_SERVER_KEY belum diisi'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4">
              <p className="text-slate-400">APP_URL</p>
              <p className={`mt-1 font-bold ${environment.appUrlConfigured ? 'text-emerald-300' : 'text-rose-300'}`}>
                {environment.appUrlConfigured ? 'URL publik valid' : 'APP_URL belum valid'}
              </p>
            </div>
          </div>
        )}

        {!environment?.checkoutEnabled && (
          <div className="mt-5 p-4 rounded-xl bg-amber-950/30 border border-amber-500/25 text-xs text-amber-100 flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>Isi `APP_URL`, `MIDTRANS_SERVER_KEY`, dan `PAYMENT_GATEWAY=midtrans` pada environment server. Kredensial tidak dikelola di browser.</p>
          </div>
        )}

        {environment?.checkoutEnabled && (
          <div className="mt-5 p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/25 text-xs text-emerald-100 flex gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <p>Checkout pelanggan aktif. Invoice baru menjadi lunas sesudah notifikasi Midtrans tervalidasi.</p>
          </div>
        )}
      </section>

      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <h3 className="font-bold text-white">Konfigurasi notifikasi Midtrans</h3>
        <p className="text-xs text-slate-400">Atur URL berikut sebagai Payment Notification URL di dashboard Midtrans:</p>
        <code className="block break-all p-3 rounded-xl bg-slate-950 border border-slate-800 text-emerald-300 text-xs">
          {environment?.webhookUrl || 'Atur APP_URL di environment server untuk menampilkan URL callback'}
        </code>
        <a href="https://dashboard.midtrans.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-indigo-300 hover:text-white">
          Dashboard Midtrans <ExternalLink className="w-3 h-3" />
        </a>
      </section>

      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h2 className="text-lg font-black text-white">Pembayaran Manual & Persetujuan</h2>
        <p className="mt-2 text-xs text-slate-400">Aktifkan metode yang benar-benar diterima operator dan isi instruksi transfer. Pelanggan menerima kode bayar dan diarahkan ke WhatsApp operator; cocokkan transaksi sebelum menyetujui invoice atau mengaktifkan voucher.</p>
        <form onSubmit={saveManualOptions} className="mt-5 space-y-4">
          {methods.map((method, index) => (
            <div key={method.id} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 sm:grid-cols-[auto_1fr_1fr_1fr_2fr]">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={method.enabled} onChange={event => setMethods(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))} />
                Aktif
              </label>
              <label className="text-xs text-slate-300">Nama metode
                <input required maxLength={64} value={method.name} onChange={event => setMethods(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
              </label>
              <label className="text-xs text-slate-300">Nama layanan / bank
                <input required={method.enabled} maxLength={64} value={method.serviceName || ''} onChange={event => setMethods(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, serviceName: event.target.value } : item))} placeholder="Contoh: BRI" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
              </label>
              <label className="text-xs text-slate-300">Nomor rekening / akun
                <input required={method.enabled} maxLength={64} value={method.accountNumber || ''} onChange={event => setMethods(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, accountNumber: event.target.value } : item))} placeholder="Contoh: 090549609604" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-white" />
              </label>
              <label className="text-xs text-slate-300">Instruksi pembayaran pelanggan
                <textarea required={method.enabled} maxLength={1000} rows={2} value={method.instructions} onChange={event => setMethods(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, instructions: event.target.value } : item))} placeholder="Contoh: Transfer ke Bank ... nomor rekening ... atas nama ..." className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
              </label>
            </div>
          ))}
          <label className="block max-w-xs text-xs text-slate-300">Timeout pembayaran manual (menit)
            <input required type="number" min={1} max={1440} value={timeoutMinutes} onChange={event => setTimeoutMinutes(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
          </label>
          {manualMessage && <p role="status" className="text-xs text-emerald-300">{manualMessage}</p>}
          <button type="submit" disabled={savingManual} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {savingManual ? 'Menyimpan...' : 'Simpan Pembayaran Manual'}
          </button>
        </form>
      </section>
    </div>
  );
};
