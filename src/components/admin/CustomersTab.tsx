import React, { useState } from 'react';
import { Customer, Invoice } from '../../types';
import { StorageService } from '../../services/storage';
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
  onRefreshData: () => void;
  onSendWa: (customer: Customer, type: 'reminder' | 'isolir') => void;
  onViewInvoice: (invoice: Invoice, customer: Customer) => void;
  onToggleIsolir: (customer: Customer) => void;
}

export const CustomersTab: React.FC<Props> = ({
  customers,
  invoices,
  onRefreshData,
  onSendWa,
  onViewInvoice,
  onToggleIsolir,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring' | 'isolated'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    pppoeUsername: '',
    pppoePassword: '',
    profileName: 'Paket Home 20 Mbps',
    bandwidthLimit: '20M/20M',
    monthlyFee: 175000,
    billingDate: 25,
    expiredDate: '2026-11-25',
    status: 'active',
    autoIsolir: true,
    routerId: 'rtr-1',
    ipAddress: '',
  });

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    const randomUserNum = Math.floor(100 + Math.random() * 900);
    setFormData({
      customerId: `CUST-2026-${String(customers.length + 1).padStart(3, '0')}`,
      name: '',
      phone: '',
      email: '',
      address: '',
      pppoeUsername: `user_${randomUserNum}`,
      pppoePassword: `pass${Math.floor(1000 + Math.random() * 9000)}`,
      profileName: 'Paket Home 20 Mbps',
      bandwidthLimit: '20M/20M',
      monthlyFee: 175000,
      billingDate: 25,
      expiredDate: '2026-11-25',
      status: 'active',
      autoIsolir: true,
      routerId: 'rtr-1',
      ipAddress: `10.10.20.${customers.length + 50}`,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setFormData(c);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Yakin ingin menghapus pelanggan ${name}? Data PPPoE di MikroTik juga akan dinonaktifkan.`)) {
      StorageService.deleteCustomer(id);
      onRefreshData();
    }
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.pppoeUsername) {
      alert('Nama, Nomor WhatsApp, dan Username PPPoE wajib diisi!');
      return;
    }

    const payload: Customer = {
      id: editingCustomer ? editingCustomer.id : 'cust-' + Date.now(),
      customerId: formData.customerId || `CUST-2026-${customers.length + 1}`,
      name: formData.name || '',
      phone: formData.phone || '',
      email: formData.email || '',
      address: formData.address || '',
      pppoeUsername: formData.pppoeUsername || '',
      pppoePassword: formData.pppoePassword || '123456',
      profileName: formData.profileName || 'Paket Home 20 Mbps',
      bandwidthLimit: formData.bandwidthLimit || '20M/20M',
      monthlyFee: Number(formData.monthlyFee) || 175000,
      billingDate: Number(formData.billingDate) || 25,
      expiredDate: formData.expiredDate || '2026-11-25',
      status: (formData.status as any) || 'active',
      autoIsolir: formData.autoIsolir ?? true,
      routerId: formData.routerId || 'rtr-1',
      ipAddress: formData.ipAddress || '',
      notes: formData.notes || '',
    };

    StorageService.saveCustomer(payload);
    setIsModalOpen(false);
    onRefreshData();
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
              Kelola user secret MikroTik, paket bandwidth, status masa aktif, dan auto-isolir terintegrasi
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
                        <div className="text-[10px] text-slate-500">
                          Auto-Isolir: {cust.autoIsolir ? '✅ Aktif' : '❌ Nonaktif'}
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
                            onClick={() => handleDelete(cust.id, cust.name)}
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
                  Data otomatis dikonfigurasi ke MikroTik RouterOS API
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
                    >
                      <option value="rtr-1">NOC-Pusat (RB4011)</option>
                      <option value="rtr-2">Tower-Barat (RB750Gr3)</option>
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
                      const val = e.target.value;
                      let fee = 175000;
                      let bw = '20M/20M';
                      if (val.includes('10')) { fee = 125000; bw = '10M/10M'; }
                      else if (val.includes('20')) { fee = 175000; bw = '20M/20M'; }
                      else if (val.includes('30')) { fee = 220000; bw = '30M/30M'; }
                      else if (val.includes('50')) { fee = 350000; bw = '50M/50M'; }
                      else if (val.includes('100')) { fee = 650000; bw = '100M/100M'; }
                      setFormData({ ...formData, profileName: val, monthlyFee: fee, bandwidthLimit: bw });
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Paket Home 10 Mbps">Paket Home 10 Mbps (Rp 125.000)</option>
                    <option value="Paket Home 20 Mbps">Paket Home 20 Mbps (Rp 175.000)</option>
                    <option value="Paket Home 30 Mbps">Paket Home 30 Mbps (Rp 220.000)</option>
                    <option value="Paket Bisnis 50 Mbps">Paket Bisnis 50 Mbps (Rp 350.000)</option>
                    <option value="Paket Bisnis 100 Mbps">Paket Bisnis 100 Mbps (Rp 650.000)</option>
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

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="autoIsolirCheck"
                  checked={formData.autoIsolir}
                  onChange={e => setFormData({ ...formData, autoIsolir: e.target.checked })}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                <label htmlFor="autoIsolirCheck" className="text-slate-300 text-xs cursor-pointer">
                  Aktifkan Auto-Isolir MikroTik jika melewati tanggal jatuh tempo
                </label>
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
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30"
                >
                  {editingCustomer ? 'Simpan Perubahan' : 'Simpan & Daftarkan ke MikroTik'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
