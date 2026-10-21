import React, { useState } from 'react';
import { Voucher, HotspotProfile } from '../../types';
import { StorageService } from '../../services/storage';
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
  Layers
} from 'lucide-react';

interface Props {
  vouchers: Voucher[];
  profiles: HotspotProfile[];
  onRefreshData: () => void;
  onOpenPrintModal: (vouchersToPrint: Voucher[]) => void;
}

export const VouchersTab: React.FC<Props> = ({
  vouchers,
  profiles,
  onRefreshData,
  onOpenPrintModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unused' | 'active' | 'expired'>('all');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('all');
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Batch generator form state
  const [batchProfileId, setBatchProfileId] = useState(profiles[0]?.id || 'hp-1');
  const [batchCount, setBatchCount] = useState(15);
  const [batchPrefix, setBatchPrefix] = useState('NET-');

  const handleGenerateBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const targetProfile = profiles.find(p => p.id === batchProfileId) || profiles[0];
    const now = new Date();
    const nowStr = now.toISOString().replace('T', ' ').substring(0, 19);
    const batchCode = 'BATCH-' + now.toISOString().substring(0, 10).replace(/-/g, '') + '-' + Math.floor(10 + Math.random() * 90);

    const newVouchers: Voucher[] = [];
    for (let i = 0; i < batchCount; i++) {
      const randomNum = Math.floor(10000 + Math.random() * 90000);
      const code = `${batchPrefix}${randomNum}`;
      newVouchers.push({
        id: 'vch-' + Date.now() + '-' + i,
        code: code,
        password: code, // standard voucher 1-code
        profileId: targetProfile.id,
        profileName: targetProfile.name,
        price: targetProfile.price,
        validityHours: targetProfile.validityHours,
        validityDuration: targetProfile.validityDuration,
        speedLimit: targetProfile.speedLimit,
        status: 'unused',
        batchCode: batchCode,
        createdAt: nowStr,
      });
    }

    StorageService.saveVouchers(newVouchers);
    setIsGenerateModalOpen(false);
    onRefreshData();

    // Ask to print immediately
    if (window.confirm(`Berhasil membuat ${batchCount} voucher (${targetProfile.name})! Mau langsung cetak voucher sekarang?`)) {
      onOpenPrintModal(newVouchers);
    }
  };

  // Generate MikroTik CLI script for import
  const getMikrotikScript = () => {
    const listToExport = filteredVouchers.slice(0, 100);
    let script = `# ====================================================\n`;
    script += `# MIKROTIK HOTSPOT USER IMPORT SCRIPT (${listToExport.length} Vouchers)\n`;
    script += `# Salin dan paste di New Terminal Winbox MikroTik\n`;
    script += `# ====================================================\n\n`;
    script += `/ip hotspot user\n`;

    listToExport.forEach(v => {
      const rosProfile = v.profileName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      script += `add name="${v.code}" password="${v.code}" profile="${rosProfile}" limit-uptime="${v.validityHours}h" comment="${v.batchCode}"\n`;
    });

    return script;
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(getMikrotikScript());
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const filteredVouchers = vouchers.filter(v => {
    const matchesSearch =
      v.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.batchCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.customerPhone && v.customerPhone.includes(searchTerm));

    if (!matchesSearch) return false;
    if (statusFilter !== 'all' && v.status !== statusFilter) return false;
    if (selectedProfileId !== 'all' && v.profileId !== selectedProfileId) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Hotspot Packages Catalog Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {profiles.map(p => {
          const countInProfile = vouchers.filter(v => v.profileId === p.id).length;
          const unusedInProfile = vouchers.filter(v => v.profileId === p.id && v.status === 'unused').length;

          return (
            <div
              key={p.id}
              className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{p.validityDuration}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {p.speedLimit}
                </span>
              </div>
              <div className="mt-2">
                <h4 className="text-lg font-black text-white">{p.name}</h4>
                <div className="text-xl font-extrabold text-indigo-400 mt-1">
                  Rp {p.price.toLocaleString('id-ID')}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>Stok Siap Jual: <b className="text-emerald-400">{unusedInProfile}</b></span>
                <span>Total: {countInProfile}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Control Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Ticket className="w-5 h-5 text-indigo-400" />
              <span>Manajemen & Cetak Voucher Hotspot</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Generator voucher massal, cetak thermal/A4 dengan QR login, dan ekspor ke User Manager / Hotspot MikroTik
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => onOpenPrintModal(filteredVouchers.length > 0 ? filteredVouchers : vouchers)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4 text-indigo-400" />
              <span>Cetak Voucher ({filteredVouchers.length})</span>
            </button>

            <button
              onClick={() => setIsScriptModalOpen(true)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
            >
              <FileCode className="w-4 h-4 text-emerald-400" />
              <span>Ekspor Script MikroTik</span>
            </button>

            <button
              onClick={() => setIsGenerateModalOpen(true)}
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
                placeholder="Cari kode voucher, batch, atau No. HP..."
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
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs w-full lg:w-auto overflow-x-auto">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua ({vouchers.length})
            </button>
            <button
              onClick={() => setStatusFilter('unused')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'unused' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Belum Dipakai ({vouchers.filter(v => v.status === 'unused').length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'active' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Aktif Digunakan ({vouchers.filter(v => v.status === 'active').length})
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
                <th className="py-3.5 px-4">Batch / Sumber</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-mono">
              {filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                    Tidak ada voucher yang sesuai.
                  </td>
                </tr>
              ) : (
                filteredVouchers.map(v => (
                  <tr key={v.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-black text-white text-sm tracking-wider bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 inline-block">
                        {v.code}
                      </div>
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
                        Rp {v.price.toLocaleString('id-ID')}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      <div>{v.batchCode}</div>
                      <div className="text-[10px] text-slate-500">{v.createdAt}</div>
                    </td>

                    <td className="py-3.5 px-4 font-sans">
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
                          EXPIRED
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right font-sans">
                      <button
                        onClick={() => onOpenPrintModal([v])}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition inline-flex items-center gap-1 text-[11px]"
                        title="Cetak Voucher Tunggal"
                      >
                        <Printer className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="hidden sm:inline">Cetak</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch Generate Modal */}
      {isGenerateModalOpen && (
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
                  {profiles.map(p => (
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
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30"
                >
                  Buat Voucher Sekarang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Export MikroTik Script Modal */}
      {isScriptModalOpen && (
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
    </div>
  );
};
