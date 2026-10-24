import React, { useCallback, useEffect, useState } from 'react';
import { Customer, Invoice, PppoePackage, RouterConfig } from '../../types';
import { StorageService } from '../../services/storage';
import { useToast } from '../ui/toast';
import {
  Users,
  Search,
  Plus,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Send,
  FileText,
  Edit2,
  Trash2,
  RefreshCw,
  ExternalLink,
  Wifi,
  Key,
  Calendar,
  X
} from 'lucide-react';

interface Props {
  customers: Customer[];
  invoices: Invoice[];
  pppoePackages: PppoePackage[];
  routers: RouterConfig[];
  onRefreshData: () => void;
  onSendWa: (customer: Customer, type: 'reminder' | 'isolir') => void;
  onViewInvoice: (invoice: Invoice, customer: Customer) => void;
  onToggleIsolir: (customer: Customer) => void;
}

interface PppRouterProfile {
  name: string;
  rateLimit: string;
  localAddress: string;
  remoteAddress: string;
  dnsServers: string;
}

interface PppRouterProfileForm extends PppRouterProfile {
  existingName: string;
  routerId: string;
}

interface PppoeLiveSession {
  name: string;
  service: string;
  callerId: string;
  address: string;
  uptime: string;
  encoding: string;
  bytesIn: number;
  bytesOut: number;
}

interface PppoeLiveRouterData {
  secrets: PppRouterSecret[];
  sessions: PppoeLiveSession[];
  error?: string;
}

interface PppRouterSecret {
  routerId: string;
  name: string;
  profile: string;
  disabled: boolean;
  remoteAddress: string;
  localAddress: string;
  callerId: string;
  service: string;
  comment: string;
}

interface PppSecretForm {
  name: string;
  password: string;
  profile: string;
  comment: string;
}

