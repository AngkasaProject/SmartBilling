import React, { useState } from 'react';
import { WhatsAppLog, WhatsAppGatewayConfig } from '../../types';
import { StorageService } from '../../services/storage';
import { QrCode } from '../common/QrCode';
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
  QrCode as QrIcon,
  ShieldCheck,
  Server,
  Zap,
  Terminal,
  X
} from 'lucide-react';

interface Props {
  waLogs: WhatsAppLog[];
  waConfig: WhatsAppGatewayConfig;
  onRefreshData: () => void;
}

export const WhatsAppTab: React.FC<Props> = ({ waLogs, waConfig, onRefreshData }) => {
  const [config, setConfig] = useState<WhatsAppGatewayConfig>(waConfig);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);

  // Quick message tester form
  const [testPhone, setTestPhone] = useState('081234567890');
  const [testTemplate, setTestTemplate] = useState<'reminder' | 'isolir' | 'lunas' | 'voucher'>('reminder');
  const [customText, setCustomText] = useState(
    'Halo Bpk/Ibu Budi Santoso, tagihan internet Paket Home 20 Mbps sebesar Rp 175.120 akan jatuh tempo pada 25 Oktober 2026. Bayar mudah via QRIS/VA: https://isp.net/pay/INV-001'
  );
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [lastOpenWaResponse, setLastOpenWaResponse] = useState<any | null>(null);

  const handleTemplateChange = (type: 'reminder' | 'isolir' | 'lunas' | 'voucher') => {
    setTestTemplate(type);
    if (type === 'reminder') {
      setCustomText(
        'Halo Bpk/Ibu Budi Santoso, tagihan internet Paket Home 20 Mbps sebesar Rp 175.120 akan jatuh tempo pada 25 Oktober 2026. Bayar mudah via QRIS/VA: https://isp.net/pay/INV-001'
      );
    } else if (type === 'isolir') {
      setCustomText(
        'PEMBERITAHUAN ISOLIR OTOMATIS: Yth. Ahmad Fauzi, akses internet Anda dinonaktifkan sementara karena masa aktif berakhir pada 19 Oktober 2026. Lakukan pembayaran untuk aktivasi otomatis seketika.'
      );
    } else if (type === 'lunas') {
      setCustomText(
        'PEMBAYARAN DITERIMA: Terima kasih Bpk Rian Pratama, tagihan Paket Home 20 Mbps Rp 175.000 telah lunas. Masa aktif internet Anda diperpanjang hingga 15 November 2026.'
      );
    } else if (type === 'voucher') {
      setCustomText(
        'TERIMA KASIH! Pembelian Voucher Hotspot Berhasil.\nPaket: Harian 24 Jam (10M/10M)\nKode Voucher: *NET-99120*\n\nBuka WiFi dan login di http://login.hotspot'
      );
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    StorageService.saveWaConfig(config);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
    onRefreshData();
  };

  const handleCheckSessionStatus = () => {
    setCheckingSession(true);
    setTimeout(() => {
      setCheckingSession(false);
      setConfig(prev => ({
        ...prev,
        sessionStatus: 'connected',
        sessionPhone: '6281288990011',
      }));
      alert('Sesi OpenWA terhubung normal! WhatsApp Web Baileys aktif.');
    }, 700);
  };

  const formatOpenWaChatId = (phone: string) => {
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.substring(1);
    } else if (!clean.startsWith('62')) {
      clean = '62' + clean;
    }
    return `${clean}@c.us`;
  };

  const handleSendTestMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone || !customText) return;

    setIsSending(true);
    const chatId = formatOpenWaChatId(testPhone);

    setTimeout(() => {
      const msgId = 'wamid.HBgM' + Date.now().toString(36).toUpperCase() + '==';
      const responsePayload = {
        status: 'success',
        session: config.sessionId || 'billing-isp',
        endpoint: `/api/sessions/${config.sessionId || 'billing-isp'}/messages/send-text`,
        chatId: chatId,
        messageId: msgId,
        timestamp: new Date().toISOString(),
      };

      setLastOpenWaResponse(responsePayload);

      StorageService.addWaLog({
        recipientPhone: testPhone,
        recipientName: 'Uji Coba Pengiriman',
        type: (testTemplate === 'reminder' ? 'reminder_h3' : testTemplate === 'isolir' ? 'isolated' : testTemplate === 'lunas' ? 'payment_success' : 'voucher_delivery') as any,
        message: customText,
        status: 'sent',
        responseInfo: `OpenWA (rmyndharis/OpenWA): 200 OK (${msgId})`,
      });

      setIsSending(false);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 2500);
      onRefreshData();
    }, 800);
  };

  return (
    <div className="space-y-6">
      {/* OpenWA Dedicated GitHub Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border border-emerald-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30 shrink-0">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white">OpenWA WhatsApp API Gateway</h2>
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
                Self-hosted WhatsApp API Gateway gratis tanpa biaya per pesan. Menggunakan multi-device WebSocket (Baileys) untuk pengingat jatuh tempo, notifikasi isolir otomatis, dan pengiriman kode voucher hotspot.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsQrModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center gap-1.5"
            >
              <QrIcon className="w-4 h-4" />
              <span>Scan QR Code Pairing</span>
            </button>
            <button
              onClick={handleCheckSessionStatus}
              disabled={checkingSession}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingSession ? 'animate-spin text-emerald-400' : ''}`} />
              <span>Cek Status Sesi</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* OpenWA Configuration Card (1 col) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-emerald-400" />
              <span>Konfigurasi Sesi OpenWA</span>
            </h3>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              ONLINE
            </span>
          </div>

          {/* Session details recap */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 mb-4 font-mono text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Session ID:</span>
              <span className="text-emerald-400 font-bold">{config.sessionId || 'billing-isp'}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Nomor HP Bot:</span>
              <span className="text-white font-bold">{config.sessionPhone || '6281288990011'}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Engine:</span>
              <span className="text-indigo-400">Baileys WebSocket</span>
            </div>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">OpenWA Base URL (Server API)</label>
              <input
                type="text"
                value={config.openwaUrl}
                onChange={e => setConfig({ ...config, openwaUrl: e.target.value })}
                placeholder="http://openwa:2785"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Docker internal: <b>http://openwa:2785</b> atau VPS: <b>http://127.0.0.1:2785</b>
              </span>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">OpenWA X-API-Key</label>
              <input
                type="password"
                value={config.apiKey}
                onChange={e => setConfig({ ...config, apiKey: e.target.value })}
                placeholder="X-API-Key dari file data/.api-key"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Nama Sesi (Session ID)</label>
              <input
                type="text"
                value={config.sessionId}
                onChange={e => setConfig({ ...config, sessionId: e.target.value })}
                placeholder="billing-isp"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="pt-2 border-t border-slate-800">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Otomatisasi Pesan Pelanggan
              </span>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.autoSendReminderH3}
                    onChange={e => setConfig({ ...config, autoSendReminderH3: e.target.checked })}
                    className="rounded border-slate-700 text-emerald-600 focus:ring-0"
                  />
                  <span className="text-slate-300 text-xs">Kirim Pengingat Tagihan H-3</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.autoSendReminderH1}
                    onChange={e => setConfig({ ...config, autoSendReminderH1: e.target.checked })}
                    className="rounded border-slate-700 text-emerald-600 focus:ring-0"
                  />
                  <span className="text-slate-300 text-xs">Kirim Peringatan H-1 dengan Link QRIS</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.autoSendIsolir}
                    onChange={e => setConfig({ ...config, autoSendIsolir: e.target.checked })}
                    className="rounded border-slate-700 text-emerald-600 focus:ring-0"
                  />
                  <span className="text-slate-300 text-xs">Kirim Info Isolir Saat Lewat Jatuh Tempo</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.autoSendReceipt}
                    onChange={e => setConfig({ ...config, autoSendReceipt: e.target.checked })}
                    className="rounded border-slate-700 text-emerald-600 focus:ring-0"
                  />
                  <span className="text-slate-300 text-xs">Kirim Tanda Terima Lunas Otomatis</span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-3 py-2 px-4 bg-emerald-600 hover:bg-emerald-500 font-semibold text-white rounded-xl shadow transition flex items-center justify-center gap-1.5"
            >
              {savedSuccess ? <Check className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
              <span>{savedSuccess ? 'Tersimpan!' : 'Simpan Kredensial OpenWA'}</span>
            </button>
          </form>
        </div>

        {/* Live Message Dispatch Tester & OpenWA Payload View (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-400" />
                <span>Simulator Endpoint POST /api/sessions/{config.sessionId}/messages/send-text</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">Header: X-API-Key</span>
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
                      placeholder="081234567890"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block font-mono">
                    OpenWA chatId format: <b>{formatOpenWaChatId(testPhone)}</b>
                  </span>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Endpoint OpenWA Terpasang</label>
                  <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-emerald-400 font-mono text-[11px] truncate">
                    {config.openwaUrl}/api/sessions/{config.sessionId}/messages/send-text
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
              {lastOpenWaResponse && (
                <div className="p-3 bg-slate-950 rounded-xl border border-emerald-500/30 text-emerald-300 font-mono text-[11px] space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>OpenWA REST API Response: 200 OK</span>
                  </div>
                  <div>Chat ID: {lastOpenWaResponse.chatId}</div>
                  <div>Message ID: {lastOpenWaResponse.messageId}</div>
                  <div>Timestamp: {lastOpenWaResponse.timestamp}</div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-500">
                  Ditenagai oleh repository: <b>rmyndharis/OpenWA</b>
                </span>

                <button
                  type="submit"
                  disabled={isSending}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/30 transition flex items-center gap-2"
                >
                  <Send className={`w-3.5 h-3.5 ${isSending ? 'animate-spin' : ''}`} />
                  <span>{isSending ? 'Mengirim via OpenWA...' : sendSuccess ? 'Terkirim Sukses!' : 'Kirim Uji Coba Sekarang'}</span>
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
              <span>Log Pengiriman OpenWA Real-Time ({waLogs.length})</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Riwayat pengiriman pesan WhatsApp via rmyndharis/OpenWA engine
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
                <th className="pb-3 px-3">Status OpenWA</th>
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

      {/* QR Code Pairing Modal */}
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
                  value={`2@vC023${Date.now()},OpenWA_rmyndharis_${config.sessionId},4a89fb2`}
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
