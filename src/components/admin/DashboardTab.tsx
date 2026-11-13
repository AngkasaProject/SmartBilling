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
  Server,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Wifi,
  RefreshCw,
  Terminal,
  Search,
  CircleCheck,
  CircleX,
  ListFilter
} from 'lucide-react';

interface RouterLogEntry {
  id: string;
  time: string;
  topics: string;
  message: string;
}

interface ParsedRouterLog extends RouterLogEntry {
  user: string;
  ip: string;
  isHotspot: boolean;
  isFailure: boolean;
}

function parseRouterLog(entry: RouterLogEntry): ParsedRouterLog {
  const source = `${entry.topics} ${entry.message}`;
  const ipMatch = entry.message.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  const userIpMatch = entry.message.match(/(?:user\s+)?([^\s(),]+)\s+\(((?:\d{1,3}\.){3}\d{1,3})\)/i);
  const userFromMatch = entry.message.match(/\buser\s+([^\s(),]+).*?\b(?:from|address)\s+((?:\d{1,3}\.){3}\d{1,3})/i);
  const userLoginMatch = entry.message.match(/\b(?:login|logged in|logged out)\s+(?:for\s+)?([^\s(),]+).*?\bfrom\s+((?:\d{1,3}\.){3}\d{1,3})/i);
  const user = userIpMatch?.[1] || userFromMatch?.[1] || userLoginMatch?.[1] || '';
  const ip = userIpMatch?.[2] || userFromMatch?.[2] || userLoginMatch?.[2] || ipMatch?.[0] || '';
  const lowerMessage = entry.message.toLowerCase();

  return {
    ...entry,
    user,
    ip,
    isHotspot: /hotspot|login|logged in|logged out|cookie|chap/.test(source.toLowerCase()),
    isFailure: /fail|invalid|error|denied|reject/.test(lowerMessage),
  };
}

