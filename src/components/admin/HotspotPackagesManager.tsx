import React, { useEffect, useState } from 'react';
import { HotspotProfile, HotspotServiceProfile, HotspotValidityPreset, RouterConfig } from '../../types';
import { StorageService } from '../../services/storage';
import { Plus, Settings2, X } from 'lucide-react';

interface Props {
  profiles: HotspotProfile[];
  serviceProfiles: HotspotServiceProfile[];
  routers: RouterConfig[];
  onRefreshData: () => void;
  onManageRouters: () => void;
}

interface PackageForm {
  id: string;
  name: string;
  serviceProfileId: string;
  price: number;
}

interface ServiceProfileForm {
  id: string;
  name: string;
  routerId: string;
  routerProfileName: string;
  speedLimit: string;
  validityPreset: HotspotValidityPreset;
  sharedUsers: number;
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

const emptyServiceProfile = (routerId: string): ServiceProfileForm => ({
  id: '',
  name: '',
  routerId,
  routerProfileName: '',
  speedLimit: '5M/5M',
  validityPreset: '1 hari',
  sharedUsers: 1,
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
  onRefreshData,
  onManageRouters,
}) => {
  const [activePage, setActivePage] = useState<'packages' | 'profiles'>('packages');
  const [packageDialog, setPackageDialog] = useState(false);
  const [profileDialog, setProfileDialog] = useState(false);
  const [packageForm, setPackageForm] = useState<PackageForm>({ id: '', name: '', serviceProfileId: '', price: 0 });
  const [serviceForm, setServiceForm] = useState<ServiceProfileForm>(emptyServiceProfile(routers[0]?.id || ''));
  const [newRouterProfileName, setNewRouterProfileName] = useState('');
  const [routerProfiles, setRouterProfiles] = useState<Array<{ name: string; rateLimit: string; sharedUsers: number }>>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!serviceForm.routerId) {
      setRouterProfiles([]);
      return;
    }
    let active = true;
    fetch(`/api/mikrotik/hotspot/profiles?routerId=${encodeURIComponent(serviceForm.routerId)}`)
      .then(response => readResponse<{ profiles: Array<{ name: string; rateLimit: string; sharedUsers: number }> }>(response))
      .then(result => {
        if (active) setRouterProfiles(result.profiles);
      })
      .catch(fetchError => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      });
    return () => {
      active = false;
    };
  }, [serviceForm.routerId]);

  const savePackage = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const result = await readResponse<{ profile: HotspotProfile }>(await fetch('/api/admin/hotspot/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...packageForm, enabled: true }),
      }));
      await StorageService.syncDataFromSqlite();
      onRefreshData();
      setMessage(`Paket ${result.profile.name} tersimpan.`);
      setPackageDialog(false);
      setPackageForm({ id: '', name: '', serviceProfileId: '', price: 0 });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const saveServiceProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await readResponse(await fetch('/api/admin/hotspot/service-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...serviceForm,
          routerProfileName: serviceForm.routerProfileName === '__new__' ? newRouterProfileName : serviceForm.routerProfileName,
          dataLimitMb: serviceForm.dataLimitMb || undefined,
        }),
      }));
      await StorageService.syncDataFromSqlite();
      onRefreshData();
      setMessage(`Profil layanan ${serviceForm.name} tersimpan dan tersinkron dengan MikroTik.`);
      setProfileDialog(false);
      setServiceForm(emptyServiceProfile(serviceForm.routerId));
      setNewRouterProfileName('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
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
    });
    setPackageDialog(true);
  };

  const selectedRouterProfile = routerProfiles.find(profile => profile.name === serviceForm.routerProfileName);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
        <div>
          <h2 className="text-lg font-bold text-white">Pengaturan Voucher Hotspot</h2>
          <p className="mt-1 text-xs text-slate-400">Kelola profil layanan MikroTik dan produk yang dijual melalui portal.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onManageRouters} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-100">
            Kelola server MikroTik
          </button>
          <button type="button" onClick={() => { setError(''); setServiceForm(emptyServiceProfile(routers[0]?.id || '')); setNewRouterProfileName(''); setProfileDialog(true); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-100">
            <Settings2 className="h-4 w-4" /> Tambah Profil
          </button>
          <button type="button" onClick={() => { setError(''); setPackageForm({ id: '', name: '', serviceProfileId: serviceProfiles[0]?.id || '', price: 0 }); setPackageDialog(true); }} disabled={!serviceProfiles.length} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
            <Plus className="h-4 w-4" /> Tambah Paket
          </button>
        </div>
      </div>

      {message && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-200">{message}</p>}
      {error && !packageDialog && !profileDialog && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</p>}

      <nav className="flex gap-2 border-b border-slate-800">
        {([
          ['packages', `Paket jual (${profiles.length})`],
          ['profiles', `Profil layanan (${serviceProfiles.length})`],
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
          {!profiles.length && <p className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs text-slate-400">Belum ada paket jual. Tambahkan profil layanan terlebih dahulu, lalu buat paket.</p>}
        </div>
      )}

      {activePage === 'profiles' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {serviceProfiles.map(profile => (
            <article key={profile.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h3 className="font-bold text-white">{profile.name}</h3>
              <p className="mt-1 text-xs text-slate-400">{profile.routerProfileName} · {profile.speedLimit}</p>
              <p className="mt-1 text-xs text-slate-400">{profile.validityPreset} · {profile.sharedUsers} perangkat · {profile.dataLimitMb ? `${profile.dataLimitMb} MB` : 'Tanpa batas kuota'}</p>
              <p className="mt-2 text-[11px] text-indigo-300">{routers.find(router => router.id === profile.routerId)?.name || 'Router tidak tersedia'}</p>
            </article>
          ))}
          {!serviceProfiles.length && <p className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs text-slate-400">Belum ada profil layanan. Profil ini menyimpan server, kecepatan, masa penggunaan, dan kuota.</p>}
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
            <label className="block text-xs text-slate-300">Profil layanan<select required value={packageForm.serviceProfileId} onChange={event => setPackageForm({ ...packageForm, serviceProfileId: event.target.value })} className={inputClass}><option value="">Pilih profil</option>{serviceProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.validityPreset} · {profile.speedLimit}</option>)}</select></label>
            <label className="block text-xs text-slate-300">Harga (Rp)<input required type="number" min="1" step="1" value={packageForm.price || ''} onChange={event => setPackageForm({ ...packageForm, price: Number(event.target.value) })} className={inputClass} /></label>
            {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setPackageDialog(false)} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">Batal</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Paket'}</button>
            </div>
          </form>
        </div>
      )}

      {profileDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4">
          <form onSubmit={saveServiceProfile} className="my-auto w-full max-w-2xl space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div><h3 className="font-bold text-white">Tambah Profil Layanan</h3><p className="mt-1 text-xs text-slate-400">Profil user akan dicek/dibuat pada router, lalu tersedia sebagai pilihan paket.</p></div>
              <button type="button" onClick={() => setProfileDialog(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-300">Nama profil layanan<input required maxLength={64} value={serviceForm.name} onChange={event => setServiceForm({ ...serviceForm, name: event.target.value })} className={inputClass} placeholder="Contoh: Harian 5 Mbps" /></label>
              <label className="text-xs text-slate-300">Server MikroTik<select required value={serviceForm.routerId} onChange={event => setServiceForm({ ...serviceForm, routerId: event.target.value, routerProfileName: '' })} className={inputClass}><option value="">Pilih server</option>{routers.map(router => <option key={router.id} value={router.id}>{router.name} · {router.host}</option>)}</select></label>
              <label className="text-xs text-slate-300">Profil Hotspot RouterOS<select required value={serviceForm.routerProfileName} onChange={event => {
                const selected = routerProfiles.find(profile => profile.name === event.target.value);
                setServiceForm({
                  ...serviceForm,
                  routerProfileName: event.target.value,
                  ...(selected ? { speedLimit: selected.rateLimit || serviceForm.speedLimit, sharedUsers: selected.sharedUsers || 1 } : {}),
                });
              }} className={inputClass}><option value="">Pilih profil yang tersinkron</option>{routerProfiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name} · {profile.rateLimit || 'tanpa rate limit'}</option>)}<option value="__new__">+ Buat profil RouterOS baru</option></select>
              </label>
              {serviceForm.routerProfileName === '__new__' && <label className="text-xs text-slate-300">Nama profil RouterOS baru<input required maxLength={64} value={newRouterProfileName} onChange={event => setNewRouterProfileName(event.target.value)} className={inputClass} placeholder="Contoh: HOTSPOT-5M" /></label>}
              <label className="text-xs text-slate-300">Batas kecepatan (upload/download)<input required pattern="\\d+[KMGkmg]/\\d+[KMGkmg]" value={serviceForm.speedLimit} onChange={event => setServiceForm({ ...serviceForm, speedLimit: event.target.value })} className={inputClass} placeholder="5M/5M" /></label>
              <label className="text-xs text-slate-300">Masa penggunaan<select value={serviceForm.validityPreset} onChange={event => setServiceForm({ ...serviceForm, validityPreset: event.target.value as HotspotValidityPreset })} className={inputClass}>{validityPresets.map(preset => <option key={preset.label} value={preset.label}>{preset.label}</option>)}</select></label>
              <label className="text-xs text-slate-300">Jumlah perangkat<input required type="number" min="1" max="100" value={serviceForm.sharedUsers} onChange={event => setServiceForm({ ...serviceForm, sharedUsers: Number(event.target.value) })} className={inputClass} /></label>
              <label className="text-xs text-slate-300">Batas kuota (MB, 0 = tanpa batas)<input type="number" min="0" value={serviceForm.dataLimitMb} onChange={event => setServiceForm({ ...serviceForm, dataLimitMb: Number(event.target.value) })} className={inputClass} /></label>
            </div>
            {selectedRouterProfile && <p className="rounded-lg border border-indigo-500/20 bg-indigo-950/30 p-3 text-xs text-indigo-200">Data profil aktif tersinkron: {selectedRouterProfile.rateLimit || 'tanpa rate limit'} · {selectedRouterProfile.sharedUsers} perangkat.</p>}
            {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setProfileDialog(false)} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">Batal</button>
              <button type="submit" disabled={saving || !routers.length || (serviceForm.routerProfileName === '__new__' && !newRouterProfileName.trim())} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Profil'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
