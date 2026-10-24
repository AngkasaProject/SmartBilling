import React, { useCallback, useEffect, useState } from 'react';
import { RouterConfig } from '../../types';
import { useToast } from '../ui/toast';
import { Edit2, FileText, Plus, RefreshCw, Trash2, X } from 'lucide-react';

interface Props {
  routerId: string;
  routers: RouterConfig[];
}

interface HotspotServer {
  id: string;
  name: string;
  interface: string;
  disabled: boolean;
  profile?: string;
  addressPool?: string;
}

interface HotspotServerProfile {
  name: string;
  hotspotAddress: string;
  dnsName: string;
  htmlDirectory: string;
  loginBy: string;
  useRadius: boolean;
}

interface HotspotFile {
  id: string;
  name: string;
  type: string;
  size: string;
  isDirectory: boolean;
}

const blankServerProfile = (): HotspotServerProfile => ({
  name: '',
  hotspotAddress: '',
  dnsName: '',
  htmlDirectory: '',
  loginBy: 'http-chap,http-pap',
  useRadius: false,
});

const fieldClass = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white';

async function readJson<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result as T;
}

export const HotspotRouterPanel: React.FC<Props> = ({ routerId, routers }) => {
  const { confirm, toast } = useToast();
  const [servers, setServers] = useState<HotspotServer[]>([]);
  const [serverProfiles, setServerProfiles] = useState<HotspotServerProfile[]>([]);
  const [htmlDirectories, setHtmlDirectories] = useState<string[]>([]);
  const [fileDirectory, setFileDirectory] = useState('');
  const [routerFiles, setRouterFiles] = useState<HotspotFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [interfaces, setInterfaces] = useState<string[]>([]);
  const [pools, setPools] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [section, setSection] = useState<'servers' | 'profiles' | 'files'>('servers');
  const [profileForm, setProfileForm] = useState<HotspotServerProfile | null>(null);
  const [existingProfileName, setExistingProfileName] = useState('');
  const [serverForm, setServerForm] = useState({ name: '', interface: '', profile: '', addressPool: '' });
  const [serverDialog, setServerDialog] = useState(false);

  const loadRouterData = useCallback(async () => {
    if (!routerId) {
      setServers([]);
      setServerProfiles([]);
      setRouterFiles([]);
      setInterfaces([]);
      setPools([]);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const query = `?routerId=${encodeURIComponent(routerId)}`;
      const [serverData, profileData, interfaceData, poolData] = await Promise.all([
        fetch(`/api/mikrotik/servers${query}`).then(readJson<{ hotspotServers: HotspotServer[] }>),
        fetch(`/api/mikrotik/hotspot/server-profiles${query}`).then(readJson<{ profiles: HotspotServerProfile[] }>),
        fetch(`/api/mikrotik/interfaces${query}`).then(readJson<{ interfaces: string[] }>),
        fetch(`/api/mikrotik/pools${query}`).then(readJson<{ pools: string[] }>),
      ]);
      setServers(serverData.hotspotServers);
      setServerProfiles(profileData.profiles);
      setInterfaces(interfaceData.interfaces);
      setPools(poolData.pools);
    } catch (loadError) {
      setServers([]);
      setServerProfiles([]);
      setInterfaces([]);
      setPools([]);
      setRouterFiles([]);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [routerId]);

  useEffect(() => {
    void loadRouterData();
  }, [loadRouterData, refreshKey]);

  useEffect(() => {
    if (!routerId) {
      setHtmlDirectories([]);
      setFileDirectory('');
      return;
    }
    let active = true;
    const query = `?routerId=${encodeURIComponent(routerId)}`;
    void fetch(`/api/mikrotik/hotspot/files${query}`)
      .then(readJson<{ directories: string[] }>)
      .then(data => {
        if (!active) return;
        setHtmlDirectories(data.directories);
        setFileDirectory(current => data.directories.includes(current) ? current : data.directories[0] || '');
      })
      .catch(loadError => {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      });
    return () => { active = false; };
  }, [refreshKey, routerId]);

  useEffect(() => {
    if (!routerId || section !== 'files' || !fileDirectory) {
      setRouterFiles([]);
      setFilesLoading(false);
      return;
    }
    let active = true;
    setFilesLoading(true);
    setError('');
    const query = `?routerId=${encodeURIComponent(routerId)}&directory=${encodeURIComponent(fileDirectory)}`;
    void fetch(`/api/mikrotik/hotspot/files${query}`)
      .then(readJson<{ files: HotspotFile[] }>)
      .then(data => {
        if (active) setRouterFiles(data.files);
      })
      .catch(loadError => {
        if (active) {
          setRouterFiles([]);
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      })
      .finally(() => {
        if (active) setFilesLoading(false);
      });
    return () => { active = false; };
  }, [fileDirectory, refreshKey, routerId, section]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profileForm || !routerId) return;
    setSaving(true);
    setError('');
    try {
      await readJson(await fetch('/api/mikrotik/hotspot/server-profiles', {
        method: existingProfileName ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routerId,
          ...(existingProfileName ? { existingName: existingProfileName } : {}),
          profile: profileForm,
        }),
      }));
      setProfileForm(null);
      setExistingProfileName('');
      setRefreshKey(key => key + 1);
      toast(existingProfileName ? 'Server profile diperbarui' : 'Server profile ditambahkan', 'success', 'Perubahan tersimpan langsung pada MikroTik.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = async (profile: HotspotServerProfile) => {
    if (!await confirm('Hapus Hotspot Server Profile?', `Profile "${profile.name}" akan dihapus dari router. Profile yang masih digunakan server tidak dapat dihapus.`, true)) return;
    setBusyId(profile.name);
    setError('');
    try {
      await readJson(await fetch('/api/mikrotik/hotspot/server-profiles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routerId, name: profile.name }),
      }));
      setRefreshKey(key => key + 1);
      toast('Server profile dihapus dari MikroTik', 'success', profile.name);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setBusyId('');
    }
  };

  const deleteFile = async (file: HotspotFile) => {
    if (!await confirm('Hapus file Hotspot?', `File "${file.name}" akan dihapus permanen dari MikroTik.`, true)) return;
    setBusyId(file.id);
    setError('');
    try {
      await readJson(await fetch('/api/mikrotik/hotspot/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routerId, directory: fileDirectory, name: file.name }),
      }));
      setRefreshKey(key => key + 1);
      toast('File dihapus dari MikroTik', 'success', file.name);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setBusyId('');
    }
  };

  const saveServer = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await readJson(await fetch('/api/mikrotik/hotspot/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routerId, server: serverForm }),
      }));
      setServerDialog(false);
      setServerForm({ name: '', interface: interfaces[0] || '', profile: serverProfiles[0]?.name || '', addressPool: '' });
      setRefreshKey(key => key + 1);
      toast('Hotspot Server ditambahkan', 'success', 'Server aktif pada MikroTik.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const updateServerStatus = async (server: HotspotServer) => {
    const disabling = !server.disabled;
    if (!await confirm(
      disabling ? 'Nonaktifkan Hotspot Server?' : 'Aktifkan Hotspot Server?',
      `${server.name} pada interface ${server.interface} akan ${disabling ? 'dinonaktifkan' : 'diaktifkan'} langsung di MikroTik.`,
      disabling,
    )) return;
    setBusyId(server.id);
    setError('');
    try {
      await readJson(await fetch(`/api/mikrotik/servers/${encodeURIComponent(routerId)}/hotspot/${encodeURIComponent(server.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: disabling }),
      }));
      setRefreshKey(key => key + 1);
      toast(disabling ? 'Hotspot Server dinonaktifkan' : 'Hotspot Server diaktifkan', 'success', server.name);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    } finally {
      setBusyId('');
    }
  };

  const deleteServer = async (server: HotspotServer) => {
    if (!await confirm('Hapus Hotspot Server?', `Konfigurasi server "${server.name}" pada ${server.interface} akan dihapus dari MikroTik.`, true)) return;
    setBusyId(server.id);
    setError('');
    try {
      await readJson(await fetch(`/api/mikrotik/servers/${encodeURIComponent(routerId)}/hotspot/${encodeURIComponent(server.id)}`, { method: 'DELETE' }));
      setRefreshKey(key => key + 1);
      toast('Hotspot Server dihapus', 'success', server.name);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setBusyId('');
    }
  };

  const openServerForm = () => {
    setError('');
    setServerForm({
      name: '',
      interface: interfaces[0] || '',
      profile: serverProfiles[0]?.name || '',
      addressPool: '',
    });
    setServerDialog(true);
  };

  const routerName = routers.find(router => router.id === routerId)?.name || 'Router';
  const profileHtmlDirectories = Array.from(new Set([
    ...htmlDirectories,
    ...serverProfiles.map(profile => profile.htmlDirectory.trim()).filter(Boolean),
    ...(profileForm?.htmlDirectory.trim() ? [profileForm.htmlDirectory.trim()] : []),
  ])).sort((left, right) => left.localeCompare(right));

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Server Hotspot</h2>
          <p className="mt-1 text-xs text-slate-400">Server dan Server Profile yang dibaca langsung dari {routerName}.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setRefreshKey(key => key + 1)} disabled={!routerId || loading} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-50" title="Segarkan data router">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {section === 'servers' ? (
            <button type="button" onClick={openServerForm} disabled={!routerId || !interfaces.length || !serverProfiles.length} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
              <Plus className="mr-1 inline h-4 w-4" /> Tambah Server
            </button>
          ) : section === 'profiles' ? (
            <button type="button" onClick={() => { setError(''); setExistingProfileName(''); setProfileForm({ ...blankServerProfile(), htmlDirectory: htmlDirectories[0] || '' }); }} disabled={!routerId} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
              <Plus className="mr-1 inline h-4 w-4" /> Tambah Server Profile
            </button>
          ) : null}
        </div>
      </div>

      <nav className="flex gap-1 border-b border-slate-800" role="tablist" aria-label="Konfigurasi Hotspot Router">
        {([['servers', `Server (${servers.length})`], ['profiles', `Server Profile (${serverProfiles.length})`], ['files', 'File Hotspot']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)} className={`border-b-2 px-4 py-3 text-xs font-bold ${section === id ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </nav>

      {error && !profileForm && !serverDialog && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</p>}
      {loading && <p role="status" className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400">Membaca konfigurasi Hotspot dari MikroTik...</p>}
      {!loading && !routerId && <p className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">Pilih router pada bagian atas workspace Hotspot.</p>}

      {!loading && routerId && section === 'servers' && (
        <div className="space-y-2">
          {servers.map(server => (
            <article key={server.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div>
                <p className="text-sm font-bold text-white">{server.name}</p>
                <p className="mt-1 text-xs text-slate-400">Interface {server.interface} · Profile {server.profile || '—'} · Pool {server.addressPool || 'none'}</p>
                <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${server.disabled ? 'bg-amber-500/10 text-amber-200' : 'bg-emerald-500/10 text-emerald-300'}`}>{server.disabled ? 'NONAKTIF' : 'AKTIF'}</span>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busyId === server.id} onClick={() => void updateServerStatus(server)} className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${server.disabled ? 'bg-emerald-950/40 text-emerald-200' : 'bg-amber-950/40 text-amber-200'}`}>{server.disabled ? 'Aktifkan' : 'Nonaktifkan'}</button>
                <button type="button" disabled={busyId === server.id} onClick={() => void deleteServer(server)} className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            </article>
          ))}
          {!servers.length && <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-xs text-slate-400">Router belum memiliki Hotspot Server.</p>}
          {(!interfaces.length || !serverProfiles.length) && <p className="text-xs text-amber-300">Untuk menambahkan server, router harus memiliki interface dan Hotspot Server Profile.</p>}
        </div>
      )}

      {!loading && routerId && section === 'profiles' && (
        <div className="space-y-2">
          {serverProfiles.map(profile => (
            <article key={profile.name} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">{profile.name}</p>
                <p className="mt-1 text-xs text-slate-400">DNS {profile.dnsName || 'tidak diatur'} · Hotspot {profile.hotspotAddress || 'otomatis'} · HTML {profile.htmlDirectory || 'default'}</p>
                <p className="mt-1 text-[11px] text-slate-500">Login {profile.loginBy || 'default'} · RADIUS {profile.useRadius ? 'aktif' : 'nonaktif'}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setError(''); setExistingProfileName(profile.name); setProfileForm({ ...profile }); }} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200"><Edit2 className="mr-1 inline h-3.5 w-3.5" /> Edit</button>
                <button type="button" disabled={busyId === profile.name} onClick={() => void deleteProfile(profile)} className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            </article>
          ))}
          {!serverProfiles.length && <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-xs text-slate-400">Router belum memiliki Hotspot Server Profile.</p>}
        </div>
      )}

      {!loading && routerId && section === 'files' && (
        <div className="space-y-3">
          <label className="block max-w-sm text-xs text-slate-300">Direktori HTML Hotspot
            <select value={fileDirectory} onChange={event => setFileDirectory(event.target.value)} className={fieldClass}>
              <option value="">Pilih direktori</option>
              {htmlDirectories.map(directory => <option key={directory} value={directory}>{directory}</option>)}
            </select>
          </label>
          {!htmlDirectories.length && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">Tidak ditemukan direktori pada router.</p>}
          {filesLoading && <p role="status" className="text-xs text-slate-400">Membaca file dari MikroTik...</p>}
          {!!fileDirectory && !filesLoading && (
            <div className="space-y-2">
              {routerFiles.map(file => (
                <article key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="h-4 w-4 shrink-0 text-indigo-300" />
                    <div className="min-w-0">
                      <p className="break-all text-xs font-semibold text-white">{file.name.slice(fileDirectory.length + 1)}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{file.size ? `${file.size} byte` : file.type || 'File'}</p>
                    </div>
                  </div>
                  <button type="button" disabled={busyId === file.id} onClick={() => void deleteFile(file)} className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-50" aria-label={`Hapus ${file.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </article>
              ))}
              {!routerFiles.length && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">Tidak ada file di direktori ini.</p>}
            </div>
          )}
        </div>
      )}

      {profileForm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <form onSubmit={saveProfile} className="my-auto w-full max-w-xl space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div><h3 className="font-bold">{existingProfileName ? 'Edit Server Profile' : 'Tambah Server Profile'}</h3><p className="mt-1 text-xs text-slate-400">Perubahan diterapkan langsung ke MikroTik.</p></div>
              <button type="button" onClick={() => { setProfileForm(null); setExistingProfileName(''); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <label className="block text-xs text-slate-300">Nama profile
              <input required maxLength={64} value={profileForm.name} onChange={event => setProfileForm({ ...profileForm, name: event.target.value })} className={fieldClass} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-300">Hotspot address<input maxLength={128} value={profileForm.hotspotAddress} onChange={event => setProfileForm({ ...profileForm, hotspotAddress: event.target.value })} className={fieldClass} /></label>
              <label className="text-xs text-slate-300">DNS name<input maxLength={128} value={profileForm.dnsName} onChange={event => setProfileForm({ ...profileForm, dnsName: event.target.value })} className={fieldClass} /></label>
              <label className="text-xs text-slate-300">HTML directory
                <select required value={profileForm.htmlDirectory} onChange={event => setProfileForm({ ...profileForm, htmlDirectory: event.target.value })} className={fieldClass}>
                  <option value="">Pilih direktori</option>
                  {profileHtmlDirectories.map(directory => <option key={directory} value={directory}>{directory}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-300">Login by
                <input maxLength={128} value={profileForm.loginBy} onChange={event => setProfileForm({ ...profileForm, loginBy: event.target.value })} placeholder="http-chap,http-pap" className={fieldClass} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={profileForm.useRadius} onChange={event => setProfileForm({ ...profileForm, useRadius: event.target.checked })} className="accent-indigo-500" /> Gunakan RADIUS</label>
            {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => { setProfileForm(null); setExistingProfileName(''); }} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold">Batal</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan ke MikroTik'}</button>
            </div>
          </form>
        </div>
      )}

      {serverDialog && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <form onSubmit={saveServer} className="my-auto w-full max-w-lg space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div><h3 className="font-bold">Tambah Hotspot Server</h3><p className="mt-1 text-xs text-slate-400">Router: {routerName}</p></div>
              <button type="button" onClick={() => setServerDialog(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <label className="block text-xs text-slate-300">Nama server<input required maxLength={128} value={serverForm.name} onChange={event => setServerForm({ ...serverForm, name: event.target.value })} className={fieldClass} /></label>
            <label className="block text-xs text-slate-300">Interface
              <select required value={serverForm.interface} onChange={event => setServerForm({ ...serverForm, interface: event.target.value })} className={fieldClass}>
                <option value="">Pilih interface</option>{interfaces.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="block text-xs text-slate-300">Server Profile
              <select required value={serverForm.profile} onChange={event => setServerForm({ ...serverForm, profile: event.target.value })} className={fieldClass}>
                <option value="">Pilih profile</option>{serverProfiles.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            <label className="block text-xs text-slate-300">Address pool
              <select value={serverForm.addressPool} onChange={event => setServerForm({ ...serverForm, addressPool: event.target.value })} className={fieldClass}>
                <option value="">Tanpa pool khusus</option>{pools.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setServerDialog(false)} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold">Batal</button>
              <button type="submit" disabled={saving || !interfaces.length || !serverProfiles.length} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold disabled:opacity-50">{saving ? 'Menyimpan...' : 'Buat Server'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
