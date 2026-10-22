import React, { useEffect, useState } from 'react';
import { RouterConfig } from '../../types';
import { StorageService } from '../../services/storage';
import { getMikrotikIsolirScript, getHotspotWalledGardenScript } from '../../services/mikrotikScripts';
import { useToast } from '../ui/toast';
import {
  Server,
  Zap,
  Activity,
  Copy,
  Check,
  ShieldAlert,
  Wifi,
  ExternalLink,
  Cpu,
  RefreshCw,
  Plus,
  Terminal,
  Pencil,
  Trash2,
} from 'lucide-react';

interface Props {
  routers: RouterConfig[];
  onRefreshData: () => void;
}

interface RouterServiceRecord {
  id: string;
  name: string;
  interface: string;
  disabled: boolean;
  profile?: string;
  addressPool?: string;
  serviceName?: string;
  defaultProfile?: string;
}

interface PppProfileRecord { name: string; rateLimit: string; localAddress: string; remoteAddress: string; dnsServers: string }
interface HotspotUserProfileRecord { name: string; rateLimit: string; sharedUsers: number; sessionTimeout: string; idleTimeout: string }
interface HotspotServerProfileRecord {
  name: string;
  hotspotAddress: string;
  dnsName: string;
  htmlDirectory: string;
  loginBy: string;
  useRadius: boolean;
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    if (response.status === 502) {
      throw new Error('HTTP 502 tanpa respons dari backend. Periksa apakah dev:server masih berjalan dan dapat terhubung ke RouterOS.');
    }
    throw new Error(`Server mengirim respons kosong (HTTP ${response.status}). Pastikan backend berjalan.`);
  }

  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Respons server bukan JSON yang valid (HTTP ${response.status}). Pastikan backend berjalan.`);
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('Format respons server tidak valid.');
  }
  if (!response.ok) {
    const error = 'error' in result && typeof result.error === 'string'
      ? result.error
      : `HTTP ${response.status}`;
    throw new Error(error);
  }
  return result as T;
}

export const RoutersTab: React.FC<Props> = ({ onRefreshData }) => {
  const { confirm: confirmAction } = useToast();
  const [activeScriptTab, setActiveScriptTab] = useState<'isolir' | 'walledGarden' | 'pppoe'>('isolir');
  const [copied, setCopied] = useState(false);
  const [testingRouterId, setTestingRouterId] = useState<string | null>(null);
  const [billingHost, setBillingHost] = useState('');
  const [routerConfig, setRouterConfig] = useState<{ configured: boolean; host: string; port: number; username: string; apiType: RouterConfig['apiType']; managedByEnvironment: boolean } | null>(null);
  const [liveRouters, setLiveRouters] = useState<RouterConfig[]>([]);
  const [routerInterfaces, setRouterInterfaces] = useState<string[]>([]);
  const [routerError, setRouterError] = useState('');
  const [routerNotice, setRouterNotice] = useState('');
  const [isAddingRouter, setIsAddingRouter] = useState(false);
  const [isApplyingPppoe, setIsApplyingPppoe] = useState(false);
  const [routerForm, setRouterForm] = useState({ name: '', host: '', port: 8728, username: '', password: '', apiType: 'api' as RouterConfig['apiType'] });
  const [pppoeRouterId, setPppoeRouterId] = useState('');
  const [pppoeServers, setPppoeServers] = useState<RouterServiceRecord[]>([]);
  const [hotspotServers, setHotspotServers] = useState<RouterServiceRecord[]>([]);
  const [pppProfiles, setPppProfiles] = useState<PppProfileRecord[]>([]);
  const [hotspotUserProfiles, setHotspotUserProfiles] = useState<HotspotUserProfileRecord[]>([]);
  const [hotspotServerProfiles, setHotspotServerProfiles] = useState<HotspotServerProfileRecord[]>([]);
  const [routerPools, setRouterPools] = useState<string[]>([]);
  const [isPppoeDialogOpen, setIsPppoeDialogOpen] = useState(false);
  const [isRouterDialogOpen, setIsRouterDialogOpen] = useState(false);
  const [profileDialog, setProfileDialog] = useState<'pppoe' | 'hotspot-user' | 'hotspot-server' | 'hotspot-create' | null>(null);
  const [profileForm, setProfileForm] = useState<Record<string, string | boolean>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingService, setEditingService] = useState<{ routerId: string; kind: 'pppoe' | 'hotspot'; record: RouterServiceRecord } | null>(null);
  const [serviceForm, setServiceForm] = useState<Record<string, string | boolean>>({});
  const [savingService, setSavingService] = useState(false);
  const [pppoeForm, setPppoeForm] = useState({
    interface: '',
    serviceName: '',
    poolName: '',
    poolRange: '',
    localAddress: '',
    profileName: '',
    rateLimit: '',
    dnsServers: '',
  });

  const loadLiveRouters = async () => {
    setRouterError('');
    try {
      const response = await fetch('/api/mikrotik/routers');
      const result = await readApiResponse<{
        routers: RouterConfig[];
        errors: Array<{ router: RouterConfig; error: string | null }>;
      }>(response);
      setLiveRouters(result.routers);
      StorageService.saveRouters(result.routers);
      onRefreshData();
      setPppoeRouterId(current => current || result.routers[0]?.id || '');
      if (result.errors.some(entry => entry.error)) {
        setRouterError(result.errors.filter(entry => entry.error)
          .map(entry => `${entry.router.name}: ${entry.error}`).join(' • '));
      }
    } catch (error) {
      setRouterError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    fetch('/api/mikrotik/config')
      .then(async response => {
        const result = await readApiResponse<{
          configured: boolean;
          host: string;
          port: number;
          username: string;
          apiType: RouterConfig['apiType'];
          managedByEnvironment: boolean;
        }>(response);
        setRouterConfig(result);
        setBillingHost(window.location.hostname);
        if (result.configured) {
          setRouterForm(current => ({
            ...current,
            host: result.host,
            port: result.port,
            username: result.username,
            apiType: result.apiType,
          }));
        }
      })
      .catch(error => setRouterError(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    void loadLiveRouters();
  }, []);

  useEffect(() => {
    if (!pppoeRouterId) {
      setRouterInterfaces([]);
      return;
    }
    fetch(`/api/mikrotik/interfaces?routerId=${encodeURIComponent(pppoeRouterId)}`).then(async response => {
      const result = await readApiResponse<{ interfaces: string[] }>(response);
      setRouterInterfaces(result.interfaces);
      setPppoeForm(current => ({
        ...current,
        interface: result.interfaces.includes(current.interface) ? current.interface : (result.interfaces[0] || ''),
      }));
    }).catch(error => setRouterError(error instanceof Error ? error.message : String(error)));
  }, [pppoeRouterId]);

  const loadRouterServices = async (routerId: string) => {
    if (!routerId) {
      setPppoeServers([]);
      setHotspotServers([]);
      return;
    }
    const response = await fetch(`/api/mikrotik/servers?routerId=${encodeURIComponent(routerId)}`);
    const result = await readApiResponse<{ pppoeServers: RouterServiceRecord[]; hotspotServers: RouterServiceRecord[] }>(response);
    setPppoeServers(result.pppoeServers);
    setHotspotServers(result.hotspotServers);
  };

  const loadServiceProfiles = async (routerId: string) => {
    if (!routerId) {
      setPppProfiles([]);
      setHotspotUserProfiles([]);
      setHotspotServerProfiles([]);
      setRouterPools([]);
      return;
    }
    const query = `?routerId=${encodeURIComponent(routerId)}`;
    const [pppResponse, hotspotResponse, serverProfileResponse, poolResponse] = await Promise.all([
      fetch(`/api/mikrotik/pppoe/profiles${query}`),
      fetch(`/api/mikrotik/hotspot/profiles${query}`),
      fetch(`/api/mikrotik/hotspot/server-profiles${query}`),
      fetch(`/api/mikrotik/pools${query}`),
    ]);
    const [ppp, hotspot, serverProfiles, pools] = await Promise.all([
      readApiResponse<{ profiles: PppProfileRecord[] }>(pppResponse),
      readApiResponse<{ profiles: HotspotUserProfileRecord[] }>(hotspotResponse),
      readApiResponse<{ profiles: HotspotServerProfileRecord[] }>(serverProfileResponse),
      readApiResponse<{ pools: string[] }>(poolResponse),
    ]);
    setPppProfiles(ppp.profiles);
    setHotspotUserProfiles(hotspot.profiles);
    setHotspotServerProfiles(serverProfiles.profiles);
    setRouterPools(pools.pools);
  };

  useEffect(() => {
    void loadRouterServices(pppoeRouterId).catch(error => setRouterError(error instanceof Error ? error.message : String(error)));
  }, [pppoeRouterId]);

  useEffect(() => {
    void loadServiceProfiles(pppoeRouterId).catch(error => setRouterError(error instanceof Error ? error.message : String(error)));
  }, [pppoeRouterId]);

  const openProfileDialog = (kind: NonNullable<typeof profileDialog>) => {
    setProfileDialog(kind);
    setProfileForm(kind === 'pppoe'
      ? { name: '', localAddress: '', remoteAddress: '', rateLimit: '', dnsServers: '' }
      : kind === 'hotspot-user'
        ? { name: '', rateLimit: '', sharedUsers: '1', sessionTimeout: '', idleTimeout: '' }
        : kind === 'hotspot-server'
          ? { name: '', hotspotAddress: '', dnsName: '', htmlDirectory: 'hotspot', loginBy: 'http-chap,http-pap', useRadius: false }
          : { name: '', interface: routerInterfaces[0] || '', addressPool: routerPools[0] || '', profile: hotspotServerProfiles[0]?.name || '' });
  };

  const handleCreateProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profileDialog || !pppoeRouterId) return;
    setSavingProfile(true);
    setRouterError('');
    try {
      const endpoint = profileDialog === 'pppoe'
        ? '/api/mikrotik/pppoe/profiles'
        : profileDialog === 'hotspot-user'
          ? '/api/mikrotik/hotspot/user-profiles'
          : profileDialog === 'hotspot-server'
            ? '/api/mikrotik/hotspot/server-profiles'
            : '/api/mikrotik/hotspot/servers';
      const { sharedUsers, ...form } = profileForm;
      const profile = profileDialog === 'hotspot-user'
        ? { ...form, ...(sharedUsers !== undefined ? { sharedUsers: Number(sharedUsers) } : {}) }
        : form;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routerId: pppoeRouterId,
          [profileDialog === 'hotspot-create' ? 'server' : 'profile']: profile,
        }),
      });
      await readApiResponse(response);
      await Promise.all([loadRouterServices(pppoeRouterId), loadServiceProfiles(pppoeRouterId)]);
      setRouterNotice(`${profileDialog === 'hotspot-create' ? 'Hotspot server' : 'Profile'} "${String(profileForm.name)}" berhasil ditambahkan ke MikroTik.`);
      setProfileDialog(null);
    } catch (error) {
      setRouterError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleTestConnection = async (router: RouterConfig) => {
    setTestingRouterId(router.id);
    setRouterError('');
    try {
      const response = await fetch('/api/mikrotik/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(router.id === 'env-default'
          ? { ...router, password: undefined }
          : { ...router, password: routerForm.password }),
      });
      const result = await readApiResponse<{ router: RouterConfig }>(response);
      setRouterNotice(`Terhubung ke ${result.router.name} (${result.router.rosVersion}).`);
      await loadLiveRouters();
    } catch (error) {
      setRouterError(error instanceof Error ? error.message : String(error));
    } finally {
      setTestingRouterId(null);
    }
  };

  const handleAddRouter = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsAddingRouter(true);
    setRouterError('');
    try {
      const response = await fetch('/api/mikrotik/routers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routerForm),
      });
      const result = await readApiResponse<{ router: RouterConfig }>(response);
      setRouterForm(current => ({ ...current, name: '', password: '' }));
      setIsRouterDialogOpen(false);
      setRouterNotice(`Router ${result.router.name} berhasil diuji dan ditambahkan.`);
      await loadLiveRouters();
      onRefreshData();
    } catch (error) {
      setRouterError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAddingRouter(false);
    }
  };

  const handleApplyPppoe = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pppoeRouterId) return;
    setIsApplyingPppoe(true);
    setRouterError('');
    try {
      const response = await fetch('/api/mikrotik/pppoe/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routerId: pppoeRouterId, config: pppoeForm }),
      });
      const result = await readApiResponse<{ created: string[]; unchanged: string[] }>(response);
      setRouterNotice(`PPPoE selesai. Dibuat: ${result.created.join(', ') || 'tidak ada perubahan'}; sudah ada: ${result.unchanged.join(', ') || 'tidak ada'}.`);
      await loadLiveRouters();
      await loadRouterServices(pppoeRouterId);
      setIsPppoeDialogOpen(false);
    } catch (error) {
      setRouterError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsApplyingPppoe(false);
    }
  };

  const handleDeleteService = async (routerId: string, kind: 'pppoe' | 'hotspot', record: RouterServiceRecord) => {
    if (!await confirmAction(
      `Hapus server ${kind === 'pppoe' ? 'PPPoE' : 'Hotspot'}?`,
      `Server "${record.name}" akan dihapus langsung dari MikroTik.`,
      true
    )) return;
    try {
      const response = await fetch(`/api/mikrotik/servers/${encodeURIComponent(routerId)}/${kind}/${encodeURIComponent(record.id)}`, { method: 'DELETE' });
      await readApiResponse(response);
      await loadRouterServices(routerId);
      setRouterNotice(`Server ${record.name} berhasil dihapus dari router.`);
    } catch (error) {
      setRouterError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSaveService = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingService) return;
    setSavingService(true);
    setRouterError('');
    try {
      const response = await fetch(`/api/mikrotik/servers/${encodeURIComponent(editingService.routerId)}/${editingService.kind}/${encodeURIComponent(editingService.record.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceForm),
      });
      await readApiResponse(response);
      await loadRouterServices(editingService.routerId);
      setEditingService(null);
      setRouterNotice(`Server ${editingService.record.name} berhasil diperbarui.`);
    } catch (error) {
      setRouterError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingService(false);
    }
  };

  const openServiceEditor = (routerId: string, kind: 'pppoe' | 'hotspot', record: RouterServiceRecord) => {
    setEditingService({ routerId, kind, record });
    setServiceForm(kind === 'pppoe'
      ? {
        'service-name': record.serviceName || record.name,
        interface: record.interface,
        'default-profile': record.defaultProfile || '',
        disabled: record.disabled,
      }
      : {
        name: record.name,
        interface: record.interface,
        profile: record.profile || '',
        'address-pool': record.addressPool || '',
        disabled: record.disabled,
      });
  };

  const getActiveScriptContent = () => {
    if (activeScriptTab === 'isolir') {
      return getMikrotikIsolirScript();
    }
    if (activeScriptTab === 'walledGarden') {
      return getHotspotWalledGardenScript(billingHost || 'DOMAIN_PORTAL_ANDA');
    }
    return `/ip pool\nadd name="${pppoeForm.poolName}" ranges="${pppoeForm.poolRange}"\n\n/ppp profile\nadd name="${pppoeForm.profileName}" local-address="${pppoeForm.localAddress}" remote-address="${pppoeForm.poolName}" rate-limit="${pppoeForm.rateLimit}" dns-server="${pppoeForm.dnsServers}"\n\n/interface pppoe-server server\nadd service-name="${pppoeForm.serviceName}" interface="${pppoeForm.interface}" default-profile="${pppoeForm.profileName}" authentication=pap,chap,mschap2 disabled=no\n`;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(getActiveScriptContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">Koneksi RouterOS langsung</h2>
            <p className="text-xs text-slate-400 mt-1">
              {routerConfig?.configured
                ? `Konfigurasi server .env: ${routerConfig.host}:${routerConfig.port} (${routerConfig.apiType})`
                : 'MIKROTIK_HOST, MIKROTIK_PORT, MIKROTIK_USER, dan MIKROTIK_PASS belum lengkap di .env.'}
            </p>
          </div>
          <button onClick={() => void loadLiveRouters()} className="px-3 py-2 bg-slate-800 text-slate-200 rounded-lg text-xs">
            Muat status live
          </button>
        </div>
        {routerConfig?.managedByEnvironment && (
          <p className="text-xs text-amber-200 bg-amber-950/40 border border-amber-500/30 rounded-lg p-3">
            Router utama dikelola oleh environment server. Konfigurasi ini terkunci di panel; ubah MIKROTIK_* pada .env lalu restart server. Router tambahan tetap dapat ditambahkan dari panel.
          </p>
        )}
        {routerError && <div role="alert" className="text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-lg p-3">{routerError}</div>}
        {routerNotice && <div role="status" className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-3">{routerNotice}</div>}
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={() => setIsRouterDialogOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4" /> Tambah MikroTik</button>
      </div>
      {isRouterDialogOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
        <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-white">Tambah Server MikroTik</h2><button type="button" onClick={() => setIsRouterDialogOpen(false)} className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Tutup</button></div>
        <form onSubmit={handleAddRouter} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4 text-xs">
          <input required placeholder="Nama router" value={routerForm.name} onChange={event => setRouterForm({ ...routerForm, name: event.target.value })} className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white" />
          <input required placeholder="Host / IP" value={routerForm.host} onChange={event => setRouterForm({ ...routerForm, host: event.target.value })} className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono" />
          <input required type="number" min="1" max="65535" placeholder="Port" value={routerForm.port} onChange={event => setRouterForm({ ...routerForm, port: Number(event.target.value) })} className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono" />
          <input required placeholder="User API" value={routerForm.username} onChange={event => setRouterForm({ ...routerForm, username: event.target.value })} className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono" />
          <input required type="password" placeholder="Password API" value={routerForm.password} onChange={event => setRouterForm({ ...routerForm, password: event.target.value })} className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono" />
          <select value={routerForm.apiType} onChange={event => setRouterForm({ ...routerForm, apiType: event.target.value as RouterConfig['apiType'], port: event.target.value === 'api-ssl' ? 8729 : event.target.value === 'rest' ? 443 : 8728 })} className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white">
            <option value="api">RouterOS API</option><option value="api-ssl">RouterOS API-SSL</option><option value="rest">RouterOS REST (v7)</option>
          </select>
          <button type="submit" disabled={isAddingRouter} className="sm:col-span-2 lg:col-span-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg disabled:opacity-50">
            {isAddingRouter ? 'Menguji koneksi...' : 'Uji koneksi lalu tambahkan'}
          </button>
        </form>
        <p className="text-[11px] text-slate-500 mt-3">Kredensial tambahan dienkripsi di SQLite. API user MikroTik sebaiknya hanya diberi hak yang diperlukan.</p>
        </div>
      </div>}

      {/* Routers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {liveRouters.map(rtr => {
          const isTesting = testingRouterId === rtr.id;

          return (
            <div
              key={rtr.id}
              className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">{rtr.name}</h3>
                    <p className="text-xs text-slate-400 font-mono">
                      {rtr.host}:{rtr.port} • API {rtr.apiType.toUpperCase()}
                    </p>
                  </div>
                </div>

                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${rtr.status === 'connected' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${rtr.status === 'connected' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  {rtr.status === 'connected' ? 'CONNECTED' : 'OFFLINE'}
                </span>
              </div>

              {/* Hardware stats */}
              <div className="grid grid-cols-3 gap-3 my-4 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono">
                <div>
                  <div className="text-slate-400 text-[10px]">Model & OS</div>
                  <div className="font-semibold text-slate-200 truncate mt-0.5">{rtr.model}</div>
                  <div className="text-[10px] text-slate-500">{rtr.rosVersion}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">CPU & RAM</div>
                  <div className="font-semibold text-indigo-400 mt-0.5">{rtr.cpuLoad}% CPU</div>
                  <div className="text-[10px] text-slate-500">Free: {rtr.memoryFreeMb} MB</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">Klien Aktif</div>
                  <div className="font-semibold text-emerald-400 mt-0.5">{rtr.activePppoe} PPPoE</div>
                  <div className="text-[10px] text-violet-400">{rtr.activeHotspot} Hotspot</div>
                </div>
              </div>

              {/* Test Connection Button */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <div className="text-[11px] text-slate-400 font-mono">Uptime: {rtr.uptime}</div>

                <button
                  onClick={() => handleTestConnection(rtr)}
                  disabled={isTesting}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-indigo-400' : ''}`} />
                  <span>{isTesting ? 'Menguji API...' : 'Uji ulang koneksi'}</span>
                </button>
              </div>
            </div>
          );
        })}
        {liveRouters.length === 0 && (
          <div className="md:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center text-sm text-slate-400">
            Belum ada router yang terhubung. Isi konfigurasi .env dan kunci admin untuk menampilkan data aktual.
          </div>
        )}
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">Server pada MikroTik</h2>
            <p className="mt-1 text-xs text-slate-400">Daftar ini dimuat langsung dari router terpilih.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Pilih router untuk daftar server" value={pppoeRouterId} onChange={event => setPppoeRouterId(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
              <option value="">Pilih router</option>{liveRouters.map(router => <option key={router.id} value={router.id}>{router.name} ({router.status})</option>)}
            </select>
            <button type="button" disabled={!pppoeRouterId} onClick={() => setIsPppoeDialogOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" /> Tambah PPPoE server</button>
            <button type="button" disabled={!pppoeRouterId || !routerInterfaces.length || !hotspotServerProfiles.length} onClick={() => openProfileDialog('hotspot-create')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" /> Tambah Hotspot server</button>
            <button type="button" disabled={!pppoeRouterId} onClick={() => void loadRouterServices(pppoeRouterId).catch(error => setRouterError(error instanceof Error ? error.message : String(error)))} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200">Muat ulang</button>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {([
            ['PPPoE', pppoeServers, 'pppoe'],
            ['Hotspot', hotspotServers, 'hotspot'],
          ] as const).map(([title, records, kind]) => (
            <div key={kind} className="overflow-hidden rounded-xl border border-slate-800">
              <h3 className="border-b border-slate-800 bg-slate-950 px-4 py-3 text-xs font-bold text-slate-200">{title} Server ({records.length})</h3>
              <div className="divide-y divide-slate-800">
                {records.map(record => (
                  <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{record.name || record.interface}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{record.interface}{record.defaultProfile || record.profile ? ` · ${record.defaultProfile || record.profile}` : ''} · {record.disabled ? 'Nonaktif' : 'Aktif'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => openServiceEditor(pppoeRouterId, kind, record)} className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      <button type="button" onClick={() => void handleDeleteService(pppoeRouterId, kind, record)} className="inline-flex items-center gap-1 rounded-lg bg-rose-950/70 px-3 py-1.5 text-xs font-bold text-rose-200"><Trash2 className="h-3.5 w-3.5" /> Hapus</button>
                    </div>
                  </div>
                ))}
                {!records.length && <p className="px-4 py-5 text-xs text-slate-500">Tidak ada server {title} yang terdeteksi.</p>}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
              <h3 className="text-xs font-bold text-slate-200">PPP Profiles ({pppProfiles.length})</h3>
              <button type="button" disabled={!pppoeRouterId} onClick={() => openProfileDialog('pppoe')} className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">Tambah</button>
            </div>
            <div className="divide-y divide-slate-800">
              {pppProfiles.map(profile => <div key={profile.name} className="px-4 py-3 text-xs"><p className="font-bold text-white">{profile.name}</p><p className="mt-1 text-slate-400">Rate: {profile.rateLimit || 'Tidak dibatasi'} · Lokal: {profile.localAddress || '-'} · Remote: {profile.remoteAddress || '-'}</p><p className="mt-1 text-slate-500">DNS: {profile.dnsServers || '-'}</p></div>)}
              {!pppProfiles.length && <p className="px-4 py-4 text-xs text-slate-500">Profil tidak ditemukan.</p>}
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
              <h3 className="text-xs font-bold text-slate-200">Hotspot User Profiles ({hotspotUserProfiles.length})</h3>
              <button type="button" disabled={!pppoeRouterId} onClick={() => openProfileDialog('hotspot-user')} className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">Tambah</button>
            </div>
            <div className="divide-y divide-slate-800">
              {hotspotUserProfiles.map(profile => <div key={profile.name} className="px-4 py-3 text-xs"><p className="font-bold text-white">{profile.name}</p><p className="mt-1 text-slate-400">Rate: {profile.rateLimit || '-'} · Shared users: {profile.sharedUsers}</p><p className="mt-1 text-slate-500">Session: {profile.sessionTimeout || '-'} · Idle: {profile.idleTimeout || '-'}</p></div>)}
              {!hotspotUserProfiles.length && <p className="px-4 py-4 text-xs text-slate-500">Profil tidak ditemukan.</p>}
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
              <h3 className="text-xs font-bold text-slate-200">Hotspot Server Profiles ({hotspotServerProfiles.length})</h3>
              <button type="button" disabled={!pppoeRouterId} onClick={() => openProfileDialog('hotspot-server')} className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">Tambah</button>
            </div>
            <div className="divide-y divide-slate-800">
              {hotspotServerProfiles.map(profile => <div key={profile.name} className="px-4 py-3 text-xs"><p className="font-bold text-white">{profile.name}</p><p className="mt-1 text-slate-400">{profile.dnsName || profile.hotspotAddress || 'Alamat belum disetel'} · Login: {profile.loginBy || '-'}</p></div>)}
              {!hotspotServerProfiles.length && <p className="px-4 py-4 text-xs text-slate-500">Profil tidak ditemukan.</p>}
            </div>
          </div>
        </div>
      </section>

      {profileDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4">
          <form onSubmit={handleCreateProfile} className="my-auto w-full max-w-2xl space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-white">
                  {profileDialog === 'pppoe' ? 'Tambah PPP Profile'
                    : profileDialog === 'hotspot-user' ? 'Tambah Hotspot User Profile'
                      : profileDialog === 'hotspot-server' ? 'Tambah Hotspot Server Profile'
                        : 'Tambah Hotspot Server'}
                </h2>
                <p className="mt-1 text-xs text-slate-400">Konfigurasi akan langsung diterapkan ke router terpilih. Data profile dibaca live dari MikroTik.</p>
              </div>
              <button type="button" onClick={() => setProfileDialog(null)} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200">Tutup</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(profileForm).map(([field, value]) => {
                const label = ({
                  name: 'Nama',
                  localAddress: 'Local address',
                  remoteAddress: 'Remote address / pool',
                  rateLimit: 'Rate limit (download/upload)',
                  dnsServers: 'DNS server',
                  sharedUsers: 'Shared users',
                  sessionTimeout: 'Session timeout',
                  idleTimeout: 'Idle timeout',
                  hotspotAddress: 'Hotspot address',
                  dnsName: 'DNS name',
                  htmlDirectory: 'HTML directory',
                  loginBy: 'Metode login (pisahkan koma)',
                  interface: 'Interface',
                  addressPool: 'Address pool',
                  profile: 'Hotspot Server Profile',
                } as Record<string, string>)[field] || field;
                if (field === 'useRadius') {
                  return <label key={field} className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={Boolean(value)} onChange={event => setProfileForm(current => ({ ...current, [field]: event.target.checked }))} /> Aktifkan RADIUS</label>;
                }
                if (field === 'interface') {
                  return <label key={field} className="text-xs text-slate-400">{label}<select required value={String(value)} onChange={event => setProfileForm(current => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white"><option value="">Pilih interface aktual</option>{routerInterfaces.map(item => <option key={item} value={item}>{item}</option>)}</select></label>;
                }
                if (field === 'remoteAddress' && routerPools.length) {
                  return <label key={field} className="text-xs text-slate-400">{label}<select value={String(value)} onChange={event => setProfileForm(current => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white"><option value="">Tidak memilih pool</option>{routerPools.map(item => <option key={item} value={item}>{item}</option>)}</select></label>;
                }
                if (field === 'addressPool' && routerPools.length) {
                  return <label key={field} className="text-xs text-slate-400">{label}<select value={String(value)} onChange={event => setProfileForm(current => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white"><option value="">None</option>{routerPools.map(item => <option key={item} value={item}>{item}</option>)}</select></label>;
                }
                if (field === 'profile' && profileDialog === 'hotspot-create') {
                  return <label key={field} className="text-xs text-slate-400">{label}<select required value={String(value)} onChange={event => setProfileForm(current => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white"><option value="">Pilih profile</option>{hotspotServerProfiles.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>;
                }
                return <label key={field} className="text-xs text-slate-400">{label}<input
                  required={field === 'name' || field === 'profile'}
                  type={field === 'sharedUsers' ? 'number' : 'text'}
                  min={field === 'sharedUsers' ? 1 : undefined}
                  max={field === 'sharedUsers' ? 1000 : undefined}
                  value={String(value)}
                  onChange={event => setProfileForm(current => ({ ...current, [field]: event.target.value }))}
                  placeholder={field === 'localAddress' ? 'Contoh: 10.10.0.1' : undefined}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white"
                /></label>;
              })}
            </div>
            {!routerPools.length && profileDialog === 'hotspot-create' && (
              <p className="text-xs text-amber-300">Router belum memiliki IP pool yang terdeteksi. Address pool opsional dan dapat dibiarkan None.</p>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button type="button" onClick={() => setProfileDialog(null)} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">Batal</button>
              <button type="submit" disabled={savingProfile || !pppoeRouterId} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{savingProfile ? 'Menyimpan ke router...' : 'Simpan ke MikroTik'}</button>
            </div>
          </form>
        </div>
      )}

      {isPppoeDialogOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4">
      <form onSubmit={handleApplyPppoe} className="my-auto w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4">
        <div>
          <h2 className="font-bold text-white">Tambah PPPoE Server</h2>
          <p className="text-xs text-slate-400 mt-1">Membuat IP pool, PPP profile, dan PPPoE server yang belum ada. Tidak menghapus konfigurasi router.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <label className="text-slate-400">Router<select required value={pppoeRouterId} onChange={event => setPppoeRouterId(event.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"><option value="">Pilih router</option>{liveRouters.map(router => <option key={router.id} value={router.id}>{router.name} ({router.status})</option>)}</select></label>
          <label className="text-slate-400">Interface<select required value={pppoeForm.interface} onChange={event => setPppoeForm({ ...pppoeForm, interface: event.target.value })} className="mt-1 w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"><option value="">Pilih interface aktual</option>{routerInterfaces.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          {([
            ['serviceName', 'Nama service'],
            ['poolName', 'Nama IP pool'],
            ['poolRange', 'Rentang IP pool'],
            ['localAddress', 'IP lokal PPP'],
            ['profileName', 'Nama PPP profile'],
            ['rateLimit', 'Rate limit (download/upload)'],
            ['dnsServers', 'DNS server'],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-slate-400">{label}<input required value={pppoeForm[key]} onChange={event => setPppoeForm({ ...pppoeForm, [key]: event.target.value })} className="mt-1 w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono" /></label>
          ))}
        </div>
        <button type="submit" disabled={!pppoeRouterId || isApplyingPppoe} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs disabled:opacity-50">
          {isApplyingPppoe ? 'Menerapkan ke router...' : 'Terapkan konfigurasi PPPoE'}
        </button>
        <button type="button" onClick={() => setIsPppoeDialogOpen(false)} className="ml-2 rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">Batal</button>
      </form>
      </div>}

      {editingService && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <form onSubmit={handleSaveService} className="w-full max-w-xl space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="font-bold text-white">Edit {editingService.kind === 'pppoe' ? 'PPPoE' : 'Hotspot'} server</h2><p className="mt-1 text-xs text-slate-400">Perubahan diterapkan langsung ke router.</p></div>
              <button type="button" onClick={() => setEditingService(null)} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200">Tutup</button>
            </div>
            {Object.entries(serviceForm).map(([field, value]) => field === 'disabled'
              ? <label key={field} className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={Boolean(value)} onChange={event => setServiceForm({ ...serviceForm, [field]: event.target.checked })} /> Nonaktifkan server</label>
              : <label key={field} className="block text-xs text-slate-300">{field.replaceAll('-', ' ')}<input required maxLength={128} value={String(value)} onChange={event => setServiceForm({ ...serviceForm, [field]: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>)}
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setEditingService(null)} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">Batal</button>
              <button type="submit" disabled={savingService} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{savingService ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Script Generator & RouterOS Terminal Guide */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Terminal className="w-5 h-5 text-indigo-400" />
              <span>Petunjuk dan skrip MikroTik RouterOS</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Isolir dan pengaturan PPPoE memakai API router di atas. Otomatisasi jadwal dan pembayaran online belum tersedia.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400">Host Billing:</span>
              <input
                type="text"
                value={billingHost}
                onChange={e => setBillingHost(e.target.value)}
                className="bg-transparent border-none text-white text-xs font-mono font-semibold focus:outline-none w-36"
              />
            </div>

            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Tersalin ke Clipboard!' : 'Salin Skrip'}</span>
            </button>
          </div>
        </div>

        {/* Script Selection Tabs */}
        <div className="flex items-center gap-2 my-4">
          <button
            onClick={() => setActiveScriptTab('isolir')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeScriptTab === 'isolir'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>1. Status Isolir PPPoE</span>
          </button>

          <button
            onClick={() => setActiveScriptTab('walledGarden')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeScriptTab === 'walledGarden'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>2. Walled Garden Portal Hotspot</span>
          </button>

          <button
            onClick={() => setActiveScriptTab('pppoe')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeScriptTab === 'pppoe'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>3. Skrip PPPoE Server & Pool</span>
          </button>
        </div>

        {/* Script Display Codeblock */}
        <div className="relative">
          <pre className="p-5 bg-slate-950 border border-slate-800 rounded-2xl font-mono text-xs text-indigo-300 leading-relaxed overflow-x-auto max-h-[420px]">
            {getActiveScriptContent()}
          </pre>
        </div>
      </div>
    </div>
  );
};
