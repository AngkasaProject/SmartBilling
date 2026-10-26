import React, { useEffect, useState } from 'react';
import { HotspotProfile, HotspotServiceProfile, HotspotValidityPreset, RouterConfig } from '../../types';
import { StorageService } from '../../services/storage';
import { useToast } from '../ui/toast';
import { Plus, RefreshCw, X } from 'lucide-react';

interface Props {
  profiles: HotspotProfile[];
  serviceProfiles: HotspotServiceProfile[];
  routers: RouterConfig[];
  selectedRouterId: string;
  onSelectRouter: (routerId: string) => void;
  onRefreshData: () => void;
  onManageRouters: () => void;
}

interface PackageForm {
  id: string;
  name: string;
  serviceProfileId: string;
  price: number;
  validityPreset: HotspotValidityPreset;
  dataLimitMb: number;
}

interface RouterUserProfileForm {
  existingName: string;
  serviceProfileId: string;
  name: string;
  routerId: string;
  rateLimit: string;
  sharedUsers: number;
  addressPool: string;
  sessionTimeout: string;
  idleTimeout: string;
  validityPreset: HotspotValidityPreset;
  dataLimitMb: number;
}

const validityPresets: Array<{ label: HotspotValidityPreset; hours: number }> = [
  { label: '1 jam', hours: 1 },
  { label: '12 jam', hours: 12 },
  { label: '1 hari', hours: 24 },
  { label: '1 minggu', hours: 168 },
  { label: '2 minggu', hours: 336 },
  { label: '1 bulan', hours: 720 },
];

const emptyRouterUserProfile = (routerId: string): RouterUserProfileForm => ({
  existingName: '',
  serviceProfileId: '',
  name: '',
  routerId,
  rateLimit: '',
  sharedUsers: 1,
  addressPool: '',
  sessionTimeout: '',
  idleTimeout: '',
  validityPreset: '1 hari',
  dataLimitMb: 0,
});

const inputClass = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white';

async function readResponse<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result as T;
}