function formatPppoeTraffic(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateCustomerId(customers: Customer[], date = new Date()): string {
  const year = date.getFullYear();
  const existingIds = new Set(customers.map(customer => customer.customerId.trim().toLowerCase()));
  const sequencePattern = new RegExp(`^CUST-${year}-(\\d+)$`, 'i');
  const nextSequence = customers.reduce((maximum, customer) => {
    const match = customer.customerId.trim().match(sequencePattern);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0) + 1;
  let sequence = nextSequence;
  let customerId = `CUST-${year}-${String(sequence).padStart(4, '0')}`;
  while (existingIds.has(customerId.toLowerCase())) {
    sequence += 1;
    customerId = `CUST-${year}-${String(sequence).padStart(4, '0')}`;
  }
  return customerId;
}

export const CustomersTab: React.FC<Props> = ({
  customers,
  invoices,
  pppoePackages,
  routers,
  onRefreshData,
  onSendWa,
  onViewInvoice,
  onToggleIsolir,
}) => {
  const { toast, confirm: confirmAction } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring' | 'isolated'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [routerProfiles, setRouterProfiles] = useState<PppRouterProfile[]>([]);
  const [customerError, setCustomerError] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [packageModalTab, setPackageModalTab] = useState<'packages' | 'profiles'>('packages');
  const [isPackageFormOpen, setIsPackageFormOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [packageRouterId, setPackageRouterId] = useState('');
  const [packageRouterProfiles, setPackageRouterProfiles] = useState<PppRouterProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesReloadKey, setProfilesReloadKey] = useState(0);
  const [pppoeLiveByRouter, setPppoeLiveByRouter] = useState<Record<string, PppoeLiveRouterData>>({});
  const [pppoeLiveLoading, setPppoeLiveLoading] = useState(false);
  const [pppoeLiveReloadKey, setPppoeLiveReloadKey] = useState(0);
  const [pppoeActionKey, setPppoeActionKey] = useState('');
  const [workspaceSection, setWorkspaceSection] = useState<'billing' | 'router'>('billing');
  const [routerWorkspaceId, setRouterWorkspaceId] = useState(() =>
    routers.find(router => router.status === 'connected')?.id || routers[0]?.id || ''
  );
  const [routerWorkspaceSection, setRouterWorkspaceSection] = useState<'accounts' | 'sessions'>('accounts');
  const [routerAccountSearch, setRouterAccountSearch] = useState('');
  const [isSecretModalOpen, setIsSecretModalOpen] = useState(false);
  const [editingSecretName, setEditingSecretName] = useState('');
  const [secretSaving, setSecretSaving] = useState(false);
  const [secretForm, setSecretForm] = useState<PppSecretForm>({ name: '', password: '', profile: '', comment: '' });
  const [secretProfiles, setSecretProfiles] = useState<PppRouterProfile[]>([]);
  const [secretProfilesLoading, setSecretProfilesLoading] = useState(false);
  const [linkingSecret, setLinkingSecret] = useState<PppRouterSecret | null>(null);
  const [packageForm, setPackageForm] = useState({ id: '', name: '', routerProfileName: '', monthlyFee: 0, dataLimitMb: 0 });
  const [profileForm, setProfileForm] = useState<PppRouterProfileForm>({
    existingName: '',
    routerId: '',
    name: '',
    rateLimit: '',
    localAddress: '',
    remoteAddress: '',
    dnsServers: '',
  });
  const [selectedPackageId, setSelectedPackageId] = useState('');

  const customerRouterIds = Array.from(new Set(customers.map(customer => customer.routerId).filter(Boolean)));
  const customerRouterIdsKey = customerRouterIds.join(',');

  useEffect(() => {
    if (!routers.length) {
      setRouterWorkspaceId('');
      return;
    }
    if (!routerWorkspaceId || !routers.some(router => router.id === routerWorkspaceId)) {
      setRouterWorkspaceId(routers.find(router => router.status === 'connected')?.id || routers[0].id);
    }
  }, [routerWorkspaceId, routers]);

  const loadPppoeLiveData = useCallback(async () => {
    const routerIds = Array.from(new Set([
      ...(customerRouterIdsKey ? customerRouterIdsKey.split(',') : []),
      ...(routerWorkspaceId ? [routerWorkspaceId] : []),
    ]));
    if (!routerIds.length) {
      setPppoeLiveByRouter({});
      setPppoeLiveLoading(false);
      return;
    }
    setPppoeLiveLoading(true);
    const results = await Promise.all(routerIds.map(async routerId => {
      try {
        const response = await fetch(`/api/mikrotik/pppoe/live?routerId=${encodeURIComponent(routerId)}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        return [routerId, {
          secrets: (result.secrets as Omit<PppRouterSecret, 'routerId'>[]).map(secret => ({ ...secret, routerId })),
          sessions: result.sessions as PppoeLiveSession[],
        }] as const;
      } catch (error) {
        return [routerId, {
          secrets: [],
          sessions: [],
          error: error instanceof Error ? error.message : String(error),
        }] as const;
      }
    }));
    setPppoeLiveByRouter(Object.fromEntries(results));
    setPppoeLiveLoading(false);
  }, [customerRouterIdsKey, routerWorkspaceId]);

  useEffect(() => {
    void loadPppoeLiveData();
    const interval = window.setInterval(() => void loadPppoeLiveData(), 15000);
    return () => window.clearInterval(interval);
  }, [loadPppoeLiveData, pppoeLiveReloadKey]);

  // Form State
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    pppoeUsername: '',
    pppoePassword: '',
    profileName: '',
    bandwidthLimit: '',
    monthlyFee: 0,
    billingDate: new Date().getDate(),
    expiredDate: new Date().toISOString().substring(0, 10),
    status: 'active',
    autoIsolir: true,
    routerId: '',
    ipAddress: '',
  });

  useEffect(() => {
    const routerId = formData.routerId;
    if (!routerId) {
      setRouterProfiles([]);
      return;
    }
    fetch(`/api/mikrotik/pppoe/profiles?routerId=${encodeURIComponent(routerId)}`).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setRouterProfiles(result.profiles);
    }).catch(error => setCustomerError(error instanceof Error ? error.message : String(error)));
  }, [formData.routerId]);

  useEffect(() => {
    if (!isPackageModalOpen || !packageRouterId) {
      setPackageRouterProfiles([]);
      setProfilesLoading(false);
      return;
    }
    let active = true;
    setProfilesLoading(true);
    setPackageRouterProfiles([]);
    fetch(`/api/mikrotik/pppoe/profiles?routerId=${encodeURIComponent(packageRouterId)}`)
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        return result.profiles as PppRouterProfile[];
      })
      .then(profiles => {
        if (active) setPackageRouterProfiles(profiles);
      })
      .catch(error => {
        if (active) toast('Gagal memuat profile PPPoE', 'error', error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setProfilesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isPackageModalOpen, packageRouterId, profilesReloadKey, toast]);

  useEffect(() => {
    if (!isSecretModalOpen || !routerWorkspaceId) {
      setSecretProfiles([]);
      return;
    }
    let active = true;
    setSecretProfilesLoading(true);
    fetch(`/api/mikrotik/pppoe/profiles?routerId=${encodeURIComponent(routerWorkspaceId)}`)
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        return result.profiles as PppRouterProfile[];
      })
      .then(profiles => {
        if (active) setSecretProfiles(profiles);
      })
      .catch(error => {
        if (active) toast('Gagal memuat PPP profile', 'error', error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setSecretProfilesLoading(false);
      });
    return () => { active = false; };
  }, [isSecretModalOpen, routerWorkspaceId, toast]);

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setLinkingSecret(null);
    const now = new Date();
    const currentDate = formatLocalDate(now);
    setFormData({
      customerId: generateCustomerId(customers, now),
      name: '',
      phone: '',
      email: '',
      address: '',
      pppoeUsername: '',
      pppoePassword: '',
      profileName: '',
      bandwidthLimit: '',
      monthlyFee: 0,
      billingDate: now.getDate(),
      expiredDate: currentDate,
      status: 'active',
      autoIsolir: true,
      routerId: routers[0]?.id || '',
      ipAddress: '',
    });
    setSelectedPackageId('');
    setCustomerError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setLinkingSecret(null);
    setEditingCustomer(c);
    const matchedPackage = pppoePackages.find(item =>
      item.routerId === c.routerId && item.routerProfileName === c.profileName
    );
    setSelectedPackageId(matchedPackage?.id || (c.profileName ? 'legacy' : ''));
    setFormData({ ...c, pppoePackageId: matchedPackage?.id, servicePackageName: matchedPackage?.name || c.servicePackageName });
    setIsModalOpen(true);
  };

  const handleSavePppoePackage = (event: React.FormEvent) => {
    event.preventDefault();
    const profile = packageRouterProfiles.find(item => item.name === packageForm.routerProfileName);
    if (!profile || packageForm.monthlyFee <= 0) {
      toast('Lengkapi profile MikroTik dan biaya bulanan paket.', 'error');
      return;
    }
    if (pppoePackages.some(item =>
      item.id !== packageForm.id &&
      item.routerId === packageRouterId &&
      item.name.trim().toLowerCase() === packageForm.name.trim().toLowerCase()
    )) {
      toast('Nama paket sudah digunakan untuk router ini.', 'error');
      return;
    }
    const nextPackage: PppoePackage = {
      id: packageForm.id || `pppoe-package-${Date.now()}`,
      name: packageForm.name.trim(),
      routerId: packageRouterId,
      routerProfileName: profile.name,
      speedLimit: profile.rateLimit,
      monthlyFee: Math.round(packageForm.monthlyFee),
      enabled: true,
      dataLimitMb: packageForm.dataLimitMb ? Math.round(packageForm.dataLimitMb) : undefined,
    };
    const nextPackages = packageForm.id
      ? pppoePackages.map(item => item.id === packageForm.id ? nextPackage : item)
      : [...pppoePackages, nextPackage];
    StorageService.savePppoePackages(nextPackages);
    const completesLinkingPackage = Boolean(
      linkingSecret &&
      nextPackage.routerId === linkingSecret.routerId &&
      nextPackage.routerProfileName === linkingSecret.profile
    );
    if (completesLinkingPackage) {
      setSelectedPackageId(nextPackage.id);
      setFormData(current => ({
        ...current,
        pppoePackageId: nextPackage.id,
        servicePackageName: nextPackage.name,
        profileName: nextPackage.routerProfileName,
        bandwidthLimit: nextPackage.speedLimit,
        monthlyFee: nextPackage.monthlyFee,
      }));
    }
    onRefreshData();
    setPackageForm({ id: '', name: '', routerProfileName: '', monthlyFee: 0, dataLimitMb: 0 });
    setIsPackageFormOpen(false);
    toast(packageForm.id ? 'Paket PPPoE berhasil diperbarui.' : 'Paket PPPoE berhasil ditambahkan.', 'success');
    if (completesLinkingPackage) setIsPackageModalOpen(false);
  };

  const handleSavePppProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileError('');
    setProfileSaving(true);
    try {
      const { existingName, routerId, ...profile } = profileForm;
      const response = await fetch('/api/mikrotik/pppoe/profiles', {
        method: existingName ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routerId, ...(existingName ? { existingName } : {}), profile }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      await StorageService.syncDataFromSqlite();
      onRefreshData();
      setIsProfileModalOpen(false);
      setProfilesReloadKey(key => key + 1);
      toast(existingName ? 'PPP profile diperbarui dan disinkronkan.' : 'PPP profile ditambahkan ke MikroTik.', 'success');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : String(error));
    } finally {
      setProfileSaving(false);
    }
  };

  const openNewPppoeSecret = () => {
    setEditingSecretName('');
    setSecretForm({
      name: '',
      password: '',
      profile: '',
      comment: '',
    });
    setIsSecretModalOpen(true);
  };

  const openEditPppoeSecret = (secret: PppRouterSecret) => {
    setEditingSecretName(secret.name);
    setSecretForm({
      name: secret.name,
      password: '',
      profile: secret.profile,
      comment: secret.comment,
    });
    setIsSecretModalOpen(true);
  };

  const handleSavePppoeSecret = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!routerWorkspaceId || !secretForm.profile) return;
    if (!editingSecretName && !secretForm.password.trim()) {
      toast('Password wajib diisi untuk secret baru.', 'error');
      return;
    }
    setSecretSaving(true);
    try {
      const response = await fetch(
        editingSecretName
          ? `/api/mikrotik/pppoe/secrets/${encodeURIComponent(routerWorkspaceId)}/${encodeURIComponent(editingSecretName)}`
          : '/api/mikrotik/pppoe/secrets',
        {
          method: editingSecretName ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingSecretName
            ? {
              ...(secretForm.password ? { password: secretForm.password } : {}),
              profile: secretForm.profile,
              comment: secretForm.comment,
            }
            : {
              routerId: routerWorkspaceId,
              name: secretForm.name,
              password: secretForm.password,
              profile: secretForm.profile,
              comment: secretForm.comment,
            }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setIsSecretModalOpen(false);
      setPppoeLiveReloadKey(key => key + 1);
      toast(editingSecretName ? 'Akun PPPoE diperbarui di MikroTik.' : 'Akun PPPoE dibuat di MikroTik.', 'success');
    } catch (error) {
      toast('Gagal menyimpan akun PPPoE', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setSecretSaving(false);
    }
  };

  const handleToggleRouterSecret = async (secret: PppRouterSecret) => {
    const disabled = !secret.disabled;
    if (!await confirmAction(
      `${disabled ? 'Nonaktifkan' : 'Aktifkan'} akun PPPoE?`,
      `Secret "${secret.name}" akan ${disabled ? 'dinonaktifkan' : 'diaktifkan'} langsung di router. Data billing tidak berubah.${disabled && pppoeLiveByRouter[routerWorkspaceId]?.sessions.some(session => session.name === secret.name) ? ' Sesi aktif tidak otomatis diputus.' : ''}`,
      disabled
    )) return;
    const actionKey = `${routerWorkspaceId}:${secret.name}`;
    setPppoeActionKey(actionKey);
    try {
      const response = await fetch(`/api/mikrotik/pppoe/secrets/${encodeURIComponent(routerWorkspaceId)}/${encodeURIComponent(secret.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setPppoeLiveReloadKey(key => key + 1);
      toast(`Secret ${disabled ? 'dinonaktifkan' : 'diaktifkan'} di MikroTik`, 'success', secret.name);
    } catch (error) {
      toast('Gagal mengubah status akun', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setPppoeActionKey('');
    }
  };

  const handleDeleteRouterSecret = async (secret: PppRouterSecret) => {
    const linkedCustomer = customers.find(customer =>
      customer.routerId === routerWorkspaceId && customer.pppoeUsername === secret.name
    );
    if (!await confirmAction(
      'Hapus secret dari MikroTik?',
      `Akun "${secret.name}" dan semua sesinya akan dihapus langsung dari router.${linkedCustomer ? ` Catatan billing untuk ${linkedCustomer.name} dan riwayat tagihannya tetap dipertahankan.` : ''}`,
      true
    )) return;
    const actionKey = `${routerWorkspaceId}:${secret.name}`;
    setPppoeActionKey(actionKey);
    try {
      const response = await fetch(`/api/mikrotik/pppoe/secrets/${encodeURIComponent(routerWorkspaceId)}/${encodeURIComponent(secret.name)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setPppoeLiveReloadKey(key => key + 1);
      toast('Secret dihapus dari MikroTik', 'success', secret.name);
    } catch (error) {
      toast('Gagal menghapus secret PPPoE', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setPppoeActionKey('');
    }
  };

  const handleDisconnectRouterSession = async (session: PppoeLiveSession) => {
    if (!await confirmAction(
      'Putuskan sesi PPPoE?',
      `Sesi "${session.name}" akan diputus dari router tanpa menghapus secret atau mengubah billing.`,
      true
    )) return;
    const actionKey = `${routerWorkspaceId}:${session.name}`;
    setPppoeActionKey(actionKey);
    try {
      const response = await fetch(`/api/mikrotik/pppoe/active/${encodeURIComponent(routerWorkspaceId)}/${encodeURIComponent(session.name)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setPppoeLiveReloadKey(key => key + 1);
      toast('Sesi PPPoE diputus', 'success', session.name);
    } catch (error) {
      toast('Gagal memutus sesi PPPoE', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setPppoeActionKey('');
    }
  };

  const handleLinkRouterSecret = (secret: PppRouterSecret) => {
    const existingCustomer = customers.find(customer =>
      customer.routerId === secret.routerId && customer.pppoeUsername === secret.name
    );
    if (existingCustomer) {
      toast('Akun sudah terhubung ke billing', 'info', existingCustomer.name);
      return;
    }
    const matchedPackage = pppoePackages.find(item =>
      item.enabled && item.routerId === secret.routerId && item.routerProfileName === secret.profile
    );
    const now = new Date();
    setEditingCustomer(null);
    setLinkingSecret(secret);
    setSelectedPackageId(matchedPackage?.id || '');
    setCustomerError('');
    setFormData({
      customerId: generateCustomerId(customers, now),
      name: '',
      phone: '',
      email: '',
      address: '',
      pppoeUsername: secret.name,
      pppoePassword: '',
      pppoePackageId: matchedPackage?.id,
      servicePackageName: matchedPackage?.name || '',
      profileName: secret.profile,
      bandwidthLimit: matchedPackage?.speedLimit || '',
      monthlyFee: matchedPackage?.monthlyFee || 0,
      billingDate: now.getDate(),
      expiredDate: formatLocalDate(now),
      status: 'active',
      autoIsolir: true,
      routerId: secret.routerId,
      ipAddress: secret.remoteAddress,
    });
    setIsModalOpen(true);
  };

  const handleEditPppProfile = (profile: PppRouterProfile) => {
    setProfileError('');
    setProfileForm({ existingName: profile.name, routerId: packageRouterId, ...profile });
    setIsProfileModalOpen(true);
  };

  const handleDeletePppProfile = async (profile: PppRouterProfile) => {
    if (!await confirmAction(
      'Hapus PPP profile?',
      `Profile "${profile.name}" akan dihapus dari MikroTik dan paket billing yang terhubung. Profile yang masih digunakan pelanggan tidak dapat dihapus.`,
      true
    )) return;
    try {
      const response = await fetch('/api/mikrotik/pppoe/profiles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routerId: packageRouterId, name: profile.name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      await StorageService.syncDataFromSqlite();
      onRefreshData();
      setProfilesReloadKey(key => key + 1);
      toast('PPP profile dan paket billing terkait dihapus.', 'success');
    } catch (error) {
      toast('Gagal menghapus PPP profile', 'error', error instanceof Error ? error.message : String(error));
    }
  };

  const handleEditPppoePackage = (pppoePackage: PppoePackage) => {
    setPackageRouterId(pppoePackage.routerId);
    setPackageModalTab('packages');
    setIsPackageFormOpen(true);
    setPackageForm({
      id: pppoePackage.id,
      name: pppoePackage.name,
      routerProfileName: pppoePackage.routerProfileName,
      monthlyFee: pppoePackage.monthlyFee,
      dataLimitMb: pppoePackage.dataLimitMb || 0,
    });
  };

  const handleDeletePppoePackage = async (pppoePackage: PppoePackage) => {
    if (customers.some(customer =>
      customer.routerId === pppoePackage.routerId && customer.profileName === pppoePackage.routerProfileName
    )) {
      toast('Paket masih digunakan pelanggan. Ubah paket pelanggan sebelum menghapusnya.', 'error');
      return;
    }
    if (!await confirmAction('Hapus paket PPPoE?', `Paket ${pppoePackage.name} akan dihapus dari daftar pilihan pelanggan.`)) return;
    StorageService.savePppoePackages(pppoePackages.filter(item => item.id !== pppoePackage.id));
    onRefreshData();
  };

  const handleDisconnectPppoeSession = async (customer: Customer, session: PppoeLiveSession) => {
    if (!await confirmAction(
      'Putuskan sesi PPPoE?',
      `Sesi ${customer.pppoeUsername} akan diputus dari router. Akun dan status billing tidak diubah; pelanggan dapat tersambung kembali jika secret masih aktif.`,
      true
    )) return;
    const actionKey = `${customer.routerId}:${customer.pppoeUsername}`;
    setPppoeActionKey(actionKey);
    try {
      const response = await fetch(`/api/mikrotik/pppoe/active/${encodeURIComponent(customer.routerId)}/${encodeURIComponent(customer.pppoeUsername)}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setPppoeLiveReloadKey(key => key + 1);
      toast('Sesi PPPoE diputus', 'success', `${customer.pppoeUsername} · ${session.uptime || 'sesi aktif'}`);
    } catch (error) {
      toast('Gagal memutus sesi PPPoE', 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setPppoeActionKey('');
    }
  };

  const handleTogglePppoeSecret = async (customer: Customer, disabled: boolean) => {
    const action = disabled ? 'Nonaktifkan' : 'Aktifkan';
    if (!await confirmAction(
      `${action} secret PPPoE?`,
      `Secret "${customer.pppoeUsername}" akan ${disabled ? 'dinonaktifkan' : 'diaktifkan'} langsung pada MikroTik. Status penagihan tidak berubah.${disabled ? ' Jika sedang online, putuskan sesi secara terpisah.' : ''}`,
      disabled
    )) return;
    const actionKey = `${customer.routerId}:${customer.pppoeUsername}`;
    setPppoeActionKey(actionKey);
    try {
      const response = await fetch(`/api/mikrotik/pppoe/secrets/${encodeURIComponent(customer.routerId)}/${encodeURIComponent(customer.pppoeUsername)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setPppoeLiveReloadKey(key => key + 1);
      toast(`Secret PPPoE ${disabled ? 'dinonaktifkan' : 'diaktifkan'}`, 'success', `${customer.pppoeUsername} · status billing tidak berubah`);
    } catch (error) {
      toast(`Gagal ${action.toLowerCase()} secret PPPoE`, 'error', error instanceof Error ? error.message : String(error));
    } finally {
      setPppoeActionKey('');
    }
  };

  const handleDelete = async (customer: Customer) => {
    const accepted = await confirmAction(
      'Hapus pelanggan?',
      `Data pelanggan ${customer.name} akan dihapus dari billing. Jika secret "${customer.pppoeUsername}" masih ada di router, secret dan sesi aktifnya juga akan dihapus.`,
      true
    );
    if (!accepted) return;
    try {
      const liveResponse = await fetch(`/api/mikrotik/pppoe/live?routerId=${encodeURIComponent(customer.routerId)}`);
      const liveResult = await liveResponse.json();
      if (!liveResponse.ok) throw new Error(liveResult.error || `HTTP ${liveResponse.status}`);
      const secretExists = (liveResult.secrets as PppRouterSecret[]).some(secret => secret.name === customer.pppoeUsername);
      if (secretExists) {
        const response = await fetch(`/api/mikrotik/pppoe/secrets/${encodeURIComponent(customer.routerId)}/${encodeURIComponent(customer.pppoeUsername)}`, {
          method: 'DELETE',
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      }
      StorageService.deleteCustomer(customer.id);
      onRefreshData();
      setPppoeLiveReloadKey(key => key + 1);
      toast('Data pelanggan dihapus dari billing.', 'success', secretExists ? 'Secret dan sesi aktif juga dihapus dari MikroTik.' : 'Secret tidak ditemukan di router.');
    } catch (error) {
      toast('Gagal menghapus pelanggan', 'error', error instanceof Error ? error.message : String(error));
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const pppoePassword = formData.pppoePassword;
    const createsOrMovesSecret = !linkingSecret && (
      !editingCustomer ||
      editingCustomer.routerId !== formData.routerId ||
      editingCustomer.pppoeUsername !== formData.pppoeUsername
    );
    if (createsOrMovesSecret && (
      typeof pppoePassword !== 'string' ||
      !pppoePassword ||
      pppoePassword.trim().toLowerCase() === 'undefined'
    )) {
      setCustomerError('Password PPPoE tidak valid. Masukkan password yang akan disimpan pada MikroTik.');
      return;
    }
    if (linkingSecret && customers.some(customer =>
      customer.id !== editingCustomer?.id &&
      customer.routerId === linkingSecret.routerId &&
      customer.pppoeUsername === linkingSecret.name
    )) {
      setCustomerError('Secret ini sudah ditautkan ke pelanggan billing lain.');
      return;
    }
    if (
      !formData.name ||
      !formData.phone ||
      !formData.pppoeUsername ||
      !formData.profileName ||
      !formData.routerId
    ) {
      setCustomerError('Nama, WhatsApp, username PPPoE, profile router, dan router wajib diisi.');
      return;
    }
    const duplicateCustomerId = customers.some(customer =>
      customer.id !== editingCustomer?.id &&
      customer.customerId.trim().toLowerCase() === String(formData.customerId || '').trim().toLowerCase()
    );
    if (duplicateCustomerId) {
      setCustomerError('ID pelanggan sudah digunakan. Buat ID baru sebelum menyimpan.');
      return;
    }
    const duplicateBillingAccount = customers.some(customer =>
      customer.id !== editingCustomer?.id &&
      customer.routerId === formData.routerId &&
      customer.pppoeUsername === formData.pppoeUsername
    );
    if (duplicateBillingAccount) {
      setCustomerError('Akun PPPoE ini sudah tertaut ke pelanggan billing lain.');
      return;
    }
    const currentPppoePackages = StorageService.getPppoePackages();
    if (linkingSecret && !currentPppoePackages.some(item =>
      item.enabled &&
      item.id === selectedPackageId &&
      item.routerId === linkingSecret.routerId &&
      item.routerProfileName === linkingSecret.profile
    )) {
      setCustomerError(`Pilih atau buat paket billing yang terhubung ke profile "${linkingSecret.profile}" pada router ini.`);
      return;
    }

    setIsSavingCustomer(true);
    setCustomerError('');
    const payload: Customer = {
      id: editingCustomer ? editingCustomer.id : 'cust-' + Date.now(),
      customerId: formData.customerId || generateCustomerId(customers),
      name: formData.name || '',
      phone: formData.phone || '',
      email: formData.email || '',
      address: formData.address || '',
      pppoeUsername: formData.pppoeUsername || '',
      pppoePassword: linkingSecret ? '' : pppoePassword || editingCustomer?.pppoePassword || '',
      pppoePackageId: currentPppoePackages.some(item => item.id === selectedPackageId) ? selectedPackageId : undefined,
      servicePackageName: formData.servicePackageName || undefined,
      profileName: formData.profileName,
      bandwidthLimit: formData.bandwidthLimit || '',
      monthlyFee: Number(formData.monthlyFee) || 0,
      billingDate: Number(formData.billingDate) || new Date().getDate(),
      expiredDate: formData.expiredDate || formatLocalDate(new Date()),
      status: (formData.status as any) || 'active',
      autoIsolir: formData.autoIsolir ?? true,
      routerId: formData.routerId,
      ipAddress: formData.ipAddress || '',
      notes: formData.notes || '',
    };

    try {
      const previous = editingCustomer;
      const changedRouterOrUser = previous && (
        previous.routerId !== payload.routerId || previous.pppoeUsername !== payload.pppoeUsername
      );
      if (!linkingSecret) {
        const endpoint = previous && !changedRouterOrUser
          ? `/api/mikrotik/pppoe/secrets/${encodeURIComponent(payload.routerId)}/${encodeURIComponent(payload.pppoeUsername)}`
          : '/api/mikrotik/pppoe/secrets';
        const response = await fetch(endpoint, {
          method: previous && !changedRouterOrUser ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(previous && !changedRouterOrUser
            ? {
              ...(pppoePassword ? { password: pppoePassword } : {}),
              profile: payload.profileName,
              disabled: payload.status === 'isolated',
            }
            : {
              routerId: payload.routerId,
              name: payload.pppoeUsername,
              password: payload.pppoePassword,
              profile: payload.profileName,
              comment: payload.customerId,
              disabled: payload.status === 'isolated',
            }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      }
      if (previous && changedRouterOrUser) {
        const deleteOld = await fetch(`/api/mikrotik/pppoe/secrets/${encodeURIComponent(previous.routerId)}/${encodeURIComponent(previous.pppoeUsername)}`, {
          method: 'DELETE',
        });
        if (!deleteOld.ok) {
          const rollback = await fetch(`/api/mikrotik/pppoe/secrets/${encodeURIComponent(payload.routerId)}/${encodeURIComponent(payload.pppoeUsername)}`, {
            method: 'DELETE',
          });
          throw new Error(
            rollback.ok
              ? 'User lama gagal dihapus dari router; user baru telah dibatalkan.'
              : 'User lama gagal dihapus dan pembatalan user baru juga gagal. Periksa kedua router secara manual.'
          );
        }
      }
      StorageService.saveCustomer(payload);
      setIsModalOpen(false);
      setLinkingSecret(null);
      setPppoeLiveReloadKey(key => key + 1);
      onRefreshData();
      toast(
        linkingSecret
          ? 'Akun MikroTik ditautkan ke billing tanpa membuat secret baru.'
          : previous ? 'Data pelanggan berhasil diperbarui.' : 'Pelanggan dan akun PPPoE berhasil dibuat.',
        'success'
      );
    } catch (error) {
      setCustomerError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingCustomer(false);
    }
  };

  // Filtered list
  const filteredCustomers = customers.filter(c => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.customerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.pppoeUsername.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      (c.ipAddress && c.ipAddress.includes(searchTerm));

    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    return statusFilter === 'isolated'
      ? c.status === 'isolated' || c.status === 'disabled'
      : c.status === statusFilter;
  });
  const selectedRouterLive = pppoeLiveByRouter[routerWorkspaceId];
  const routerQuery = routerAccountSearch.trim().toLowerCase();
  const filteredRouterSecrets = (selectedRouterLive?.secrets || []).filter(secret =>
    !routerQuery || [secret.name, secret.profile, secret.comment, secret.remoteAddress].some(value => value.toLowerCase().includes(routerQuery))
  );
  const filteredRouterSessions = (selectedRouterLive?.sessions || []).filter(session =>
    !routerQuery || [session.name, session.address, session.callerId, session.service].some(value => value.toLowerCase().includes(routerQuery))
  );

  return (
    <div className="space-y-5">
      {/* Top Header & Search Filter Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <span>{workspaceSection === 'billing' ? 'Manajemen Pelanggan PPPoE' : 'Workspace Router PPPoE'}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {workspaceSection === 'billing'
                ? 'Kelola pelanggan dan penagihan. Kondisi secret dan sesi router ditampilkan terpisah.'
                : 'Daftar akun dan sesi live di MikroTik; perubahan akun router tidak otomatis mengubah billing.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setPppoeLiveReloadKey(key => key + 1)}
              disabled={pppoeLiveLoading || !routerWorkspaceId}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
              title="Segarkan status RouterOS"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${pppoeLiveLoading ? 'animate-spin' : ''}`} />
              <span>{(pppoeLiveByRouter[routerWorkspaceId]?.sessions.length || 0)} online</span>
            </button>
            {workspaceSection === 'billing' ? (
              <>
                <button
                  onClick={() => {
                    setPackageRouterId(routers.find(router => router.status === 'connected')?.id || routers[0]?.id || '');
                    setPackageForm({ id: '', name: '', routerProfileName: '', monthlyFee: 0, dataLimitMb: 0 });
                    setPackageModalTab('packages');
                    setIsPackageFormOpen(false);
                    setIsPackageModalOpen(true);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 font-semibold text-white text-xs rounded-xl transition"
                >
                  Paket PPPoE ({pppoePackages.length})
                </button>
                <button
                  onClick={handleOpenAdd}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Pelanggan</span>
                </button>
              </>
            ) : (
              <>
                <select
                  aria-label="Pilih router PPPoE"
                  value={routerWorkspaceId}
                  onChange={event => setRouterWorkspaceId(event.target.value)}
                  className="max-w-52 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="">Pilih router</option>
                  {routers.map(router => <option key={router.id} value={router.id}>{router.name} ({router.host})</option>)}
                </select>
                {routerWorkspaceSection === 'accounts' && (
                  <button
                    type="button"
                    onClick={openNewPppoeSecret}
                    disabled={!routerWorkspaceId}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" /> Tambah akun
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <nav className="mt-4 flex gap-1 border-b border-slate-800" role="tablist" aria-label="Workspace PPPoE">
          {([['billing', 'Pelanggan & Billing'], ['router', 'Data Router']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={workspaceSection === id} onClick={() => setWorkspaceSection(id)} className={`border-b-2 px-4 py-3 text-xs font-bold ${workspaceSection === id ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </nav>

        {/* Filter & Search Bar */}
        {workspaceSection === 'billing' && <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, PPPoE user, No. WA, atau IP..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs w-full sm:w-auto overflow-x-auto">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua ({customers.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'active' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Aktif ({customers.filter(c => c.status === 'active').length})
            </button>
            <button
              onClick={() => setStatusFilter('expiring')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'expiring' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              H-1 / H-3 ({customers.filter(c => c.status === 'expiring').length})
            </button>
            <button
              onClick={() => setStatusFilter('isolated')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'isolated' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Nonaktif / Ter-Isolir ({customers.filter(c => c.status === 'isolated' || c.status === 'disabled').length})
            </button>
          </div>
        </div>}
      </div>

      {workspaceSection === 'router' && (
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 pt-2">
            <nav className="flex gap-1" role="tablist" aria-label="Data PPPoE RouterOS">
              {([
                ['accounts', `Semua akun (${pppoeLiveByRouter[routerWorkspaceId]?.secrets.length || 0})`],
                ['sessions', `Sesi aktif (${pppoeLiveByRouter[routerWorkspaceId]?.sessions.length || 0})`],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={routerWorkspaceSection === id} onClick={() => setRouterWorkspaceSection(id)} className={`border-b-2 px-4 py-3 text-xs font-bold ${routerWorkspaceSection === id ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </nav>
            <label className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input value={routerAccountSearch} onChange={event => setRouterAccountSearch(event.target.value)} placeholder="Cari akun, profile, IP..." className="w-56 rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white" />
            </label>
          </div>
          {selectedRouterLive?.error && <p role="alert" className="m-4 rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">{selectedRouterLive.error}</p>}
          {!routerWorkspaceId ? (
            <p className="p-8 text-center text-xs text-slate-400">Pilih router untuk membaca akun dan sesi PPPoE.</p>
          ) : pppoeLiveLoading && !selectedRouterLive ? (
            <p role="status" className="p-8 text-center text-xs text-slate-400">Membaca data langsung dari MikroTik...</p>
          ) : routerWorkspaceSection === 'accounts' ? (
            <div className="divide-y divide-slate-800/80">
              {filteredRouterSecrets.map(secret => {
                  const linkedCustomer = customers.find(customer => customer.routerId === routerWorkspaceId && customer.pppoeUsername === secret.name);
                  const activeSessions = selectedRouterLive?.sessions.filter(session => session.name === secret.name) || [];
                  const sessionCount = activeSessions.length;
                  const actionKey = `${routerWorkspaceId}:${secret.name}`;
                  return (
                    <article key={secret.name} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-sm font-bold text-white">{secret.name}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${secret.disabled ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{secret.disabled ? 'NONAKTIF' : 'AKTIF'}</span>
                          {sessionCount > 0 && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold text-sky-300">ONLINE · {sessionCount}</span>}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">Profile {secret.profile || 'default'}{secret.remoteAddress ? ` · IP ${secret.remoteAddress}` : ''}{secret.localAddress ? ` · Local ${secret.localAddress}` : ''}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{secret.comment || 'Tanpa komentar'}{secret.service ? ` · Service ${secret.service}` : ''}{secret.callerId ? ` · Caller ID ${secret.callerId}` : ''}</p>
                        {linkedCustomer
                          ? <p className="mt-1 text-[10px] font-semibold text-indigo-300">TERHUBUNG KE BILLING · {linkedCustomer.name}</p>
                          : <p className="mt-1 text-[10px] font-semibold text-amber-300">BELUM TERTAUT KE BILLING</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!linkedCustomer && (
                          <button type="button" onClick={() => handleLinkRouterSecret(secret)} className="rounded-lg bg-indigo-500/15 px-3 py-2 text-[10px] font-bold text-indigo-200 hover:bg-indigo-600 hover:text-white">Tautkan ke billing</button>
                        )}
                        {sessionCount > 0 && (
                          <button type="button" disabled={pppoeActionKey === actionKey} onClick={() => { const activeSession = activeSessions[0]; if (activeSession) void handleDisconnectRouterSession(activeSession); }} className="rounded-lg bg-sky-500/15 px-3 py-2 text-[10px] font-bold text-sky-200 hover:bg-sky-600 hover:text-white disabled:opacity-50">Putus sesi</button>
                        )}
                        <button type="button" disabled={pppoeActionKey === actionKey} onClick={() => openEditPppoeSecret(secret)} className="rounded-lg bg-slate-800 p-2 text-slate-300 hover:bg-slate-700" title="Edit akun"><Edit2 className="h-4 w-4" /></button>
                        <button type="button" disabled={pppoeActionKey === actionKey} onClick={() => void handleToggleRouterSecret(secret)} className="rounded-lg bg-slate-800 px-3 py-2 text-[10px] font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50">{secret.disabled ? 'Aktifkan' : 'Nonaktifkan'}</button>
                        <button type="button" disabled={pppoeActionKey === actionKey} onClick={() => void handleDeleteRouterSecret(secret)} className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2 text-rose-200 hover:bg-rose-900/50 disabled:opacity-50" title="Hapus dari MikroTik"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </article>
                  );
                })}
              {!pppoeLiveLoading && !filteredRouterSecrets.length && <p className="p-8 text-center text-xs text-slate-400">{routerQuery ? 'Tidak ada akun yang cocok dengan pencarian.' : 'Tidak ada PPPoE secret pada router ini.'}</p>}
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {filteredRouterSessions.map((session, index) => (
                  <article key={`${session.name}-${session.callerId}-${index}`} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
                    <div>
                      <p className="font-mono text-sm font-bold text-white">{session.name}</p>
                      <p className="mt-1 text-xs text-slate-400">{session.address || 'IP —'} · {session.service || 'PPP'} · {session.uptime || 'uptime —'}{session.callerId ? ` · ${session.callerId}` : ''}</p>
                      <p className="mt-1 text-[10px] text-slate-500">RX {formatPppoeTraffic(session.bytesIn)} / TX {formatPppoeTraffic(session.bytesOut)}</p>
                    </div>
                    <button type="button" disabled={pppoeActionKey === `${routerWorkspaceId}:${session.name}`} onClick={() => void handleDisconnectRouterSession(session)} className="rounded-lg bg-sky-500/15 px-3 py-2 text-[10px] font-bold text-sky-200 hover:bg-sky-600 hover:text-white disabled:opacity-50">Putus sesi</button>
                  </article>
                ))}
              {!pppoeLiveLoading && !filteredRouterSessions.length && <p className="p-8 text-center text-xs text-slate-400">{routerQuery ? 'Tidak ada sesi yang cocok dengan pencarian.' : 'Tidak ada sesi PPPoE aktif pada router ini.'}</p>}
            </div>
          )}
        </section>
      )}

      {/* Customer Table */}
      {workspaceSection === 'billing' && <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                <th className="py-3.5 px-4">ID & Pelanggan</th>
                <th className="py-3.5 px-4">PPPoE Credentials</th>
                <th className="py-3.5 px-4">Paket & Bandwidth</th>
                <th className="py-3.5 px-4">Masa Aktif & Jatuh Tempo</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Tidak ada pelanggan yang cocok dengan pencarian.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map(cust => {
                  const matchingInv = invoices.find(i => i.customerId === cust.id);
                  const liveRouter = pppoeLiveByRouter[cust.routerId];
                  const liveSecret = liveRouter?.secrets.find(secret => secret.name === cust.pppoeUsername);
                  const liveSessions = liveRouter?.sessions.filter(session => session.name === cust.pppoeUsername) || [];
                  const pppoeActionBusy = pppoeActionKey === `${cust.routerId}:${cust.pppoeUsername}`;
                  const billingShouldDisable = cust.status === 'isolated' || cust.status === 'disabled';
                  const routerStatusMismatch = liveSecret && liveSecret.disabled !== billingShouldDisable;

                  return (
                    <tr key={cust.id} className="hover:bg-slate-800/30 transition">
                      {/* Name & ID */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-sm">{cust.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                          <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-indigo-300 font-semibold">
                            {cust.customerId}
                          </span>
                          <span>• {cust.phone}</span>
                        </div>
                        {cust.address && (
                          <div className="text-[10px] text-slate-500 truncate max-w-xs mt-0.5">
                            {cust.address}
                          </div>
                        )}
                      </td>

                      {/* PPPoE */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                          <Key className="w-3 h-3 text-amber-400" />
                          <span>{cust.pppoeUsername}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          IP: <span className="text-slate-300">{cust.ipAddress || 'Dynamic Pool'}</span>
                        </div>
                        {liveRouter?.error ? (
                          <div className="mt-1 text-[10px] text-rose-300" title={liveRouter.error}>Status router gagal dimuat</div>
                        ) : liveSecret ? (
                          <>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[9px] font-bold text-indigo-300">TERHUBUNG</span>
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${liveSecret.disabled ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                                Secret {liveSecret.disabled ? 'NONAKTIF' : 'AKTIF'}
                              </span>
                              {routerStatusMismatch && (
                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-300">
                                  STATUS BILLING / ROUTER BERBEDA
                                </span>
                              )}
                              {liveSessions.length > 0
                                ? <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold text-sky-300">ONLINE · {liveSessions.length} sesi</span>
                                : <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-slate-400">OFFLINE</span>}
                            </div>
                            {routerStatusMismatch && (
                              <div className="mt-1 text-[10px] text-amber-200">
                                Billing {billingShouldDisable ? 'terisolir' : 'aktif'}, tetapi secret router {liveSecret.disabled ? 'nonaktif' : 'aktif'}.
                                <button
                                  type="button"
                                  disabled={pppoeActionBusy}
                                  onClick={() => void handleTogglePppoeSecret(cust, billingShouldDisable)}
                                  className="ml-1 font-semibold text-indigo-300 underline underline-offset-2 hover:text-indigo-200 disabled:opacity-50"
                                >
                                  Samakan status RouterOS
                                </button>
                              </div>
                            )}
                            {liveSessions.map((session, index) => (
                              <div key={`${session.callerId}-${index}`} className="mt-1 max-w-[260px] break-words text-[10px] leading-relaxed text-slate-400">
                                {session.address || 'IP —'} · {session.uptime || 'uptime —'}{session.callerId ? ` · ${session.callerId}` : ''}
                                <span className="block text-slate-500">RX {formatPppoeTraffic(session.bytesIn)} / TX {formatPppoeTraffic(session.bytesOut)}</span>
                              </div>
                            ))}
                          </>
                        ) : (
                          <div className="mt-1">
                            {pppoeLiveLoading && !liveRouter
                              ? <span className="text-[10px] text-slate-500">Membaca status router...</span>
                              : liveRouter
                                ? <span className="inline-flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-300">SECRET TIDAK DITEMUKAN DI ROUTER</span>
                                  <button type="button" onClick={() => {
                                    setRouterWorkspaceId(cust.routerId);
                                    setWorkspaceSection('router');
                                    setRouterWorkspaceSection('accounts');
                                    setRouterAccountSearch(cust.pppoeUsername);
                                    setPppoeLiveReloadKey(key => key + 1);
                                  }} className="text-[9px] font-semibold text-indigo-300 hover:text-indigo-200">Cari di data router</button>
                                </span>
                                : <span className="text-[10px] text-slate-500">Status live belum dimuat</span>}
                          </div>
                        )}
                      </td>

                      {/* Package */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-200">{cust.servicePackageName || cust.profileName}</div>
                        {cust.servicePackageName && <div className="text-[10px] text-slate-500">PPP profile: {cust.profileName}</div>}
                        <div className="text-[11px] font-mono text-emerald-400 mt-0.5">
                          {cust.bandwidthLimit}
                        </div>
                        <div className="text-[11px] font-bold text-white mt-0.5">
                          Rp {cust.monthlyFee.toLocaleString('id-ID')} /bln
                        </div>
                      </td>

                      {/* Expiration */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-medium text-slate-200">
                          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{cust.expiredDate}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Siklus: Tgl {cust.billingDate} tiap bulan
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {cust.status === 'active' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" /> AKTIF
                          </span>
                        )}
                        {cust.status === 'expiring' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <AlertCircle className="w-3 h-3" /> JATUH TEMPO
                          </span>
                        )}
                        {(cust.status === 'isolated' || cust.status === 'disabled') && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <ShieldAlert className="w-3 h-3" /> {cust.status === 'disabled' ? 'NONAKTIF' : 'TER-ISOLIR'}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Toggle PPPoE access */}
                          <button
                            onClick={() => onToggleIsolir(cust)}
                            className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition ${
                              cust.status === 'isolated' || cust.status === 'disabled'
                                ? 'bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white'
                                : 'bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white'
                            }`}
                            title="Ubah status billing; perubahan akses RouterOS dikonfirmasi terpisah"
                          >
                            {cust.status === 'isolated' || cust.status === 'disabled'
                              ? <><CheckCircle2 className="w-3.5 h-3.5" /><span>Aktifkan billing</span></>
                              : <><ShieldAlert className="w-3.5 h-3.5" /><span>Isolir billing</span></>}
                          </button>

                          {liveSecret && (
                            <button
                              type="button"
                              disabled={pppoeActionBusy}
                              onClick={() => void handleTogglePppoeSecret(cust, !liveSecret.disabled)}
                              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold transition disabled:opacity-50 ${liveSecret.disabled ? 'bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600 hover:text-white' : 'bg-amber-500/15 text-amber-300 hover:bg-amber-600 hover:text-white'}`}
                              title={`${liveSecret.disabled ? 'Aktifkan' : 'Nonaktifkan'} secret langsung di MikroTik; status billing tidak berubah`}
                            >
                              {liveSecret.disabled ? 'Aktifkan secret' : 'Nonaktifkan secret'}
                            </button>
                          )}
                          {liveSessions.length > 0 && (
                            <button
                              type="button"
                              disabled={pppoeActionBusy}
                              onClick={() => void handleDisconnectPppoeSession(cust, liveSessions[0])}
                              className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 px-2 py-1.5 text-[10px] font-bold text-sky-300 transition hover:bg-sky-600 hover:text-white disabled:opacity-50"
                              title={`Putuskan ${liveSessions.length} sesi aktif tanpa menghapus akun`}
                            >
                              <Wifi className="h-3.5 w-3.5" /> Putus sesi ({liveSessions.length})
                            </button>
                          )}

                          {/* WhatsApp Reminder */}
                          <button
                            onClick={() => onSendWa(
                              cust,
                              billingShouldDisable && liveSecret?.disabled ? 'isolir' : 'reminder'
                            )}
                            className="p-1.5 bg-emerald-500/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg transition"
                            title="Kirim Pesan WhatsApp"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>

                          {/* Invoice View */}
                          {matchingInv && (
                            <button
                              onClick={() => onViewInvoice(matchingInv, cust)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                              title="Lihat / Cetak Invoice"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Edit */}
                          <button
                            onClick={() => handleOpenEdit(cust)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                            title="Edit Data Pelanggan"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => void handleDelete(cust)}
                            className="p-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-lg transition"
                            title="Hapus Pelanggan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>}

      {/* Add / Edit Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl text-white shadow-2xl relative my-8">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>{linkingSecret ? 'Tautkan Akun PPPoE ke Billing' : editingCustomer ? 'Edit Data Pelanggan PPPoE' : 'Tambah Pelanggan Baru'}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  {linkingSecret
                    ? 'Akun router yang sudah ada akan ditautkan ke billing; secret tidak dibuat atau diubah.'
                    : 'User PPPoE dibuat di router dan baru disimpan ke billing setelah operasi RouterOS berhasil.'}
                </p>
              </div>
              <button
                onClick={() => { setIsModalOpen(false); setLinkingSecret(null); }}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-6 space-y-4 text-xs">
              {customerError && <div role="alert" className="p-3 rounded-lg border border-rose-500/30 bg-rose-950/40 text-rose-300">{customerError}</div>}
              {linkingSecret && (
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3 text-[11px]">
                  <p className="font-semibold text-indigo-200">Akun router yang akan ditautkan</p>
                  <p className="mt-1 text-slate-300">{linkingSecret.name} · Profile {linkingSecret.profile} · {routers.find(router => router.id === linkingSecret.routerId)?.name || 'Router'}</p>
                  <p className="mt-1 text-slate-500">Status secret {linkingSecret.disabled ? 'nonaktif' : 'aktif'} · password tidak dibaca atau diubah.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-slate-300 font-medium">ID Pelanggan
                  <div className="mt-1 flex gap-2">
                    <input
                      readOnly
                      value={formData.customerId || ''}
                      className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-white read-only:opacity-80"
                    />
                    {!editingCustomer && (
                      <button type="button" onClick={() => setFormData(current => ({ ...current, customerId: generateCustomerId(customers) }))} className="rounded-xl border border-slate-700 bg-slate-800 px-3 text-slate-300 hover:bg-slate-700" title="Buat ID pelanggan baru">
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <span className="mt-1 block text-[10px] font-normal text-slate-500">Dibuat otomatis dan unik untuk tahun ini.</span>
                </label>
                <label className="block text-slate-300 font-medium">Tanggal tagihan setiap bulan
                  <input
                    type="number"
                    required
                    min={1}
                    max={31}
                    value={formData.billingDate || ''}
                    onChange={event => setFormData({ ...formData, billingDate: Number(event.target.value) })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white"
                  />
                  <span className="mt-1 block text-[10px] font-normal text-slate-500">Tanggal siklus invoice bulanan.</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Nama Lengkap *</label>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Budi Santoso"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Nomor WhatsApp *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone || ''}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="081234567890"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="budi@gmail.com"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Alamat Pemasangan</label>
                  <input
                    type="text"
                    value={formData.address || ''}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Jl. Mawar No. 12"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block">
                  Kredensial MikroTik PPPoE Secret
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">PPPoE Username *</label>
                    <input
                      type="text"
                      required
                      readOnly={!!linkingSecret}
                      value={formData.pppoeUsername || ''}
                      onChange={e => setFormData({ ...formData, pppoeUsername: e.target.value })}
                      placeholder="budi_merak14"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500 read-only:opacity-70"
                    />
                  </div>
                  {linkingSecret
                    ? <p className="self-end text-[10px] leading-relaxed text-slate-500">Password router tidak dapat dibaca. Penautan tidak mengubah kredensial akun.</p>
                    : <div>
                      <label className="block text-slate-400 mb-1">PPPoE Password *</label>
                      <input
                        type="text"
                        required={!editingCustomer && !linkingSecret}
                        value={formData.pppoePassword || ''}
                        onChange={e => setFormData({ ...formData, pppoePassword: e.target.value })}
                        placeholder={editingCustomer ? 'Kosongkan jika tidak diubah' : 'pass1234'}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Static IP (Opsional)</label>
                    <input
                      type="text"
                      value={formData.ipAddress || ''}
                      onChange={e => setFormData({ ...formData, ipAddress: e.target.value })}
                      placeholder="10.10.20.14"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Router MikroTik</label>
                    <select
                      value={formData.routerId}
                      onChange={e => setFormData({ ...formData, routerId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                      required
                      disabled={!!linkingSecret}
                    >
                      <option value="">Pilih router aktif</option>
                      {routers.filter(router => router.status === 'connected').map(router => (
                        <option key={router.id} value={router.id}>{router.name} ({router.host})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Paket PPPoE *</label>
                  <select
                    value={selectedPackageId}
                    onChange={e => {
                      const selectedPackage = pppoePackages.find(item => item.id === e.target.value);
                      if (!selectedPackage) {
                        setSelectedPackageId(e.target.value);
                        return;
                      }
                      const selectedProfile = selectedPackage
                        ? routerProfiles.find(profile => profile.name === selectedPackage.routerProfileName)
                        : undefined;
                      setSelectedPackageId(e.target.value);
                      setFormData({
                        ...formData,
                        routerId: selectedPackage?.routerId || formData.routerId,
                        profileName: selectedPackage?.routerProfileName || '',
                        servicePackageName: selectedPackage?.name || '',
                        pppoePackageId: selectedPackage?.id,
                        bandwidthLimit: selectedPackage?.speedLimit || selectedProfile?.rateLimit || '',
                        monthlyFee: selectedPackage?.monthlyFee || 0,
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    required
                  >
                    <option value="">Pilih paket yang sudah dibuat</option>
                    {pppoePackages.filter(item => item.enabled && (!linkingSecret || (item.routerId === linkingSecret.routerId && item.routerProfileName === linkingSecret.profile))).map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.speedLimit || item.routerProfileName} · Rp {item.monthlyFee.toLocaleString('id-ID')}
                      </option>
                    ))}
                    {linkingSecret && !pppoePackages.some(item =>
                      item.enabled && item.routerId === linkingSecret.routerId && item.routerProfileName === linkingSecret.profile
                    ) && (
                      <option value="" disabled>
                        Belum ada paket untuk profile {linkingSecret.profile}
                      </option>
                    )}
                    {editingCustomer && !pppoePackages.some(item =>
                      item.routerId === editingCustomer.routerId && item.routerProfileName === editingCustomer.profileName
                    ) && (
                      <option value="legacy">
                        {editingCustomer.profileName} (paket lama; buat paket PPPoE untuk pilihan berikutnya)
                      </option>
                    )}
                  </select>
                  {formData.profileName && (
                    <p className="mt-1 text-[10px] text-slate-400">
                      Profile MikroTik: {formData.profileName} · {formData.bandwidthLimit || 'tanpa batas'}
                    </p>
                  )}
                  {linkingSecret && !pppoePackages.some(item =>
                    item.enabled && item.routerId === linkingSecret.routerId && item.routerProfileName === linkingSecret.profile
                  ) && (
                    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
                      <p className="text-[10px] text-amber-200">Akun router ditemukan, tetapi belum ada paket billing untuk profile ini. Buat paket terlebih dahulu; data dialog ini akan tetap tersimpan.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setPackageRouterId(linkingSecret.routerId);
                          setPackageForm({ id: '', name: '', routerProfileName: linkingSecret.profile, monthlyFee: 0, dataLimitMb: 0 });
                          setPackageModalTab('packages');
                          setIsPackageFormOpen(true);
                          setIsPackageModalOpen(true);
                        }}
                        className="mt-2 rounded-lg bg-amber-500/20 px-3 py-2 text-[10px] font-bold text-amber-100 hover:bg-amber-500/30"
                      >
                        Buat paket untuk profile ini
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Biaya Bulanan</label>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200">
                    Rp {Number(formData.monthlyFee || 0).toLocaleString('id-ID')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Tanggal Jatuh Tempo</label>
                  <input
                    type="date"
                    value={formData.expiredDate || ''}
                    onChange={e => setFormData({ ...formData, expiredDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Status Awal</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="active">Aktif</option>
                    <option value="expiring">Menjelang Expired (H-1/H-3)</option>
                    <option value="isolated">Ter-Isolir (Blokir)</option>
                  </select>
                </div>
              </div>


              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); setLinkingSecret(null); }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingCustomer || routers.length === 0}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  {isSavingCustomer ? 'Menyimpan...' : linkingSecret ? 'Tautkan ke Billing' : editingCustomer ? 'Simpan Perubahan' : 'Simpan & Daftarkan ke MikroTik'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSecretModalOpen && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <form onSubmit={handleSavePppoeSecret} className="my-auto w-full max-w-lg space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-bold">{editingSecretName ? 'Edit Akun PPPoE Router' : 'Tambah Akun PPPoE Router'}</h3>
                <p className="mt-1 text-xs text-slate-400">Perubahan langsung pada {routers.find(router => router.id === routerWorkspaceId)?.name || 'MikroTik'}; tidak otomatis menambah pelanggan billing.</p>
              </div>
              <button type="button" onClick={() => setIsSecretModalOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <label className="block text-xs text-slate-300">Username
              <input required readOnly={!!editingSecretName} maxLength={64} pattern="[A-Za-z0-9_.@-]+" value={secretForm.name} onChange={event => setSecretForm({ ...secretForm, name: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white read-only:opacity-60" />
            </label>
            <label className="block text-xs text-slate-300">Password {editingSecretName ? '(opsional, kosongkan jika tidak diubah)' : ''}
              <input required={!editingSecretName} maxLength={128} type="password" value={secretForm.password} onChange={event => setSecretForm({ ...secretForm, password: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            </label>
            <label className="block text-xs text-slate-300">PPP Profile
              <select required value={secretForm.profile} onChange={event => setSecretForm({ ...secretForm, profile: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
                <option value="">Pilih profile dari router</option>
                {secretProfiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}{profile.rateLimit ? ` · ${profile.rateLimit}` : ''}</option>)}
              </select>
              {secretProfilesLoading && <span className="mt-1 block text-[10px] text-slate-500">Memuat profile router...</span>}
            </label>
            <label className="block text-xs text-slate-300">Komentar
              <input maxLength={200} value={secretForm.comment} onChange={event => setSecretForm({ ...secretForm, comment: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setIsSecretModalOpen(false)} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold">Batal</button>
              <button type="submit" disabled={secretSaving || secretProfilesLoading || !secretProfiles.some(profile => profile.name === secretForm.profile)} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold disabled:opacity-50">{secretSaving ? 'Menyimpan...' : 'Simpan ke MikroTik'}</button>
            </div>
          </form>
        </div>
      )}

      {isPackageModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <section className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 text-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 p-5">
              <div>
                <h3 className="font-bold">Pengelolaan PPPoE</h3>
                <p className="mt-1 text-xs text-slate-400">Kelola paket billing dan profile router pada halaman terpisah.</p>
              </div>
              <button type="button" onClick={() => setIsPackageModalOpen(false)} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="shrink-0 border-b border-slate-800 px-5 pt-3">
              <div className="flex gap-2" role="tablist" aria-label="Pengelolaan PPPoE">
                <button type="button" role="tab" aria-selected={packageModalTab === 'packages'} onClick={() => setPackageModalTab('packages')} className={`border-b-2 px-3 py-3 text-sm font-semibold ${packageModalTab === 'packages' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
                  Paket Billing <span className="ml-1 text-xs text-slate-500">{pppoePackages.length}</span>
                </button>
                <button type="button" role="tab" aria-selected={packageModalTab === 'profiles'} onClick={() => setPackageModalTab('profiles')} className={`border-b-2 px-3 py-3 text-sm font-semibold ${packageModalTab === 'profiles' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
                  PPP Profile <span className="ml-1 text-xs text-slate-500">{packageRouterProfiles.length}</span>
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {packageModalTab === 'packages' ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold">Paket layanan pelanggan</h4>
                      <p className="mt-1 text-xs text-slate-400">Hubungkan harga dan kuota billing ke profile MikroTik.</p>
                    </div>
                    {!isPackageFormOpen && (
                      <button type="button" onClick={() => { setPackageForm({ id: '', name: '', routerProfileName: '', monthlyFee: 0, dataLimitMb: 0 }); setIsPackageFormOpen(true); }} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500">
                        <Plus className="mr-1 inline h-4 w-4" /> Tambah Paket
                      </button>
                    )}
                  </div>
                  {isPackageFormOpen && (
                    <form onSubmit={handleSavePppoePackage} className="grid gap-4 rounded-xl border border-slate-800 bg-slate-950 p-4 sm:grid-cols-2">
                      <div className="flex items-center justify-between sm:col-span-2">
                        <h5 className="text-sm font-bold">{packageForm.id ? 'Edit Paket' : 'Paket Baru'}</h5>
                        <button type="button" onClick={() => { setIsPackageFormOpen(false); setPackageForm({ id: '', name: '', routerProfileName: '', monthlyFee: 0, dataLimitMb: 0 }); }} className="text-xs text-slate-400 hover:text-white">Batal</button>
                      </div>
                      <label className="text-xs text-slate-300">Nama paket
                        <input required minLength={2} maxLength={80} value={packageForm.name} onChange={event => setPackageForm({ ...packageForm, name: event.target.value })} placeholder="Internet 10 Mbps" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                      </label>
                      <label className="text-xs text-slate-300">Router MikroTik
                        <select required disabled={!!packageForm.id} value={packageRouterId} onChange={event => { setPackageRouterId(event.target.value); setPackageForm({ ...packageForm, routerProfileName: '' }); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white disabled:opacity-60">
                          <option value="">Pilih router</option>
                          {routers.map(router => <option key={router.id} value={router.id}>{router.name} ({router.host})</option>)}
                        </select>
                      </label>
                      <label className="text-xs text-slate-300 sm:col-span-2">PPP Profile MikroTik
                        <select required value={packageForm.routerProfileName} onChange={event => setPackageForm({ ...packageForm, routerProfileName: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white">
                          <option value="">Pilih profile dari router</option>
                          {packageRouterProfiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}{profile.rateLimit ? ` · ${profile.rateLimit}` : ''}</option>)}
                        </select>
                        {profilesLoading && <span className="mt-1 block text-[11px] text-slate-500">Memuat profile dari router...</span>}
                        {!profilesLoading && !packageRouterProfiles.length && packageRouterId && <span className="mt-1 block text-[11px] text-amber-300">Profile tidak tersedia. Tambahkan dari tab PPP Profile.</span>}
                      </label>
                      <label className="text-xs text-slate-300">Biaya bulanan (Rp)
                        <input required type="number" min={1} step={1} value={packageForm.monthlyFee || ''} onChange={event => setPackageForm({ ...packageForm, monthlyFee: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                      </label>
                      <label className="text-xs text-slate-300">Kuota bulanan (MB, opsional)
                        <input type="number" min={0} step={1} value={packageForm.dataLimitMb || ''} onChange={event => setPackageForm({ ...packageForm, dataLimitMb: Number(event.target.value) })} placeholder="Tanpa batas" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                        <span className="mt-1 block text-[10px] text-slate-500">Perkiraan penggunaan sesi aktif.</span>
                      </label>
                      <button type="submit" disabled={!packageRouterProfiles.some(profile => profile.name === packageForm.routerProfileName)} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50 sm:col-span-2">{packageForm.id ? 'Simpan Perubahan' : 'Simpan Paket'}</button>
                    </form>
                  )}
                  <section className="overflow-hidden rounded-xl border border-slate-800">
                    <div className="border-b border-slate-800 bg-slate-950 px-4 py-3 text-xs font-semibold text-slate-300">Paket terdaftar <span className="text-slate-500">({pppoePackages.length})</span></div>
                    {pppoePackages.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-3 border-b border-slate-800/80 p-4 last:border-b-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{item.name}</p>
                          <p className="mt-1 text-xs text-slate-400">{routers.find(router => router.id === item.routerId)?.name || 'Router'} · {item.routerProfileName} · {item.speedLimit || 'tanpa batas'}</p>
                          <p className="mt-1 text-xs text-slate-300">Rp {item.monthlyFee.toLocaleString('id-ID')}/bulan{item.dataLimitMb ? ` · ${(item.dataLimitMb / 1024).toFixed(1)} GB` : ' · kuota tanpa batas'}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => handleEditPppoePackage(item)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title="Edit paket"><Edit2 className="h-4 w-4" /></button>
                          <button type="button" onClick={() => void handleDeletePppoePackage(item)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-950 hover:text-rose-300" title="Hapus paket"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ))}
                    {!pppoePackages.length && <p className="p-6 text-center text-xs text-slate-500">Belum ada paket billing PPPoE.</p>}
                  </section>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold">Profile di MikroTik</h4>
                      <p className="mt-1 text-xs text-slate-400">Data live dari router; perubahan diterapkan langsung ke router.</p>
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="text-xs text-slate-400">Router
                        <select disabled={!!packageForm.id} value={packageRouterId} onChange={event => { setPackageRouterId(event.target.value); setPackageForm(current => ({ ...current, routerProfileName: '' })); }} className="mt-1 block min-w-52 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white disabled:opacity-60">
                          <option value="">Pilih router</option>
                          {routers.map(router => <option key={router.id} value={router.id}>{router.name} ({router.host})</option>)}
                        </select>
                      </label>
                      <button type="button" onClick={() => setProfilesReloadKey(key => key + 1)} disabled={!packageRouterId || profilesLoading} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold disabled:opacity-50" title="Segarkan profile">
                        <RefreshCw className={`h-4 w-4 ${profilesLoading ? 'animate-spin' : ''}`} />
                      </button>
                      <button type="button" onClick={() => { setProfileError(''); setProfileForm({ existingName: '', routerId: packageRouterId, name: '', rateLimit: '', localAddress: '', remoteAddress: '', dnsServers: '' }); setIsProfileModalOpen(true); }} disabled={!packageRouterId} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                        <Plus className="mr-1 inline h-4 w-4" /> Tambah Profile
                      </button>
                    </div>
                  </div>
                  {profilesLoading && <p role="status" className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400">Memuat profile dari MikroTik...</p>}
                  {!profilesLoading && !packageRouterProfiles.length && <p className="rounded-xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-xs text-slate-400">{packageRouterId ? 'Tidak ada profile PPP yang terbaca dari router ini.' : 'Pilih router untuk melihat PPP profile.'}</p>}
                  <div className="space-y-2">
                    {packageRouterProfiles.map(profile => (
                      <div key={profile.name} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
                        <div className="min-w-0">
                          <p className="text-sm font-bold">{profile.name}</p>
                          <p className="mt-1 text-xs text-slate-400">{profile.rateLimit || 'Tanpa batas'} · Local {profile.localAddress || 'otomatis'} · Remote {profile.remoteAddress || 'tidak diatur'}</p>
                          <p className="mt-1 text-[11px] text-slate-500">DNS {profile.dnsServers || 'default router'}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button type="button" onClick={() => handleEditPppProfile(profile)} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold hover:bg-slate-700">Edit</button>
                          <button type="button" onClick={() => void handleDeletePppProfile(profile)} className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-950">Hapus</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <form onSubmit={handleSavePppProfile} className="my-auto w-full max-w-xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-bold">{profileForm.existingName ? 'Edit PPP Profile MikroTik' : 'Tambah PPP Profile MikroTik'}</h3>
                <p className="mt-1 text-xs text-slate-400">Perubahan disimpan langsung ke router terpilih dan paket terkait ikut disinkronkan.</p>
              </div>
              <button type="button" onClick={() => setIsProfileModalOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            {profileError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">{profileError}</p>}
            <label className="block text-xs text-slate-300">Nama PPP profile
              <input required maxLength={64} value={profileForm.name} onChange={event => setProfileForm({ ...profileForm, name: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-300">Local address
                <input maxLength={128} value={profileForm.localAddress} onChange={event => setProfileForm({ ...profileForm, localAddress: event.target.value })} placeholder="IP router / pool" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
              <label className="text-xs text-slate-300">Remote address / IP pool
                <input maxLength={128} value={profileForm.remoteAddress} onChange={event => setProfileForm({ ...profileForm, remoteAddress: event.target.value })} placeholder="Nama IP pool" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
              <label className="text-xs text-slate-300">Rate limit
                <input maxLength={128} value={profileForm.rateLimit} onChange={event => setProfileForm({ ...profileForm, rateLimit: event.target.value })} placeholder="Contoh: 10M/10M" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
              <label className="text-xs text-slate-300">DNS server
                <input maxLength={128} value={profileForm.dnsServers} onChange={event => setProfileForm({ ...profileForm, dnsServers: event.target.value })} placeholder="Opsional" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => setIsProfileModalOpen(false)} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">Batal</button>
              <button type="submit" disabled={profileSaving || !profileForm.routerId} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{profileSaving ? 'Menyimpan...' : 'Simpan ke MikroTik'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
