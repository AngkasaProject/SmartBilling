import React, { useEffect, useState } from 'react';
import { WhatsAppLog, WhatsAppGatewayConfig } from '../../types';
import { StorageService } from '../../services/storage';
import { useToast } from '../ui/toast';
import {
  Send,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Clock,
  Settings,
  Sparkles,
  Phone,
  RefreshCw,
  Sliders,
  Check,
  ExternalLink,
  ShieldCheck,
  Server,
  Zap,
  Terminal,
} from 'lucide-react';

interface Props {
  waLogs: WhatsAppLog[];
  waConfig: WhatsAppGatewayConfig;
  onRefreshData: () => void;
}

function formatOpenWaChatId(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (!digits.startsWith('62')) digits = `62${digits}`;
  return digits.length >= 10 ? `${digits}@c.us` : 'Masukkan nomor WhatsApp yang valid';
}

export const WhatsAppTab: React.FC<Props> = ({ waLogs, waConfig, onRefreshData }) => {
  const { toast } = useToast();
  const [config, setConfig] = useState<WhatsAppGatewayConfig>(waConfig);
  const [waEnvironment, setWaEnvironment] = useState<{
    provider: 'openwa' | 'fonnte';
    managedByEnvironment: boolean;
    baseUrl: string;
    sessionId: string;
    apiKeyConfigured: boolean;
    fonnteApiUrl: string;
    tokenConfigured: boolean;
  } | null>(null);
  const [waConfigError, setWaConfigError] = useState('');
  const [checkingSession, setCheckingSession] = useState(false);

  // Quick message tester form
  const [testPhone, setTestPhone] = useState('');
  const [testTemplate, setTestTemplate] = useState<'reminder' | 'isolir' | 'lunas' | 'voucher'>('reminder');
  const [customText, setCustomText] = useState('Tes pesan WhatsApp dari dashboard billing.');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [lastProviderResponse, setLastProviderResponse] = useState<any | null>(null);

  const loadWhatsAppConfig = async () => {
    const response = await fetch('/api/wa/config');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    setWaEnvironment(result);
    setConfig(current => ({
      ...current,
      provider: result.provider,
      openwaUrl: result.baseUrl,
      sessionId: result.sessionId,
      apiKey: '',
    }));
  };

  useEffect(() => {
    loadWhatsAppConfig().catch(error => setWaConfigError(error instanceof Error ? error.message : String(error)));
  }, []);

  const handleProviderChange = async (provider: 'openwa' | 'fonnte') => {
    setWaConfigError('');
    try {
      const response = await fetch('/api/wa/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setWaEnvironment(result);
      setConfig(current => ({ ...current, provider: result.provider, sessionStatus: 'disconnected', sessionPhone: undefined }));
    } catch (error) {
      setWaConfigError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleTemplateChange = (type: 'reminder' | 'isolir' | 'lunas' | 'voucher') => {
    setTestTemplate(type);
    if (type === 'reminder') {
      setCustomText(
        'PENGINGAT TAGIHAN: Invoice [nomor invoice] sebesar [jumlah] jatuh tempo pada [tanggal].'
      );
    } else if (type === 'isolir') {
      setCustomText(
        'PEMBERITAHUAN: Akses PPPoE Anda telah dinonaktifkan oleh operator. Hubungi layanan pelanggan untuk informasi lebih lanjut.'
      );
    } else if (type === 'lunas') {
      setCustomText(
        'PEMBAYARAN DICATAT: Invoice [nomor invoice] telah diterima operator. Hubungi layanan pelanggan bila ada pertanyaan.'
      );
    } else if (type === 'voucher') {
      setCustomText(
        'VOUCHER HOTSPOT: Kode [kode voucher], profil [nama profil]. Gunakan kode ini pada captive portal jaringan.'
      );
    }
  };

  const handleCheckSessionStatus = async () => {
    setCheckingSession(true);
    try {
      const response = await fetch('/api/wa/session/status');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setConfig(prev => ({
        ...prev,
        sessionStatus: result.status === 'connected' ? 'connected' : 'disconnected',
        sessionPhone: result.phone || undefined,
      }));
      toast(`Status sesi OpenWA: ${result.status || 'unknown'}`, result.status === 'connected' ? 'success' : 'info');
    } catch (error) {
      setConfig(prev => ({ ...prev, sessionStatus: 'disconnected' }));
      toast('Gagal memeriksa status sesi OpenWA', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setCheckingSession(false);
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone || !customText) return;

    setIsSending(true);
    setSendSuccess(false);
    try {
      const response = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone, message: customText }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `WhatsApp provider returned ${response.status}`);
      setLastProviderResponse(result);
      StorageService.addWaLog({
        recipientPhone: testPhone,
        recipientName: 'Uji Coba Pengiriman',
        type: (testTemplate === 'reminder' ? 'reminder_h3' : testTemplate === 'isolir' ? 'isolated' : testTemplate === 'lunas' ? 'payment_success' : 'voucher_delivery') as any,
        message: customText,
        status: 'sent',
        responseInfo: JSON.stringify(result.data),
      });
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 2500);
      onRefreshData();
    } catch (error) {
      setLastProviderResponse({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
      StorageService.addWaLog({
        recipientPhone: testPhone,
        recipientName: 'Uji Coba Pengiriman',
        type: 'custom',
        message: customText,
        status: 'failed',
        responseInfo: error instanceof Error ? error.message : String(error),
      });
      onRefreshData();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Provider REST integration banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border border-emerald-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30 shrink-0">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white">Provider WhatsApp: {config.provider === 'fonnte' ? 'Fonnte' : 'OpenWA'}</h2>
                <a
                  href="https://github.com/rmyndharis/OpenWA"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition"
                >
                  <span>github.com/rmyndharis/OpenWA</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                SmartBilling hanya memakai REST API provider eksternal. Layanan Fonnte/OpenWA berjalan dan dikelola terpisah dari aplikasi billing.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {config.provider === 'openwa' && (
              <button
                onClick={handleCheckSessionStatus}
                disabled={checkingSession}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingSession ? 'animate-spin text-emerald-400' : ''}`} />
                <span>Cek Status Sesi</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main 2-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Provider configuration card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-emerald-400" />
              <span>Konfigurasi Provider</span>
            </h3>
            {config.provider === 'openwa' && (
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1 ${config.sessionStatus === 'connected' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                <span className={`w-2 h-2 rounded-full ${config.sessionStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                {config.sessionStatus === 'connected' ? 'TERHUBUNG' : 'BELUM DIUJI'}
              </span>
            )}
          </div>

          {waConfigError && <p role="alert" className="mb-3 text-xs text-rose-300">{waConfigError}</p>}
          <div className="space-y-3 text-xs">
            <label className="block text-slate-300 font-semibold">
              Provider WhatsApp
              <select
                disabled={waEnvironment?.managedByEnvironment}
                value={config.provider}
                onChange={event => void handleProviderChange(event.target.value as 'openwa' | 'fonnte')}
                className="mt-1.5 w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white disabled:opacity-50"
              >
                <option value="openwa">OpenWA (REST API eksternal)</option>
                <option value="fonnte">Fonnte (REST API eksternal)</option>
              </select>
            </label>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              {config.provider === 'openwa' ? (
                <>
                  <p className="text-slate-400">OpenWA Base URL</p>
                  <p className="text-white font-mono break-all">{config.openwaUrl || 'Belum dikonfigurasi'}</p>
                  <p className="text-slate-400 mt-2">Session ID: <span className="text-white">{config.sessionId || 'Belum dikonfigurasi'}</span></p>
                  <p className="text-slate-400 mt-2">API key</p>
                  <p className={waEnvironment?.tokenConfigured ? 'text-emerald-400' : 'text-rose-300'}>
                    {waEnvironment?.tokenConfigured ? 'Tersetel di environment server' : 'OPENWA_BASE_URL/OPENWA_API_KEY belum lengkap'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-slate-400">Fonnte REST API</p>
                  <p className="text-white font-mono break-all">{waEnvironment?.fonnteApiUrl || 'https://api.fonnte.com/send'}</p>
                  <p className="text-slate-400 mt-2">Token API</p>
                  <p className={waEnvironment?.tokenConfigured ? 'text-emerald-400' : 'text-rose-300'}>
                    {waEnvironment?.tokenConfigured ? 'Tersetel di environment server' : 'FONNTE_TOKEN belum disetel'}
                  </p>
                </>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {waEnvironment?.managedByEnvironment
                ? 'Provider dikunci oleh WA_PROVIDER di environment server.'
                : 'Pilih provider di sini; token/API key dan alamat endpoint disetel di environment server.'}
              {' '}Pengingat terjadwal belum tersedia.
            </p>
          </div>
        </div>

        {/* Live message dispatch tester */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-400" />
                <span>Kirim pesan melalui API {config.provider === 'fonnte' ? 'Fonnte' : 'OpenWA'}</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">Server-side REST</span>
            </div>

            {/* Template Selector */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => handleTemplateChange('reminder')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  testTemplate === 'reminder' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                }`}
              >
                Template Pengingat (H-3/H-1)
              </button>
              <button
                type="button"
                onClick={() => handleTemplateChange('isolir')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  testTemplate === 'isolir' ? 'bg-rose-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                }`}
              >
                Template Isolir Otomatis
              </button>
              <button
                type="button"
                onClick={() => handleTemplateChange('lunas')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  testTemplate === 'lunas' ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                }`}
              >
                Template Tanda Terima Lunas
              </button>
              <button
                type="button"
                onClick={() => handleTemplateChange('voucher')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  testTemplate === 'voucher' ? 'bg-violet-600 text-white' : 'bg-slate-950 text-slate-400 border border-slate-800'
                }`}
              >
                Template Voucher Hotspot
              </button>
            </div>

            {/* Input Phone & Custom Text */}
            <form onSubmit={handleSendTestMessage} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Nomor WhatsApp Tujuan</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={testPhone}
                      onChange={e => setTestPhone(e.target.value)}
                      placeholder="Masukkan nomor WhatsApp"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block font-mono">
                    {config.provider === 'openwa'
                      ? <>OpenWA chatId: <b>{formatOpenWaChatId(testPhone)}</b></>
                      : 'Fonnte memakai nomor tujuan format internasional.'}
                  </span>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Endpoint provider eksternal</label>
                  <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-emerald-400 font-mono text-[11px] truncate">
                    {config.provider === 'fonnte'
                      ? waEnvironment?.fonnteApiUrl || 'https://api.fonnte.com/send'
                      : `${config.openwaUrl}/api/sessions/${config.sessionId}/messages/send-text`}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Isi Pesan WhatsApp</label>
                <textarea
                  rows={4}
                  required
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              {/* Response Json View if sent */}
              {lastProviderResponse && (
                <div className={`p-3 bg-slate-950 rounded-xl border font-mono text-[11px] space-y-1 ${lastProviderResponse.status === 'success' ? 'border-emerald-500/30 text-emerald-300' : 'border-rose-500/30 text-rose-300'}`}>
                  <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                    {lastProviderResponse.status === 'success'
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      : <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                    <span>{lastProviderResponse.status === 'success' ? `Pesan diterima ${config.provider === 'fonnte' ? 'Fonnte' : 'OpenWA'}` : 'Pengiriman gagal'}</span>
                  </div>
                  <pre className="whitespace-pre-wrap break-all">{JSON.stringify(lastProviderResponse.data || lastProviderResponse.error, null, 2)}</pre>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-500">
                  Provider aktif: <b>{config.provider === 'fonnte' ? 'Fonnte' : 'OpenWA'}</b>
                </span>

                <button
                  type="submit"
                  disabled={isSending}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/30 transition flex items-center gap-2"
                >
                  <Send className={`w-3.5 h-3.5 ${isSending ? 'animate-spin' : ''}`} />
                  <span>{isSending ? `Mengirim via ${config.provider === 'fonnte' ? 'Fonnte' : 'OpenWA'}...` : sendSuccess ? 'Diterima provider' : 'Kirim Uji Coba Sekarang'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* WhatsApp Logs Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span>Log Pengiriman WhatsApp ({waLogs.length})</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Riwayat respons dari provider REST API yang dipilih
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                <th className="pb-3 px-3">Waktu</th>
                <th className="pb-3 px-3">Penerima & No. WA</th>
                <th className="pb-3 px-3">Jenis Notifikasi</th>
                <th className="pb-3 px-3">Isi Pesan Terkirim</th>
                <th className="pb-3 px-3">Status Provider</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {waLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                    {log.timestamp}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <div className="font-bold text-white">{log.recipientName}</div>
                    <div className="text-[11px] font-mono text-emerald-400">{log.recipientPhone}</div>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-indigo-300 border border-slate-700">
                      {log.type}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-300 max-w-md">
                    <p className="line-clamp-2 text-[11px]">{log.message}</p>
                    {log.responseInfo && (
                      <span className="text-[10px] text-emerald-400 font-mono mt-0.5 block">
                        {log.responseInfo}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> SENT
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