export const HotspotPackagesManager: React.FC<Props> = ({
  profiles,
  serviceProfiles,
  routers,
  selectedRouterId,
  onSelectRouter,
  onRefreshData,
  onManageRouters,
}) => {
  const { confirm: confirmAction } = useToast();
  const [activePage, setActivePage] = useState<'packages' | 'profiles'>('packages');
  const [packageDialog, setPackageDialog] = useState(false);
  const [routerProfileDialog, setRouterProfileDialog] = useState(false);
  const [packageForm, setPackageForm] = useState<PackageForm>({
    id: '',
    name: '',
    serviceProfileId: '',
    price: 0,
    validityPreset: '1 hari',
    dataLimitMb: 0,
  });
  const [routerProfileForm, setRouterProfileForm] = useState<RouterUserProfileForm>(emptyRouterUserProfile(routers[0]?.id || ''));
  const profilesRouterId = selectedRouterId;
  const [routerProfiles, setRouterProfiles] = useState<Array<{
    name: string;
    rateLimit: string;
    sharedUsers: number;
    addressPool: string;
    sessionTimeout: string;
    idleTimeout: string;
  }>>([]);
  const [routerPools, setRouterPools] = useState<string[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState('');
  const [profilesReloadKey, setProfilesReloadKey] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profilesRouterId) {
      setRouterProfiles([]);
      setRouterPools([]);
      setProfilesLoading(false);
      return;
    }
    let active = true;
    setRouterProfiles([]);
    setRouterPools([]);
    setProfilesLoading(true);
    setProfilesError('');
    fetch(`/api/mikrotik/hotspot/profiles?routerId=${encodeURIComponent(profilesRouterId)}`)
      .then(response => readResponse<{
        profiles: Array<{
          name: string;
          rateLimit: string;
          sharedUsers: number;
          addressPool: string;
          sessionTimeout: string;
          idleTimeout: string;
        }>;
        pools: string[];
      }>(response))
      .then(result => {
        if (active) {
          setRouterProfiles(result.profiles);
          setRouterPools(result.pools);
        }
      })
      .catch(fetchError => {
        if (active) setProfilesError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      })
      .finally(() => {
        if (active) setProfilesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [profilesRouterId, profilesReloadKey]);

  const savePackage = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      let serviceProfileId = packageForm.serviceProfileId;
      if (serviceProfileId.startsWith('router:')) {
        const routerProfileName = serviceProfileId.slice('router:'.length);
        const routerProfile = routerProfiles.find(profile => profile.name === routerProfileName);
        if (!routerProfile || !profilesRouterId) throw new Error('User profile router tidak lagi tersedia. Segarkan daftar MikroTik.');
        const serviceResult = await readResponse<{ profile: HotspotServiceProfile }>(await fetch('/api/admin/hotspot/service-profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: routerProfile.name,
            routerId: profilesRouterId,
            routerProfileName: routerProfile.name,
            poolName: routerProfile.addressPool === 'none' ? '' : routerProfile.addressPool,
            speedLimit: routerProfile.rateLimit,
            validityPreset: packageForm.validityPreset,
            sharedUsers: routerProfile.sharedUsers,
            dataLimitMb: packageForm.dataLimitMb || undefined,
          }),
        }));
        serviceProfileId = serviceResult.profile.id;
        setPackageForm(current => ({ ...current, serviceProfileId }));
      }
      const result = await readResponse<{ profile: HotspotProfile }>(await fetch('/api/admin/hotspot/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...packageForm, serviceProfileId, enabled: true }),
      }));
      await StorageService.syncDataFromSqlite();
      onRefreshData();
      setMessage(`Paket ${result.profile.name} tersimpan.`);
      setPackageDialog(false);
      setPackageForm({ id: '', name: '', serviceProfileId: '', price: 0, validityPreset: '1 hari', dataLimitMb: 0 });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const saveRouterProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { existingName, routerId, ...profile } = routerProfileForm;
      if (existingName) {
        await readResponse(await fetch('/api/mikrotik/hotspot/user-profiles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routerId, existingName, profile }),
        }));
      }
      await readResponse(await fetch('/api/admin/hotspot/service-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(profile.serviceProfileId ? { id: profile.serviceProfileId } : {}),
          name: profile.name.trim(),
          routerId,
          routerProfileName: profile.name.trim(),
          poolName: profile.addressPool,
          speedLimit: profile.rateLimit,
          validityPreset: profile.validityPreset,
          sharedUsers: profile.sharedUsers,
          dataLimitMb: profile.dataLimitMb || undefined,
        }),
      }));
      await StorageService.syncDataFromSqlite();
      onRefreshData();
      setMessage(`User profile ${profile.name} ${existingName ? 'diperbarui' : 'ditambahkan'} dan disinkronkan dengan data billing.`);
      setRouterProfileDialog(false);
      setRouterProfileForm(emptyRouterUserProfile(routerId));
      setProfilesReloadKey(key => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const editRouterProfile = (profile: typeof routerProfiles[number]) => {
    setError('');
    setRouterProfileForm({
      existingName: profile.name,
      serviceProfileId: serviceProfiles.find(item => item.routerId === profilesRouterId && item.routerProfileName === profile.name)?.id || '',
      name: profile.name,
      routerId: profilesRouterId,
      rateLimit: profile.rateLimit,
      sharedUsers: profile.sharedUsers,
      addressPool: profile.addressPool === 'none' ? '' : profile.addressPool,
      sessionTimeout: profile.sessionTimeout,
      idleTimeout: profile.idleTimeout,
      validityPreset: serviceProfiles.find(item => item.routerId === profilesRouterId && item.routerProfileName === profile.name)?.validityPreset || '1 hari',
      dataLimitMb: serviceProfiles.find(item => item.routerId === profilesRouterId && item.routerProfileName === profile.name)?.dataLimitMb || 0,
    });
    setRouterProfileDialog(true);
  };

  const deleteRouterProfile = async (profileName: string) => {
    if (!await confirmAction('Hapus user profile?', `Profile "${profileName}" akan dihapus dari MikroTik, konfigurasi billing, dan paket yang terhubung.`, true)) return;
    setError('');
    try {
      await readResponse(await fetch('/api/mikrotik/hotspot/user-profiles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routerId: profilesRouterId, name: profileName }),
      }));
      await StorageService.syncDataFromSqlite();
      onRefreshData();
      setMessage(`User profile ${profileName} dihapus dari MikroTik.`);
      setProfilesReloadKey(key => key + 1);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  const setPackageEnabled = async (profile: HotspotProfile, enabled: boolean) => {
    setError('');
    try {
      const result = await readResponse<{ profile: HotspotProfile }>(await fetch('/api/admin/hotspot/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: profile.id,
          name: profile.name,
          serviceProfileId: profile.serviceProfileId,
          price: profile.price,
          enabled,
        }),
      }));
      await StorageService.syncDataFromSqlite();
      onRefreshData();
      setMessage(`Paket ${result.profile.name} ${enabled ? 'ditampilkan' : 'disembunyikan'} di portal.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  const editPackage = (profile: HotspotProfile) => {
    setPackageForm({
      id: profile.id,
      name: profile.name,
      serviceProfileId: profile.serviceProfileId || '',
      price: profile.price,
      validityPreset: '1 hari',
      dataLimitMb: 0,
    });
    setPackageDialog(true);
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
        <div>
          <h2 className="text-lg font-bold text-white">Pengaturan Voucher Hotspot</h2>
          <p className="mt-1 text-xs text-slate-400">Kelola profil layanan MikroTik dan produk portal. Masa berlaku voucher baru dimulai saat pertama dipakai.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onManageRouters} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-100">
            Kelola server MikroTik
          </button>
          <button type="button" onClick={() => { const routerId = profilesRouterId || routers[0]?.id || ''; setError(''); setRouterProfileForm(emptyRouterUserProfile(routerId)); setRouterProfileDialog(true); }} disabled={!routers.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-100 disabled:opacity-50">
            <Plus className="h-4 w-4" /> Tambah User Profile MikroTik
          </button>
          <button type="button" onClick={() => { setError(''); setPackageForm({ id: '', name: '', serviceProfileId: serviceProfiles[0]?.id || '', price: 0, validityPreset: '1 hari', dataLimitMb: 0 }); setPackageDialog(true); }} disabled={!serviceProfiles.length && !routerProfiles.length} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
            <Plus className="h-4 w-4" /> Tambah Paket
          </button>
        </div>
      </div>

      {message && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-200">{message}</p>}
      {error && !packageDialog && !routerProfileDialog && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</p>}

      <nav className="flex gap-2 border-b border-slate-800">
        {([
          ['packages', `Paket jual (${profiles.length})`],
          ['profiles', `User Profile MikroTik (${routerProfiles.length})`],
        ] as const).map(([page, label]) => (
          <button key={page} type="button" onClick={() => setActivePage(page)} className={`border-b-2 px-4 py-3 text-xs font-bold ${activePage === page ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
      </nav>

      {activePage === 'packages' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map(profile => (
            <article key={profile.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-white">{profile.name}</h3>
                  <p className="mt-1 text-xs text-slate-400">{profile.validityDuration} · {profile.speedLimit}</p>
                </div>
                <span className={`text-[10px] font-bold ${profile.enabled === false ? 'text-slate-500' : 'text-emerald-300'}`}>{profile.enabled === false ? 'TERSEMBUNYI' : 'AKTIF'}</span>
              </div>
              <p className="mt-3 text-sm font-bold text-indigo-300">Rp {profile.price.toLocaleString('id-ID')}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => editPackage(profile)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200">Edit</button>
                <button type="button" onClick={() => void setPackageEnabled(profile, profile.enabled === false)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200">{profile.enabled === false ? 'Tampilkan' : 'Sembunyikan'}</button>
              </div>
            </article>
          ))}
          {!profiles.length && <p className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs text-slate-400">Belum ada paket jual. Pilih user profile live dari MikroTik atau siapkan konfigurasi billing, lalu buat paket.</p>}
        </div>
      )}

      {activePage === 'profiles' && (
        <div className="space-y-5">
          <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-bold text-white">User Profile MikroTik (data langsung)</h3>
                <p className="mt-1 text-xs text-slate-400">Daftar ini dibaca langsung dari router, tidak dari database billing.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                  {routers.find(router => router.id === profilesRouterId)?.name || 'Pilih router dari header'}
                </span>
                <button type="button" onClick={() => setProfilesReloadKey(key => key + 1)} disabled={!profilesRouterId || profilesLoading} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${profilesLoading ? 'animate-spin' : ''}`} /> Segarkan
                </button>
              </div>
            </div>
            {profilesLoading && <p role="status" className="text-xs text-slate-400">Memuat user profile dari MikroTik...</p>}
            {profilesError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">{profilesError}</p>}
            {!profilesRouterId && <p className="text-xs text-amber-300">Pilih router untuk mengambil daftar profile secara langsung.</p>}
            {!profilesLoading && !profilesError && profilesRouterId && routerProfiles.length === 0 && <p className="text-xs text-slate-400">Router tidak mengembalikan user profile.</p>}
            {!!routerProfiles.length && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {routerProfiles.map(profile => (
                  <article key={profile.name} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <h4 className="font-bold text-white">{profile.name}</h4>
                    <p className="mt-1 text-xs text-slate-400">Rate limit: {profile.rateLimit || 'tanpa batas'}</p>
                    <p className="mt-1 text-xs text-slate-400">IP pool: {profile.addressPool || 'tidak diatur'} · Shared user: {profile.sharedUsers}</p>
                    <p className="mt-1 text-xs text-slate-400">Session timeout: {profile.sessionTimeout || 'tidak diatur'} · Idle timeout: {profile.idleTimeout || 'tidak diatur'}</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => editRouterProfile(profile)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200">Edit di MikroTik</button>
                      <button type="button" onClick={() => void deleteRouterProfile(profile.name)} className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-1.5 text-xs font-bold text-rose-200">Hapus dari MikroTik</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {packageDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <form onSubmit={savePackage} className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div><h3 className="font-bold text-white">{packageForm.id ? 'Edit Paket Jual' : 'Tambah Paket Jual'}</h3><p className="mt-1 text-xs text-slate-400">Pilih profil yang sudah disiapkan pada MikroTik.</p></div>
              <button type="button" onClick={() => setPackageDialog(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <label className="block text-xs text-slate-300">Nama paket<input required maxLength={64} value={packageForm.name} onChange={event => setPackageForm({ ...packageForm, name: event.target.value })} className={inputClass} /></label>
            <label className="block text-xs text-slate-300">Profil layanan
              <select required value={packageForm.serviceProfileId} onChange={event => setPackageForm({ ...packageForm, serviceProfileId: event.target.value })} className={inputClass}>
                <option value="">Pilih profil</option>
                {serviceProfiles.length > 0 && <optgroup label="Konfigurasi billing tersimpan">{serviceProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.validityPreset} · {profile.speedLimit || 'tanpa batas'}</option>)}</optgroup>}
                {routerProfiles.length > 0 && <optgroup label={`User profile live · ${routers.find(router => router.id === profilesRouterId)?.name || 'MikroTik'}`}>
                  {routerProfiles.map(profile => <option key={profile.name} value={`router:${profile.name}`}>{profile.name} · {profile.rateLimit || 'tanpa batas'}</option>)}
                </optgroup>}
              </select>
            </label>
            {packageForm.serviceProfileId.startsWith('router:') && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-slate-300">Masa berlaku voucher
                  <select value={packageForm.validityPreset} onChange={event => setPackageForm({ ...packageForm, validityPreset: event.target.value as HotspotValidityPreset })} className={inputClass}>{validityPresets.map(preset => <option key={preset.label} value={preset.label}>{preset.label}</option>)}</select>
                </label>
                <label className="block text-xs text-slate-300">Batas kuota (MB, 0 = tanpa batas)
                  <input type="number" min="0" value={packageForm.dataLimitMb} onChange={event => setPackageForm({ ...packageForm, dataLimitMb: Number(event.target.value) })} className={inputClass} />
                </label>
                <p className="sm:col-span-2 text-xs text-slate-400">Profil MikroTik live akan disambungkan ke konfigurasi billing dengan masa berlaku dan kuota di atas.</p>
              </div>
            )}
            <label className="block text-xs text-slate-300">Harga (Rp)<input required type="number" min="1" step="1" value={packageForm.price || ''} onChange={event => setPackageForm({ ...packageForm, price: Number(event.target.value) })} className={inputClass} /></label>
            {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setPackageDialog(false)} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">Batal</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Paket'}</button>
            </div>
          </form>
        </div>
      )}

      {routerProfileDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4">
          <form onSubmit={saveRouterProfile} className="my-auto w-full max-w-2xl space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white">{routerProfileForm.existingName ? 'Edit User Profile MikroTik' : 'Tambah User Profile MikroTik'}</h3>
                <p className="mt-1 text-xs text-slate-400">Profil MikroTik dan pengaturan billing dikelola dalam satu alur.</p>
              </div>
              <button type="button" onClick={() => setRouterProfileDialog(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <label className="block text-xs text-slate-300">Server MikroTik
              <select required disabled={!!routerProfileForm.existingName} value={routerProfileForm.routerId} onChange={event => { setRouterProfileForm({ ...routerProfileForm, routerId: event.target.value, addressPool: '' }); onSelectRouter(event.target.value); }} className={inputClass}>
                <option value="">Pilih server</option>{routers.map(router => <option key={router.id} value={router.id}>{router.name} · {router.host}</option>)}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-300">Nama profile
                <input required maxLength={64} value={routerProfileForm.name} onChange={event => setRouterProfileForm({ ...routerProfileForm, name: event.target.value })} className={inputClass} />
              </label>
              <label className="text-xs text-slate-300">Batas kecepatan
                <input maxLength={256} value={routerProfileForm.rateLimit} onChange={event => setRouterProfileForm({ ...routerProfileForm, rateLimit: event.target.value })} className={inputClass} placeholder="Contoh: 5M/5M" />
              </label>
              <label className="text-xs text-slate-300">IP pool
                <select value={routerProfileForm.addressPool} onChange={event => setRouterProfileForm({ ...routerProfileForm, addressPool: event.target.value })} className={inputClass}>
                  <option value="">Tanpa pool</option>
                  {routerProfileForm.addressPool && !routerPools.includes(routerProfileForm.addressPool) && <option value={routerProfileForm.addressPool}>{routerProfileForm.addressPool} (nilai dari router)</option>}
                  {routerPools.map(pool => <option key={pool} value={pool}>{pool}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-300">Jumlah shared user
                <input required type="number" min="1" max="1000" value={routerProfileForm.sharedUsers} onChange={event => setRouterProfileForm({ ...routerProfileForm, sharedUsers: Number(event.target.value) })} className={inputClass} />
              </label>
              <label className="text-xs text-slate-300">Session timeout
                <input maxLength={64} value={routerProfileForm.sessionTimeout} onChange={event => setRouterProfileForm({ ...routerProfileForm, sessionTimeout: event.target.value })} className={inputClass} placeholder="Contoh: 01:00:00" />
              </label>
              <label className="text-xs text-slate-300">Idle timeout
                <input maxLength={64} value={routerProfileForm.idleTimeout} onChange={event => setRouterProfileForm({ ...routerProfileForm, idleTimeout: event.target.value })} className={inputClass} placeholder="Contoh: 00:05:00" />
              </label>
              <label className="text-xs text-slate-300">Masa berlaku billing
                <select value={routerProfileForm.validityPreset} onChange={event => setRouterProfileForm({ ...routerProfileForm, validityPreset: event.target.value as HotspotValidityPreset })} className={inputClass}>
                  {validityPresets.map(preset => <option key={preset.label} value={preset.label}>{preset.label}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-300">Batas kuota billing (MB, 0 = tanpa batas)
                <input type="number" min="0" value={routerProfileForm.dataLimitMb} onChange={event => setRouterProfileForm({ ...routerProfileForm, dataLimitMb: Number(event.target.value) })} className={inputClass} />
              </label>
            </div>
            {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setRouterProfileDialog(false)} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">Batal</button>
              <button type="submit" disabled={saving || !routerProfileForm.routerId} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan ke MikroTik'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
