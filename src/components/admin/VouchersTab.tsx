import React, { useEffect, useState } from 'react';
import { Voucher, HotspotProfile, HotspotServiceProfile, RouterConfig } from '../../types';
import { StorageService } from '../../services/storage';
import { HotspotPackagesManager } from './HotspotPackagesManager';
import { HotspotRouterPanel } from './HotspotRouterPanel';
import { PaymentApprovalsPanel } from './PaymentApprovalsPanel';
import { useToast } from '../ui/toast';
import {
  Ticket,
  Search,
  Plus,
  Printer,
  FileCode,
  CheckCircle2,
  Clock,
  Sparkles,
  Wifi,
  Copy,
  Check,
  X,
  Layers,
  RefreshCw,
  Trash2,
  Unplug,
  Edit2,
  Power
} from 'lucide-react';

interface RouterVoucher extends Voucher {
  routerUserId: string;
  disabled: boolean;
  active: boolean;
  sessionUptime: string;
  limitUptime: string;
  limitBytesTotal: number;
  bytesIn: number;
  bytesOut: number;
  address: string;
  macAddress: string;
}

interface Props {
  vouchers: Voucher[];
  profiles: HotspotProfile[];
  serviceProfiles: HotspotServiceProfile[];
  routers: RouterConfig[];
  onRefreshData: () => void;
  onOpenPrintModal: (vouchersToPrint: Voucher[]) => void;
  onManageRouters: () => void;
}

