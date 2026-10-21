import React, { useState, useEffect } from 'react';
import { HotspotProfile, Voucher, PaymentTransaction } from '../../types';
import { StorageService } from '../../services/storage';
import { QrCode } from '../common/QrCode';
import {
  Wifi,
  Ticket,
  QrCode as QrIcon,
  CreditCard,
  Phone,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
  ArrowRight,
  ShieldCheck,
  Copy,
  Check,
  Send,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

interface Props {
  profiles: HotspotProfile[];
  onVoucherPurchased: () => void;
  onNavigateToLogin: (voucherCode?: string) => void;
}

export const VoucherStorePortal: React.FC<Props> = ({
  profiles,
  onVoucherPurchased,
  onNavigateToLogin,
}) => {
  const [selectedProfile, setSelectedProfile] = useState<HotspotProfile>(profiles[1] || profiles[0]);
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'qris' | 'va_bca' | 'va_mandiri' | 'gopay'>('qris');
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [purchasedVoucher, setPurchasedVoucher] = useState<Voucher | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(899); // 14:59

  // Payment Countdown
  useEffect(() => {
    if (!isCheckoutModalOpen || purchasedVoucher) return;
    const interval = setInterval(() => {
      setCountdownSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isCheckoutModalOpen, purchasedVoucher]);

  const handleStartCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 9) {
      alert('Silakan masukkan nomor WhatsApp yang valid (contoh: 081234567890)');
      return;
    }
    setCountdownSeconds(899);
    setPurchasedVoucher(null);
    setIsCheckoutModalOpen(true);
  };

  const handleSimulatePaySuccess = () => {
    setIsVerifyingPayment(true);
    setTimeout(() => {
      const channelLabel =
        paymentMethod === 'qris'
          ? 'QRIS Instant'
          : paymentMethod === 'va_bca'
          ? 'BCA Virtual Account'
          : paymentMethod === 'va_mandiri'
          ? 'Mandiri Virtual Account'
          : 'GoPay Direct';

      const result = StorageService.purchaseVoucherOnline({
        profileId: selectedProfile.id,
        phone: phone,
        paymentMethod: 'Online Gateway',
        paymentChannel: channelLabel,
      });

      setIsVerifyingPayment(false);
      setPurchasedVoucher(result.voucher);
      onVoucherPurchased();
    }, 1000);
  };

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleCopyVoucher = () => {
    if (!purchasedVoucher) return;
    navigator.clipboard.writeText(purchasedVoucher.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto py-4 px-2 sm:px-4">
      {/* Top Banner */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold mb-3 shadow-sm">
          <Wifi className="w-3.5 h-3.5" />
          <span>Hotspot WiFi High Speed Unlimited</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          Beli Voucher WiFi Online Mandiri
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm mt-2 max-w-xl mx-auto">
          Pilih paket voucher internet, bayar praktis via QRIS (BCA, Mandiri, Dana, GoPay, OVO), dan kode voucher langsung aktif seketika!
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Step 1: Packages Selection (2 cols) */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">1</span>
              <span>Pilih Paket Kecepatan & Durasi</span>
            </h3>
            <span className="text-xs text-slate-500">Aktif langsung tanpa registrasi KTP</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {profiles.map(p => {
              const isSelected = selectedProfile.id === p.id;

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
                      Internet Unlimited tanpa FUP • Streaming & Gaming Lancar
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

          {/* Guarantee pill */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 flex items-center gap-3 text-xs text-slate-400">
            <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
            <span>
              Kode voucher dikirim langsung ke layar Anda dan dicadangkan ke WhatsApp. Jika ada kendala, hubungi NOC di <b>0812-8899-0011</b>.
            </span>
          </div>
        </div>

        {/* Step 2 & 3: Checkout Card (1 col) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl relative">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">2</span>
            <span>Konfirmasi & Pembayaran</span>
          </h3>

          <form onSubmit={handleStartCheckout} className="space-y-4 text-xs">
            {/* Selected package recap */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Paket Terpilih</span>
              <div className="font-extrabold text-white text-sm mt-0.5">{selectedProfile.name}</div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-800 font-mono">
                <span className="text-slate-400">Total Bayar:</span>
                <span className="text-base font-black text-emerald-400">
                  Rp {selectedProfile.price.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* WhatsApp number */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Nomor WhatsApp Anda *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  placeholder="081234567890"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Struk voucher akan dikirim via WhatsApp otomatis
              </span>
            </div>

            {/* Payment method selector */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">
                Metode Pembayaran
              </label>
              <div className="space-y-2">
                {[
                  { id: 'qris', name: 'QRIS Instant (Semua Bank & E-Wallet)', badge: 'Paling Cepat' },
                  { id: 'va_bca', name: 'BCA Virtual Account', badge: 'Instan' },
                  { id: 'va_mandiri', name: 'Mandiri Virtual Account', badge: 'Instan' },
                  { id: 'gopay', name: 'GoPay / ShopeePay', badge: 'DeepLink' },
                ].map(m => (
                  <label
                    key={m.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                      paymentMethod === m.id
                        ? 'bg-indigo-600/10 border-indigo-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="payMethod"
                        checked={paymentMethod === m.id}
                        onChange={() => setPaymentMethod(m.id as any)}
                        className="text-indigo-600"
                      />
                      <span className="text-xs font-medium">{m.name}</span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold">
                      {m.badge}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-bold text-white rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 text-sm mt-2"
            >
              <span>Lanjut Bayar Sekarang</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Interactive Payment & QRIS Modal */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md text-white shadow-2xl p-6 relative">
            {!purchasedVoucher ? (
              /* Payment Pending Screen */
              <div className="text-center space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Menunggu Pembayaran</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-mono text-amber-400 font-bold">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatCountdown(countdownSeconds)}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-black text-white">{selectedProfile.name}</h3>
                  <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                    Rp {selectedProfile.price.toLocaleString('id-ID')}
                  </div>
                </div>

                {/* QRIS / VA Presentation */}
                {paymentMethod === 'qris' ? (
                  <div className="bg-white p-4 rounded-2xl inline-block shadow-inner">
                    <div className="text-[10px] text-slate-800 font-bold uppercase tracking-wider mb-1.5 flex items-center justify-center gap-1">
                      <span>QRIS STANDAR PEMBAYARAN NASIONAL</span>
                    </div>
                    <QrCode
                      value={`00020101021226600016ID.CO.NETFLOW.WWW011893600918${Date.now()}520459995802ID5914NETFLOW_WIFI6007JAKARTA61051219062070703A016304`}
                      size={180}
                      className="mx-auto"
                    />
                    <div className="text-[9px] text-slate-500 font-mono mt-2">
                      Scan via BCA, Mandiri, GoPay, OVO, Dana, ShopeePay
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-left font-mono text-xs">
                    <div className="text-slate-400">Nomor Virtual Account:</div>
                    <div className="text-lg font-bold text-indigo-400 tracking-wider my-1">
                      88019{phone.slice(-6) || '928371'}
                    </div>
                    <div className="text-[10px] text-slate-500">Nama Akun: NETFLOW WIFI HOTSPOT</div>
                  </div>
                )}

                {/* Action button to simulate real webhook verification */}
                <div className="pt-2 space-y-2">
                  <button
                    onClick={handleSimulatePaySuccess}
                    disabled={isVerifyingPayment}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className={`w-4 h-4 ${isVerifyingPayment ? 'animate-spin' : ''}`} />
                    <span>
                      {isVerifyingPayment ? 'Memverifikasi Pembayaran Otomatis...' : 'Saya Sudah Bayar (Cek Otomatis)'}
                    </span>
                  </button>

                  <button
                    onClick={() => setIsCheckoutModalOpen(false)}
                    className="w-full py-2 text-xs text-slate-400 hover:text-white"
                  >
                    Batal Pembelian
                  </button>
                </div>
              </div>
            ) : (
              /* Success / Voucher Revealed Screen */
              <div className="text-center space-y-4">
                <div className="w-14 h-14 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400 mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Pembayaran Berhasil!
                  </span>
                  <h3 className="text-xl font-black text-white mt-0.5">Voucher WiFi Hotspot Anda</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Struk dan kode voucher juga telah dikirim ke WhatsApp {phone}
                  </p>
                </div>

                {/* Big Voucher Code */}
                <div className="bg-slate-950 p-4 rounded-2xl border-2 border-dashed border-indigo-500/40 relative">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Kode Voucher Hotspot
                  </span>
                  <div className="text-2xl font-black font-mono tracking-widest text-indigo-300 my-2">
                    {purchasedVoucher.code}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Paket: {purchasedVoucher.profileName} ({purchasedVoucher.validityDuration})
                  </div>

                  <button
                    onClick={handleCopyVoucher}
                    className="mt-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 inline-flex items-center gap-1.5"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'Kode Tersalin!' : 'Salin Kode Voucher'}</span>
                  </button>
                </div>

                {/* Instant Login action */}
                <div className="pt-2 space-y-2">
                  <button
                    onClick={() => {
                      setIsCheckoutModalOpen(false);
                      onNavigateToLogin(purchasedVoucher.code);
                    }}
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2"
                  >
                    <Wifi className="w-4 h-4" />
                    <span>Langsung Login ke Halaman Hotspot</span>
                  </button>

                  <button
                    onClick={() => setIsCheckoutModalOpen(false)}
                    className="w-full py-2 text-xs text-slate-400 hover:text-white"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
