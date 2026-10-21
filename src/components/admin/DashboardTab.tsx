import React, { useState, useEffect } from 'react';
import { Customer, Invoice, Voucher, RouterConfig } from '../../types';
import { StorageService } from '../../services/storage';
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  ShieldAlert,
  Ticket,
  Send,
  Zap,
  Server,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  CreditCard,
  Wifi
} from 'lucide-react';

interface Props {
  customers: Customer[];
  invoices: Invoice[];
  vouchers: Voucher[];
  routers: RouterConfig[];
  onRefreshData: () => void;
  onNavigateTab: (tab: string) => void;
  onSendWaNotification: (customer: Customer, type: 'reminder' | 'isolir') => void;
  onToggleIsolir: (customer: Customer) => void;
}

export const DashboardTab: React.FC<Props> = ({
  customers,
  invoices,
  vouchers,
  routers,
  onRefreshData,
  onNavigateTab,
  onSendWaNotification,
  onToggleIsolir,
}) => {
  // Real-time Traffic Simulator state (Rx and Tx bandwidth over time)
  const [trafficHistory, setTrafficHistory] = useState<{ time: string; rx: number; tx: number }[]>([
    { time: '14:00', rx: 42.5, tx: 18.2 },
    { time: '14:05', rx: 48.1, tx: 22.4 },
    { time: '14:10', rx: 55.6, tx: 25.1 },
    { time: '14:15', rx: 61.2, tx: 29.8 },
    { time: '14:20', rx: 58.7, tx: 27.3 },
    { time: '14:25', rx: 69.4, tx: 34.6 },
    { time: '14:30', rx: 74.2, tx: 38.9 },
    { time: '14:35', rx: 82.5, tx: 41.2 },
    { time: '14:40', rx: 78.1, tx: 39.5 },
    { time: '14:45', rx: 86.8, tx: 46.7 },
  ]);

  const [currentRx, setCurrentRx] = useState(86.8);
  const [currentTx, setCurrentTx] = useState(46.7);

  // Periodic traffic simulation
  useEffect(() => {
    const timer = setInterval(() => {
      const deltaRx = (Math.random() - 0.48) * 12;
      const deltaTx = (Math.random() - 0.48) * 8;
      const newRx = Math.max(25, Math.min(120, +(currentRx + deltaRx).toFixed(1)));
      const newTx = Math.max(12, Math.min(65, +(currentTx + deltaTx).toFixed(1)));

      setCurrentRx(newRx);
      setCurrentTx(newTx);

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      setTrafficHistory(prev => {
        const next = [...prev.slice(1), { time: timeStr, rx: newRx, tx: newTx }];
        return next;
      });
    }, 2500);

    return () => clearInterval(timer);
  }, [currentRx, currentTx]);

  // Derived metrics
  const totalRevenue = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + i.totalAmount, 0) +
    vouchers.reduce((sum, v) => sum + (v.status !== 'unused' ? v.price : 0), 0);

  const activeCustomers = customers.filter(c => c.status === 'active').length;
  const isolatedCustomers = customers.filter(c => c.status === 'isolated').length;
  const expiringCustomers = customers.filter(c => c.status === 'expiring').length;

  const urgentCustomers = customers.filter(c => c.status === 'isolated' || c.status === 'expiring');

  const mainRouter = routers[0] || {
    name: 'RB4011-NOC',
    status: 'connected',
    model: 'RB4011iGS+RM',
    rosVersion: 'v7.16',
    cpuLoad: 18,
    memoryFreeMb: 842,
    activePppoe: 154,
    activeHotspot: 92,
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome / Status Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              MikroTik RouterOS API Online • v7.16 Connected
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Network Operations & Billing Center
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">
              Sistem otomatis mengawasi {customers.length} pelanggan PPPoE, isolir otomatis saat jatuh tempo, notifikasi WhatsApp blast, dan pembelian voucher hotspot QRIS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => onNavigateTab('customers')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Kelola Pelanggan</span>
            </button>
            <button
              onClick={() => onNavigateTab('vouchers')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>Cetak Voucher</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Omset */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-lg backdrop-blur hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Pendapatan (Okt)</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white tracking-tight">
              Rp {totalRevenue.toLocaleString('id-ID')}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400 font-medium">
              <TrendingUp className="w-3 h-3" />
              <span>+18.4% dari bulan lalu</span>
            </div>
          </div>
        </div>

        {/* Pelanggan PPPoE */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-lg backdrop-blur hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Pelanggan PPPoE</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white tracking-tight">
              {activeCustomers} <span className="text-sm font-normal text-slate-400">/ {customers.length} Aktif</span>
            </div>
            <div className="flex items-center gap-2 mt-2 text-[11px]">
              <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 font-semibold border border-rose-500/20">
                {isolatedCustomers} Ter-Isolir
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/20">
                {expiringCustomers} H-1/H-3
              </span>
            </div>
          </div>
        </div>

        {/* Voucher Hotspot */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-lg backdrop-blur hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Voucher Hotspot Terjual</span>
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <Ticket className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white tracking-tight">
              {vouchers.filter(v => v.status !== 'unused').length} <span className="text-sm font-normal text-slate-400">Voucher</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-violet-400 font-medium">
              <Wifi className="w-3 h-3" />
              <span>{mainRouter.activeHotspot} user sedang login online</span>
            </div>
          </div>
        </div>

        {/* Router Health */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-lg backdrop-blur hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">MikroTik Router Load</span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white tracking-tight">
              {mainRouter.cpuLoad}% <span className="text-xs font-normal text-slate-400">CPU Usage</span>
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400 font-mono">
              <span>Free RAM: {mainRouter.memoryFreeMb} MB</span>
              <span className="text-emerald-400 font-semibold">Uptime: 42d</span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-Time Bandwidth Monitor & Router Stats Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-time Bandwidth Graph (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                <span>Live Bandwidth Monitor (NOC Gateway)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Pemantauan trafik real-time port ether1-WAN (Download Rx & Upload Tx)
              </p>
            </div>

            <div className="flex items-center gap-4 bg-slate-950 px-3.5 py-1.5 rounded-xl border border-slate-800/90 font-mono text-xs">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span>Rx: <b>{currentRx}</b> Mbps</span>
              </div>
              <div className="w-px h-3 bg-slate-800" />
              <div className="flex items-center gap-1.5 text-indigo-400">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Tx: <b>{currentTx}</b> Mbps</span>
              </div>
            </div>
          </div>

          {/* SVG Traffic Wave Visualizer */}
          <div className="h-48 w-full relative flex items-end">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
              <defs>
                <linearGradient id="rxGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="txGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              <line x1="0" y1="40" x2="500" y2="40" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="80" x2="500" y2="80" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="120" x2="500" y2="120" stroke="#1e293b" strokeDasharray="3 3" />

              {/* Rx Path */}
              {(() => {
                const step = 500 / (trafficHistory.length - 1);
                const points = trafficHistory.map((d, i) => {
                  const x = i * step;
                  const y = 150 - (d.rx / 120) * 130;
                  return `${x},${y}`;
                });
                const dArea = `M0,150 L${points.join(' L')} L500,150 Z`;
                const dLine = `M${points.join(' L')}`;

                return (
                  <>
                    <path d={dArea} fill="url(#rxGradient)" />
                    <path d={dLine} fill="none" stroke="#10b981" strokeWidth="2.5" />
                  </>
                );
              })()}

              {/* Tx Path */}
              {(() => {
                const step = 500 / (trafficHistory.length - 1);
                const points = trafficHistory.map((d, i) => {
                  const x = i * step;
                  const y = 150 - (d.tx / 120) * 130;
                  return `${x},${y}`;
                });
                const dArea = `M0,150 L${points.join(' L')} L500,150 Z`;
                const dLine = `M${points.join(' L')}`;

                return (
                  <>
                    <path d={dArea} fill="url(#txGradient)" />
                    <path d={dLine} fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="4 2" />
                  </>
                );
              })()}
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-3 pt-2 border-t border-slate-800">
            <span>{trafficHistory[0]?.time}</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm inline-block" /> Download (Rx)
              </span>
              <span className="flex items-center gap-1.5 text-indigo-400">
                <span className="w-2.5 h-2.5 bg-indigo-500 rounded-sm inline-block" /> Upload (Tx)
              </span>
            </div>
            <span>{trafficHistory[trafficHistory.length - 1]?.time}</span>
          </div>
        </div>

        {/* Router Details & Auto-Scheduler Box (1 col) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-400" />
                <span>Status Router MikroTik</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                ONLINE
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-slate-400 text-[11px]">Nama Perangkat</div>
                <div className="font-bold text-white mt-0.5">{mainRouter.name}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{mainRouter.model} • {mainRouter.rosVersion}</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[10px]">PPPoE Secrets</div>
                  <div className="text-lg font-bold text-indigo-400">{mainRouter.activePppoe}</div>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[10px]">Hotspot Active</div>
                  <div className="text-lg font-bold text-violet-400">{mainRouter.activeHotspot}</div>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                  <span>Beban CPU MikroTik</span>
                  <span className="text-white font-bold">{mainRouter.cpuLoad}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${mainRouter.cpuLoad}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800">
            <button
              onClick={() => onNavigateTab('routers')}
              className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center justify-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Buka Konfigurasi & Skrip Router</span>
            </button>
          </div>
        </div>
      </div>

      {/* Urgent Attention Table (Expiring & Isolated Customers) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Perhatian Khusus: Pelanggan Menjelang Expired & Ter-Isolir ({urgentCustomers.length})</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Daftar pelanggan yang membutuhkan tindak lanjut pengingat WhatsApp atau penanganan isolir
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('customers')}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
          >
            <span>Lihat Semua Pelanggan</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {urgentCustomers.length === 0 ? (
          <div className="p-8 text-center text-slate-500 bg-slate-950/50 rounded-xl border border-slate-800/80">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">Semua Pelanggan Berstatus Normal</p>
            <p className="text-xs text-slate-500 mt-1">Tidak ada pelanggan yang tertunggak atau ter-isolir saat ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="pb-3 font-semibold">Pelanggan</th>
                  <th className="pb-3 font-semibold">Paket & Biaya</th>
                  <th className="pb-3 font-semibold">Jatuh Tempo</th>
                  <th className="pb-3 font-semibold">Status Isolir</th>
                  <th className="pb-3 font-semibold text-right">Tindakan Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {urgentCustomers.map(cust => (
                  <tr key={cust.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5">
                      <div className="font-bold text-white">{cust.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{cust.pppoeUsername} • {cust.phone}</div>
                    </td>
                    <td className="py-3.5">
                      <div className="text-slate-300">{cust.profileName}</div>
                      <div className="text-[11px] font-semibold text-indigo-400">
                        Rp {cust.monthlyFee.toLocaleString('id-ID')}
                      </div>
                    </td>
                    <td className="py-3.5">
                      <div className="font-medium text-slate-300">{cust.expiredDate}</div>
                      <div className="text-[10px] text-slate-500">Tgl {cust.billingDate} per bulan</div>
                    </td>
                    <td className="py-3.5">
                      {cust.status === 'isolated' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          <AlertCircle className="w-3 h-3" /> TER-ISOLIR
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          MENJELANG EXPIRED
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => onSendWaNotification(cust, cust.status === 'isolated' ? 'isolir' : 'reminder')}
                          className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded-lg text-[11px] font-semibold transition flex items-center gap-1"
                          title="Kirim pengingat via WhatsApp"
                        >
                          <Send className="w-3 h-3" />
                          <span>Kirim WA</span>
                        </button>

                        <button
                          onClick={() => onToggleIsolir(cust)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${
                            cust.status === 'isolated'
                              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                              : 'bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300'
                          }`}
                        >
                          {cust.status === 'isolated' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Buka Isolir</span>
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="w-3 h-3" />
                              <span>Isolir Manual</span>
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