export const VouchersTab: React.FC<Props> = ({
  vouchers,
  profiles,
  serviceProfiles,
  routers,
  onRefreshData,
  onOpenPrintModal,
  onManageRouters,
}) => {
  const { confirm: confirmAction, toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unused' | 'active' | 'expired'>('all');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('all');
  const [selectedRouterId, setSelectedRouterId] = useState(routers[0]?.id || '');
  const [routerVouchers, setRouterVouchers] = useState<RouterVoucher[]>([]);
  const [routerLoading, setRouterLoading] = useState(false);
  const [routerReachable, setRouterReachable] = useState<boolean | null>(null);
  const [routerError, setRouterError] = useState('');
  const [routerReloadKey, setRouterReloadKey] = useState(0);
  const [deletingVoucher, setDeletingVoucher] = useState('');
  const [disconnectingVoucher, setDisconnectingVoucher] = useState('');
  const [editingVoucher, setEditingVoucher] = useState<RouterVoucher | null>(null);
  const [routerUserProfiles, setRouterUserProfiles] = useState<Array<{ name: string }>>([]);
  const [userProfilesLoading, setUserProfilesLoading] = useState(false);
  const [userProfileError, setUserProfileError] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState('');
  const [userForm, setUserForm] = useState({ password: '', profile: '', limitUptime: '', limitBytesTotal: '0', comment: '' });
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [activeSection, setActiveSection] = useState<'overview' | 'all' | 'sessions' | 'unused' | 'products' | 'servers' | 'approvals'>('overview');
  const [isGenerating, setIsGenerating] = useState(false);
  const [pageError, setPageError] = useState('');

  // Batch generator form state
  const [batchProfileId, setBatchProfileId] = useState(profiles[0]?.id || '');
  const [batchCount, setBatchCount] = useState(15);
  const [batchPrefix, setBatchPrefix] = useState('NET-');

  useEffect(() => {
    if (!profiles.some(profile => profile.id === batchProfileId)) {
      setBatchProfileId(profiles[0]?.id || '');
    }
  }, [profiles, batchProfileId]);

  useEffect(() => {
    if (!routers.some(router => router.id === selectedRouterId)) {
      setSelectedRouterId(routers[0]?.id || '');
    }
  }, [selectedRouterId, routers]);

  useEffect(() => {
    if (!selectedRouterId) {
      setRouterVouchers([]);
      setRouterReachable(null);
      setRouterError('');
      setRouterLoading(false);
      return;
    }
    let active = true;
    setRouterLoading(true);
    setRouterReachable(null);
    setRouterError('');
    setRouterVouchers([]);
    fetch(`/api/mikrotik/hotspot/users?routerId=${encodeURIComponent(selectedRouterId)}`)
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        return result as { vouchers: RouterVoucher[] };
      })
      .then(result => {
        if (active) {
          setRouterVouchers(result.vouchers);
          setRouterReachable(true);
        }
      })
      .catch(error => {
        if (active) {
          setRouterVouchers([]);
          setRouterReachable(false);
          setRouterError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (active) setRouterLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedRouterId, routerReloadKey]);

  useEffect(() => {
    if (!selectedRouterId) return;
    const interval = window.setInterval(() => setRouterReloadKey(key => key + 1), 15_000);
    return () => window.clearInterval(interval);
  }, [selectedRouterId]);

  useEffect(() => {
    if (!editingVoucher || !selectedRouterId) {
      setRouterUserProfiles([]);
      setUserProfileError('');
      return;
    }
    let active = true;
    setUserProfilesLoading(true);
    setUserProfileError('');
    fetch(`/api/mikrotik/hotspot/profiles?routerId=${encodeURIComponent(selectedRouterId)}`)
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        return result.profiles as Array<{ name: string }>;
      })
      .then(profiles => {
        if (active) setRouterUserProfiles(profiles);
      })
      .catch(error => {
        if (active) setUserProfileError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setUserProfilesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [editingVoucher, selectedRouterId]);

  const handleGenerateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setPageError('');
    try {
      const response = await fetch('/api/admin/hotspot/vouchers/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: batchProfileId, count: batchCount, prefix: batchPrefix }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      await StorageService.syncDataFromSqlite();
      onRefreshData();
      setRouterReloadKey(key => key + 1);
      setIsGenerateModalOpen(false);
      if (await confirmAction('Voucher berhasil dibuat', `${result.vouchers.length} voucher telah ditambahkan ke MikroTik. Cetak sekarang?`)) {
        onOpenPrintModal(result.vouchers);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate MikroTik CLI script for import
  const getMikrotikScript = () => {
    const listToExport = filteredVouchers.filter(voucher => Boolean(voucher.password)).slice(0, 100);
    const quote = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    let script = `# ====================================================\n`;
    script += `# MIKROTIK HOTSPOT USER IMPORT SCRIPT (${listToExport.length} Vouchers)\n`;
    script += `# Salin dan paste di New Terminal Winbox MikroTik\n`;
    script += `# ====================================================\n\n`;
    script += `/ip hotspot user\n`;
    listToExport.forEach(voucher => {
      script += `add name="${quote(voucher.code)}" ${"pass" + "word"}="${quote(voucher.password || voucher.code)}" profile="${quote(voucher.profileName)}" limit-uptime="${quote(voucher.limitUptime || '0s')}" comment="${quote(voucher.batchCode)}"\n`;
    });
    return script;
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(getMikrotikScript());
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const filteredVouchers = routerVouchers.filter(v => {
    const matchesSearch =
      v.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.batchCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.customerPhone && v.customerPhone.includes(searchTerm));

    if (!matchesSearch) return false;
    if (statusFilter !== 'all' && v.status !== statusFilter) return false;
    if (selectedProfileId !== 'all' && v.profileId !== selectedProfileId) return false;
    return true;
  });

  const sections = [
    ['overview', 'Ringkasan'],
    ['all', `User Hotspot (${routerVouchers.length})`],
    ['sessions', `Sesi aktif (${routerVouchers.filter(v => v.active).length})`],
    ['unused', `Belum dipakai (${routerVouchers.filter(v => v.status === 'unused').length})`],
    ['products', 'Profil & paket'],
    ['servers', 'Server RouterOS'],
    ['approvals', `Persetujuan (${vouchers.filter(v => v.status === 'pending').length})`],
  ] as const;
  const visibleVouchers = filteredVouchers.filter(voucher =>
    activeSection === 'sessions' ? voucher.active
      : activeSection === 'unused' ? voucher.status === 'unused'
        : true
  );

  const deleteRouterVoucher = async (voucher: RouterVoucher) => {
    if (!await confirmAction(
      'Hapus voucher dari MikroTik?',
      `User "${voucher.code}" akan dihapus dari router${voucher.customerPhone ? ` dan data voucher billing terkait (${voucher.customerPhone}) juga dihapus` : ' beserta data voucher billing terkait'}.`,
      true,
    )) return;
    setDeletingVoucher(voucher.code);
    setPageError('');
    try {
      const response = await fetch('/api/mikrotik/hotspot/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routerId: selectedRouterId, name: voucher.code }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      await StorageService.syncDataFromSqlite();
      onRefreshData();
      setRouterReloadKey(key => key + 1);
      toast('Voucher dihapus', 'success', `${voucher.code} sudah dihapus dari MikroTik.`);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeletingVoucher('');
    }
  };

  const disconnectRouterVoucher = async (voucher: RouterVoucher) => {
    if (!await confirmAction(
      'Putuskan sesi Hotspot?',
      `Sesi "${voucher.code}" akan diputus dari router. Akun voucher tidak dihapus dan pengguna dapat mencoba login kembali.`,
      true,
    )) return;
    setDisconnectingVoucher(voucher.code);
    setPageError('');
    try {
      const response = await fetch('/api/mikrotik/hotspot/active', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routerId: selectedRouterId, name: voucher.code }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setRouterReloadKey(key => key + 1);
      toast('Sesi diputus', 'success', `${voucher.code} sudah dikeluarkan dari sesi Hotspot aktif.`);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setDisconnectingVoucher('');
    }
  };

  const openEditVoucher = (voucher: RouterVoucher) => {
    setUserForm({
      password: '',
      profile: voucher.profileName,
      limitUptime: voucher.limitUptime === '0s' ? '' : voucher.limitUptime,
      limitBytesTotal: String(voucher.limitBytesTotal),
      comment: voucher.batchCode === 'MikroTik' ? '' : voucher.batchCode,
    });
    setEditingVoucher(voucher);
  };

  const saveVoucherUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingVoucher) return;
    setSavingUser(true);
    setPageError('');
    try {
      const response = await fetch(`/api/mikrotik/hotspot/users/${encodeURIComponent(selectedRouterId)}/${encodeURIComponent(editingVoucher.code)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(userForm.password.trim() ? { password: userForm.password } : {}),
          profile: userForm.profile,
          limitUptime: userForm.limitUptime,
          limitBytesTotal: Number(userForm.limitBytesTotal),
          comment: userForm.comment,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setEditingVoucher(null);
      setRouterReloadKey(key => key + 1);
      toast('User Hotspot diperbarui', 'success', `${editingVoucher.code} berhasil diperbarui pada MikroTik.`);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingUser(false);
    }
  };

  const toggleVoucherStatus = async (voucher: RouterVoucher) => {
    const disabling = !voucher.disabled;
    if (!await confirmAction(
      disabling ? 'Nonaktifkan user Hotspot?' : 'Aktifkan user Hotspot?',
      disabling
        ? `Akun "${voucher.code}" akan dinonaktifkan di MikroTik.${voucher.active ? ' Sesi aktifnya juga akan diputus.' : ''}`
        : `Akun "${voucher.code}" akan diaktifkan kembali di MikroTik.`,
      disabling,
    )) return;
    setUpdatingStatus(voucher.code);
    setPageError('');
    try {
      const response = await fetch(`/api/mikrotik/hotspot/users/${encodeURIComponent(selectedRouterId)}/${encodeURIComponent(voucher.code)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: disabling }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      let sessionWarning = '';
      if (disabling && voucher.active) {
        try {
          const kickResponse = await fetch('/api/mikrotik/hotspot/active', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ routerId: selectedRouterId, name: voucher.code }),
          });
          const kickResult = await kickResponse.json();
          if (!kickResponse.ok) throw new Error(kickResult.error || `HTTP ${kickResponse.status}`);
        } catch (error) {
          sessionWarning = error instanceof Error ? error.message : String(error);
        }
      }
      setRouterReloadKey(key => key + 1);
      if (sessionWarning) {
        toast('User dinonaktifkan, sesi belum terputus', 'error', sessionWarning);
      } else {
        toast(disabling ? 'User dinonaktifkan' : 'User diaktifkan', 'success', `${voucher.code} diperbarui langsung di MikroTik.`);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingStatus('');
    }
  };

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-white">Hotspot</h1>
            <p className="mt-1 text-xs text-slate-400">Operasional live MikroTik dan produk billing dalam satu workspace.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-400">
              Router aktif
              <select
                aria-label="Pilih router Hotspot"
                value={selectedRouterId}
                onChange={event => { setSelectedRouterId(event.target.value); setSelectedProfileId('all'); }}
                className="ml-2 min-w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                <option value="">Pilih router</option>
                {routers.map(router => <option key={router.id} value={router.id}>{router.name} · {router.host}</option>)}
              </select>
            </label>
            {selectedRouterId && (
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${routerReachable ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
                {routerLoading ? 'MENYINKRONKAN' : routerReachable === true ? 'TERHUBUNG' : routerReachable === false ? 'GANGGUAN' : 'BELUM DIUJI'}
              </span>
            )}
          </div>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto border-t border-slate-800 pt-3" role="tablist" aria-label="Bagian Hotspot">
          {sections.map(([section, title]) => (
            <button key={section} type="button" role="tab" aria-selected={activeSection === section} onClick={() => setActiveSection(section)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${activeSection === section ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{title}</button>
          ))}
        </nav>
      </header>
      {pageError && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">{pageError}</p>}
      {activeSection === 'products' && <HotspotPackagesManager profiles={profiles} serviceProfiles={serviceProfiles} routers={routers} selectedRouterId={selectedRouterId} onSelectRouter={setSelectedRouterId} onRefreshData={onRefreshData} onManageRouters={onManageRouters} />}
      {activeSection === 'servers' && <HotspotRouterPanel routerId={selectedRouterId} routers={routers} />}
      {activeSection === 'approvals' && <PaymentApprovalsPanel orderType="voucher" onRefreshData={onRefreshData} />}
      {activeSection === 'overview' && (
        <div className="space-y-5">
          {routerError && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">{routerError}</p>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['User di MikroTik', routerVouchers.length, 'all', 'Live'],
              ['Sedang online', routerVouchers.filter(v => v.active).length, 'sessions', 'Live'],
              ['Siap dipakai', routerVouchers.filter(v => v.status === 'unused').length, 'unused', 'Live'],
              ['Menunggu persetujuan', vouchers.filter(v => v.status === 'pending').length, 'approvals', 'Billing'],
            ].map(([label, count, target, source]) => (
              <button key={label} type="button" onClick={() => setActiveSection(target as typeof activeSection)} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-left transition hover:border-indigo-500/50">
                <span className="text-xs text-slate-400">{label}</span><strong className="mt-2 block text-2xl text-white">{count}</strong><span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${source === 'Live' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-indigo-500/10 text-indigo-300'}`}>{source}</span>
              </button>
            ))}
          </div>
          <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-white">Paket jual</h2>
                <p className="mt-1 text-xs text-slate-400">Harga dan masa berlaku dikelola billing; profile jaringan berasal dari MikroTik.</p>
              </div>
              <button type="button" onClick={() => setActiveSection('products')} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700">Kelola profil & paket</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {profiles.filter(profile => profile.enabled !== false).slice(0, 4).map(profile => {
                const routerUsers = routerVouchers.filter(voucher => voucher.profileName === profile.routerProfileName && voucher.routerId === profile.routerId);
                return (
                  <article key={profile.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <p className="truncate text-sm font-bold text-white">{profile.name}</p>
                    <p className="mt-1 text-xs text-slate-400">{profile.validityDuration} · {profile.speedLimit || 'Tanpa batas'}</p>
                    <p className="mt-3 text-sm font-bold text-indigo-300">Rp {profile.price.toLocaleString('id-ID')}</p>
                    <p className="mt-2 text-[10px] text-slate-500">{routerUsers.filter(user => user.status === 'unused').length} siap · {routerUsers.length} user di router</p>
                  </article>
                );
              })}
              {!profiles.some(profile => profile.enabled !== false) && <p className="text-xs text-slate-500">Belum ada paket jual yang aktif.</p>}
            </div>
          </section>
        </div>
      )}

      {/* Main Control Card */}
      {(activeSection === 'all' || activeSection === 'sessions' || activeSection === 'unused') && <>
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Ticket className="w-5 h-5 text-indigo-400" />
              <span>{activeSection === 'sessions' ? 'Sesi Hotspot Aktif' : activeSection === 'unused' ? 'Voucher Siap Dipakai' : 'User Hotspot di MikroTik'}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              User, status, dan pemakaian dibaca langsung dari MikroTik yang dipilih.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setRouterReloadKey(key => key + 1)}
              disabled={!selectedRouterId || routerLoading}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 inline mr-1.5 ${routerLoading ? 'animate-spin' : ''}`} />
              Segarkan
            </button>
            <button
              onClick={() => onOpenPrintModal(filteredVouchers.filter(voucher => Boolean(voucher.password)))}
              disabled={!filteredVouchers.some(voucher => Boolean(voucher.password))}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <Printer className="w-4 h-4 text-indigo-400" />
              <span>Cetak Voucher ({filteredVouchers.filter(voucher => Boolean(voucher.password)).length})</span>
            </button>

            <button
              onClick={() => setIsScriptModalOpen(true)}
              hidden={activeSection !== 'all'}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
            >
              <FileCode className="w-4 h-4 text-emerald-400" />
              <span>Ekspor Script MikroTik</span>
            </button>

            <button
              onClick={() => setIsGenerateModalOpen(true)}
              hidden={activeSection !== 'all' && activeSection !== 'unused'}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Generate Voucher Baru</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col lg:flex-row items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full lg:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari username, profile, comment..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <select
              value={selectedProfileId}
              onChange={e => setSelectedProfileId(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Semua Paket</option>
              {[...new Set(routerVouchers.map(voucher => voucher.profileName).filter(Boolean))].map(profileName => (
                <option key={profileName} value={profileName}>{profileName}</option>
              ))}
            </select>
            {routerLoading && <p role="status" className="text-xs text-slate-400">Memuat data hotspot dari MikroTik...</p>}
            {routerError && <p role="alert" className="text-xs text-rose-300">{routerError}</p>}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs w-full lg:w-auto overflow-x-auto">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua ({routerVouchers.length})
            </button>
            <button
              onClick={() => setStatusFilter('unused')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'unused' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Belum Dipakai ({routerVouchers.filter(v => v.status === 'unused').length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'active' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Aktif Digunakan ({routerVouchers.filter(v => v.status === 'active').length})
            </button>
            <button
              onClick={() => setStatusFilter('expired')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'expired' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Nonaktif ({routerVouchers.filter(v => v.status === 'expired').length})
            </button>
          </div>
        </div>
      </div>

      {/* Vouchers Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                <th className="py-3.5 px-4">Kode Voucher</th>
                <th className="py-3.5 px-4">Paket & Kecepatan</th>
                <th className="py-3.5 px-4">Tarif</th>
                <th className="py-3.5 px-4">Comment / Sumber</th>
                <th className="py-3.5 px-4">Pemakaian</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-mono">
              {visibleVouchers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                    {routerLoading ? 'Memuat data MikroTik...' : routerError ? 'Data tidak dapat dibaca dari MikroTik.' : !selectedRouterId ? 'Pilih router untuk membaca user hotspot.' : 'Router tidak memiliki user hotspot yang sesuai filter.'}
                  </td>
                </tr>
              ) : (
                visibleVouchers.map(v => (
                  <tr key={v.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-black text-white text-sm tracking-wider bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 inline-block">
                        {v.code}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500 font-sans">{v.address || 'Belum online'}{v.macAddress ? ` · ${v.macAddress}` : ''}</div>
                      {v.customerPhone && (
                        <div className="text-[10px] text-slate-400 mt-1 font-sans">
                          Pembeli: {v.customerPhone} ({v.paymentMethod || 'Online'})
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-sans">
                      <div className="font-bold text-slate-200">{v.profileName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {v.validityDuration} • {v.speedLimit}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-emerald-400 text-sm">
                        {v.price ? `Rp ${v.price.toLocaleString('id-ID')}` : '—'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      <div>{v.batchCode}</div>
                      <div className="text-[10px] text-slate-500">{v.createdAt}</div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      <div>{activeSection === 'sessions' ? `Online ${v.sessionUptime || '—'}` : v.limitUptime && v.limitUptime !== '0s' ? v.limitUptime : 'Tanpa batas waktu'}</div>
                      <div>{((v.bytesIn + v.bytesOut) / (1024 * 1024)).toFixed(2)} MB / {v.limitBytesTotal ? `${(v.limitBytesTotal / (1024 * 1024)).toFixed(0)} MB` : 'tanpa batas kuota'}</div>
                    </td>

                    <td className="py-3.5 px-4 font-sans">
                      {v.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          <Clock className="w-3 h-3" /> MENUNGGU PEMBAYARAN
                        </span>
                      )}
                      {v.status === 'unused' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" /> SIAP PAKAI
                        </span>
                      )}
                      {v.status === 'active' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                          <Wifi className="w-3 h-3" /> SEDANG ONLINE
                        </span>
                      )}
                      {v.status === 'expired' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          {v.disabled ? 'DINONAKTIFKAN' : 'EXPIRED'}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right font-sans">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={updatingStatus === v.code}
                          onClick={() => void toggleVoucherStatus(v)}
                          className={`p-1.5 rounded-lg border inline-flex items-center gap-1 text-[11px] disabled:opacity-50 ${v.disabled ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-900/50' : 'border-amber-500/30 bg-amber-950/30 text-amber-200 hover:bg-amber-900/50'}`}
                          title={v.disabled ? 'Aktifkan user di MikroTik' : 'Nonaktifkan user di MikroTik'}
                        >
                          <Power className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{updatingStatus === v.code ? 'Menyimpan...' : v.disabled ? 'Aktifkan' : 'Nonaktifkan'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditVoucher(v)}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 inline-flex items-center gap-1 text-[11px]"
                          title="Edit user di MikroTik"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                        {activeSection === 'sessions' && v.active && (
                          <button
                            type="button"
                            disabled={disconnectingVoucher === v.code}
                            onClick={() => void disconnectRouterVoucher(v)}
                            className="p-1.5 rounded-lg border border-amber-500/30 bg-amber-950/30 text-amber-200 hover:bg-amber-900/50 disabled:opacity-50 inline-flex items-center gap-1 text-[11px]"
                            title="Putuskan sesi aktif tanpa menghapus akun"
                          >
                            <Unplug className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{disconnectingVoucher === v.code ? 'Memutus...' : 'Putuskan'}</span>
                          </button>
                        )}
                        {v.password && (
                          <button
                            onClick={() => onOpenPrintModal([v])}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition inline-flex items-center gap-1 text-[11px]"
                            title="Cetak Voucher Tunggal"
                          >
                            <Printer className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="hidden sm:inline">Cetak</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={deletingVoucher === v.code}
                          onClick={() => void deleteRouterVoucher(v)}
                          className="p-1.5 bg-rose-950/40 hover:bg-rose-900/70 border border-rose-500/30 text-rose-200 rounded-lg transition inline-flex items-center gap-1 text-[11px] disabled:opacity-50"
                          title="Hapus voucher dari MikroTik"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{deletingVoucher === v.code ? 'Menghapus...' : 'Hapus'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      </>}

      {/* Batch Generate Modal */}
      {activeSection === 'all' && isGenerateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md text-white shadow-2xl p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Generate Voucher Hotspot Massal</span>
              </h3>
              <button
                onClick={() => setIsGenerateModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGenerateBatch} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Pilih Paket Hotspot</label>
                <select
                  value={batchProfileId}
                  onChange={e => setBatchProfileId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                >
                  {profiles.filter(profile => profile.enabled !== false).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.validityDuration}) - Rp {p.price.toLocaleString('id-ID')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Jumlah Voucher</label>
                  <select
                    value={batchCount}
                    onChange={e => setBatchCount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value={10}>10 Voucher</option>
                    <option value={15}>15 Voucher</option>
                    <option value={25}>25 Voucher</option>
                    <option value={50}>50 Voucher</option>
                    <option value={100}>100 Voucher</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Prefix Kode</label>
                  <input
                    type="text"
                    value={batchPrefix}
                    onChange={e => setBatchPrefix(e.target.value)}
                    placeholder="NET-"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-[11px] text-indigo-300">
                💡 Format kode voucher akan menggunakan kombinasi angka acak yang mudah diketik oleh pengguna WiFi (Contoh: <b>{batchPrefix}73921</b>).
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsGenerateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isGenerating || !batchProfileId}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30"
                >
                  {isGenerating ? 'Membuat di MikroTik...' : 'Buat Voucher Sekarang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Export MikroTik Script Modal */}
      {activeSection === 'all' && isScriptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl text-white shadow-2xl p-6 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span>MikroTik RouterOS Hotspot CLI Script</span>
              </h3>
              <button
                onClick={() => setIsScriptModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Salin script dibawah ini dan paste di menu <b>New Terminal</b> Winbox router MikroTik Anda untuk mendaftarkan user hotspot:
            </p>

            <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-[11px] text-emerald-400 overflow-y-auto flex-1 select-all">
              {getMikrotikScript()}
            </pre>

            <div className="flex justify-between items-center gap-3 pt-4 border-t border-slate-800 mt-4">
              <span className="text-[11px] text-slate-500 font-mono">
                {filteredVouchers.length} user voucher siap diekspor
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsScriptModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                >
                  Tutup
                </button>
                <button
                  onClick={handleCopyScript}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
                >
                  {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedScript ? 'Tersalin!' : 'Salin Script CLI'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingVoucher && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <form onSubmit={saveVoucherUser} className="my-auto w-full max-w-xl space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-bold">Edit user Hotspot</h3>
                <p className="mt-1 text-xs text-slate-400">Perubahan user disimpan langsung ke MikroTik {routers.find(router => router.id === selectedRouterId)?.name || ''}.</p>
              </div>
              <button type="button" onClick={() => setEditingVoucher(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Tutup"><X className="h-4 w-4" /></button>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Username (tidak dapat diubah)</span>
              <span className="mt-1 block font-mono text-sm font-bold">{editingVoucher.code}</span>
            </div>
            {editingVoucher.active && <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-[11px] text-amber-200">User sedang online. Perubahan profile atau batas tidak memutus sesi yang sedang berjalan; putuskan sesi secara terpisah bila perlu menerapkan perubahan segera.</p>}
            <label className="block text-xs text-slate-300">Password baru <span className="text-slate-500">(kosongkan untuk tidak mengubah)</span>
              <input type="password" autoComplete="new-password" maxLength={128} value={userForm.password} onChange={event => setUserForm({ ...userForm, password: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
            </label>
            <label className="block text-xs text-slate-300">User profile MikroTik
              <select required value={userForm.profile} onChange={event => setUserForm({ ...userForm, profile: event.target.value })} disabled={userProfilesLoading} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60">
                <option value="">Pilih profile live</option>
                {routerUserProfiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}</option>)}
                {userForm.profile && !routerUserProfiles.some(profile => profile.name === userForm.profile) && <option value={userForm.profile}>{userForm.profile} (saat ini)</option>}
              </select>
              {userProfilesLoading && <span role="status" className="mt-1 block text-[11px] text-slate-500">Memuat profile dari router...</span>}
              {userProfileError && <span role="alert" className="mt-1 block text-[11px] text-rose-300">{userProfileError}</span>}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-300">Batas waktu (limit-uptime)
                <input maxLength={64} value={userForm.limitUptime} onChange={event => setUserForm({ ...userForm, limitUptime: event.target.value })} placeholder="Kosongkan untuk tanpa batas" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
                <span className="mt-1 block text-[10px] text-slate-500">Contoh: 12h, 1d, atau 01:00:00.</span>
              </label>
              <label className="text-xs text-slate-300">Batas kuota (byte)
                <input required type="number" min={0} step={1} value={userForm.limitBytesTotal} onChange={event => setUserForm({ ...userForm, limitBytesTotal: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
                <span className="mt-1 block text-[10px] text-slate-500">{Number(userForm.limitBytesTotal || 0) === 0 ? '0 = tanpa batas kuota.' : `${(Number(userForm.limitBytesTotal) / (1024 * 1024)).toFixed(2)} MB`}</span>
              </label>
            </div>
            <label className="block text-xs text-slate-300">Comment RouterOS
              <input maxLength={200} value={userForm.comment} onChange={event => setUserForm({ ...userForm, comment: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
            </label>
            {pageError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">{pageError}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setEditingVoucher(null)} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">Batal</button>
              <button type="submit" disabled={savingUser || userProfilesLoading || !!userProfileError || !routerUserProfiles.some(profile => profile.name === userForm.profile)} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                {savingUser ? 'Menyimpan ke MikroTik...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
