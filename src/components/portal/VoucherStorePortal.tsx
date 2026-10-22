import React, { useEffect, useState } from 'react';
import { HotspotProfile } from '../../types';
import {
  Wifi,
  Check,
} from 'lucide-react';

interface Props {
  profiles: HotspotProfile[];
  onCheckBilling?: () => void;
}

export const VoucherStorePortal: React.FC<Props> = ({ profiles, onCheckBilling }) => {
  const availableProfiles = profiles.filter(profile =>
    profile.enabled !== false && Boolean(profile.routerId && profile.routerProfileName)
  );
  const [selectedProfile, setSelectedProfile] = useState<HotspotProfile | null>(availableProfiles[0] || null);
  const [manualMethods, setManualMethods] = useState<Array<{ id: string; name: string; serviceName?: string; accountNumber?: string; instructions: string }>>([]);
  const [operatorWhatsapp, setOperatorWhatsapp] = useState('');
  const [automaticAvailable, setAutomaticAvailable] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [paymentMode, setPaymentMode] = useState<'automatic' | 'manual'>('automatic');
  const [manualMethodId, setManualMethodId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [operatorUrl, setOperatorUrl] = useState('');
  const [orderPaymentInstructions, setOrderPaymentInstructions] = useState('');
  const [voucherResult, setVoucherResult] = useState<{ code: string; password: string; validityDuration: string } | null>(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [isOrdering, setIsOrdering] = useState(false);

  useEffect(() => {
    fetch('/api/portal/payment-options')
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        setManualMethods(result.manualMethods || []);
        setOperatorWhatsapp(result.operatorWhatsapp || '');
        setAutomaticAvailable(Boolean(result.automaticAvailable));
        setManualMethodId(result.manualMethods?.[0]?.id || '');
        setPaymentMode(result.automaticAvailable ? 'automatic' : 'manual');
      })
      .catch(fetchError => setCheckoutError(fetchError instanceof Error ? fetchError.message : String(fetchError)));
  }, []);

  useEffect(() => {
    if (!selectedProfile && availableProfiles.length) setSelectedProfile(availableProfiles[0]);
  }, [availableProfiles, selectedProfile]);

  useEffect(() => {
    if (!orderId || !buyerPhone || orderStatus !== 'pending') return;
    const interval = window.setInterval(() => {
      fetch('/api/portal/voucher-orders/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, phone: buyerPhone }),
      }).then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        setOrderStatus(result.status);
        if (result.voucher) setVoucherResult(result.voucher);
      }).catch(fetchError => setCheckoutError(fetchError instanceof Error ? fetchError.message : String(fetchError)));
    }, 5000);
    return () => window.clearInterval(interval);
  }, [orderId, buyerPhone, orderStatus]);

  const handleOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProfile) return;
    setCheckoutError('');
    setIsOrdering(true);
    try {
      const response = await fetch('/api/portal/voucher-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: selectedProfile.id,
          customerName: buyerName,
          phone: buyerPhone,
          email: buyerEmail || undefined,
          paymentMode,
          methodId: paymentMode === 'manual' ? manualMethodId : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setOrderId(result.orderId);
      setOrderStatus(result.status);
      setExpiresAt(result.expiresAt || '');
      setOperatorUrl(result.operatorUrl || '');
      setOrderPaymentInstructions(result.method?.instructions || '');
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      setBuyerName('');
      setBuyerEmail('');
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOrdering(false);
    }
  };

  if (orderId) {
    return (
      <section className="max-w-3xl mx-auto px-4 py-12">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-2xl font-black text-white">Status Pesanan Voucher</h1>
          <p className="mt-2 text-xs text-slate-400">Nomor pesanan: {orderId}</p>
          {orderStatus === 'pending' && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/30 p-4 text-sm text-amber-200">
              Kode bayar: <b className="font-mono">{orderId}</b>. Selesaikan pembayaran melalui metode yang dipilih, lalu hubungi operator untuk konfirmasi. Batas pembayaran: {expiresAt}. Status pesanan diperiksa berkala.
              {orderPaymentInstructions && <p className="mt-3 whitespace-pre-wrap border-t border-amber-500/20 pt-3">{orderPaymentInstructions}</p>}
            </div>
          )}
          {orderStatus === 'pending' && operatorUrl && (
            <a href={operatorUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white">
              Lanjutkan ke WhatsApp Operator
            </a>
          )}
          {orderStatus === 'pending' && !operatorUrl && (
            <p className="mt-3 text-xs text-amber-300">Nomor WhatsApp operator belum dikonfigurasi. Hubungi operator dan berikan kode bayar di atas.</p>
          )}
          {orderStatus === 'settlement' && voucherResult && (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-emerald-100">
              <p className="font-bold">Pembayaran disetujui. Voucher aktif pada MikroTik.</p>
              <p className="mt-3 font-mono">Username: {voucherResult.code}</p>
              <p className="font-mono">Password: {voucherResult.password}</p>
              <p className="mt-1 text-xs">Masa penggunaan: {voucherResult.validityDuration}</p>
            </div>
          )}
          {(orderStatus === 'expired' || orderStatus === 'canceled') && (
            <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-sm text-rose-200">Pesanan telah kedaluwarsa atau dibatalkan. Silakan buat pesanan baru.</p>
          )}
          {checkoutError && <p role="alert" className="mt-4 text-xs text-rose-300">{checkoutError}</p>}
          <button type="button" onClick={() => { setOrderId(''); setOrderStatus(''); setVoucherResult(null); }} className="mt-5 rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white">
            Kembali ke Paket
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-4 px-2 sm:px-4">
      {/* Top Banner */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold mb-3 shadow-sm">
          <Wifi className="w-3.5 h-3.5" />
          <span>Profil Hotspot</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          Paket Hotspot Tersedia
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm mt-2 max-w-xl mx-auto">
          Lihat profil hotspot yang saat ini dikonfigurasi operator.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Step 1: Packages Selection (2 cols) */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">1</span>
                <span>Pilih Profil Hotspot</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {availableProfiles.length === 0 && (
                <p className="sm:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">
                  Belum ada profil hotspot yang dikonfigurasi.
                </p>
              )}
              {availableProfiles.map(p => {
                const isSelected = selectedProfile?.id === p.id;

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProfile(p)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all relative overflow-hidden flex flex-col justify-between ${
                    isSelected
                      ? 'bg-gradient-to-br from-indigo-900/40 via-slate-900 to-slate-900 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow">
                      <Check className="w-3 h-3" />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold">
                        {p.validityDuration}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-semibold font-mono">
                        {p.speedLimit}
                      </span>
                    </div>

                    <h4 className="text-base font-black text-white mt-2">{p.name}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Profil layanan hotspot
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Harga:</span>
                    <span className="text-lg font-black text-emerald-400">
                      Rp {p.price.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Step 2 & 3: Checkout Card (1 col) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl relative">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">2</span>
            <span>Konfirmasi & Pembayaran</span>
          </h3>

          <div className="space-y-4 text-xs">
            {/* Selected package recap */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Paket Terpilih</span>
              <div className="font-extrabold text-white text-sm mt-0.5">{selectedProfile?.name || 'Belum ada profil'}</div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-800 font-mono">
                <span className="text-slate-400">Total Bayar:</span>
                <span className="text-base font-black text-emerald-400">
                  {selectedProfile ? `Rp ${selectedProfile.price.toLocaleString('id-ID')}` : '—'}
                </span>
              </div>
            </div>

            {selectedProfile && (
              <form onSubmit={handleOrder} className="space-y-3">
                <label className="block text-xs text-slate-300">Nama
                  <input required maxLength={100} value={buyerName} onChange={event => setBuyerName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
                </label>
                <label className="block text-xs text-slate-300">Nomor WhatsApp untuk menerima voucher
                  <input required type="tel" maxLength={32} value={buyerPhone} onChange={event => setBuyerPhone(event.target.value)} placeholder="08..." className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
                </label>
                <label className="block text-xs text-slate-300">Email (opsional)
                  <input type="email" maxLength={254} value={buyerEmail} onChange={event => setBuyerEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
                </label>
                {automaticAvailable && manualMethods.length > 0 && (
                  <label className="block text-xs text-slate-300">Metode pembayaran
                    <select value={paymentMode} onChange={event => setPaymentMode(event.target.value as 'automatic' | 'manual')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                      <option value="automatic">Otomatis (Midtrans)</option>
                      <option value="manual">Manual, diverifikasi admin</option>
                    </select>
                  </label>
                )}
                {paymentMode === 'manual' && manualMethods.length > 0 && (
                  <>
                    <label className="block text-xs text-slate-300">Transfer ke
                      <select value={manualMethodId} onChange={event => setManualMethodId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                        {manualMethods.map(method => <option key={method.id} value={method.id}>{method.name}</option>)}
                      </select>
                    </label>
                    <p className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-300">
                      {(() => {
                        const method = manualMethods.find(item => item.id === manualMethodId);
                        return [method?.serviceName, method?.accountNumber, method?.instructions].filter(Boolean).join('\n');
                      })()}
                    </p>
                  </>
                )}
                {checkoutError && <p role="alert" className="text-[11px] text-rose-300">{checkoutError}</p>}
                <button type="submit" disabled={isOrdering || (paymentMode === 'manual' && !manualMethodId) || (!automaticAvailable && !manualMethods.length)} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
                  {isOrdering ? 'Membuat pesanan...' : paymentMode === 'automatic' ? 'Pesan & Bayar Otomatis' : 'Buat Kode Bayar & Hubungi Operator'}
                </button>
                {!automaticAvailable && manualMethods.length === 0 && <p className="text-[11px] text-amber-300">Pembayaran belum dikonfigurasi operator.</p>}
              </form>
            )}
            {onCheckBilling ? (
              <button
                type="button"
                onClick={onCheckBilling}
                className="block text-center w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 font-bold text-slate-200 rounded-xl text-sm"
              >
                Cek Tagihan
              </button>
            ) : (
              <a href="/portal/billing" className="block text-center w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 font-bold text-slate-200 rounded-xl text-sm">
                Cek Tagihan
              </a>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};
