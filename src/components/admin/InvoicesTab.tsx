import React, { useState } from 'react';
import { Invoice, Customer } from '../../types';
import { StorageService } from '../../services/storage';
import {
  CreditCard,
  Search,
  Plus,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  Zap,
  Printer,
  X,
  DollarSign
} from 'lucide-react';

interface Props {
  invoices: Invoice[];
  customers: Customer[];
  onRefreshData: () => void;
  onViewInvoice: (invoice: Invoice, customer?: Customer) => void;
  onSendWa: (customer: Customer, type: 'reminder' | 'isolir') => void;
}

export const InvoicesTab: React.FC<Props> = ({
  invoices,
  customers,
  onRefreshData,
  onViewInvoice,
  onSendWa,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid' | 'expired'>('all');
  const [manualPayInvoice, setManualPayInvoice] = useState<Invoice | null>(null);
  const [manualPaymentMethod, setManualPaymentMethod] = useState('Cash (Tunai / Kasir)');

  // Derived stats
  const totalInvoiced = invoices.reduce((sum, i) => sum + i.totalAmount, 0);
  const paidInvoiced = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + i.totalAmount, 0);
  const unpaidInvoiced = invoices
    .filter(i => i.status !== 'paid')
    .reduce((sum, i) => sum + i.totalAmount, 0);

  // Batch Billing Generation (Run billing for next month)
  const handleGenerateMonthlyInvoices = () => {
    const activeCustomers = customers.filter(c => c.status !== 'disabled');
    if (
      !window.confirm(
        `Jalankan Billing Run untuk ${activeCustomers.length} pelanggan aktif? Invoice baru periode November 2026 akan dibuat.`
      )
    ) {
      return;
    }

    const currentInvs = StorageService.getInvoices();
    let createdCount = 0;

    activeCustomers.forEach((cust, idx) => {
      // Check if invoice for this month already exists
      const exists = currentInvs.some(
        i => i.customerId === cust.id && i.periodMonth === 'November 2026'
      );
      if (!exists) {
        const uniqueCode = Math.floor(10 + Math.random() * 890);
        const newInv: Invoice = {
          id: 'inv-' + Date.now() + '-' + idx,
          invoiceNumber: `INV-202611-${String(currentInvs.length + createdCount + 1).padStart(3, '0')}`,
          customerId: cust.id,
          customerName: cust.name,
          customerPhone: cust.phone,
          profileName: cust.profileName,
          periodMonth: 'November 2026',
          amount: cust.monthlyFee,
          uniqueCode: uniqueCode,
          totalAmount: cust.monthlyFee + uniqueCode,
          status: 'unpaid',
          dueDate: `2026-11-${String(cust.billingDate).padStart(2, '0')}`,
        };
        StorageService.saveInvoice(newInv);
        createdCount++;
      }
    });

    alert(`Berhasil membuat ${createdCount} invoice baru untuk periode November 2026!`);
    onRefreshData();
  };

  // Process manual payment
  const handleConfirmManualPayment = () => {
    if (!manualPayInvoice) return;
    StorageService.settleInvoice(manualPayInvoice.id, manualPaymentMethod, 'Manual Admin Settle');
    setManualPayInvoice(null);
    onRefreshData();
    alert('Pembayaran berhasil dicatat! Masa aktif pelanggan diperpanjang dan status isolir otomatis dibuka di MikroTik.');
  };

  const filteredInvoices = invoices.filter(i => {
    const matchesSearch =
      i.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.customerPhone.includes(searchTerm);

    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    return i.status === statusFilter;
  });

  return (
    <div className="space-y-5">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-medium text-slate-400">Total Nilai Tagihan</span>
          <div className="text-2xl font-black text-white mt-1">
            Rp {totalInvoiced.toLocaleString('id-ID')}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">{invoices.length} Faktur Diterbitkan</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-medium text-slate-400">Sudah Terbayar (Lunas)</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            Rp {paidInvoiced.toLocaleString('id-ID')}
          </div>
          <span className="text-[11px] text-emerald-500/80 mt-1 block">
            {invoices.filter(i => i.status === 'paid').length} Invoice Lunas
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-medium text-slate-400">Tertunggak / Belum Bayar</span>
          <div className="text-2xl font-black text-rose-400 mt-1">
            Rp {unpaidInvoiced.toLocaleString('id-ID')}
          </div>
          <span className="text-[11px] text-rose-500/80 mt-1 block">
            {invoices.filter(i => i.status !== 'paid').length} Invoice Belum Terbayar
          </span>
        </div>
      </div>

      {/* Control Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-400" />
              <span>Daftar Tagihan & Invoice Bulanan</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Pemantauan tagihan PPPoE, riwayat pembayaran gateway, dan auto-extend subscription
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleGenerateMonthlyInvoices}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>Generate Tagihan Massal Baru</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nomor invoice, nama, atau No. HP..."
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
              Semua ({invoices.length})
            </button>
            <button
              onClick={() => setStatusFilter('unpaid')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'unpaid' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Belum Bayar ({invoices.filter(i => i.status === 'unpaid').length})
            </button>
            <button
              onClick={() => setStatusFilter('paid')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'paid' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Lunas ({invoices.filter(i => i.status === 'paid').length})
            </button>
            <button
              onClick={() => setStatusFilter('expired')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === 'expired' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Jatuh Tempo ({invoices.filter(i => i.status === 'expired').length})
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                <th className="py-3.5 px-4">No. Invoice & Periode</th>
                <th className="py-3.5 px-4">Pelanggan</th>
                <th className="py-3.5 px-4">Paket Layanan</th>
                <th className="py-3.5 px-4">Total Tagihan</th>
                <th className="py-3.5 px-4">Jatuh Tempo & Bayar</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Tidak ada invoice yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => {
                  const cust = customers.find(c => c.id === inv.customerId);

                  return (
                    <tr key={inv.id} className="hover:bg-slate-800/30 transition">
                      {/* Invoice No */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-white text-sm">#{inv.invoiceNumber}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{inv.periodMonth}</div>
                      </td>

                      {/* Customer */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{inv.customerName}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{inv.customerPhone}</div>
                      </td>

                      {/* Package */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-200">{inv.profileName}</div>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-white text-sm">
                          Rp {inv.totalAmount.toLocaleString('id-ID')}
                        </div>
                        {inv.uniqueCode > 0 && (
                          <div className="text-[10px] text-slate-500">
                            Unik: +Rp {inv.uniqueCode}
                          </div>
                        )}
                      </td>

                      {/* Due Date & Paid Info */}
                      <td className="py-3.5 px-4">
                        <div className="text-slate-300">Tempo: {inv.dueDate}</div>
                        {inv.paidAt && (
                          <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                            Lunas: {inv.paidAt.substring(0, 10)} ({inv.paymentMethod || 'Gateway'})
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {inv.status === 'paid' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" /> LUNAS
                          </span>
                        )}
                        {inv.status === 'unpaid' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <Clock className="w-3 h-3" /> BELUM BAYAR
                          </span>
                        )}
                        {inv.status === 'expired' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <AlertTriangle className="w-3 h-3" /> JATUH TEMPO
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Print / View */}
                          <button
                            onClick={() => onViewInvoice(inv, cust)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                            title="Lihat & Cetak Invoice"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* WhatsApp Link */}
                          {cust && (
                            <button
                              onClick={() => onSendWa(cust, 'reminder')}
                              className="p-1.5 bg-emerald-500/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg transition"
                              title="Kirim Tagihan via WhatsApp"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Manual Settle (if not paid) */}
                          {inv.status !== 'paid' && (
                            <button
                              onClick={() => setManualPayInvoice(inv)}
                              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold transition flex items-center gap-1"
                              title="Catat Pembayaran Masuk"
                            >
                              <DollarSign className="w-3 h-3" />
                              <span>Bayar</span>
                            </button>
                          )}
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

      {/* Manual Payment Modal */}
      {manualPayInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md text-white shadow-2xl p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span>Catat Pembayaran Manual</span>
              </h3>
              <button
                onClick={() => setManualPayInvoice(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs mb-5">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-slate-400">Invoice: #{manualPayInvoice.invoiceNumber}</div>
                <div className="text-sm font-bold text-white mt-0.5">{manualPayInvoice.customerName}</div>
                <div className="text-base font-extrabold text-indigo-400 mt-1">
                  Rp {manualPayInvoice.totalAmount.toLocaleString('id-ID')}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Metode Pembayaran</label>
                <select
                  value={manualPaymentMethod}
                  onChange={e => setManualPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Cash (Tunai / Kasir)">Cash (Tunai / Kasir)</option>
                  <option value="Transfer Bank BCA Manual">Transfer Bank BCA Manual</option>
                  <option value="Transfer Bank Mandiri Manual">Transfer Bank Mandiri Manual</option>
                  <option value="QRIS Statis Toko">QRIS Statis Toko</option>
                </select>
              </div>

              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-[11px] text-indigo-300 leading-relaxed">
                ℹ️ Saat dikonfirmasi, sistem akan:
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Mengubah status invoice menjadi LUNAS</li>
                  <li>Memperpanjang masa aktif pelanggan +30 hari</li>
                  <li>Mencabut isolir MikroTik seketika</li>
                  <li>Mengirim WhatsApp tanda terima lunas otomatis</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setManualPayInvoice(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium text-xs"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmManualPayment}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/30"
              >
                Konfirmasi Lunas & Buka Isolir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
