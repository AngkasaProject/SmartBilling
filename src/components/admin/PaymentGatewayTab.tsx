import React, { useState } from 'react';
import { PaymentGatewayConfig, Invoice } from '../../types';
import { StorageService } from '../../services/storage';
import {
  CreditCard,
  QrCode as QrIcon,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Copy,
  Check,
  ArrowRight,
  ExternalLink,
  Layers,
  Settings,
  AlertCircle
} from 'lucide-react';

interface Props {
  invoices: Invoice[];
  paymentConfig: PaymentGatewayConfig;
  onRefreshData: () => void;
}

export const PaymentGatewayTab: React.FC<Props> = ({
  invoices,
  paymentConfig,
  onRefreshData,
}) => {
  const [config, setConfig] = useState<PaymentGatewayConfig>(paymentConfig);
  const [saved, setSaved] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Webhook Simulator state
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(unpaidInvoices[0]?.id || '');
  const [simulatedMethod, setSimulatedMethod] = useState('QRIS Instant (GoPay / BCA)');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string | null>(null);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    StorageService.savePaymentConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onRefreshData();
  };

  const handleSimulateWebhook = () => {
    if (!selectedInvoiceId) {
      alert('Pilih invoice yang belum lunas terlebih dahulu!');
      return;
    }

    setIsSimulating(true);
    setSimulationLog(null);

    setTimeout(() => {
      const result = StorageService.settleInvoice(
        selectedInvoiceId,
        simulatedMethod.split(' ')[0],
        simulatedMethod
      );

      setIsSimulating(false);
      if (result.success) {
        setSimulationLog(
          `✅ [WEBHOOK 200 OK] Pembayaran Invoice #${result.invoice?.invoiceNumber} (${result.invoice?.customerName}) sebesar Rp ${result.invoice?.totalAmount.toLocaleString('id-ID')} diverifikasi via ${simulatedMethod}. Masa aktif otomatis diperpanjang hingga ${result.customer?.expiredDate}. Isolir MikroTik telah dibuka.`
        );
      } else {
        setSimulationLog(`❌ Gagal: ${result.message}`);
      }
      onRefreshData();
    }, 800);
  };

  const webhookEndpoint = `${window.location.origin}/api/payment/webhook`;

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookEndpoint);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Gateway Setup & Webhook Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gateway Credentials Setup */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-400" />
              <span>Konfigurasi Payment Gateway Lokal</span>
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
              {config.isProduction ? 'PRODUCTION' : 'SANDBOX MODE'}
            </span>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Provider Payment Gateway</label>
              <select
                value={config.provider}
                onChange={e => setConfig({ ...config, provider: e.target.value as any })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="midtrans">Midtrans (Snap & Core API QRIS / VA)</option>
                <option value="xendit">Xendit Indonesia (Invoice & Direct Debit)</option>
                <option value="tripay">Tripay (Payment Channel Murah RT-RW Net)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-1 pb-1">
              <input
                type="checkbox"
                id="isProdCheck"
                checked={config.isProduction}
                onChange={e => setConfig({ ...config, isProduction: e.target.checked })}
                className="rounded border-slate-700 text-indigo-600 focus:ring-0"
              />
              <label htmlFor="isProdCheck" className="text-slate-300 cursor-pointer">
                Aktifkan Mode Produksi (Live Real Money)
              </label>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Server Key / API Secret</label>
              <input
                type="password"
                value={config.serverKey}
                onChange={e => setConfig({ ...config, serverKey: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Client Key / Public Key</label>
              <input
                type="text"
                value={config.clientKey}
                onChange={e => setConfig({ ...config, clientKey: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Webhook Endpoint Display */}
            <div className="pt-2">
              <label className="block text-slate-400 mb-1">URL Callback / Webhook untuk Gateway Dashboard</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookEndpoint}
                  className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-emerald-400 font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={handleCopyWebhook}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition"
                  title="Salin Webhook URL"
                >
                  {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-500 font-semibold text-white rounded-xl shadow transition flex items-center justify-center gap-1.5"
            >
              {saved ? <Check className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
              <span>{saved ? 'Pengaturan Disimpan!' : 'Simpan Kredensial Gateway'}</span>
            </button>
          </form>
        </div>

        {/* Interactive Webhook Simulator */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                <span>Simulator Webhook & Notifikasi Pembayaran</span>
              </h3>
              <span className="text-xs text-slate-400">Sandbox Tester</span>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Gunakan simulator ini untuk menguji bagaimana sistem otomatis mendeteksi notifikasi pelunasan dari bank / QRIS secara real-time.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Pilih Invoice Belum Bayar ({unpaidInvoices.length} tersedia)
                </label>
                {unpaidInvoices.length === 0 ? (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-500 text-xs">
                    Semua invoice saat ini telah berstatus lunas.
                  </div>
                ) : (
                  <select
                    value={selectedInvoiceId}
                    onChange={e => setSelectedInvoiceId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    {unpaidInvoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        #{inv.invoiceNumber} - {inv.customerName} (Rp {inv.totalAmount.toLocaleString('id-ID')})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Kanal Pembayaran Masuk</label>
                <select
                  value={simulatedMethod}
                  onChange={e => setSimulatedMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="QRIS Instant (GoPay / BCA / ShopeePay)">QRIS Instant (GoPay / BCA / ShopeePay)</option>
                  <option value="Virtual Account BCA (VA 88019...)">Virtual Account BCA (VA 88019...)</option>
                  <option value="Virtual Account Mandiri (VA 89301...)">Virtual Account Mandiri (VA 89301...)</option>
                  <option value="Virtual Account BRI (BRIVA)">Virtual Account BRI (BRIVA)</option>
                  <option value="Alfamart / Indomaret Payment">Alfamart / Indomaret Payment</option>
                </select>
              </div>

              {simulationLog && (
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-mono leading-relaxed">
                  {simulationLog}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 mt-4">
            <button
              onClick={handleSimulateWebhook}
              disabled={isSimulating || unpaidInvoices.length === 0}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2"
            >
              <Zap className={`w-4 h-4 text-amber-300 ${isSimulating ? 'animate-bounce' : ''}`} />
              <span>{isSimulating ? 'Memproses Webhook Gateway...' : 'Kirim Simulasi Pembayaran Sukses (Webhook)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Supported Payment Channels Grid */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="text-base font-bold text-white mb-2">
          Metode Pembayaran Lokal Indonesia yang Didukung
        </h3>
        <p className="text-xs text-slate-400 mb-5">
          Semua metode langsung terhubung dengan webhook status settlement otomatis 24/7 tanpa perlu konfirmasi manual admin
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { name: 'QRIS Instant', desc: 'BCA, GoPay, OVO, Dana', color: 'from-emerald-600 to-teal-700' },
            { name: 'BCA Virtual Account', desc: 'Konfirmasi Instan 24 Jam', color: 'from-blue-600 to-indigo-700' },
            { name: 'BRI Virtual Account', desc: 'BRIVA Otomatis', color: 'from-sky-600 to-blue-800' },
            { name: 'Mandiri Livin VA', desc: 'Mandiri Bill Payment', color: 'from-amber-600 to-orange-700' },
            { name: 'E-Wallet Dana/OVO', desc: 'Direct App Deep Link', color: 'from-violet-600 to-purple-800' },
            { name: 'Alfamart / Indomaret', desc: 'Bayar di Kasir Toko', color: 'from-rose-600 to-pink-700' },
          ].map((item, idx) => (
            <div
              key={idx}
              className="bg-slate-950 p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between"
            >
              <div>
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${item.color} flex items-center justify-center text-white font-bold text-xs mb-2.5`}>
                  ✓
                </div>
                <h4 className="font-bold text-white text-xs">{item.name}</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">{item.desc}</p>
              </div>
              <span className="text-[9px] text-emerald-400 font-semibold mt-3">Ready</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
