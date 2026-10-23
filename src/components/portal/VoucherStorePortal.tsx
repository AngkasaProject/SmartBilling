import React, { useEffect, useRef, useState } from "react";
import { HotspotProfile } from "../../types";
import {
  Wifi,
  Check,
  CreditCard,
  ChevronRight,
  Sparkles,
  Clock,
  Zap,
  ExternalLink,
  ShieldCheck,
  XCircle,
  Copy,
  CheckCheck,
  Loader2,
} from "lucide-react";

interface Props {
  profiles: HotspotProfile[];
  onCheckBilling?: () => void;
}

export const VoucherStorePortal: React.FC<Props> = ({
  profiles,
  onCheckBilling,
}) => {
  const availableProfiles = profiles.filter(
    (profile) =>
      profile.enabled !== false &&
      Boolean(profile.routerId && profile.routerProfileName),
  );
  const [selectedProfile, setSelectedProfile] = useState<HotspotProfile | null>(
    availableProfiles[0] || null,
  );
  const [manualMethods, setManualMethods] = useState<
    Array<{
      id: string;
      name: string;
      accountHolder?: string;
      serviceName?: string;
      accountNumber?: string;
      instructions: string;
    }>
  >([]);
  const [operatorWhatsapp, setOperatorWhatsapp] = useState("");
  const [automaticAvailable, setAutomaticAvailable] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [paymentMode, setPaymentMode] = useState<"automatic" | "manual">("manual");
  const [manualMethodId, setManualMethodId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [paymentCode, setPaymentCode] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [operatorUrl, setOperatorUrl] = useState("");
  const [orderPaymentInstructions, setOrderPaymentInstructions] = useState("");
  const [voucherResult, setVoucherResult] = useState<{
    code: string;
    password: string;
    validityDuration: string;
  } | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [isOrdering, setIsOrdering] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [ripples, setRipples] = useState<
    Record<string, { x: number; y: number; id: number }[]>
  >({});
  const checkoutRef = useRef<HTMLDivElement>(null);

  // ... (semua useEffect & handleOrder SAMA PERSIS — tidak diubah) ...

  useEffect(() => {
    fetch("/api/portal/payment-options")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || `HTTP ${response.status}`);
        setManualMethods(result.manualMethods || []);
        setOperatorWhatsapp(result.operatorWhatsapp || "");
        setAutomaticAvailable(Boolean(result.automaticAvailable));
        setManualMethodId(result.manualMethods?.[0]?.id || "");
        setPaymentMode(result.manualMethods?.length ? "manual" : "automatic");
      })
      .catch((fetchError) =>
        setCheckoutError(
          fetchError instanceof Error ? fetchError.message : String(fetchError),
        ),
      );
  }, []);

  useEffect(() => {
    if (!selectedProfile && availableProfiles.length)
      setSelectedProfile(availableProfiles[0]);
  }, [availableProfiles, selectedProfile]);

  useEffect(() => {
    if (!orderId || !buyerPhone || orderStatus !== "pending") return;
    const interval = window.setInterval(() => {
      fetch("/api/portal/voucher-orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, phone: buyerPhone }),
      })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || `HTTP ${response.status}`);
          setOrderStatus(result.status);
          if (result.voucher) setVoucherResult(result.voucher);
        })
        .catch((fetchError) =>
          setCheckoutError(
            fetchError instanceof Error
              ? fetchError.message
              : String(fetchError),
          ),
        );
    }, 5000);
    return () => window.clearInterval(interval);
  }, [orderId, buyerPhone, orderStatus]);

  // Trigger confetti saat settlement
  useEffect(() => {
    if (orderStatus === "settlement") {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [orderStatus]);

  const handleOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProfile) return;
    setCheckoutError("");
    setIsOrdering(true);
    try {
      const response = await fetch("/api/portal/voucher-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: selectedProfile.id,
          customerName: buyerName,
          phone: buyerPhone,
          email: buyerEmail || undefined,
          paymentMode,
          methodId: paymentMode === "manual" ? manualMethodId : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || `HTTP ${response.status}`);
      setOrderId(result.orderId);
      setPaymentCode(result.paymentCode || result.orderId);
      setOrderStatus(result.status);
      setExpiresAt(result.expiresAtFormatted || result.expiresAt || "");
      setOperatorUrl(result.operatorUrl || "");
      setOrderPaymentInstructions([
        result.method?.name,
        result.method?.accountNumber,
        result.method?.accountHolder || result.method?.serviceName
          ? `Atas nama: ${result.method.accountHolder || result.method.serviceName}`
          : '',
        result.method?.instructions,
      ].filter(Boolean).join('\n'));
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      setBuyerName("");
      setBuyerEmail("");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOrdering(false);
    }
  };

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      /* noop */
    }
  };

  const triggerRipple = (
    id: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ripple = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      id: Date.now(),
    };
    setRipples((prev) => ({ ...prev, [id]: [...(prev[id] || []), ripple] }));
    setTimeout(() => {
      setRipples((prev) => ({
        ...prev,
        [id]: (prev[id] || []).filter((r) => r.id !== ripple.id),
      }));
    }, 600);
  };

  const handleSelectProfile = (
    p: HotspotProfile,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    triggerRipple(p.id, event);
    setSelectedProfile(p);
    if (window.innerWidth < 768) {
      setTimeout(
        () =>
          checkoutRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        120,
      );
    }
  };

  // ============= ORDER STATUS =============
  if (orderId) {
    return (
      <section className="max-w-2xl mx-auto px-4 py-12 relative">
        {/* Confetti CSS-only */}
        {showConfetti && (
          <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
            {Array.from({ length: 60 }).map((_, i) => {
              const left = Math.random() * 100;
              const delay = Math.random() * 0.8;
              const duration = 2 + Math.random() * 1.5;
              const colors = [
                "bg-emerald-400",
                "bg-indigo-400",
                "bg-amber-300",
                "bg-violet-400",
                "bg-rose-400",
              ];
              const color = colors[i % colors.length];
              return (
                <span
                  key={i}
                  className={`absolute w-2 h-2 rounded-sm ${color}`}
                  style={{
                    left: `${left}%`,
                    top: "-10px",
                    animation: `confetti-fall ${duration}s ${delay}s linear forwards`,
                    opacity: 0.9,
                  }}
                />
              );
            })}
            <style>{`
              @keyframes confetti-fall {
                0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
              }
            `}</style>
          </div>
        )}

        <div className="animate-[fadeInUp_0.4s_ease-out] rounded-[28px] border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-7 shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-medium mb-2">
                <Sparkles className="w-3 h-3" />
                Status Pesanan
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Voucher Anda
              </h1>
              <p className="mt-1 text-[12.5px] text-slate-400 font-mono break-all">
                {paymentCode || orderId}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400/20 to-indigo-600/5 border border-white/[0.08] flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-indigo-300" strokeWidth={2} />
            </div>
          </div>

          {/* Pending — animated progress ring */}
          {orderStatus === "pending" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] backdrop-blur-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="relative w-9 h-9 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-amber-400/30" />
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-400 animate-spin" />
                    <Clock
                      className="w-4 h-4 text-amber-300 relative"
                      strokeWidth={2.5}
                    />
                  </div>
                  <div>
                    <span className="text-[13px] font-semibold text-amber-200 block">
                      Menunggu Pembayaran
                    </span>
                    <span className="text-[11px] text-amber-300/70">
                      Status diperiksa otomatis setiap 5 detik
                    </span>
                  </div>
                </div>
                <div className="space-y-2 text-[13px] text-amber-100/90 leading-relaxed">
                  <p>
                    Kode bayar:{" "}
                    <button
                      type="button"
                      onClick={() => handleCopy(paymentCode || orderId, "paymentCode")}
                      className="inline-flex items-center gap-1.5 font-mono text-amber-100 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] px-2 py-0.5 rounded-md transition active:scale-95"
                    >
                      {paymentCode || orderId}
                      {copiedField === "paymentCode" ? (
                        <CheckCheck className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 opacity-60" />
                      )}
                    </button>
                  </p>
                  <p>
                    Selesaikan pembayaran melalui metode yang dipilih, lalu
                    hubungi operator untuk konfirmasi.
                  </p>
                  <p className="text-[12px] text-amber-200/70">
                    Batas pembayaran:{" "}
                    <span className="font-mono">{expiresAt}</span>
                  </p>
                </div>
                {orderPaymentInstructions && (
                  <p className="mt-3 whitespace-pre-wrap border-t border-amber-500/20 pt-3 text-[12.5px] text-amber-100/90">
                    {orderPaymentInstructions}
                  </p>
                )}
              </div>

              {operatorUrl ? (
                <a
                  href={operatorUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center justify-center gap-2 w-full rounded-2xl bg-emerald-500 hover:bg-emerald-400 px-4 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-emerald-500/30 transition active:scale-[0.97]"
                >
                  <span>Lanjutkan ke WhatsApp Operator</span>
                  <ExternalLink
                    className="w-4 h-4 group-hover:translate-x-0.5 transition"
                    strokeWidth={2.5}
                  />
                </a>
              ) : (
                <p className="text-[12.5px] text-amber-300 bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl px-4 py-3">
                  Nomor WhatsApp operator belum dikonfigurasi. Hubungi operator
                  dan berikan kode bayar di atas.
                </p>
              )}
            </div>
          )}

          {/* Settlement — voucher reveal */}
          {orderStatus === "settlement" && voucherResult && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] backdrop-blur-xl p-5 animate-[fadeInUp_0.5s_ease-out]">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <ShieldCheck
                      className="w-4 h-4 text-emerald-300"
                      strokeWidth={2.5}
                    />
                  </div>
                  <span className="text-[13px] font-semibold text-emerald-200">
                    Pembayaran Disetujui
                  </span>
                </div>
                <p className="text-[12.5px] text-emerald-100/80 mb-4">
                  Voucher aktif pada MikroTik. Ketuk kode untuk menyalin.
                </p>
                <div className="space-y-2.5">
                  {[
                    {
                      label: "Username",
                      value: voucherResult.code,
                      field: "code",
                    },
                    {
                      label: "Password",
                      value: voucherResult.password,
                      field: "password",
                    },
                  ].map(({ label, value, field }) => (
                    <button
                      key={field}
                      type="button"
                      onClick={() => handleCopy(value, field)}
                      className="w-full text-left rounded-xl bg-slate-950/60 hover:bg-slate-950/90 border border-white/[0.06] hover:border-white/[0.12] px-4 py-3 transition group active:scale-[0.98]"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10.5px] uppercase tracking-wider text-slate-500 font-semibold">
                          {label}
                        </p>
                        {copiedField === field ? (
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition" />
                        )}
                      </div>
                      <p className="font-mono text-[15px] font-bold text-white tracking-wide break-all">
                        {value}
                      </p>
                    </button>
                  ))}
                  <div className="rounded-xl bg-slate-950/60 border border-white/[0.06] px-4 py-3 flex items-center gap-2">
                    <Clock
                      className="w-3.5 h-3.5 text-slate-400"
                      strokeWidth={2.5}
                    />
                    <span className="text-[12.5px] text-slate-300">
                      Masa penggunaan:{" "}
                      <b className="text-white">
                        {voucherResult.validityDuration}
                      </b>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Expired / Canceled */}
          {(orderStatus === "expired" || orderStatus === "canceled") && (
            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.08] backdrop-blur-xl p-5 flex items-start gap-3">
              <XCircle
                className="w-5 h-5 text-rose-300 shrink-0 mt-0.5"
                strokeWidth={2.5}
              />
              <div>
                <p className="text-[13px] font-semibold text-rose-200">
                  Pesanan tidak aktif
                </p>
                <p className="mt-1 text-[12.5px] text-rose-100/80 leading-relaxed">
                  Pesanan telah kedaluwarsa atau dibatalkan. Silakan buat
                  pesanan baru.
                </p>
              </div>
            </div>
          )}

          {checkoutError && (
            <p
              role="alert"
              className="mt-4 text-[12.5px] text-rose-200 bg-rose-500/[0.08] border border-rose-500/20 rounded-2xl px-4 py-3"
            >
              {checkoutError}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setOrderId("");
              setOrderStatus("");
              setVoucherResult(null);
              setShowConfetti(false);
            }}
            className="mt-6 w-full rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] px-4 py-3 text-[14px] font-semibold text-slate-100 transition active:scale-[0.97]"
          >
            Kembali ke Paket
          </button>
        </div>
      </section>
    );
  }

  // ============= MAIN STORE =============
  return (
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-5">
      {/* Global keyframes */}
      <style>{`
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes ripple-anim {
          0% { transform: scale(0); opacity: 0.6; }
          100% { transform: scale(4); opacity: 0; }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(129,140,248,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(129,140,248,0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* Section Header */}
      <div className="text-center mb-10 animate-[fadeInUp_0.5s_ease-out]">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] text-[12px] font-medium text-slate-200 mb-5">
          <Wifi className="w-3.5 h-3.5 text-emerald-300" strokeWidth={2.5} />
          Profil Hotspot
          <Sparkles className="w-3 h-3 text-amber-300" />
        </div>
        <h1 className="text-[32px] sm:text-[42px] font-bold text-white tracking-[-0.03em] leading-tight">
          Paket Hotspot{" "}
          <span className="bg-gradient-to-r from-emerald-400 to-indigo-400 bg-clip-text text-transparent">
            Tersedia
          </span>
        </h1>
        <p className="text-slate-400 text-[14px] sm:text-[15px] mt-3 max-w-lg mx-auto leading-relaxed">
          Lihat profil hotspot yang saat ini dikonfigurasi operator.
        </p>
      </div>

      {/* Progress steps */}
      <div className="max-w-md mx-auto mb-6 flex items-center justify-center gap-2 text-[11px]">
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition ${selectedProfile ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.06] text-slate-400"}`}
        >
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${selectedProfile ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-300"}`}
          >
            {selectedProfile ? (
              <Check className="w-2.5 h-2.5" strokeWidth={3} />
            ) : (
              "1"
            )}
          </span>
          Pilih Paket
        </div>
        <div className="h-px w-6 bg-white/[0.1]" />
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition ${selectedProfile ? "bg-indigo-500/15 text-indigo-300" : "bg-white/[0.06] text-slate-400"}`}
        >
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${selectedProfile ? "bg-indigo-500 text-white" : "bg-slate-700 text-slate-300"}`}
          >
            2
          </span>
          Pembayaran
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
        {/* ===== STEP 1: Packages ===== */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[12px] font-bold shadow-lg shadow-indigo-500/30">
              1
            </span>
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-300">
              Pilih Profil Hotspot
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {availableProfiles.length === 0 && (
              <p className="sm:col-span-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-5 text-[13px] text-slate-400">
                Belum ada profil hotspot yang dikonfigurasi.
              </p>
            )}
            {availableProfiles.map((p, index) => {
              const isSelected = selectedProfile?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={(e) => handleSelectProfile(p, e)}
                  style={{
                    animation: `fadeInUp 0.5s ${index * 0.06}s ease-out both`,
                  }}
                  className={`group relative p-5 rounded-3xl border text-left cursor-pointer transition-all overflow-hidden flex flex-col justify-between ${
                    isSelected
                      ? "bg-gradient-to-br from-indigo-500/[0.15] via-white/[0.03] to-white/[0.02] border-indigo-400/50 ring-1 ring-indigo-400/30 shadow-lg shadow-indigo-500/10"
                      : "bg-white/[0.03] backdrop-blur-xl border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] hover:-translate-y-0.5"
                  }`}
                >
                  {/* Ripple overlay */}
                  {(ripples[p.id] || []).map((r) => (
                    <span
                      key={r.id}
                      className="absolute pointer-events-none rounded-full bg-white/30"
                      style={{
                        left: r.x - 10,
                        top: r.y - 10,
                        width: 20,
                        height: 20,
                        animation: "ripple-anim 0.6s ease-out forwards",
                      }}
                    />
                  ))}

                  {isSelected && (
                    <div
                      className="absolute top-3.5 right-3.5 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/40 animate-[fadeInUp_0.3s_ease-out]"
                      style={{
                        animation: "glow-pulse 2s ease-in-out infinite",
                      }}
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-slate-200 text-[10.5px] font-semibold">
                        {p.validityDuration}
                      </span>
                      <span className="text-[10.5px] text-emerald-300 font-semibold font-mono">
                        {p.speedLimit}
                      </span>
                    </div>

                    <h4 className="text-[17px] font-bold text-white mt-3 tracking-tight leading-tight">
                      {p.name}
                    </h4>
                    <p className="text-[12px] text-slate-400 mt-1">
                      Profil layanan hotspot
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                    <span className="text-[11.5px] text-slate-400">Harga</span>
                    <span className="text-[19px] font-bold text-emerald-300 tracking-tight">
                      Rp {p.price.toLocaleString("id-ID")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== STEP 2: Checkout (sticky di desktop) ===== */}
        <div
          ref={checkoutRef}
          className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-5 shadow-2xl md:sticky md:top-24 animate-[fadeInUp_0.6s_0.15s_ease-out_both]"
        >
          <div className="flex items-center gap-2.5 mb-5">
            <span className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[12px] font-bold shadow-lg shadow-indigo-500/30">
              2
            </span>
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-300">
              Konfirmasi & Pembayaran
            </h3>
          </div>

          <div className="space-y-4">
            {/* Selected package recap */}
            <div
              className={`rounded-2xl bg-white/[0.04] border p-4 transition-all duration-300 ${
                selectedProfile
                  ? "border-emerald-500/25"
                  : "border-white/[0.08]"
              }`}
            >
              <span className="text-[10.5px] uppercase tracking-wider text-slate-500 font-semibold">
                Paket Terpilih
              </span>
              <div
                className={`font-bold text-[15px] mt-1 tracking-tight transition-colors ${selectedProfile ? "text-white" : "text-slate-500"}`}
              >
                {selectedProfile?.name || "Belum ada profil"}
              </div>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/[0.06]">
                <span className="text-[12px] text-slate-400">Total Bayar</span>
                <span
                  className={`text-[18px] font-bold tracking-tight transition-colors ${selectedProfile ? "text-emerald-300" : "text-slate-500"}`}
                >
                  {selectedProfile
                    ? `Rp ${selectedProfile.price.toLocaleString("id-ID")}`
                    : "—"}
                </span>
              </div>
            </div>

            {selectedProfile && (
              <form onSubmit={handleOrder} className="space-y-3">
                {[
                  {
                    label: "Nama",
                    value: buyerName,
                    setter: setBuyerName,
                    type: "text",
                    placeholder: "Nama lengkap",
                    required: true,
                    maxLength: 100,
                  },
                  {
                    label: "Nomor WhatsApp",
                    value: buyerPhone,
                    setter: setBuyerPhone,
                    type: "tel",
                    placeholder: "08...",
                    required: true,
                    maxLength: 32,
                    hint: "Voucher akan dikirim ke nomor ini",
                  },
                  {
                    label: "Email (opsional)",
                    value: buyerEmail,
                    setter: setBuyerEmail,
                    type: "email",
                    placeholder: "email@contoh.com",
                    required: false,
                    maxLength: 254,
                  },
                ].map(
                  ({
                    label,
                    value,
                    setter,
                    type,
                    placeholder,
                    required,
                    maxLength,
                    hint,
                  }) => (
                    <label key={label} className="block group">
                      <span className="text-[12px] font-medium text-slate-300">
                        {label}
                      </span>
                      <input
                        required={required}
                        type={type}
                        maxLength={maxLength}
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        placeholder={placeholder}
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-[13.5px] text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                      {hint && (
                        <span className="mt-1 block text-[10.5px] text-slate-500">
                          {hint}
                        </span>
                      )}
                    </label>
                  ),
                )}

                {automaticAvailable && manualMethods.length > 0 && (
                  <div>
                    <span className="text-[12px] font-medium text-slate-300 block mb-1.5">
                      Metode pembayaran
                    </span>
                    <div className="relative grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                      <span
                        className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-all duration-300 ease-out ${
                          paymentMode === "automatic"
                            ? "left-1 bg-indigo-500 shadow-lg shadow-indigo-500/30"
                            : "left-[calc(50%+2px)] bg-emerald-500 shadow-lg shadow-emerald-500/30"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setPaymentMode("automatic")}
                        className={`relative z-10 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${paymentMode === "automatic" ? "text-white" : "text-slate-400 hover:text-white"}`}
                      >
                        Otomatis
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMode("manual")}
                        className={`relative z-10 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${paymentMode === "manual" ? "text-white" : "text-slate-400 hover:text-white"}`}
                      >
                        Manual
                      </button>
                    </div>
                  </div>
                )}

                {paymentMode === "manual" && manualMethods.length > 0 && (
                  <div className="space-y-2.5 animate-[fadeInUp_0.3s_ease-out]">
                    <label className="block">
                      <span className="text-[12px] font-medium text-slate-300">
                        Transfer ke
                      </span>
                      <select
                        value={manualMethodId}
                        onChange={(event) =>
                          setManualMethodId(event.target.value)
                        }
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-[13.5px] text-white focus:outline-none focus:border-emerald-400/50 focus:bg-white/[0.06] transition"
                      >
                        {manualMethods.map((method) => (
                          <option key={method.id} value={method.id}>
                            {method.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="whitespace-pre-wrap rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3.5 text-[12px] text-slate-300 leading-relaxed">
                      {(() => {
                        const method = manualMethods.find(
                          (item) => item.id === manualMethodId,
                        );
                        return [
                          method?.name,
                          method?.accountNumber,
                          method?.accountHolder || method?.serviceName
                            ? `Atas nama: ${method.accountHolder || method.serviceName}`
                            : '',
                          method?.instructions,
                        ]
                          .filter(Boolean)
                          .join("\n");
                      })()}
                    </p>
                  </div>
                )}

                {checkoutError && (
                  <p
                    role="alert"
                    className="text-[12px] text-rose-200 bg-rose-500/[0.08] border border-rose-500/20 rounded-xl px-3.5 py-2.5"
                  >
                    {checkoutError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={
                    isOrdering ||
                    (paymentMode === "manual" && !manualMethodId) ||
                    (!automaticAvailable && !manualMethods.length)
                  }
                  className="group relative w-full rounded-2xl bg-indigo-500 hover:bg-indigo-400 px-4 py-3.5 text-[14.5px] font-semibold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-50 transition active:scale-[0.97] flex items-center justify-center gap-2 overflow-hidden"
                >
                  {isOrdering && (
                    <span
                      className="absolute inset-0 opacity-40"
                      style={{
                        background:
                          "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.5s linear infinite",
                      }}
                    />
                  )}
                  {isOrdering ? (
                    <>
                      <Loader2
                        className="w-4 h-4 animate-spin"
                        strokeWidth={2.5}
                      />
                      <span>Membuat pesanan...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" strokeWidth={2.5} />
                      <span>
                        {paymentMode === "automatic"
                          ? "Pesan & Bayar Otomatis"
                          : "Buat Kode Bayar"}
                      </span>
                      <ChevronRight
                        className="w-4 h-4 group-hover:translate-x-0.5 transition"
                        strokeWidth={2.5}
                      />
                    </>
                  )}
                </button>

                {!automaticAvailable && manualMethods.length === 0 && (
                  <p className="text-[11.5px] text-amber-300 bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-3.5 py-2.5">
                    Pembayaran belum dikonfigurasi operator.
                  </p>
                )}
              </form>
            )}

            {onCheckBilling ? (
              <button
                type="button"
                onClick={onCheckBilling}
                className="block text-center w-full py-3 px-4 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] font-semibold text-slate-100 rounded-2xl text-[13.5px] transition active:scale-[0.97]"
              >
                Cek Tagihan
              </button>
            ) : (
              <a
                href="/portal/billing"
                className="block text-center w-full py-3 px-4 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] font-semibold text-slate-100 rounded-2xl text-[13.5px] transition active:scale-[0.97]"
              >
                Cek Tagihan
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
