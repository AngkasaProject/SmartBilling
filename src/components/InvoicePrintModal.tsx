import React from 'react';
import { Invoice, Customer, AppSettings } from '../types';
import { X, Printer, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface Props {
  invoice: Invoice;
  customer?: Customer;
  settings: AppSettings;
  onClose: () => void;
}

export const InvoicePrintModal: React.FC<Props> = ({ invoice, customer, settings, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  const isPaid = invoice.status === 'paid';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative my-8">
        {/* Top Control Bar (Hidden during print) */}
        <div className="no-print bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Invoice #{invoice.invoiceNumber}</span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                isPaid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {isPaid ? 'Lunas' : 'Belum Lunas'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Sheet */}
        <div className="p-8 font-sans">
          {/* Header */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-6 mb-6">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
                  {(settings.brandName || settings.appName || 'S').charAt(0)}
                </div>
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{settings.brandName || settings.appName}</h1>
                  {settings.companyName && <p className="text-[11px] text-slate-500">{settings.companyName}</p>}
                </div>
              </div>
              {(settings.officeAddress || settings.phoneContact || settings.emailContact) && (
                <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                  {settings.officeAddress && <>{settings.officeAddress}<br /></>}
                  {[settings.phoneContact, settings.emailContact].filter(Boolean).join(' | ')}
                </p>
              )}
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-indigo-600 tracking-wider uppercase">Tagihan Pelanggan</span>
              <p className="text-2xl font-black text-slate-900 mt-0.5">#{invoice.invoiceNumber}</p>
              <p className="text-xs font-semibold text-rose-600">Jatuh Tempo: {invoice.dueDate}</p>
            </div>
          </div>

          {/* Customer & Info Grid */}
          <div className="grid grid-cols-2 gap-6 bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100">
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ditagihkan Kepada</p>
              <p className="text-base font-bold text-slate-900 mt-1">{invoice.customerName}</p>
              <p className="text-xs text-slate-600 mt-0.5">{invoice.customerPhone}</p>
              {customer?.address && (
                <p className="text-xs text-slate-500 mt-1">{customer.address}</p>
              )}
              {customer?.pppoeUsername && (
                <p className="text-[11px] font-mono text-slate-500 mt-1">
                  PPPoE User: <span className="font-semibold text-slate-800">{customer.pppoeUsername}</span>
                </p>
              )}
            </div>

            <div className="text-right">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status Pembayaran</p>
              <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-bold">
                {isPaid ? (
                  <span className="bg-emerald-100 text-emerald-800 flex items-center gap-1 px-3 py-1 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> LUNAS DICATAT OPERATOR
                  </span>
                ) : invoice.status === 'canceled' ? (
                  <span className="bg-slate-200 text-slate-700 flex items-center gap-1 px-3 py-1 rounded-full">
                    <AlertTriangle className="w-3.5 h-3.5" /> TAGIHAN DIBATALKAN
                  </span>
                ) : invoice.status === 'expired' ? (
                  <span className="bg-rose-100 text-rose-800 flex items-center gap-1 px-3 py-1 rounded-full">
                    <AlertTriangle className="w-3.5 h-3.5" /> LEWAT JATUH TEMPO
                  </span>
                ) : (
                  <span className="bg-amber-100 text-amber-800 flex items-center gap-1 px-3 py-1 rounded-full">
                    <Clock className="w-3.5 h-3.5" /> MENUNGGU PEMBAYARAN
                  </span>
                )}
              </div>
              {invoice.paidAt && (
                <p className="text-[11px] text-slate-500 mt-2">
                  Dibayar pada: <span className="font-semibold text-slate-700">{invoice.paidAt}</span>
                  <br />
                  Metode: <span className="font-semibold">{invoice.paymentMethod || 'Tidak tercatat'}</span>
                </p>
              )}
            </div>
          </div>

          {/* Table of items */}
          <table className="w-full text-left mb-6">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                <th className="pb-3">Deskripsi Layanan</th>
                <th className="pb-3 text-center">Periode</th>
                <th className="pb-3 text-right">Biaya Langganan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              <tr>
                <td className="py-4 font-semibold text-slate-800">
                  {invoice.profileName}
                  <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                    Layanan berlangganan
                  </div>
                </td>
                <td className="py-4 text-center text-slate-600">{invoice.periodMonth}</td>
                <td className="py-4 text-right font-medium text-slate-900">
                  Rp {invoice.amount.toLocaleString('id-ID')}
                </td>
              </tr>
              {invoice.uniqueCode > 0 && (
                <tr>
                  <td className="py-2.5 text-slate-500" colSpan={2}>
                    Kode Verifikasi Unik Pembayaran Otomatis
                  </td>
                  <td className="py-2.5 text-right font-mono text-slate-600">
                    Rp {invoice.uniqueCode.toLocaleString('id-ID')}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900 text-sm">
                <th colSpan={2} className="pt-4 font-bold text-slate-900">Total Pembayaran</th>
                <th className="pt-4 text-right font-extrabold text-indigo-700 text-lg">
                  Rp {invoice.totalAmount.toLocaleString('id-ID')}
                </th>
              </tr>
            </tfoot>
          </table>

          {/* Payment Instructions if unpaid */}
          {!isPaid ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs mb-6">
              <p className="font-semibold text-slate-800 mb-1.5">Konfirmasi Pembayaran</p>
              <p className="text-slate-600">
                Pembayaran online belum tersedia. Hubungi operator menggunakan kontak yang tercantum di atas untuk mengonfirmasi metode pembayaran.
              </p>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 mb-6 flex items-center justify-between">
              <div>
                <p className="font-bold">Terima Kasih Atas Pembayaran Anda!</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  {invoice.paymentRef ? `Referensi transaksi: ${invoice.paymentRef}` : 'Pembayaran dicatat oleh operator.'}
                </p>
              </div>
              <div className="w-16 h-16 border-2 border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-600 font-extrabold rotate-[-12deg] text-xs uppercase tracking-widest">
                LUNAS
              </div>
            </div>
          )}

          {/* Footer note */}
          <div className="border-t border-slate-200 pt-4 text-center text-[10px] text-slate-400">
            Bukti ini menampilkan data invoice yang tercatat di aplikasi.
          </div>
        </div>
      </div>
    </div>
  );
};