const RouterLogsPanel: React.FC<{ routers: RouterConfig[] }> = ({ routers }) => {
  const [selectedRouterId, setSelectedRouterId] = useState('');
  const [entries, setEntries] = useState<RouterLogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<'hotspot' | 'all'>('hotspot');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const selectedRouter = routers.find(router => router.id === selectedRouterId);
  const parsedEntries = entries.map(parseRouterLog);
  const visibleEntries = parsedEntries.filter(entry => {
    if (logFilter === 'hotspot' && !entry.isHotspot) return false;
    const search = searchTerm.trim().toLowerCase();
    return !search || `${entry.user} ${entry.ip} ${entry.message} ${entry.topics}`.toLowerCase().includes(search);
  });
  const hotspotCount = parsedEntries.filter(entry => entry.isHotspot).length;
  const failedCount = parsedEntries.filter(entry => entry.isHotspot && entry.isFailure).length;

  useEffect(() => {
    if (!routers.some(router => router.id === selectedRouterId)) {
      setSelectedRouterId(routers[0]?.id || '');
    }
  }, [routers, selectedRouterId]);

  useEffect(() => {
    if (!selectedRouterId) {
      setEntries([]);
      setError('');
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    fetch(`/api/mikrotik/logs?routerId=${encodeURIComponent(selectedRouterId)}`, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        if (!Array.isArray(result.entries)) throw new Error('Format log router tidak valid');
        if (active) setEntries(result.entries as RouterLogEntry[]);
      })
      .catch(fetchError => {
        if (active) {
          setEntries([]);
          setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [selectedRouterId, refreshKey]);

  useEffect(() => {
    if (!selectedRouterId) return;
    const interval = window.setInterval(() => setRefreshKey(value => value + 1), 15_000);
    return () => window.clearInterval(interval);
  }, [selectedRouterId]);

  return (
    <section className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-base font-bold text-foreground">Log router</h3>
            {selectedRouter && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${selectedRouter.status === 'connected' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-border bg-secondary text-muted-foreground'}`}>
                {selectedRouter.status === 'connected' ? 'ONLINE' : 'OFFLINE'}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Log terbaru dari RouterOS, diperbarui otomatis setiap 15 detik.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey(value => value + 1)}
          disabled={!selectedRouterId || loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Perbarui
        </button>
      </div>

      {routers.length > 1 ? (
        <div className="mt-4 flex gap-2 overflow-x-auto border-b border-border pb-2" role="tablist" aria-label="Pilih server MikroTik">
          {routers.map(router => (
            <button
              key={router.id}
              type="button"
              role="tab"
              aria-selected={selectedRouterId === router.id}
              onClick={() => setSelectedRouterId(router.id)}
              className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium transition ${selectedRouterId === router.id ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-secondary-foreground hover:bg-muted'}`}
            >
              {router.name}
              <span className={`ml-2 inline-block h-1.5 w-1.5 rounded-full ${router.status === 'connected' ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-muted-foreground'}`} />
            </button>
          ))}
        </div>
      ) : selectedRouter ? (
        <p className="mt-3 text-xs font-medium text-muted-foreground">{selectedRouter.name}</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Log diterima</p>
          <p className="mt-1 text-lg font-bold text-foreground">{entries.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Aktivitas hotspot</p>
          <p className="mt-1 text-lg font-bold text-foreground">{hotspotCount}</p>
        </div>
        <div className="col-span-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 sm:col-span-1">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <CircleX className="h-3 w-3 text-rose-500" /> Login gagal / error
          </p>
          <p className="mt-1 text-lg font-bold text-destructive">{failedCount}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="relative block flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Cari username, IP, atau pesan..."
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/30"
          />
        </label>
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-background p-1">
          <ListFilter className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
          <button
            type="button"
            onClick={() => setLogFilter('hotspot')}
            aria-pressed={logFilter === 'hotspot'}
            className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${logFilter === 'hotspot' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Hotspot
          </button>
          <button
            type="button"
            onClick={() => setLogFilter('all')}
            aria-pressed={logFilter === 'all'}
            className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${logFilter === 'all' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Semua log
          </button>
        </div>
      </div>

      <div className="mt-3 max-h-[22rem] min-h-44 overflow-auto rounded-xl border border-border bg-background">
        {loading && !entries.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Memuat log router...</p>
        ) : error ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Log tidak dapat dimuat. Periksa koneksi router dan coba perbarui.</p>
        ) : visibleEntries.length ? (
          <table className="w-full min-w-[34rem] border-collapse text-left text-[11px]">
            <thead className="sticky top-0 z-10 bg-secondary text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-20 border-b border-border px-3 py-2 font-semibold">Waktu</th>
                <th className="w-40 border-b border-border px-3 py-2 font-semibold">User (IP)</th>
                <th className="border-b border-border px-3 py-2 font-semibold">Pesan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleEntries.map(entry => (
                <tr key={entry.id} className="align-top transition hover:bg-muted/50">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-muted-foreground">{entry.time || '—'}</td>
                  <td className="px-3 py-2">
                    {entry.user || entry.ip ? (
                      <>
                        <span className="block break-all font-semibold text-foreground">{entry.user || '—'}</span>
                        {entry.ip && <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{entry.ip}</span>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-1.5">
                      {entry.isFailure
                        ? <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                        : entry.isHotspot
                          ? <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                          : <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className="break-words text-foreground">{entry.message || '—'}</span>
                    </div>
                    <span className="mt-1 block break-all font-mono text-[9px] text-muted-foreground">{entry.topics || 'system'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {entries.length
              ? 'Tidak ada log yang cocok dengan filter atau pencarian.'
              : selectedRouterId ? 'Belum ada entri log pada router ini.' : 'Belum ada server MikroTik yang dikonfigurasi.'}
          </p>
        )}
      </div>
    </section>
  );
};

interface TrafficSample {
  sampledAt: string;
  rxBitsPerSecond: number;
  txBitsPerSecond: number;
}

type TrafficRange = '1h' | '6h' | '24h' | '7d';

const trafficRanges: Array<{ value: TrafficRange; label: string; milliseconds: number }> = [
  { value: '1h', label: '1 jam', milliseconds: 60 * 60 * 1000 },
  { value: '6h', label: '6 jam', milliseconds: 6 * 60 * 60 * 1000 },
  { value: '24h', label: '24 jam', milliseconds: 24 * 60 * 60 * 1000 },
  { value: '7d', label: '7 hari', milliseconds: 7 * 24 * 60 * 60 * 1000 },
];

function formatBitrate(bitsPerSecond: number): string {
  if (bitsPerSecond >= 1_000_000_000) return `${(bitsPerSecond / 1_000_000_000).toFixed(2)} Gbps`;
  if (bitsPerSecond >= 1_000_000) return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`;
  if (bitsPerSecond >= 1_000) return `${(bitsPerSecond / 1_000).toFixed(1)} Kbps`;
  return `${Math.round(bitsPerSecond)} bps`;
}

function getNiceRateScale(maximum: number): number {
  const rawScale = Math.max(maximum * 1.1, 1);
  const exponent = Math.floor(Math.log10(rawScale));
  const magnitude = 10 ** exponent;
  const fraction = rawScale / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

function isTrafficSample(value: unknown): value is TrafficSample {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'sampledAt' in value &&
    typeof value.sampledAt === 'string' &&
    Number.isFinite(Date.parse(value.sampledAt)) &&
    'rxBitsPerSecond' in value &&
    typeof value.rxBitsPerSecond === 'number' &&
    Number.isFinite(value.rxBitsPerSecond) &&
    value.rxBitsPerSecond >= 0 &&
    'txBitsPerSecond' in value &&
    typeof value.txBitsPerSecond === 'number' &&
    Number.isFinite(value.txBitsPerSecond) &&
    value.txBitsPerSecond >= 0
  );
}

const InterfaceTrafficPanel: React.FC<{ routers: RouterConfig[] }> = ({ routers }) => {
  const connectedRouters = routers.filter(router => router.status === 'connected');
  const [selectedRouterId, setSelectedRouterId] = useState('');
  const [interfaces, setInterfaces] = useState<string[]>([]);
  const [selectedInterface, setSelectedInterface] = useState('');
  const [liveSamples, setLiveSamples] = useState<TrafficSample[]>([]);
  const [historySamples, setHistorySamples] = useState<TrafficSample[]>([]);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [loadingInterfaces, setLoadingInterfaces] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedRange, setSelectedRange] = useState<TrafficRange>('1h');
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
      setLiveSamples([]);
      return;
    }
    let active = true;
    setLoadingInterfaces(true);
    setError('');
    setLiveSamples([]);
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
    if (!selectedRouterId || !selectedInterface) {
      setHistorySamples([]);
      setHistoryError('');
      return;
    }
    let active = true;
    setLoadingHistory(true);
    setHistoryError('');
    setHistorySamples([]);
    const query = new URLSearchParams({
      routerId: selectedRouterId,
      interface: selectedInterface,
      range: selectedRange,
    });
    fetch(`/api/mikrotik/interface-traffic/history?${query}`, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        if (!Array.isArray(result.samples) || !result.samples.every(isTrafficSample)) {
          throw new Error('Format riwayat trafik tidak valid');
        }
        if (active) setHistorySamples(result.samples as TrafficSample[]);
      })
      .catch(fetchError => {
        if (active) {
          setHistorySamples([]);
          setHistoryError(fetchError instanceof Error ? fetchError.message : String(fetchError));
        }
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => { active = false; };
  }, [selectedRouterId, selectedInterface, selectedRange]);

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
        if (!isTrafficSample(result)) throw new Error('Data trafik router tidak valid');
        if (!active) return;
        setError('');
        setLiveSamples(current => [...current, result].slice(-30));
      } catch (fetchError) {
        if (active) setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      } finally {
        if (active) timer = window.setTimeout(() => void sample(), 2000);
      }
    };
    setLiveSamples([]);
    void sample();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [selectedRouterId, selectedInterface, refreshKey]);

  const selectedRangeMilliseconds = trafficRanges.find(range => range.value === selectedRange)?.milliseconds ?? trafficRanges[0].milliseconds;
  const rangeStart = Date.now() - selectedRangeMilliseconds;
  const chartSamples = [...historySamples, ...liveSamples]
    .filter(sample => Date.parse(sample.sampledAt) >= rangeStart)
    .reduce<TrafficSample[]>((unique, sample) => {
      if (!unique.some(item => item.sampledAt === sample.sampledAt)) unique.push(sample);
      return unique;
    }, [])
    .sort((left, right) => left.sampledAt.localeCompare(right.sampledAt));
  const latest = liveSamples[liveSamples.length - 1] || chartSamples[chartSamples.length - 1];
  const maxRate = getNiceRateScale(Math.max(0, ...chartSamples.flatMap(sample => [sample.rxBitsPerSecond, sample.txBitsPerSecond])));
  const rateUnit = maxRate >= 1_000_000_000
    ? { divisor: 1_000_000_000, label: 'Gbps' }
    : maxRate >= 1_000_000
      ? { divisor: 1_000_000, label: 'Mbps' }
      : maxRate >= 1_000
        ? { divisor: 1_000, label: 'Kbps' }
        : { divisor: 1, label: 'bps' };
  const formatAxisRate = (bitsPerSecond: number) => {
    const value = bitsPerSecond / rateUnit.divisor;
    return `${Number(value.toFixed(value < 10 ? 1 : 0))} ${rateUnit.label}`;
  };
  const chartWidth = 700;
  const chartHeight = 220;
  const plotLeft = 82;
  const plotRight = 690;
  const plotTop = 14;
  const plotBottom = 180;
  const plotHeight = plotBottom - plotTop;
  const plotWidth = plotRight - plotLeft;
  const pointFor = (value: number, index: number) => {
    const timestamp = Date.parse(chartSamples[index].sampledAt);
    const x = plotLeft + Math.max(0, Math.min(1, (timestamp - rangeStart) / selectedRangeMilliseconds)) * plotWidth;
    const y = plotBottom - (value / maxRate) * plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const rxPoints = chartSamples.map((sample, index) => pointFor(sample.rxBitsPerSecond, index)).join(' ');
  const txPoints = chartSamples.map((sample, index) => pointFor(sample.txBitsPerSecond, index)).join(' ');
  const rangeEnd = new Date(rangeStart + selectedRangeMilliseconds);
  const formatAxisTime = (time: number) => new Date(time).toLocaleString('id-ID', selectedRangeMilliseconds > 24 * 60 * 60 * 1000
    ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' });

  return (
    <section className="lg:col-span-2 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-base font-bold text-foreground">Lalu lintas interface</h3>
            {latest && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-label="Live" />}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Data Rx/Tx RouterOS diperbarui setiap 2 detik.</p>
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
          <label className="sr-only" htmlFor="traffic-range">Rentang riwayat trafik</label>
          <select
            id="traffic-range"
            value={selectedRange}
            onChange={event => setSelectedRange(event.target.value as TrafficRange)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
          >
            {trafficRanges.map(range => (
              <option key={range.value} value={range.value}>{range.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setRefreshKey(current => current + 1)}
            disabled={!selectedInterface}
            className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground hover:bg-muted disabled:opacity-50"
          >Perbarui</button>
        </div>
      </div>

      {(error || historyError) && (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error || historyError}
        </p>
      )}

      {latest ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-[11px] text-muted-foreground">Download · Rx</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{formatBitrate(latest.rxBitsPerSecond)}</div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-[11px] text-muted-foreground">Upload · Tx</div>
              <div className="mt-1 text-lg font-semibold text-muted-foreground">{formatBitrate(latest.txBitsPerSecond)}</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-border bg-background p-3">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`Grafik lalu lintas ${selectedInterface} dalam ${rateUnit.label}`} className="h-52 w-full">
              {[0, 1, 2, 3, 4].map(tick => {
                const y = plotTop + (plotHeight / 4) * tick;
                const value = maxRate * (1 - tick / 4);
                return (
                  <g key={tick}>
                    <line x1={plotLeft} x2={plotRight} y1={y} y2={y} className="stroke-border" strokeWidth="1" strokeDasharray="4 5" />
                    <text x="0" y={y + 4} className="fill-muted-foreground" fontSize="10">{formatAxisRate(value)}</text>
                  </g>
                );
              })}
              {chartSamples.length > 1 && (
                <>
                  <polyline points={rxPoints} fill="none" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={txPoints} fill="none" className="stroke-muted-foreground" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
              {chartSamples.length === 1 && (
                <>
                  <circle cx={pointFor(latest.rxBitsPerSecond, 0).split(',')[0]} cy={pointFor(latest.rxBitsPerSecond, 0).split(',')[1]} r="5" className="fill-primary" />
                  <circle cx={pointFor(latest.txBitsPerSecond, 0).split(',')[0]} cy={pointFor(latest.txBitsPerSecond, 0).split(',')[1]} r="5" className="fill-muted-foreground" />
                </>
              )}
              {[rangeStart, rangeStart + selectedRangeMilliseconds / 2, rangeEnd.getTime()].map((time, index) => {
                const x = plotLeft + (plotWidth / 2) * index;
                return (
                  <text
                    key={time}
                    x={x}
                    y={chartHeight - 3}
                    textAnchor={index === 0 ? 'start' : index === 2 ? 'end' : 'middle'}
                    className="fill-muted-foreground"
                    fontSize="10"
                  >
                    {formatAxisTime(time)}
                  </text>
                );
              })}
            </svg>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-primary" /> Download</span>
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-muted-foreground" /> Upload</span>
              </div>
              <span>
                {loadingHistory ? 'Memuat riwayat...' : `Diperbarui ${new Date(latest.sampledAt).toLocaleTimeString('id-ID')}`}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-5 grid min-h-48 place-items-center rounded-xl border border-dashed border-border bg-background p-6 text-center">
          {connectedRouters.length && selectedInterface
            ? <p className="text-sm text-muted-foreground">{loadingHistory ? 'Memuat riwayat dan menunggu sampel live...' : 'Menunggu sampel trafik dari RouterOS...'}</p>
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
    vouchers
      .filter(v => v.status === 'active' || v.status === 'expired')
      .reduce((sum, v) => sum + v.price, 0);
  const [reportedRevenue, setReportedRevenue] = useState<number | null>(null);
  const [reportedInvoiceCount, setReportedInvoiceCount] = useState<number | null>(null);
  const [revenueError, setRevenueError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/admin/revenue', { cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        if (
          typeof result.summary?.totalRevenue !== 'number' ||
          typeof result.summary?.invoiceCount !== 'number'
        ) {
          throw new Error('Ringkasan pendapatan tidak valid');
        }
        if (active) {
          setReportedRevenue(result.summary.totalRevenue);
          setReportedInvoiceCount(result.summary.invoiceCount);
          setRevenueError('');
        }
      })
      .catch(error => {
        if (active) setRevenueError(error instanceof Error ? error.message : String(error));
      });
    return () => { active = false; };
  }, [invoices, vouchers]);

  const activeCustomers = customers.filter(c => c.status === 'active').length;
  const isolatedCustomers = customers.filter(c => c.status === 'isolated' || c.status === 'disabled').length;
  const expiringCustomers = customers.filter(c => c.status === 'expiring').length;
  const issuedVouchers = vouchers.filter(v => v.status !== 'pending').length;

  const urgentCustomers = customers.filter(c => c.status === 'isolated' || c.status === 'disabled' || c.status === 'expiring');

  const mainRouter = routers.find(router => router.status === 'connected');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <button
          type="button"
          onClick={() => onNavigateTab('revenue')}
          aria-label="Buka riwayat pendapatan"
          className="w-full rounded-xl border border-border bg-card p-5 text-left text-card-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:col-span-2"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">Pendapatan tercatat</span>
            <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-semibold tracking-tight text-foreground">
              Rp {(reportedRevenue ?? totalRevenue).toLocaleString('id-ID')}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{reportedInvoiceCount ?? invoices.filter(invoice => invoice.status === 'paid').length} invoice lunas</span>
              <span className="font-medium text-foreground">Buka riwayat <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></span>
            </div>
            {revenueError && <span className="mt-2 block text-[11px] text-amber-700 dark:text-amber-400">Statistik laporan belum dimuat dari server.</span>}
          </div>
        </button>

        <article className="rounded-xl border border-border bg-card p-5 text-card-foreground">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Pelanggan PPPoE</span>
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              {activeCustomers} <span className="text-sm font-normal text-muted-foreground">aktif</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">dari {customers.length} pelanggan</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                {isolatedCustomers} isolir / nonaktif
              </span>
              <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {expiringCustomers} segera berakhir
              </span>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-border bg-card p-5 text-card-foreground">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Voucher diterbitkan</span>
            <Ticket className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              {issuedVouchers} <span className="text-sm font-normal text-muted-foreground">voucher</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Wifi className="w-3 h-3" />
              <span>{mainRouter?.activeHotspot ?? '—'} pengguna Hotspot aktif</span>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-border bg-card p-5 text-card-foreground">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Kondisi router</span>
            <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              {mainRouter ? `${mainRouter.cpuLoad}%` : '—'} <span className="text-xs font-normal text-muted-foreground">CPU</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span>RAM bebas: {mainRouter?.memoryFreeMb ?? '—'} MB</span>
              <span className="font-medium">Waktu aktif: {mainRouter?.uptime ?? '—'}</span>
            </div>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">{mainRouter?.name ?? 'Tidak ada router online'}</p>
          </div>
        </article>
      </div>

      {/* Router telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <InterfaceTrafficPanel routers={routers} />
        <RouterLogsPanel routers={routers} />
      </div>

      {/* Urgent Attention Table (Expiring & Isolated Customers) */}
      <div className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <span>Perlu tindak lanjut</span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{urgentCustomers.length}</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pelanggan yang masa aktifnya segera berakhir, terisolir, atau nonaktif.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('customers')}
            className="inline-flex min-h-11 items-center gap-1 self-start text-xs font-medium text-primary hover:underline sm:self-auto"
          >
            <span>Lihat semua pelanggan</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {urgentCustomers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Tidak ada pelanggan yang perlu ditindaklanjuti</p>
            <p className="mt-1 text-xs text-muted-foreground">Pelanggan mendekati masa berakhir atau terisolir akan muncul di sini.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 lg:hidden">
              {urgentCustomers.map(cust => {
                const isIsolated = cust.status === 'isolated' || cust.status === 'disabled';
                return (
                  <article key={cust.id} className="space-y-3 rounded-lg border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{cust.name}</p>
                        <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
                          {cust.pppoeUsername}{cust.phone ? ` · ${cust.phone}` : ''}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-medium ${
                        isIsolated
                          ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      }`}>
                        {isIsolated ? 'Isolir / nonaktif' : 'Segera berakhir'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="text-muted-foreground">Paket</p>
                        <p className="mt-0.5 truncate font-medium text-foreground">{cust.servicePackageName || cust.profileName}</p>
                        <p className="mt-0.5 text-muted-foreground">Rp {cust.monthlyFee.toLocaleString('id-ID')} / bulan</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Masa aktif</p>
                        <p className="mt-0.5 font-medium text-foreground">{cust.expiredDate}</p>
                        <p className="mt-0.5 text-muted-foreground">Tanggal {cust.billingDate}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onSendWaNotification(cust, 'reminder')}
                        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-border bg-secondary px-2 text-xs font-medium text-secondary-foreground transition hover:bg-muted"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Kirim WA
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleIsolir(cust)}
                        className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition ${
                          isIsolated
                            ? 'bg-primary text-primary-foreground hover:opacity-90'
                            : 'border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20'
                        }`}
                      >
                        {isIsolated ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                        {isIsolated ? 'Aktifkan billing' : 'Isolir billing'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 font-semibold">Pelanggan</th>
                  <th className="pb-3 font-semibold">Paket & biaya</th>
                  <th className="pb-3 font-semibold">Masa aktif</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold text-right">Tindakan Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {urgentCustomers.map(cust => (
                  <tr key={cust.id} className="transition-colors hover:bg-muted/50">
                    <td className="py-3.5">
                      <div className="font-medium text-foreground">{cust.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{cust.pppoeUsername}{cust.phone ? ` · ${cust.phone}` : ''}</div>
                    </td>
                    <td className="py-3.5">
                      <div className="text-foreground">{cust.servicePackageName || cust.profileName}</div>
                      {cust.servicePackageName && <div className="text-[10px] text-muted-foreground">PPP profile: {cust.profileName}</div>}
                      <div className="text-[11px] font-medium text-muted-foreground">
                        Rp {cust.monthlyFee.toLocaleString('id-ID')}
                      </div>
                    </td>
                    <td className="py-3.5">
                      <div className="font-medium text-foreground">{cust.expiredDate}</div>
                      <div className="text-[10px] text-muted-foreground">Tanggal billing {cust.billingDate}</div>
                    </td>
                    <td className="py-3.5">
                      {cust.status === 'isolated' || cust.status === 'disabled' ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[10px] font-medium text-rose-700 dark:text-rose-400">
                          <AlertCircle className="w-3 h-3" /> TER-ISOLIR
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          MENJELANG EXPIRED
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSendWaNotification(cust, 'reminder')}
                          className="flex min-h-9 items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-[11px] font-medium text-secondary-foreground transition hover:bg-muted"
                          title="Kirim pengingat via WhatsApp"
                        >
                          <Send className="w-3 h-3" />
                          <span>Kirim WA</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onToggleIsolir(cust)}
                          title="Ubah status billing; perubahan akses RouterOS dikonfirmasi terpisah"
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${
                            cust.status === 'isolated' || cust.status === 'disabled'
                              ? 'bg-primary text-primary-foreground hover:opacity-90'
                              : 'border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20'
                          }`}
                        >
                          {cust.status === 'isolated' || cust.status === 'disabled' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Aktifkan billing</span>
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="w-3 h-3" />
                              <span>Isolir billing</span>
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
          </>
        )}
      </div>
    </div>
  );
};
