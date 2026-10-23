import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';

interface PublicCustomer {
  id: string;
  customerId: string;
  name: string;
  profileName: string;
  bandwidthLimit: string;
  monthlyFee: number;
  expiredDate: string;
  status: 'active' | 'expiring' | 'isolated' | 'disabled';
}

interface PublicInvoice {
  id: string;
  invoiceNumber: string;
  profileName: string;
  periodMonth: string;
  amount: number;
  uniqueCode: number;
  totalAmount: number;
  status: string;
  dueDate: string;
  paidAt?: string;
  paymentMethod?: string;
}

interface CustomerBillPortalProps {
  showNavigation?: boolean;
  onBack?: () => void;
}

interface ManualPaymentOption {
  id: string;
  name: string;
  accountHolder?: string;
  serviceName?: string;
  accountNumber?: string;
  instructions: string;
}

export const CustomerBillPortal: React.FC<CustomerBillPortalProps> = ({ showNavigation = true, onBack }) => {
  const [lookupValue, setLookupValue] = useState('');
  const [portalToken] = useState(new URLSearchParams(window.location.search).get('token') || '');
  const [customer, setCustomer] = useState<PublicCustomer | null>(null);
  const [invoices, setInvoices] = useState<PublicInvoice[]>([]);
  const [paymentAvailable, setPaymentAvailable] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState('');
  const [manualPaymentOptions, setManualPaymentOptions] = useState<ManualPaymentOption[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<PublicInvoice | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [operatorWhatsapp, setOperatorWhatsapp] = useState('');
  const [operatorUrl, setOperatorUrl] = useState('');
  const [paymentOrderCode, setPaymentOrderCode] = useState('');
  const [payingInvoiceId, setPayingInvoiceId] = useState('');
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [notice, setNotice] = useState(
    new URLSearchParams(window.location.search).get('payment') === 'complete'
      ? 'Anda kembali dari halaman pembayaran. Cek status langganan kembali untuk memperbarui status tagihan setelah Midtrans mengirim konfirmasi.'
      : ''
  );

  useEffect(() => {
    fetch('/api/portal/payment-options')
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        setManualPaymentOptions(result.manualMethods || []);
        setPaymentAvailable(Boolean(result.automaticAvailable));
        setPaymentProvider(typeof result.provider === 'string' ? result.provider : '');
        setOperatorWhatsapp(result.operatorWhatsapp || '');
      })
      .catch(optionError => setError(optionError instanceof Error ? optionError.message : String(optionError)));
  }, []);

  useEffect(() => {
    if (!portalToken) return;
    fetch('/api/portal/billing-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: portalToken }),
    }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setCustomer(result.customer);
      setInvoices(result.invoices);
      setPaymentAvailable(Boolean(result.paymentAvailable));
    }).catch(linkError => setError(linkError instanceof Error ? linkError.message : String(linkError)));
  }, [portalToken]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setCustomer(null);
    setInvoices([]);
    setPaymentAvailable(false);
    setError('');
    setNotice('');
    if (!lookupValue.trim()) {
      setError('Masukkan ID pelanggan atau nomor terdaftar.');
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch('/api/portal/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookupValue: lookupValue.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setCustomer(result.customer);
      setInvoices(result.invoices);
      setPaymentAvailable(Boolean(result.paymentAvailable));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : String(searchError));
    } finally {
      setIsSearching(false);
    }
  };

  const handlePayInvoice = async (paymentMode: 'automatic' | 'manual') => {
    if (!selectedInvoice) return;
    setError('');
    setNotice('');
    setPayingInvoiceId(selectedInvoice.id);
    try {
      const response = await fetch('/api/portal/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(portalToken ? { portalToken } : { lookupValue }),
          invoiceId: selectedInvoice.id,
          paymentMode,
          ...(paymentMode === 'manual' ? { methodId: selectedPaymentMethod } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      if (paymentMode === 'automatic') {
        if (typeof result.redirectUrl !== 'string') throw new Error('URL checkout tidak diberikan oleh server pembayaran');
        window.location.assign(result.redirectUrl);
      } else {
        setNotice(result.message || 'Kode bayar dibuat. Hubungi operator untuk konfirmasi pembayaran.');
        setPaymentOrderCode(result.paymentCode || result.orderId || '');
        setOperatorUrl(result.operatorUrl || (operatorWhatsapp
          ? `https://wa.me/${operatorWhatsapp}?text=${encodeURIComponent(`Halo operator, saya ingin konfirmasi pembayaran invoice ${selectedInvoice.invoiceNumber}.`)}`
          : ''));
        setSelectedInvoice(null);
        setSelectedPaymentMethod('');
      }
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : String(paymentError));
    } finally {
      setPayingInvoiceId('');
    }
  };

  return (
    <main id="status" className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="max-w-3xl mx-auto">
        {showNavigation && (
          <div className="flex justify-between items-center mb-10">
            <a href="/portal/billing" className="font-extrabold text-white">SmartBilling</a>
            <a href="/" className="text-xs text-indigo-300 hover:text-white">Daftar Paket</a>
          </div>
        )}
        <div className="text-center mb-7">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mb-5 px-4 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-sm font-bold text-slate-200"
            >
              Kembali ke Menu Paket
            </button>
          )}
          <h1 className="text-2xl sm:text-3xl font-black">Cek Status Langganan</h1>
          <p className="text-slate-400 text-sm mt-2">
            {portalToken
              ? 'Tautan pembayaran khusus pelanggan. Periksa tagihan di bawah dan pilih metode pembayaran.'
              : 'Masukkan ID pelanggan atau nomor terdaftar untuk melihat paket serta tagihan.'}
          </p>
        </div>

        {!portalToken && (
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-xl">
            <input
              type="text"
              value={lookupValue}
              onChange={event => setLookupValue(event.target.value)}
              placeholder="Masukan id pelanggan / nomer terdaftar"
              autoComplete="off"
              className="w-full flex-1 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button type="submit" disabled={isSearching} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl">
              {isSearching ? 'Memeriksa...' : 'Cek Status'}
            </button>
          </form>
        )}

        {notice && <p role="status" className="mt-4 p-3 rounded-xl bg-indigo-950/50 border border-indigo-500/30 text-indigo-200 text-sm">{notice}{paymentOrderCode && <><br />Kode bayar: <b className="font-mono">{paymentOrderCode}</b></>}</p>}
        {operatorUrl && <a href={operatorUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">Lanjutkan ke WhatsApp Operator</a>}
        {error && <p role="alert" className="mt-4 p-3 rounded-xl bg-rose-950/50 border border-rose-500/30 text-rose-200 text-sm">{error}</p>}

        {customer && (
          <section className="mt-6 space-y-4">
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${
              customer.status === 'isolated' || customer.status === 'disabled'
                ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                : customer.status === 'expiring'
                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                  : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
            }`}>
              {customer.status === 'isolated' || customer.status === 'disabled' ? <ShieldAlert className="w-5 h-5 shrink-0" /> :
                customer.status === 'expiring' ? <AlertCircle className="w-5 h-5 shrink-0" /> :
                  <CheckCircle2 className="w-5 h-5 shrink-0" />}
              <div>
                <h2 className="font-bold">
                  {customer.status === 'isolated' || customer.status === 'disabled'
                    ? 'Layanan dinonaktifkan'
                    : customer.status === 'expiring'
                      ? 'Masa aktif segera berakhir'
                      : 'Status layanan'}
                </h2>
                <p className="text-xs mt-1">
                  Masa aktif: {customer.expiredDate}.
                  {customer.status === 'active'
                    ? ' Layanan Anda aktif.'
                    : ' Tagihan dan pilihan pembayaran tersedia di bawah.'}
                </p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="pb-4 border-b border-slate-800">
                <p className="text-xs text-slate-400">Pelanggan</p>
                <h2 className="text-lg font-black mt-1">{customer.name}</h2>
                <p className="text-xs text-slate-400 mt-1">{customer.customerId} · {customer.profileName} · {customer.bandwidthLimit}</p>
                <p className="text-xs text-slate-400 mt-1">Biaya paket: Rp {customer.monthlyFee.toLocaleString('id-ID')} / bulan</p>
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-300 mt-5 mb-3">Riwayat Tagihan</h3>
              {invoices.length === 0 ? <p className="text-sm text-slate-400">Belum ada tagihan tercatat.</p> : (
                <div className="space-y-3">
                  {invoices.map(invoice => (
                    <div key={invoice.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="font-mono font-bold text-sm">#{invoice.invoiceNumber}</p>
                        <p className="text-xs text-slate-400 mt-1">{invoice.periodMonth} · Jatuh tempo {invoice.dueDate}</p>
                        <p className={`text-xs mt-1 ${invoice.status === 'paid' ? 'text-emerald-400' : invoice.status === 'unpaid' ? 'text-amber-300' : 'text-slate-400'}`}>
                          {invoice.status === 'paid'
                            ? `Lunas${invoice.paidAt ? ` pada ${invoice.paidAt}` : ''}`
                            : invoice.status === 'unpaid'
                              ? 'Belum lunas'
                              : 'Tidak dapat dibayar'}
                        </p>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        <p className="font-mono font-bold">Rp {invoice.totalAmount.toLocaleString('id-ID')}</p>
                        {invoice.status === 'unpaid' && (paymentAvailable || manualPaymentOptions.length > 0) && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setError('');
                              setOperatorUrl('');
                              setSelectedPaymentMethod(manualPaymentOptions[0]?.id || '');
                            }}
                            disabled={Boolean(payingInvoiceId)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg"
                          >
                            Bayar Tagihan
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {customer.status === 'active' && !invoices.some(invoice => invoice.status === 'unpaid')
                ? <p className="mt-4 text-xs text-emerald-300">Layanan masih aktif. Pilihan pembayaran akan tersedia saat masa aktif segera berakhir atau layanan dinonaktifkan.</p>
                : paymentAvailable || manualPaymentOptions.length > 0
                ? <p className="mt-4 text-xs text-slate-500">Invoice yang belum lunas dapat dibayar sekarang, termasuk sebelum masa aktif berakhir. Pembayaran manual menunggu verifikasi admin.</p>
                : <p className="mt-4 text-xs text-amber-300">Metode pembayaran belum dikonfigurasi oleh operator. Hubungi operator.</p>}
              <p className="mt-2 text-xs text-slate-500">Jangan membagikan ID pelanggan atau nomor terdaftar kepada pihak lain.</p>
            </div>
          </section>
        )}

        {selectedInvoice && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
            <section className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-white">Pembayaran Tagihan</h2>
                  <p className="mt-1 text-xs text-slate-400">#{selectedInvoice.invoiceNumber} · Rp {selectedInvoice.totalAmount.toLocaleString('id-ID')}</p>
                </div>
                <button type="button" onClick={() => setSelectedInvoice(null)} className="text-slate-400 hover:text-white">Tutup</button>
              </div>
              {paymentAvailable && (
                <button
                  type="button"
                  disabled={Boolean(payingInvoiceId)}
                  onClick={() => void handlePayInvoice('automatic')}
                  className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {payingInvoiceId ? 'Menyiapkan checkout...' : `Bayar otomatis dengan ${paymentProvider ? paymentProvider.toUpperCase() : 'gateway'}`}
                </button>
              )}
              {manualPaymentOptions.length > 0 && (
                <div className="mt-5 space-y-3 border-t border-slate-800 pt-4">
                  <label className="block text-xs text-slate-300">Pembayaran manual
                    <select value={selectedPaymentMethod} onChange={event => setSelectedPaymentMethod(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                      {manualPaymentOptions.map(method => <option key={method.id} value={method.id}>{method.name}</option>)}
                    </select>
                  </label>
                  <p className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                    {(() => {
                      const method = manualPaymentOptions.find(item => item.id === selectedPaymentMethod);
                      return [
                        method?.name,
                        method?.accountNumber,
                        method?.accountHolder || method?.serviceName ? `Atas nama: ${method.accountHolder || method.serviceName}` : '',
                        method?.instructions,
                      ].filter(Boolean).join('\n');
                    })()}
                  </p>
                  <button
                    type="button"
                    disabled={Boolean(payingInvoiceId) || !selectedPaymentMethod}
                    onClick={() => void handlePayInvoice('manual')}
                    className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {payingInvoiceId ? 'Membuat kode bayar...' : 'Selesaikan & Hubungi Operator'}
                  </button>
                </div>
              )}
              {!paymentAvailable && manualPaymentOptions.length === 0 && (
                <p className="mt-5 text-sm text-amber-300">Pembayaran belum dikonfigurasi operator.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
};
