import React, { useEffect, useState } from 'react';
import { Customer, Invoice, Voucher, RouterConfig } from '../../types';
import { StorageService } from '../../services/storage';
import {
  Activity,
  ArrowUpRight,
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

interface TrafficSample {
  sampledAt: string;
  rxBitsPerSecond: number;
  txBitsPerSecond: number;
}

function formatBitrate(bitsPerSecond: number): string {
  if (bitsPerSecond >= 1_000_000_000) return `${(bitsPerSecond / 1_000_000_000).toFixed(2)} Gbps`;
  if (bitsPerSecond >= 1_000_000) return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`;
  if (bitsPerSecond >= 1_000) return `${(bitsPerSecond / 1_000).toFixed(1)} Kbps`;
  return `${Math.round(bitsPerSecond)} bps`;
}

const InterfaceTrafficPanel: React.FC<{ routers: RouterConfig[] }> = ({ routers }) => {
  const connectedRouters = routers.filter(router => router.status === 'connected');
  const [selectedRouterId, setSelectedRouterId] = useState('');
  const [interfaces, setInterfaces] = useState<string[]>([]);
  const [selectedInterface, setSelectedInterface] = useState('');
  const [samples, setSamples] = useState<TrafficSample[]>([]);
  const [error, setError] = useState('');
  const [loadingInterfaces, setLoadingInterfaces] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!connectedRouters.some(router => router.id === selectedRouterId)) {
      setSelectedRouterId(connectedRouters[0]?.id || '');
    }
  }, [connectedRouters, selectedRouterId]);

  useEffect(() => {
    if (!selectedRouterId) {
      setInterfaces([]);
      setSelectedInterface('');
      setSamples([]);
      return;
    }
    let active = true;
    setLoadingInterfaces(true);
    setError('');
    setSamples([]);
    fetch(`/api/mikrotik/interfaces?routerId=${encodeURIComponent(selectedRouterId)}`)
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        if (!Array.isArray(result.interfaces)) throw new Error('Daftar interface dari router tidak valid');
        if (!active) return;
        const nextInterfaces = result.interfaces.filter((item: unknown): item is string => typeof item === 'string' && item.length > 0);
        setInterfaces(nextInterfaces);
        setSelectedInterface(current => nextInterfaces.includes(current) ? current : nextInterfaces[0] || '');
      })
      .catch(fetchError => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      })
      .finally(() => {
        if (active) setLoadingInterfaces(false);
      });
    return () => { active = false; };
  }, [selectedRouterId]);

  useEffect(() => {
    if (!selectedRouterId || !selectedInterface) return;
    let active = true;
    let timer: number | undefined;
    const sample = async () => {
      try {
        const query = new URLSearchParams({ routerId: selectedRouterId, interface: selectedInterface });
        const response = await fetch(`/api/mikrotik/interface-traffic?${query}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        if (
          typeof result.sampledAt !== 'string' ||
          typeof result.rxBitsPerSecond !== 'number' ||
          typeof result.txBitsPerSecond !== 'number'
        ) throw new Error('Data trafik router tidak valid');
        if (!active) return;
        setError('');
        setSamples(current => [...current, result as TrafficSample].slice(-30));
      } catch (fetchError) {
        if (active) setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      } finally {
        if (active) timer = window.setTimeout(() => void sample(), 2000);
      }
    };
    setSamples([]);
    void sample();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [selectedRouterId, selectedInterface, refreshKey]);

  const latest = samples[samples.length - 1];
  const maxRate = Math.max(1, ...samples.flatMap(sample => [sample.rxBitsPerSecond, sample.txBitsPerSecond])) * 1.15;
  const chartWidth = 640;
  const chartHeight = 164;
  const pointFor = (value: number, index: number) => {
    const x = samples.length < 2 ? chartWidth : (index / (samples.length - 1)) * chartWidth;
    const y = chartHeight - (value / maxRate) * (chartHeight - 12) - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const rxPoints = samples.map((sample, index) => pointFor(sample.rxBitsPerSecond, index)).join(' ');
  const txPoints = samples.map((sample, index) => pointFor(sample.txBitsPerSecond, index)).join(' ');

  return (
    <section className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            <h3 className="text-base font-bold text-foreground">Pemantauan Trafik Interface</h3>
            {latest && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-label="Live" />}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Kecepatan Rx/Tx aktual dari RouterOS, diperbarui setiap 2 detik.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="traffic-router">Pilih router</label>
          <select
            id="traffic-router"
            value={selectedRouterId}
            onChange={event => setSelectedRouterId(event.target.value)}
            disabled={!connectedRouters.length}
            className="min-w-36 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
          >
            {connectedRouters.length
              ? connectedRouters.map(router => <option key={router.id} value={router.id}>{router.name}</option>)
              : <option value="">Tidak ada router online</option>}
          </select>
          <label className="sr-only" htmlFor="traffic-interface">Pilih interface</label>
          <select
            id="traffic-interface"
            value={selectedInterface}
            onChange={event => setSelectedInterface(event.target.value)}
            disabled={!interfaces.length || loadingInterfaces}
            className="min-w-36 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
          >
            {interfaces.length
              ? interfaces.map(name => <option key={name} value={name}>{name}</option>)
              : <option value="">{loadingInterfaces ? 'Memuat interface...' : 'Pilih interface'}</option>}
          </select>
          <button
            type="button"
            onClick={() => setRefreshKey(current => current + 1)}
            disabled={!selectedInterface}
            className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground hover:bg-muted disabled:opacity-50"
          >Perbarui</button>
        </div>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}

      {latest ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-[11px] text-muted-foreground">Download · Rx</div>
              <div className="mt-1 text-lg font-bold text-emerald-400">{formatBitrate(latest.rxBitsPerSecond)}</div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-[11px] text-muted-foreground">Upload · Tx</div>
              <div className="mt-1 text-lg font-bold text-blue-400">{formatBitrate(latest.txBitsPerSecond)}</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-border bg-background p-3">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`Grafik trafik ${selectedInterface}`} className="h-40 w-full overflow-visible">
              {[0, 1, 2, 3].map(line => {
                const y = (chartHeight / 3) * line;
                return <line key={line} x1="0" x2={chartWidth} y1={y} y2={y} className="stroke-slate-700" strokeWidth="1" strokeDasharray="4 5" />;
              })}
              {samples.length > 1 && (
                <>
                  <polyline points={rxPoints} fill="none" className="stroke-emerald-500" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={txPoints} fill="none" className="stroke-blue-500" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
              {samples.length === 1 && (
                <>
                  <circle cx={chartWidth} cy={pointFor(latest.rxBitsPerSecond, 0).split(',')[1]} r="5" className="fill-emerald-500" />
                  <circle cx={chartWidth} cy={pointFor(latest.txBitsPerSecond, 0).split(',')[1]} r="5" className="fill-blue-500" />
                </>
              )}
            </svg>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Download</span>
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-blue-500" /> Upload</span>
              </div>
              <span>Terakhir diperbarui {new Date(latest.sampledAt).toLocaleTimeString('id-ID')}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-5 grid min-h-48 place-items-center rounded-xl border border-dashed border-border bg-background p-6 text-center">
          {connectedRouters.length && selectedInterface
            ? <p className="text-sm text-muted-foreground">Mengambil sampel trafik dari {selectedInterface}...</p>
            : <p className="text-sm text-muted-foreground">Pilih router yang online dan interface untuk mulai memantau trafik.</p>}
        </div>
      )}
    </section>
  );
};

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
  // Derived metrics
  const totalRevenue = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + i.totalAmount, 0) +
    vouchers.reduce((sum, v) => sum + (v.status !== 'unused' ? v.price : 0), 0);

  const activeCustomers = customers.filter(c => c.status === 'active').length;
  const isolatedCustomers = customers.filter(c => c.status === 'isolated' || c.status === 'disabled').length;
  const expiringCustomers = customers.filter(c => c.status === 'expiring').length;

  const urgentCustomers = customers.filter(c => c.status === 'isolated' || c.status === 'disabled' || c.status === 'expiring');

  const mainRouter = routers.find(router => router.status === 'connected');

  return (
    <div className="space-y-6">
      {/* Top Welcome / Status Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {mainRouter ? `RouterOS terhubung • ${mainRouter.rosVersion}` : 'Tidak ada router MikroTik terhubung'}
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Network Operations & Billing Center
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">
              Data yang ditampilkan berasal dari pelanggan, invoice, voucher, serta router yang tersimpan dan berhasil dimuat.
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
            <span className="text-xs font-medium text-slate-400">Total Pendapatan Tercatat</span>
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
              <span>{invoices.filter(invoice => invoice.status === 'paid').length} invoice lunas</span>
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
              <span>{mainRouter?.activeHotspot ?? '—'} user hotspot aktif</span>
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
              {mainRouter ? `${mainRouter.cpuLoad}%` : '—'} <span className="text-xs font-normal text-slate-400">CPU Usage</span>
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400 font-mono">
              <span>Free RAM: {mainRouter?.memoryFreeMb ?? '—'} MB</span>
              <span className="text-slate-400 font-semibold">Uptime: {mainRouter?.uptime ?? '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Router telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <InterfaceTrafficPanel routers={routers} />

        {/* Router status */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-400" />
                <span>Status Router MikroTik</span>
              </h3>
              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${mainRouter ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                {mainRouter ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-slate-400 text-[11px]">Nama Perangkat</div>
                <div className="font-bold text-white mt-0.5">{mainRouter?.name || 'Belum terhubung'}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{mainRouter ? `${mainRouter.model} • ${mainRouter.rosVersion}` : 'Tidak ada telemetri router'}</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[10px]">PPPoE Secrets</div>
                  <div className="text-lg font-bold text-indigo-400">{mainRouter?.activePppoe ?? '—'}</div>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[10px]">Hotspot Active</div>
                  <div className="text-lg font-bold text-violet-400">{mainRouter?.activeHotspot ?? '—'}</div>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                  <span>Beban CPU MikroTik</span>
                  <span className="text-white font-bold">{mainRouter ? `${mainRouter.cpuLoad}%` : '—'}</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${mainRouter?.cpuLoad ?? 0}%` }}
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
                      <div className="text-slate-300">{cust.servicePackageName || cust.profileName}</div>
                      {cust.servicePackageName && <div className="text-[10px] text-slate-500">PPP profile: {cust.profileName}</div>}
                      <div className="text-[11px] font-semibold text-indigo-400">
                        Rp {cust.monthlyFee.toLocaleString('id-ID')}
                      </div>
                    </td>
                    <td className="py-3.5">
                      <div className="font-medium text-slate-300">{cust.expiredDate}</div>
                      <div className="text-[10px] text-slate-500">Tgl {cust.billingDate} per bulan</div>
                    </td>
                    <td className="py-3.5">
                      {cust.status === 'isolated' || cust.status === 'disabled' ? (
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
                          onClick={() => onSendWaNotification(cust, cust.status === 'isolated' || cust.status === 'disabled' ? 'isolir' : 'reminder')}
                          className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded-lg text-[11px] font-semibold transition flex items-center gap-1"
                          title="Kirim pengingat via WhatsApp"
                        >
                          <Send className="w-3 h-3" />
                          <span>Kirim WA</span>
                        </button>

                        <button
                          onClick={() => onToggleIsolir(cust)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${
                            cust.status === 'isolated' || cust.status === 'disabled'
                              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                              : 'bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300'
                          }`}
                        >
                          {cust.status === 'isolated' || cust.status === 'disabled' ? (
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
