import React, { useState } from 'react';
import { Customer, Invoice } from '../../types';
import { StorageService } from '../../services/storage';
import { QrCode } from '../common/QrCode';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  CreditCard,
  QrCode as QrIcon,
  Wifi,
  Calendar,
  Lock,
  ArrowRight,
  Clock,
  Sparkles,
  Check
} from 'lucide-react';

interface Props {
  customers: Customer[];
  invoices: Invoice[];
  onRefreshData: () => void;
}

export const CustomerBillPortal: React.FC<Props> = ({
  customers,
  invoices,
  onRefreshData,
}) => {
  const [query, setQuery] = useState('081987654321'); // default to isolated customer for demo
  const [searchedCustomer, setSearchedCustomer] = useState<Customer | null>(
    customers.find(c => c.phone === '081987654321') || customers[2] || null
  );
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;

    const found = customers.find(
      c =>
        c.customerId.toLowerCase() === query.trim().toLowerCase() ||
        c.phone.replace(/[^0-9]/g, '') === query.trim().replace(/[^0-9]/g, '') ||
        c.pppoeUsername.toLowerCase() === query.trim().toLowerCase()
    );

    if (found) {
      setSearchedCustomer(found);
    } else {
      alert('Pelanggan tidak ditemukan. Cek kembali No. Pelanggan atau No. WhatsApp Anda.');
    }
  };

  // Find customer's invoices
  const customerInvoices = searchedCustomer
    ? invoices.filter(i => i.customerId === searchedCustomer.id)
    : [];

  const unpaidInvoice = customerInvoices.find(i => i.status !== 'paid');

  const handleOpenPay = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setPaySuccess(false);
    setIsPayModalOpen(true);
  };

  const handleSimulatePayment = () => {
    if (!selectedInvoice) return;
    setIsPaying(true);

    setTimeout(() => {
      StorageService.settleInvoice(selectedInvoice.id, 'QRIS Instant', 'Pelanggan Mandiri Web');
      setIsPaying(false);
      setPaySuccess(true);
      onRefreshData();

      // Refresh searched customer
      const updated = StorageService.getCustomers().find(c => c.id === searchedCustomer?.id);
      if (updated) setSearchedCustomer(updated);
    }, 1200);
  };

  return (
    <div className="max-w-3xl mx-auto py-4 px-2 sm:px-4">
      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Cek & Bayar Tagihan Internet PPPoE Mandiri
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm mt-1.5 max-w-lg mx-auto">
          Masukkan ID Pelanggan atau Nomor WhatsApp Anda untuk melihat rincian masa aktif dan pelunasan otomatis
        </p>
      </div>

      {/* Search Input Box */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex flex-col sm:flex-row gap-2 bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Masukkan ID Pelanggan (CUST-2026-001) atau No. WhatsApp (0812...)"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow transition"
          >
            Cari Tagihan
          </button>
        </div>
      </form>

      {/* Customer Result Info Card */}
      {searchedCustomer && (
        <div className="space-y-4">
          {/* Status Alert Banner */}
          {searchedCustomer.status === 'isolated' && (
            <div className="bg-rose-950/40 border border-rose-500/50 rounded-2xl p-4 sm:p-5 text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm sm:text-base text-rose-100">
                    Akses Internet Anda Ter-Isolir (Jatuh Tempo)
                  </h4>
                  <p className="text-xs text-rose-300/90 mt-0.5">
                    Masa aktif berakhir pada <b>{searchedCustomer.expiredDate}</b>. Segera lunasi tagihan bulan berjalan untuk mengaktifkan kembali koneksi dalam 5 detik.
                  </p>
                </div>
              </div>

              {unpaidInvoice && (
                <button
                  onClick={() => handleOpenPay(unpaidInvoice)}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition shrink-0"
                >
                  Bayar & Buka Isolir
                </button>
              )}
            </div>
          )}

          {searchedCustomer.status === 'expiring' && (
            <div className="bg-amber-950/40 border border-amber-500/50 rounded-2xl p-4 text-amber-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <p className="text-xs">
                  Tagihan Anda akan jatuh tempo pada <b>{searchedCustomer.expiredDate}</b>. Bayar lebih awal agar internet tidak terputus.
                </p>
              </div>
              {unpaidInvoice && (
                <button
                  onClick={() => handleOpenPay(unpaidInvoice)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition shrink-0"
                >
                  Bayar Sekarang
                </button>
              )}
            </div>
          )}

          {searchedCustomer.status === 'active' && (
            <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-2xl p-4 text-emerald-200 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="text-xs">
                Koneksi internet Anda berstatus <b>AKTIF NORMAL</b>. Masa aktif hingga <b>{searchedCustomer.expiredDate}</b>.
              </p>
            </div>
          )}

          {/* Details Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-2">
              <div>
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                  Data Pelanggan Terverifikasi
                </span>
                <h3 className="text-lg font-black text-white mt-0.5">{searchedCustomer.name}</h3>
                <p className="text-xs text-slate-400 font-mono">
                  {searchedCustomer.customerId} • PPPoE User: {searchedCustomer.pppoeUsername}
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-400">Paket Internet:</span>
                <div className="text-base font-bold text-white">{searchedCustomer.profileName}</div>
                <div className="text-xs font-mono text-emerald-400">{searchedCustomer.bandwidthLimit}</div>
              </div>
            </div>

            {/* Invoices List */}
            <div className="mt-5">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                Rincian Tagihan
              </h4>

              {customerInvoices.length === 0 ? (
                <p className="text-xs text-slate-500">Tidak ada riwayat tagihan.</p>
              ) : (
                <div className="space-y-3">
                  {customerInvoices.map(inv => {
                    const isPaid = inv.status === 'paid';

                    return (
                      <div
                        key={inv.id}
                        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isPaid
                            ? 'bg-slate-950/80 border-slate-800'
                            : 'bg-indigo-950/30 border-indigo-500/40'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-white text-xs">#{inv.invoiceNumber}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                isPaid
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {isPaid ? 'Lunas' : 'Belum Lunas'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            Periode: {inv.periodMonth} • Jatuh Tempo: {inv.dueDate}
                          </p>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block">Total</span>
                            <span className="text-base font-black text-white font-mono">
                              Rp {inv.totalAmount.toLocaleString('id-ID')}
                            </span>
                          </div>

                          {!isPaid ? (
                            <button
                              onClick={() => handleOpenPay(inv)}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition"
                            >
                              Bayar Tagihan
                            </button>
                          ) : (
                            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Terbayar
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal for Customer */}
      {isPayModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md text-white shadow-2xl p-6 text-center">
            {!paySuccess ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Pembayaran Tagihan PPPoE
                  </span>
                  <span className="text-xs font-mono text-emerald-400 font-bold">
                    #{selectedInvoice.invoiceNumber}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-white">{selectedInvoice.customerName}</h3>
                  <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                    Rp {selectedInvoice.totalAmount.toLocaleString('id-ID')}
                  </div>
                </div>

                {/* QRIS presentation */}
                <div className="bg-white p-4 rounded-2xl inline-block shadow-inner">
                  <QrCode
                    value={`00020101021226600016ID.CO.NETFLOW.INV011893600918${selectedInvoice.id}520459995802ID5914NETFLOW_ISP6007JAKARTA61051219062070703A016304`}
                    size={170}
                    className="mx-auto"
                  />
                  <div className="text-[9px] text-slate-600 font-mono mt-2">
                    BCA Mobile, Livin Mandiri, GoPay, OVO, Dana
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-left font-mono">
                  <span className="text-slate-400 block text-[10px]">Atau Transfer Virtual Account BCA:</span>
                  <span className="text-sm font-bold text-indigo-400">
                    88019{selectedInvoice.customerPhone.slice(-6)}
                  </span>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={handleSimulatePayment}
                    disabled={isPaying}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className={`w-4 h-4 ${isPaying ? 'animate-spin' : ''}`} />
                    <span>{isPaying ? 'Memverifikasi Pembayaran...' : 'Saya Sudah Bayar (Cek Otomatis)'}</span>
                  </button>

                  <button
                    onClick={() => setIsPayModalOpen(false)}
                    className="w-full py-2 text-xs text-slate-400 hover:text-white"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-14 h-14 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400 mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div>
                  <h3 className="text-xl font-black text-white">Pembayaran Sukses!</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Masa aktif internet Anda telah diperpanjang 30 hari ke depan dan status isolir otomatis dibuka di router MikroTik.
                  </p>
                </div>

                <button
                  onClick={() => setIsPayModalOpen(false)}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow transition mt-4"
                >
                  Selesai
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
