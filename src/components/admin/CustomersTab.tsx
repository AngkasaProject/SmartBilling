import React, { useEffect, useState } from 'react';
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
  const [routerProfiles, setRouterProfiles] = useState<Array<{ name: string; rateLimit: string }>>([]);
  const [customerError, setCustomerError] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [packageRouterId, setPackageRouterId] = useState('');
  const [packageRouterProfiles, setPackageRouterProfiles] = useState<Array<{ name: string; rateLimit: string }>>([]);
  const [packageForm, setPackageForm] = useState({ name: '', routerProfileName: '', monthlyFee: 0, dataLimitMb: 0 });
  const [selectedPackageId, setSelectedPackageId] = useState('');

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
      return;
    }
    fetch(`/api/mikrotik/pppoe/profiles?routerId=${encodeURIComponent(packageRouterId)}`)
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        setPackageRouterProfiles(result.profiles);
      })
      .catch(error => toast('Gagal memuat profile PPPoE', 'error', error instanceof Error ? error.message : String(error)));
  }, [isPackageModalOpen, packageRouterId, toast]);

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    const now = new Date();
    const currentDate = now.toISOString().substring(0, 10);
    setFormData({
      customerId: `CUST-${now.getFullYear()}-${String(customers.length + 1).padStart(4, '0')}`,
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
    setEditingCustomer(c);
    const matchedPackage = pppoePackages.find(item =>
      item.routerId === c.routerId && item.routerProfileName === c.profileName
    );
    setSelectedPackageId(matchedPackage?.id || (c.profileName ? 'legacy' : ''));
    setFormData({ ...c, pppoePackageId: matchedPackage?.id, servicePackageName: matchedPackage?.name || c.servicePackageName });
    setIsModalOpen(true);
  };

  const handleAddPppoePackage = (event: React.FormEvent) => {
    event.preventDefault();
    const profile = packageRouterProfiles.find(item => item.name === packageForm.routerProfileName);
    if (!profile || packageForm.monthlyFee <= 0) {
      toast('Lengkapi profile MikroTik dan biaya bulanan paket.', 'error');
      return;
    }
    if (pppoePackages.some(item =>
      item.routerId === packageRouterId &&
      item.name.trim().toLowerCase() === packageForm.name.trim().toLowerCase()
    )) {
      toast('Nama paket sudah digunakan untuk router ini.', 'error');
      return;
    }
    const nextPackages = [...pppoePackages, {
      id: `pppoe-package-${Date.now()}`,
      name: packageForm.name.trim(),
      routerId: packageRouterId,
      routerProfileName: profile.name,
      speedLimit: profile.rateLimit,
      monthlyFee: Math.round(packageForm.monthlyFee),
      enabled: true,
      dataLimitMb: packageForm.dataLimitMb ? Math.round(packageForm.dataLimitMb) : undefined,
    }];
    StorageService.savePppoePackages(nextPackages);
    onRefreshData();
    setPackageForm({ name: '', routerProfileName: '', monthlyFee: 0, dataLimitMb: 0 });
    toast('Paket PPPoE berhasil ditambahkan.', 'success');
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

  const handleDelete = async (customer: Customer) => {
    const accepted = await confirmAction(
      'Hapus pelanggan?',
      `Pelanggan ${customer.name} dan user PPPoE ${customer.pppoeUsername} akan dihapus dari MikroTik serta daftar billing.`,
      true
    );
    if (!accepted) return;
    try {
      const response = await fetch(`/api/mikrotik/pppoe/secrets/${encodeURIComponent(customer.routerId)}/${encodeURIComponent(customer.pppoeUsername)}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      StorageService.deleteCustomer(customer.id);
      onRefreshData();
      toast('Pelanggan berhasil dihapus dari billing dan MikroTik.', 'success');
    } catch (error) {
      toast('Gagal menghapus pelanggan', 'error', error instanceof Error ? error.message : String(error));
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const pppoePassword = formData.pppoePassword;
    if (
      typeof pppoePassword !== 'string' ||
      !pppoePassword ||
      pppoePassword.trim().toLowerCase() === 'undefined'
    ) {
      setCustomerError('Password PPPoE tidak valid. Masukkan password yang akan disimpan pada MikroTik.');
      return;
    }
    if (
      !formData.name ||
      !formData.phone ||
      !formData.pppoeUsername ||
      !formData.profileName ||
      !formData.routerId
    ) {
      setCustomerError('Nama, WhatsApp, username/password PPPoE, profile router, dan router wajib diisi.');
      return;
    }

    setIsSavingCustomer(true);
    setCustomerError('');
    const payload: Customer = {
      id: editingCustomer ? editingCustomer.id : 'cust-' + Date.now(),
      customerId: formData.customerId || `CUST-${new Date().getFullYear()}-${String(customers.length + 1).padStart(4, '0')}`,
      name: formData.name || '',
      phone: formData.phone || '',
      email: formData.email || '',
      address: formData.address || '',
      pppoeUsername: formData.pppoeUsername || '',
      pppoePassword,
      pppoePackageId: pppoePackages.some(item => item.id === selectedPackageId) ? selectedPackageId : undefined,
      servicePackageName: formData.servicePackageName || undefined,
      profileName: formData.profileName,
      bandwidthLimit: formData.bandwidthLimit || '',
      monthlyFee: Number(formData.monthlyFee) || 0,
      billingDate: Number(formData.billingDate) || new Date().getDate(),
      expiredDate: formData.expiredDate || new Date().toISOString().substring(0, 10),
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
      const endpoint = previous && !changedRouterOrUser
        ? `/api/mikrotik/pppoe/secrets/${encodeURIComponent(payload.routerId)}/${encodeURIComponent(payload.pppoeUsername)}`
        : '/api/mikrotik/pppoe/secrets';
      const response = await fetch(endpoint, {
        method: previous && !changedRouterOrUser ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previous && !changedRouterOrUser
          ? { password: payload.pppoePassword, profile: payload.profileName, disabled: payload.status === 'isolated' }
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
      onRefreshData();
      toast(previous ? 'Data pelanggan berhasil diperbarui.' : 'Pelanggan dan akun PPPoE berhasil dibuat.', 'success');
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

  return (
    <div className="space-y-5">
      {/* Top Header & Search Filter Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <span>Manajemen Pelanggan PPPoE</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Kelola secret PPPoE dan masa aktif. Isolir manual mengubah status secret RouterOS.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                setPackageRouterId(routers.find(router => router.status === 'connected')?.id || routers[0]?.id || '');
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
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
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
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
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
                            title={cust.status === 'isolated' || cust.status === 'disabled' ? 'Aktifkan akses PPPoE di MikroTik' : 'Nonaktifkan akses PPPoE di MikroTik'}
                          >
                            {cust.status === 'isolated' || cust.status === 'disabled'
                              ? <><CheckCircle2 className="w-3.5 h-3.5" /><span>Aktifkan</span></>
                              : <><ShieldAlert className="w-3.5 h-3.5" /><span>Nonaktifkan</span></>}
                          </button>

                          {/* WhatsApp Reminder */}
                          <button
                            onClick={() => onSendWa(cust, cust.status === 'isolated' || cust.status === 'disabled' ? 'isolir' : 'reminder')}
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
      </div>

      {/* Add / Edit Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl text-white shadow-2xl relative my-8">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>{editingCustomer ? 'Edit Data Pelanggan PPPoE' : 'Tambah Pelanggan Baru'}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  User PPPoE dibuat di router dan baru disimpan ke billing setelah operasi RouterOS berhasil.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-6 space-y-4 text-xs">
              {customerError && <div role="alert" className="p-3 rounded-lg border border-rose-500/30 bg-rose-950/40 text-rose-300">{customerError}</div>}
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
                      value={formData.pppoeUsername || ''}
                      onChange={e => setFormData({ ...formData, pppoeUsername: e.target.value })}
                      placeholder="budi_merak14"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">PPPoE Password *</label>
                    <input
                      type="text"
                      required
                      value={formData.pppoePassword || ''}
                      onChange={e => setFormData({ ...formData, pppoePassword: e.target.value })}
                      placeholder="pass1234"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
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
                    {pppoePackages.filter(item => item.enabled).map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.speedLimit || item.routerProfileName} · Rp {item.monthlyFee.toLocaleString('id-ID')}
                      </option>
                    ))}
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
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingCustomer || routers.length === 0}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  {isSavingCustomer ? 'Menyimpan...' : editingCustomer ? 'Simpan Perubahan' : 'Simpan & Daftarkan ke MikroTik'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPackageModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <section className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 p-5">
              <div>
                <h3 className="font-bold">Paket Layanan PPPoE</h3>
                <p className="mt-1 text-xs text-slate-400">Paket menghubungkan harga billing dengan PPP profile yang ada di MikroTik.</p>
              </div>
              <button type="button" onClick={() => setIsPackageModalOpen(false)} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-5 p-5">
              <form onSubmit={handleAddPppoePackage} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 sm:grid-cols-2">
                <label className="text-xs text-slate-300">Nama paket
                  <input required minLength={2} maxLength={80} value={packageForm.name} onChange={event => setPackageForm({ ...packageForm, name: event.target.value })} placeholder="Internet 10 Mbps" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                </label>
                <label className="text-xs text-slate-300">Router MikroTik
                  <select required value={packageRouterId} onChange={event => { setPackageRouterId(event.target.value); setPackageForm({ ...packageForm, routerProfileName: '' }); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white">
                    <option value="">Pilih router</option>
                    {routers.map(router => <option key={router.id} value={router.id}>{router.name} ({router.host})</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-300">PPP Profile (data live dari router)
                  <select required value={packageForm.routerProfileName} onChange={event => setPackageForm({ ...packageForm, routerProfileName: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white">
                    <option value="">Pilih profile</option>
                    {packageRouterProfiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}{profile.rateLimit ? ` · ${profile.rateLimit}` : ''}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-300">Biaya bulanan (Rp)
                  <input required type="number" min={1} step={1} value={packageForm.monthlyFee || ''} onChange={event => setPackageForm({ ...packageForm, monthlyFee: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                </label>
                <label className="text-xs text-slate-300">Kuota bulanan (MB, opsional)
                  <input type="number" min={0} step={1} value={packageForm.dataLimitMb || ''} onChange={event => setPackageForm({ ...packageForm, dataLimitMb: Number(event.target.value) })} placeholder="Kosongkan untuk tanpa batas" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                  <span className="mt-1 block text-[10px] text-slate-500">Penggunaan Portal ditampilkan sebagai perkiraan dari sesi PPPoE aktif.</span>
                </label>
                <button type="submit" disabled={!packageRouterProfiles.length} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 sm:col-span-2">Tambah Paket PPPoE</button>
                {!packageRouterProfiles.length && packageRouterId && <p className="text-[11px] text-amber-300 sm:col-span-2">Tidak ada PPP profile yang terbaca. Pastikan router tersambung dan profile dibuat di menu Router & MikroTik.</p>}
              </form>
              <div className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
                {pppoePackages.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-sm font-bold">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.routerProfileName} · {item.speedLimit || 'tanpa batas'} · Rp {item.monthlyFee.toLocaleString('id-ID')}/bulan{item.dataLimitMb ? ` · ${(item.dataLimitMb / 1024).toFixed(1)} GB` : ' · kuota tanpa batas'}</p>
                    </div>
                    <button type="button" onClick={() => void handleDeletePppoePackage(item)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-950 hover:text-rose-300" title="Hapus paket"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                {!pppoePackages.length && <p className="p-4 text-xs text-slate-500">Belum ada paket PPPoE. Buat profile di MikroTik, lalu daftarkan sebagai paket di atas.</p>}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
