import React, { useState } from 'react';
import { getHotspotLoginTemplate, getHotspotWalledGardenScript } from '../../services/mikrotikScripts';
import {
  Wifi,
  Download,
  Copy,
  Check,
  Ticket,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Gauge,
  ArrowRight,
  HelpCircle,
  FileCode,
  FolderDown,
  Terminal
} from 'lucide-react';

interface Props {
  initialVoucherCode?: string;
  onNavigateToStore: () => void;
}

export const HotspotLoginPage: React.FC<Props> = ({
  initialVoucherCode = '',
  onNavigateToStore,
}) => {
  const [voucherCode, setVoucherCode] = useState(initialVoucherCode);
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'guide'>('preview');
  const [loginState, setLoginState] = useState<'idle' | 'logging_in' | 'connected'>('idle');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedWalled, setCopiedWalled] = useState(false);
  const [showSpeedtest, setShowSpeedtest] = useState(false);
  const [speedVal, setSpeedVal] = useState(0);

  const rawTemplate = getHotspotLoginTemplate();
  const walledScript = getHotspotWalledGardenScript('billing.ispnet.id');

  const handleSimulateLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode) return;

    setLoginState('logging_in');
    setTimeout(() => {
      setLoginState('connected');
    }, 1200);
  };

  const handleStartSpeedtest = () => {
    setShowSpeedtest(true);
    setSpeedVal(0);
    let cur = 0;
    const interval = setInterval(() => {
      cur += Math.floor(Math.random() * 8) + 5;
      if (cur >= 48) {
        cur = 48.6;
        clearInterval(interval);
      }
      setSpeedVal(cur);
    }, 150);
  };

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(rawTemplate);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDownloadFile = (fileName: string, content: string) => {
    const blob = new Blob([content], { type: fileName.endsWith('.rsc') ? 'text/plain' : 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto py-4 px-2 sm:px-4">
      {/* Top Banner & Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-indigo-400" />
            <span>Halaman Login Hotspot MikroTik</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Template login captive portal modern dengan tombol beli voucher online mandiri & QRIS
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeTab === 'preview' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Live Preview
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeTab === 'code' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Source Code
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeTab === 'guide' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Panduan Winbox & Files
            </button>
          </div>

          <button
            onClick={() => handleDownloadFile('login.html', rawTemplate)}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh login.html</span>
          </button>
        </div>
      </div>

      {activeTab === 'preview' && (
        /* Realistic Phone / Captive Portal Mockup Frame */
        <div className="flex justify-center items-center py-6">
          <div className="w-full max-w-sm bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute -top-12 -right-12 w-36 h-36 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />

            {/* Captive Portal Top Bar */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800 text-[10px] text-slate-400 font-mono">
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <Wifi className="w-3 h-3" /> NETFLOW_5G
              </span>
              <span>10.10.30.1</span>
            </div>

            {loginState === 'connected' ? (
              /* Connected / Status Screen */
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-400 mx-auto shadow-lg shadow-emerald-500/20">
                  <Check className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">Terhubung ke Internet!</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Voucher <b>{voucherCode || 'NET-73921'}</b> aktif. Sisa waktu: <b>2 Jam 58 Menit</b>.
                  </p>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>IP Anda:</span>
                    <span className="text-white font-bold">10.10.30.84</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Kecepatan Max:</span>
                    <span className="text-emerald-400 font-bold">10M / 10M</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Trafik Terpakai:</span>
                    <span className="text-indigo-400 font-bold">42.8 MB</span>
                  </div>
                </div>

                {/* Speedtest Widget */}
                {showSpeedtest ? (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Speedtest Result:</span>
                      <span className="text-emerald-400 font-bold font-mono">{speedVal} Mbps</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${(speedVal / 50) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleStartSpeedtest}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center justify-center gap-1.5"
                  >
                    <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Uji Kecepatan (Speedtest)</span>
                  </button>
                )}

                <button
                  onClick={() => setLoginState('idle')}
                  className="w-full py-2.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-bold rounded-xl transition"
                >
                  Logout (Putuskan Koneksi)
                </button>
              </div>
            ) : (
              /* Hotspot Login Form */
              <div>
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-tr from-indigo-600 to-emerald-500 rounded-2xl shadow-lg mb-2 text-white font-extrabold text-lg">
                    N
                  </div>
                  <h2 className="text-lg font-black text-white tracking-tight">WIFI HOTSPOT SUPER</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Koneksi Internet Cepat, Stabil & Tanpa Batas
                  </p>
                </div>

                <form onSubmit={handleSimulateLogin} className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Kode Voucher
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: NET-73921"
                      value={voucherCode}
                      onChange={e => setVoucherCode(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-center font-mono font-bold tracking-wider text-white text-base placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loginState === 'logging_in'}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 font-bold text-white text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2"
                  >
                    <span>{loginState === 'logging_in' ? 'Memverifikasi...' : 'Masuk Sekarang'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="relative my-5 text-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-800" />
                  </div>
                  <span className="relative px-2 bg-slate-900 text-[10px] font-medium text-slate-500 uppercase">
                    Belum Punya Voucher?
                  </span>
                </div>

                {/* Self-service online buy button integrated */}
                <button
                  type="button"
                  onClick={onNavigateToStore}
                  className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 font-bold text-white rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 text-xs"
                >
                  <Ticket className="w-3.5 h-3.5" />
                  <span>Beli Voucher Online (QRIS / E-Wallet)</span>
                </button>

                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setVoucherCode('TRIAL-GUEST');
                      setLoginState('connected');
                    }}
                    className="text-[11px] text-indigo-400 hover:underline"
                  >
                    Coba Gratis 10 Menit (Trial)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'code' && (
        /* Source Code Viewer */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-xs font-mono text-emerald-400 font-semibold">
              MikroTik Captive Portal Template: /files/hotspot/login.html
            </span>
            <button
              onClick={handleCopyTemplate}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Tersalin!' : 'Salin Kode HTML'}</span>
            </button>
          </div>

          <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-indigo-300 overflow-x-auto max-h-[500px] leading-relaxed">
            {rawTemplate}
          </pre>
        </div>
      )}

      {activeTab === 'guide' && (
        /* Guide & Direct Files Download */
        <div className="space-y-6">
          {/* Download Bundle Cards */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
              <FolderDown className="w-5 h-5 text-indigo-400" />
              <span>Paket File Hotspot MikroTik Lengkap</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Unduh file berikut dan upload langsung ke direktori <b>hotspot/</b> pada menu <b>Files</b> di Winbox MikroTik Anda:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { name: 'login.html', desc: 'Halaman login voucher', ext: 'HTML' },
                { name: 'status.html', desc: 'Status sisa waktu user', ext: 'HTML' },
                { name: 'logout.html', desc: 'Konfirmasi pemutusan sesi', ext: 'HTML' },
                { name: 'walled-garden.rsc', desc: 'Bypass QRIS & billing', ext: 'RSC' },
              ].map(f => (
                <div key={f.name} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-indigo-500/20 text-indigo-400">
                      {f.ext}
                    </span>
                    <div className="font-mono font-bold text-white text-xs mt-1.5">{f.name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{f.desc}</div>
                  </div>
                  <button
                    onClick={() => handleDownloadFile(f.name, f.name.endsWith('.rsc') ? walledScript : rawTemplate)}
                    className="mt-3 w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3 h-3 text-emerald-400" />
                    <span>Download</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Step by step Winbox Setup */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Terminal className="w-5 h-5 text-emerald-400" />
              <span>Langkah Menghubungkan Hotspot ke Web Pembelian Voucher</span>
            </h3>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                <p className="font-bold text-white mb-1">1. Pasang Walled Garden di MikroTik</p>
                <p className="text-slate-400 text-[11px] mb-2">
                  Buka <b>New Terminal</b> di Winbox dan tempel skrip berikut agar pembeli bisa membuka web pembayaran QRIS tanpa login:
                </p>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500 font-mono">Skrip Walled Garden CLI</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(walledScript);
                      setCopiedWalled(true);
                      setTimeout(() => setCopiedWalled(false), 2000);
                    }}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    {copiedWalled ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedWalled ? 'Tersalin!' : 'Salin Skrip'}</span>
                  </button>
                </div>
                <pre className="p-3 bg-slate-900 rounded-lg text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-40">
                  {walledScript}
                </pre>
              </div>

              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                <p className="font-bold text-white mb-1">2. Upload File Template ke Winbox</p>
                <p className="text-slate-400 text-[11px]">
                  Buka menu <b>Files</b> di Winbox, lalu buat folder <b>hotspot</b> (jika belum ada) dan drag & drop file <b>login.html</b> yang sudah diunduh ke dalam folder tersebut.
                </p>
              </div>

              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                <p className="font-bold text-white mb-1">3. Tentukan HTML Directory di Server Profile</p>
                <p className="text-slate-400 text-[11px]">
                  Buka menu <b>IP &gt; Hotspot &gt; Server Profiles</b> &gt; Klik ganda profil Anda &gt; Set <b>HTML Directory</b> ke <b>hotspot</b>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
