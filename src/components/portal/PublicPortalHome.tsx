import React, { useEffect, useState } from "react";
import { HotspotProfile } from "../../types";
import { CustomerBillPortal } from "./CustomerBillPortal";
import { VoucherStorePortal } from "./VoucherStorePortal";
import {
  Wifi,
  CreditCard,
  Headphones,
  ChevronRight,
  ShieldCheck,
  Zap,
  Users,
  Sparkles,
} from "lucide-react";

export const PublicPortalHome: React.FC = () => {
  const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
  const [error, setError] = useState("");
  const [view, setView] = useState<"packages" | "billing">("packages");

  useEffect(() => {
    let mounted = true;
    fetch("/api/portal/vouchers")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || `HTTP ${response.status}`);
        if (mounted) setProfiles(result.profiles);
      })
      .catch((fetchError) => {
        if (mounted)
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : String(fetchError),
          );
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* ===== iOS-style Navbar (glass) ===== */}
      <nav className="sticky top-0 z-30 bg-slate-950/60 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group">
            <span className="relative w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 group-active:scale-95 transition">
              <span className="absolute inset-0 rounded-2xl bg-white/10" />
              <Wifi className="relative w-4 h-4 text-white" strokeWidth={2.5} />
            </span>
            <span className="font-semibold text-[15px] tracking-tight text-white">
              SmartBilling
            </span>
          </a>
          <a
            href="/admin"
            className="text-[13px] font-medium text-slate-300 hover:text-white px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] transition active:scale-95"
          >
            Login Admin
          </a>
        </div>
      </nav>

      <main className="flex-1">
        {view === "packages" ? (
          <>
            {/* ===== Hero ===== */}
            <section className="relative overflow-hidden">
              {/* Soft ambient glows */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(99,102,241,0.22),transparent_70%)] pointer-events-none" />
              <div className="absolute -top-32 -right-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
              <div className="absolute -top-24 -left-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

              <div className="relative max-w-5xl mx-auto px-4 pt-16 pb-12 text-center">
                {/* Pill badge */}
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] text-[12px] font-medium text-slate-200 mb-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Portal Layanan Pelanggan
                  <Sparkles className="w-3 h-3 text-amber-300" />
                </div>

                <h1 className="text-[40px] sm:text-[56px] font-bold text-white tracking-[-0.03em] leading-[1.05]">
                  Paket Internet
                  <br />
                  <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">
                    Tersedia
                  </span>
                </h1>
                <p className="mt-5 text-[15px] sm:text-base text-slate-400 max-w-md mx-auto leading-relaxed">
                  Pilih paket yang sesuai atau cek status langganan dan tagihan
                  Anda kapan saja.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setView("billing")}
                    className="group inline-flex items-center gap-2 px-6 py-3.5 bg-indigo-500 hover:bg-indigo-400 rounded-2xl text-[15px] font-semibold text-white shadow-lg shadow-indigo-500/30 transition active:scale-[0.97]"
                  >
                    <CreditCard className="w-4 h-4" strokeWidth={2.5} />
                    <span>Cek Status Langganan</span>
                    <ChevronRight
                      className="w-4 h-4 group-hover:translate-x-0.5 transition"
                      strokeWidth={2.5}
                    />
                  </button>
                  <a
                    href="#paket"
                    className="inline-flex items-center gap-2 px-6 py-3.5 bg-white/[0.06] hover:bg-white/[0.1] backdrop-blur-xl border border-white/[0.1] rounded-2xl text-[15px] font-semibold text-slate-100 transition active:scale-[0.97]"
                  >
                    <Zap className="w-4 h-4 text-amber-300" strokeWidth={2.5} />
                    <span>Lihat Paket</span>
                  </a>
                </div>
              </div>
            </section>

            {/* ===== Feature cards (iOS grouped tiles) ===== */}
            <section className="max-w-5xl mx-auto px-4 pb-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    icon: ShieldCheck,
                    title: "Pembayaran Aman",
                    desc: "Transaksi diproses via provider pembayaran terpercaya.",
                    tint: "from-emerald-400/20 to-emerald-600/5",
                    iconColor: "text-emerald-300",
                  },
                  {
                    icon: Zap,
                    title: "Aktivasi Cepat",
                    desc: "Voucher hotspot aktif setelah pembayaran terverifikasi.",
                    tint: "from-indigo-400/20 to-indigo-600/5",
                    iconColor: "text-indigo-300",
                  },
                  {
                    icon: Users,
                    title: "Dukungan Operator",
                    desc: "Butuh bantuan? Hubungi operator lewat WhatsApp.",
                    tint: "from-violet-400/20 to-violet-600/5",
                    iconColor: "text-violet-300",
                  },
                ].map(({ icon: Icon, title, desc, tint, iconColor }) => (
                  <div
                    key={title}
                    className="group rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-5 hover:bg-white/[0.06] hover:border-white/[0.12] transition"
                  >
                    <div
                      className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${tint} border border-white/[0.08] flex items-center justify-center mb-4 group-hover:scale-105 transition`}
                    >
                      <Icon
                        className={`w-5 h-5 ${iconColor}`}
                        strokeWidth={2}
                      />
                    </div>
                    <h3 className="text-[15px] font-semibold text-white tracking-tight">
                      {title}
                    </h3>
                    <p className="mt-1.5 text-[12.5px] text-slate-400 leading-relaxed">
                      {desc}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* ===== Error banner (iOS inset alert) ===== */}
            {error && (
              <div className="max-w-5xl mx-auto px-4 mt-5">
                <p
                  role="alert"
                  className="text-[13px] text-rose-200 bg-rose-500/[0.08] backdrop-blur-xl border border-rose-500/20 rounded-2xl px-4 py-3"
                >
                  {error}
                </p>
              </div>
            )}

            {/* ===== Paket & Checkout (logic tetap) ===== */}
            <div id="paket" className="scroll-mt-24">
              <VoucherStorePortal
                profiles={profiles}
                onCheckBilling={() => setView("billing")}
              />
            </div>
          </>
        ) : (
          <CustomerBillPortal
            showNavigation={false}
            onBack={() => setView("packages")}
          />
        )}
      </main>

      {/* ===== iOS-style Footer ===== */}
      <footer className="border-t border-white/[0.06] mt-12">
        <div className="max-w-5xl mx-auto px-5 py-10 grid grid-cols-1 sm:grid-cols-3 gap-8 text-[13px]">
          <div>
            <div className="flex items-center gap-2.5 font-semibold text-white tracking-tight">
              <span className="relative w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <span className="absolute inset-0 rounded-xl bg-white/10" />
                <Wifi
                  className="relative w-3.5 h-3.5 text-white"
                  strokeWidth={2.5}
                />
              </span>
              <span>SmartBilling</span>
            </div>
            <p className="mt-3 text-slate-500 leading-relaxed">
              Portal layanan pelanggan untuk paket internet, voucher hotspot,
              dan pembayaran tagihan.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[10.5px] mb-3">
              Layanan
            </h4>
            <ul className="space-y-2 text-slate-400">
              <li>
                <button
                  type="button"
                  onClick={() => setView("packages")}
                  className="hover:text-white transition inline-flex items-center gap-1 group"
                >
                  Paket Hotspot
                  <ChevronRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition" />
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setView("billing")}
                  className="hover:text-white transition inline-flex items-center gap-1 group"
                >
                  Cek Tagihan
                  <ChevronRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition" />
                </button>
              </li>
              <li>
                <a
                  href="/admin"
                  className="hover:text-white transition inline-flex items-center gap-1 group"
                >
                  Login Admin
                  <ChevronRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition" />
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[10.5px] mb-3">
              Bantuan
            </h4>
            <p className="text-slate-400 leading-relaxed">
              Pembayaran online, jika tersedia, diproses dengan aman melalui
              provider pembayaran.
            </p>
            <p className="mt-3 text-slate-500 inline-flex items-center gap-1.5">
              <Headphones className="w-3.5 h-3.5" strokeWidth={2.5} />
              Hubungi operator untuk kendala layanan.
            </p>
          </div>
        </div>

        <div className="border-t border-white/[0.06]">
          <div className="max-w-5xl mx-auto px-5 py-4 text-center text-[11.5px] text-slate-600">
            © {new Date().getFullYear()} SmartBilling · Semua hak dilindungi.
          </div>
        </div>
      </footer>
    </div>
  );
};
