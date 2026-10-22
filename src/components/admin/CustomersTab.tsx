import React, { useEffect, useState } from 'react';
import { Customer, Invoice, RouterConfig } from '../../types';
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
  routers: RouterConfig[];
  onRefreshData: () => void;
  onSendWa: (customer: Customer, type: 'reminder' | 'isolir') => void;
  onViewInvoice: (invoice: Invoice, customer: Customer) => void;
  onToggleIsolir: (customer: Customer) => void;
}

export const CustomersTab: React.FC<Props> = ({
  customers,
  invoices,
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
    setCustomerError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setFormData(c);
    setIsModalOpen(true);
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
    if (!formData.name || !formData.phone || !formData.pppoeUsername || !formData.pppoePassword || !formData.profileName || !formData.routerId) {
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
      pppoePassword: formData.pppoePassword,
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
    return c.status === statusFilter;
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
              Ter-Isolir ({customers.filter(c => c.status === 'isolated').length})
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
                        <div className="font-semibold text-slate-200">{cust.profileName}</div>
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
                        {cust.status === 'isolated' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <ShieldAlert className="w-3 h-3" /> TER-ISOLIR
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Toggle Isolir */}
                          <button
                            onClick={() => onToggleIsolir(cust)}
                            className={`p-1.5 rounded-lg transition ${
                              cust.status === 'isolated'
                                ? 'bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white'
                                : 'bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white'
                            }`}
                            title={cust.status === 'isolated' ? 'Buka Isolir MikroTik' : 'Isolir Akses Pelanggan'}
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </button>

                          {/* WhatsApp Reminder */}
                          <button
                            onClick={() => onSendWa(cust, cust.status === 'isolated' ? 'isolir' : 'reminder')}
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
                  <label className="block text-slate-300 font-medium mb-1">Paket Layanan</label>
                  <select
                    value={formData.profileName}
                    onChange={e => {
                      const selected = routerProfiles.find(profile => profile.name === e.target.value);
                      setFormData({
                        ...formData,
                        profileName: e.target.value,
                        bandwidthLimit: selected?.rateLimit || '',
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                    required
                  >
                    <option value="">Pilih profile aktual dari router</option>
                    {formData.profileName && !routerProfiles.some(profile => profile.name === formData.profileName) && <option value={formData.profileName}>{formData.profileName} (saat ini)</option>}
                    {routerProfiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}{profile.rateLimit ? ` (${profile.rateLimit})` : ''}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Biaya Bulanan (Rp)</label>
                  <input
                    type="number"
                    value={formData.monthlyFee || 0}
                    onChange={e => setFormData({ ...formData, monthlyFee: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  />
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
    </div>
  );
};
