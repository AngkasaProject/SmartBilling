import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CreditCard,
  RefreshCw,
  Wifi,
  ShieldCheck,
  ChevronRight,
  Loader2,
  MapPin,
  ArrowUpRight,
  Search,
  Copy,
  Check,
  ExternalLink,
  Ticket,
} from "lucide-react";
import { QrCode } from "./common/QrCode";

interface PortalStatus {
  connected: boolean;
  appName?: string;
  brandName?: string;
  brandMainLogoDataUrl?: string;
  companyName?: string;
  tagline?: string;
  officeAddress?: string;
  operatorWhatsapp?: string;
}

interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  profileName: string;
  periodMonth: string;
  amount: number;
  uniqueCode: number;
  totalAmount: number;
  status: "unpaid" | "paid" | "expired" | "canceled";
  dueDate: string;
  paidAt?: string;
  paymentMethod?: string;
  latestPaymentStatus?: "pending" | "settlement" | "expired" | "canceled";
  latestPaymentMethod?: string;
  latestPaymentChannel?: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  accountHolder?: string;
  serviceName?: string;
  accountNumber?: string;
  instructions: string;
}

interface PaymentOptions {
  automaticAvailable: boolean;
  provider: string;
  manualMethods: PaymentMethod[];
  operatorWhatsapp: string;
}

interface VoucherProfile {
  id: string;
  name: string;
  speedLimit: string;
  validityDuration: string;
  validityHours: number;
  price: number;
  dataLimitMb?: number;
}

interface VoucherOrder {
  orderId: string;
  phone: string;
  status: string;
  paymentCode?: string;
  expiresAt?: string;
  operatorUrl?: string;
  message?: string;
  qrString?: string;
  amount?: number;
}

interface VoucherOrderStatus {
  status: "pending" | "settlement" | "canceled" | "expired";
  amount?: number;
  expiresAt?: string;
  voucher?: { code: string; password?: string; validityDuration: string };
}

interface BillingLink {
  customer: { name: string; customerId: string; profileName: string };
  invoices: PortalInvoice[];
}

interface PublicBillingCheck {
  invoices: PortalInvoice[];
  lookupType?: "customer" | "paymentCode";
}

interface RecentVoucher {
  orderId: string;
  paymentCode: string;
  packageName: string;
  amount: number;
  phone: string;
  createdAt: string;
}

interface VoucherLookupData {
  found: boolean;
  orderId: string;
  paymentCode: string;
  orderType: string;
  status: 'pending' | 'settlement' | 'canceled' | 'expired';
  amount: number;
  customerName: string;
  customerPhone: string;
  packageName: string;
  validityDuration: string;
  speedLimit: string;
  paymentMethod: string;
  paymentChannel?: string;
  qrString?: string;
  manualMethod?: {
    id: string;
    name: string;
    accountHolder: string;
    accountNumber: string;
    instructions: string;
  };
  operatorUrl?: string;
  createdAt: string;
  paidAt?: string;
  voucher?: {
    code: string;
    password?: string;
    validityDuration: string;
    speedLimit?: string;
  };
  recentMatches?: Array<{
    orderId: string;
    paymentCode: string;
    status: string;
    amount: number;
    createdAt: string;
  }>;
}

interface CustomerDashboard {
  customer: {
    id: string;
    customerId: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    pppoeUsername: string;
    profileName: string;
    bandwidthLimit: string;
    monthlyFee: number;
    billingDate: number;
    expiredDate: string;
    status: string;
    dataLimitMb?: number;
    dataUsedBytes?: number;
    dataRemainingBytes?: number;
    pendingPackageName?: string;
  };
  invoices: PortalInvoice[];
  paymentAvailable: boolean;
}

interface PaymentResult {
  redirectUrl?: string;
  orderId?: string;
  qrString?: string;
  amount?: number;
  status?: string;
  reconciliationRequired?: boolean;
  expiresAt?: string;
  paymentCode?: string;
  expiresAtFormatted?: string;
  operatorUrl?: string;
  message?: string;
  method?: PaymentMethod;
}

type PaymentSelection = {
  invoice: PortalInvoice;
  lookupValue?: string;
  portalToken?: string;
  onClose?: () => void;
};

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-900 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition";

function rupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Permintaan gagal (HTTP ${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

function InvoiceStatusBadge({ invoice }: { invoice: PortalInvoice }) {
  if (invoice.status === "paid")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" /> Lunas
      </span>
    );
  if (invoice.status === "canceled")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 border border-slate-200">
        <AlertCircle className="w-3 h-3" /> Tagihan dibatalkan
      </span>
    );
  if (
    invoice.status === "expired" ||
    invoice.latestPaymentStatus === "expired" ||
    invoice.latestPaymentStatus === "canceled"
  )
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 border border-rose-200">
        <AlertCircle className="w-3 h-3" /> Gagal / Expired
      </span>
    );
  if (invoice.latestPaymentStatus === "pending")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 border border-amber-200">
        <Clock3 className="w-3 h-3" /> Menunggu
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-600 border border-zinc-200">
      Belum dibayar
    </span>
  );
}

function PortalPaymentDialog({
  invoice,
  lookupValue,
  portalToken,
  options,
  onClose,
}: PaymentSelection & { options: PaymentOptions | null }) {
  const [mode, setMode] = useState<"automatic" | "manual">("automatic");
  const [methodId, setMethodId] = useState("");
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!options) return;
    setMode(options.automaticAvailable ? "automatic" : "manual");
    setMethodId(options.manualMethods[0]?.id || "");
  }, [options]);

  useEffect(() => {
    if (!result?.qrString || !result.orderId || result.status !== "pending") return;
    let active = true;
    const checkStatus = async () => {
      try {
        const status = await apiRequest<{
          status: string;
          amount?: number;
          expiresAt?: string;
          reconciliationRequired?: boolean;
        }>("/api/portal/payment/status", {
          method: "POST",
          body: jsonBody({
            orderId: result.orderId,
            invoiceId: invoice.id,
            ...(lookupValue ? { lookupValue } : {}),
            ...(portalToken ? { portalToken } : {}),
          }),
        });
        if (!active) return;
        setResult(current => current?.orderId === result.orderId
          ? { ...current, ...status }
          : current);
      } catch (statusError) {
        if (active) {
          setError(statusError instanceof Error ? statusError.message : "Status QRIS belum dapat diperiksa.");
        }
      }
    };
    void checkStatus();
    const timer = window.setInterval(() => void checkStatus(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [result?.qrString, result?.orderId, result?.status, invoice.id, lookupValue, portalToken]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const payment = await apiRequest<PaymentResult>("/api/portal/payment", {
        method: "POST",
        body: jsonBody({
          invoiceId: invoice.id,
          paymentMode: mode,
          ...(lookupValue ? { lookupValue } : {}),
          ...(portalToken ? { portalToken } : {}),
          ...(mode === "manual" ? { methodId } : {}),
        }),
      });
      setResult(payment);
      if (payment.redirectUrl) window.location.assign(payment.redirectUrl);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Pembayaran belum dapat diproses",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl animate-[fadeInUp_0.2s_ease-out]">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">
              Pembayaran Tagihan
            </p>
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
              {invoice.invoiceNumber}
            </h2>
            <p className="mt-2 text-3xl font-bold text-zinc-900">
              {rupiah(invoice.totalAmount)}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900 transition"
            >
              ✕
            </button>
          )}
        </div>

        {result?.qrString ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-center text-sm text-zinc-700">
            <p className="font-semibold text-zinc-900">
              {result.reconciliationRequired
                ? "Pembayaran diterima — perlu konfirmasi operator"
                : result.status === "settlement"
                  ? "Pembayaran berhasil diverifikasi"
                  : result.status === "expired" || result.status === "canceled"
                    ? "QRIS kedaluwarsa"
                    : "Scan QRIS untuk membayar"}
            </p>
            {result.status === "pending" && (
              <div className="my-4 flex justify-center">
                <QrCode value={result.qrString} size={220} />
              </div>
            )}
            <p className="font-semibold text-zinc-900">{rupiah(result.amount ?? invoice.totalAmount)}</p>
            {result.paymentCode && (
              <p className="mt-1 text-xs text-zinc-600">
                Kode bayar: <b className="font-mono">{result.paymentCode}</b>
              </p>
            )}
            {result.amount !== undefined && result.amount !== invoice.totalAmount && (
              <p className="mt-1 text-xs text-zinc-500">
                Nominal tagihan {rupiah(invoice.totalAmount)}; bayar sesuai nominal QRIS di atas.
              </p>
            )}
            <p className="mt-1 text-xs text-zinc-500">Kode pesanan: {result.paymentCode || result.orderId}</p>
            {result.expiresAt && (
              <p className="mt-1 text-xs text-zinc-500">
                Berlaku sampai {new Date(result.expiresAt).toLocaleString("id-ID")}
              </p>
            )}
            {result.status === "pending" && (
              <p className="mt-3 text-xs text-zinc-500">Status diperiksa otomatis setiap beberapa detik.</p>
            )}
            {result.reconciliationRequired && (
              <p className="mt-3 text-xs text-amber-700">Hubungi operator untuk rekonsiliasi pembayaran ini sebelum layanan diperpanjang.</p>
            )}
            {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
          </div>
        ) : result?.paymentCode ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
            <p className="font-semibold text-zinc-900 mb-3">
              Instruksi Pembayaran Manual
            </p>
            <div className="bg-white rounded-lg p-4 mb-4 border border-zinc-200">
              <p className="text-xs text-zinc-500 mb-1">Kode Bayar</p>
              <p className="font-mono text-xl font-bold text-zinc-900 tracking-widest">
                {result.paymentCode}
              </p>
            </div>
            {result.method && (
              <p className="mt-2 text-zinc-900">
                <b>{result.method.name}</b> — {result.method.accountNumber} a.n.{" "}
                {result.method.accountHolder || result.method.serviceName}
              </p>
            )}
            {result.method?.instructions && (
              <p className="mt-2 whitespace-pre-wrap text-zinc-500 text-xs leading-relaxed">
                {result.method.instructions}
              </p>
            )}
            {result.message && (
              <p className="mt-2 text-xs text-zinc-500">{result.message}</p>
            )}
            {result.operatorUrl && (
              <a
                className={`${buttonClass} mt-5 w-full`}
                href={result.operatorUrl}
                target="_blank"
                rel="noreferrer"
              >
                Konfirmasi via WhatsApp <ChevronRight className="w-4 h-4" />
              </a>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className={`${secondaryButtonClass} mt-3 w-full`}
              >
                Tutup & Lihat Status
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {options?.automaticAvailable && (
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${mode === "automatic" ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900" : "border-zinc-200 hover:bg-zinc-50"}`}
                >
                  <input
                    type="radio"
                    className="accent-zinc-900 w-4 h-4"
                    checked={mode === "automatic"}
                    onChange={() => setMode("automatic")}
                  />
                  <span className="flex-1 text-sm font-medium text-zinc-900">
                    Otomatis ({options.provider.toUpperCase()})
                  </span>
                </label>
              )}
              {options?.manualMethods.map((method) => (
                <label
                  key={method.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${mode === "manual" && methodId === method.id ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900" : "border-zinc-200 hover:bg-zinc-50"}`}
                >
                  <input
                    type="radio"
                    className="mt-0.5 accent-zinc-900 w-4 h-4"
                    checked={mode === "manual" && methodId === method.id}
                    onChange={() => {
                      setMode("manual");
                      setMethodId(method.id);
                    }}
                  />
                  <span className="flex-1">
                    <b className="block text-sm text-zinc-900">{method.name}</b>
                    <span className="block text-xs text-zinc-500 mt-0.5">
                      {method.accountNumber} a.n.{" "}
                      {method.accountHolder || method.serviceName}
                    </span>
                  </span>
                </label>
              ))}
              {mode === "manual" &&
                options?.manualMethods.find((method) => method.id === methodId)
                  ?.instructions && (
                  <div className="whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-xs text-zinc-600 leading-relaxed border border-zinc-200">
                    {
                      options.manualMethods.find(
                        (method) => method.id === methodId,
                      )?.instructions
                    }
                  </div>
                )}
            </div>
            {error && (
              <p
                role="alert"
                className="mt-4 text-sm text-rose-600 bg-rose-50 border border-rose-200 p-3 rounded-xl"
              >
                {error}
              </p>
            )}
            <button
              type="button"
              className={`${buttonClass} mt-6 w-full`}
              onClick={() => void submit()}
              disabled={busy || !options || (mode === "manual" && !methodId)}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              {busy
                ? "Memproses..."
                : mode === "automatic"
                  ? "Lanjut Bayar Otomatis"
                  : "Buat Kode Bayar Manual"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function PublicVoucherLookup({ onSwitchToBuy }: { onSwitchToBuy?: () => void } = {}) {
  const [lookupCode, setLookupCode] = useState(() => {
    return new URLSearchParams(window.location.search).get("code") || "";
  });
  const [result, setResult] = useState<VoucherLookupData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [recentVouchers, setRecentVouchers] = useState<RecentVoucher[]>(() => {
    try {
      const stored = localStorage.getItem("smartbilling_recent_vouchers");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 2000);
    } catch {}
  };

  const lookup = useCallback(async (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) {
      setError("Masukkan Kode Bayar pesanan voucher Anda.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await apiRequest<VoucherLookupData>("/api/portal/voucher-lookup", {
        method: "POST",
        body: jsonBody({ query: cleanCode }),
      });
      setResult(data);
      if (data.orderId) {
        setRecentVouchers(curr => {
          const filtered = curr.filter(v => v.paymentCode !== data.paymentCode && v.orderId !== data.orderId);
          const next = [{
            orderId: data.orderId,
            paymentCode: data.paymentCode || data.orderId,
            packageName: data.packageName,
            amount: data.amount,
            phone: data.customerPhone,
            createdAt: data.createdAt,
          }, ...filtered].slice(0, 8);
          try {
            localStorage.setItem("smartbilling_recent_vouchers", JSON.stringify(next));
          } catch {}
          return next;
        });
      }
    } catch (lookupError) {
      setResult(null);
      setError(lookupError instanceof Error ? lookupError.message : "Pesanan voucher tidak ditemukan. Periksa kembali Kode Bayar Anda.");
    } finally {
      setBusy(false);
    }
  }, []);

  // Auto-check if code was in URL query
  useEffect(() => {
    const codeParam = new URLSearchParams(window.location.search).get("code");
    if (codeParam) {
      void lookup(codeParam);
    }
  }, [lookup]);

  // Auto-polling if status is pending
  useEffect(() => {
    if (!result || result.status !== "pending") return;
    const timer = setInterval(() => {
      void lookup(result.paymentCode || result.orderId);
    }, 4000);
    return () => clearInterval(timer);
  }, [result, lookup]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = lookupCode.trim();
    if (value) {
      void lookup(value);
    }
  };

  return (
    <section className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      {/* Sub-menu Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            Voucher Hotspot
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Periksa status pembayaran dan ambil kode voucher Anda.
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-zinc-100 p-1 border border-zinc-200 shrink-0 self-start sm:self-auto">
          {onSwitchToBuy && (
            <button
              type="button"
              onClick={onSwitchToBuy}
              className="px-3.5 py-1.5 text-xs font-bold rounded-lg text-zinc-600 hover:text-zinc-900 transition"
            >
              Beli Voucher Baru
            </button>
          )}
          <button
            type="button"
            className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 flex items-center gap-1.5"
          >
            <Ticket className="h-3.5 w-3.5" />
            Cek Status Pembelian
          </button>
        </div>
      </div>

      <form
        className="portal-enter rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_40px_-28px_rgba(24,24,27,0.35)] transition-shadow duration-300 hover:shadow-[0_18px_48px_-28px_rgba(24,24,27,0.4)] sm:rounded-3xl sm:p-8"
        onSubmit={submit}
      >
        <div className="mb-5 flex items-center gap-3 sm:mb-6">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-900 text-white shadow-lg shadow-zinc-900/10 transition-transform duration-300 hover:rotate-3">
            <Ticket className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              Cek Status Pembelian Voucher
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              Masukkan Kode Bayar untuk melihat rincian pemesanan dan kode voucher Anda.
            </p>
          </div>
        </div>

        <label className="block">
          <input
            className={`${inputClass} h-12 text-center font-mono text-base tracking-wide transition-shadow focus:shadow-[0_0_0_4px_rgba(24,24,27,0.06)] sm:text-lg`}
            value={lookupCode}
            onChange={(event) => setLookupCode(event.target.value)}
            placeholder="Kode Bayar (Contoh: SBV-6E82EB9AB3AC)"
            autoComplete="off"
            maxLength={64}
            aria-label="Kode Bayar"
            required
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-600 text-center">
            {error}
          </p>
        )}
        <button
          className={`${buttonClass} mt-4 min-h-12 w-full transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0`}
          disabled={busy || !lookupCode.trim()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {busy ? "Memeriksa Status..." : "Cek Status Sekarang"}
        </button>

        {/* Quick Recent Chips */}
        {recentVouchers.length > 0 && (
          <div className="mt-4 pt-3 border-t border-zinc-100">
            <p className="text-[11px] font-semibold text-zinc-400 mb-1.5">Kode Bayar Sebelumnya di Perangkat Ini:</p>
            <div className="flex flex-wrap gap-2">
              {recentVouchers.map((item) => (
                <button
                  key={item.orderId}
                  type="button"
                  onClick={() => {
                    setLookupCode(item.paymentCode);
                    void lookup(item.paymentCode);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-mono font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-white"
                >
                  <span>{item.paymentCode}</span>
                  <span className="text-[10px] font-sans text-zinc-400">({item.packageName})</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      {/* Result Card: Formatted like the order notification */}
      {result && (
        <div className="portal-enter rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_40px_-28px_rgba(24,24,27,0.35)] sm:rounded-3xl sm:p-8 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900">
                Detail Status Pesanan
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Rincian pelanggan, paket yang dipilih, dan status voucher.
              </p>
            </div>
            <button
              type="button"
              className={`${secondaryButtonClass} min-h-9 !px-3 !py-1.5 !text-xs transition duration-200 hover:-translate-y-0.5 active:translate-y-0`}
              disabled={busy}
              onClick={() => void lookup(result.paymentCode || result.orderId)}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {/* Kotak notifikasi persis seperti di gambar user */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
            <div className="flex items-center gap-2 font-semibold mb-3">
              <Clock3 className="w-4 h-4 shrink-0 text-amber-800" />
              <span className="font-mono text-xs sm:text-sm">Pesanan {result.orderId}</span>
            </div>

            {/* Detail Pelanggan & Paket */}
            <div className="mb-4 grid gap-2 rounded-xl bg-white/80 p-3.5 ring-1 ring-amber-200/60 text-xs sm:grid-cols-2">
              <div>
                <span className="text-zinc-500">Nama Pelanggan:</span>
                <p className="font-semibold text-zinc-900">{result.customerName || '-'}</p>
              </div>
              <div>
                <span className="text-zinc-500">Nomor WhatsApp:</span>
                <p className="font-mono font-semibold text-zinc-900">{result.customerPhone || '-'}</p>
              </div>
              <div>
                <span className="text-zinc-500">Paket yang Dipilih:</span>
                <p className="font-semibold text-zinc-900">{result.packageName}</p>
              </div>
              <div>
                <span className="text-zinc-500">Total Nominal:</span>
                <p className="font-extrabold text-zinc-900">{rupiah(result.amount)}</p>
              </div>
            </div>

            <p className="text-sm">
              Status:{" "}
              <b>
                {result.status === "settlement"
                  ? "Lunas - terverifikasi"
                  : result.status === "pending"
                    ? "Menunggu pembayaran"
                    : result.status === "canceled"
                      ? "Dibatalkan"
                      : "Kedaluwarsa"}
              </b>
            </p>

            {result.status === "pending" && result.qrString && (
              <div className="mt-4 flex flex-col items-center rounded-xl border border-amber-200 bg-white p-4">
                <p className="mb-3 text-xs font-semibold">Scan QRIS untuk membayar</p>
                <QrCode value={result.qrString} size={220} />
              </div>
            )}

            {result.paymentCode && (
              <p className="mt-2">
                Kode bayar:{" "}
                <b className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200 text-zinc-900">
                  {result.paymentCode}
                </b>
              </p>
            )}

            {/* Jika Menunggu Pembayaran */}
            {result.status === "pending" && (
              <>
                <p className="mt-2 text-xs leading-relaxed text-amber-900">
                  Pesanan dibuat. Ikuti instruksi transfer, lalu konfirmasikan pembayaran kepada Customer Service melalui WhatsApp.
                </p>

                {result.manualMethod && (
                  <div className="mt-3 rounded-xl bg-white border border-amber-200 p-3.5 text-xs space-y-1">
                    <p className="font-bold text-zinc-900">Instruksi Transfer ({result.manualMethod.name}):</p>
                    <p className="font-mono text-sm font-bold text-zinc-800">
                      {result.manualMethod.accountNumber} <span className="font-normal font-sans text-zinc-500">(a.n {result.manualMethod.accountHolder})</span>
                    </p>
                    {result.manualMethod.instructions && (
                      <p className="text-zinc-600 text-[11px] pt-1 border-t border-zinc-100">{result.manualMethod.instructions}</p>
                    )}
                  </div>
                )}

                {result.operatorUrl && (
                  <a
                    className="mt-3 inline-flex items-center gap-1 font-semibold underline text-amber-900 hover:text-amber-950"
                    href={result.operatorUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Konfirmasi ke operator <ChevronRight className="w-3 h-3" />
                  </a>
                )}
              </>
            )}

            {/* Jika Lunas & Kode Voucher Tergenerate */}
            {result.status === "settlement" && result.voucher && (
              <div className="mt-3 rounded-xl bg-white border border-amber-200 p-3.5 text-amber-900 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Kode Voucher Hotspot</span>
                    <p className="font-bold text-xl sm:text-2xl font-mono text-zinc-900 mt-0.5">
                      {result.voucher.code}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(result.voucher!.code, 'voucher_code')}
                    className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-200 transition"
                  >
                    {copiedKey === 'voucher_code' ? '✓ Disalin' : 'Salin Kode'}
                  </button>
                </div>
                <p className="text-xs mt-1.5 text-zinc-600">
                  Password: <b className="font-mono text-zinc-900">{result.voucher.password || result.voucher.code}</b>
                </p>
                <p className="text-xs text-zinc-600">
                  Masa berlaku: <b className="text-zinc-900">{result.voucher.validityDuration || '-'}</b>
                </p>
                <div className="mt-3 pt-2 border-t border-zinc-100 text-[11px] text-zinc-500">
                  Silakan hubungkan perangkat Anda ke jaringan WiFi Hotspot dan masukkan kode voucher di atas pada halaman login.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function PublicBillingLookup({ options }: { options: PaymentOptions | null }) {
  const [lookupValue, setLookupValue] = useState("");
  const [result, setResult] = useState<PublicBillingCheck | null>(null);
  const [voucherResult, setVoucherResult] = useState<VoucherLookupData | null>(null);
  const [selectedInvoice, setSelectedInvoice] =
    useState<PaymentSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Fungsi pencarian (Hanya mengambil data, tanpa menyimpan ke sessionStorage)
  const lookup = useCallback(async (value: string) => {
    setBusy(true);
    setError("");
    const [billingLookup, voucherLookup] = await Promise.allSettled([
      apiRequest<PublicBillingCheck>("/api/portal/billing", {
        method: "POST",
        body: jsonBody({ lookupValue: value }),
      }),
      apiRequest<VoucherLookupData>("/api/portal/voucher-lookup", {
        method: "POST",
        body: jsonBody({ query: value }),
      }),
    ]);
    setResult(billingLookup.status === "fulfilled" ? billingLookup.value : null);
    setVoucherResult(voucherLookup.status === "fulfilled" ? voucherLookup.value : null);
    if (billingLookup.status === "rejected" && voucherLookup.status === "rejected") {
      const lookupError = billingLookup.reason;
      setError(lookupError instanceof Error
        ? lookupError.message
        : "Data tagihan atau pesanan belum dapat diperiksa.");
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!voucherResult || voucherResult.status !== "pending") return;
    const timer = window.setInterval(() => {
      void apiRequest<VoucherOrderStatus>("/api/portal/voucher-orders/status", {
        method: "POST",
        body: jsonBody({
          orderId: voucherResult.orderId,
          phone: voucherResult.customerPhone,
        }),
      }).then(status => {
        setVoucherResult(current => current?.orderId === voucherResult.orderId
          ? { ...current, ...status }
          : current);
      }).catch((lookupError: unknown) => {
        setError(lookupError instanceof Error ? lookupError.message : "Status pesanan voucher belum dapat diperiksa.");
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [voucherResult?.orderId, voucherResult?.paymentCode, voucherResult?.status]);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;
    setLookupValue(code);
    void lookup(code);
  }, [lookup]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = lookupValue.trim();
    if (value) {
      void lookup(value);
    }
  };

  return (
    <section className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <form
        className="portal-enter rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_40px_-28px_rgba(24,24,27,0.35)] transition-shadow duration-300 hover:shadow-[0_18px_48px_-28px_rgba(24,24,27,0.4)] sm:rounded-3xl sm:p-8"
        onSubmit={submit}
      >
        <div className="mb-5 flex items-center gap-3 sm:mb-6">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-900 text-white shadow-lg shadow-zinc-900/10 transition-transform duration-300 hover:rotate-3">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              Cek Tagihan & Status Pesanan
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              Masukkan ID pelanggan atau nomor WhatsApp untuk tagihan PPPoE, atau ID pesanan/kode bayar voucher.
            </p>
          </div>
        </div>

        <label className="block">
          <input
            className={`${inputClass} h-12 text-center font-mono text-base tracking-wide transition-shadow focus:shadow-[0_0_0_4px_rgba(24,24,27,0.06)] sm:text-lg`}
            value={lookupValue}
            onChange={(event) => setLookupValue(event.target.value)}
            placeholder="ID Pelanggan / No. WhatsApp (PPPoE) / Kode Bayar"
            autoComplete="off"
            maxLength={128}
            aria-label="ID pelanggan atau nomor WhatsApp PPPoE, ID pesanan voucher, atau kode bayar"
            required
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-600 text-center">
            {error}
          </p>
        )}
        <button
          className={`${buttonClass} mt-4 min-h-12 w-full transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0`}
          disabled={busy || !lookupValue.trim()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {busy ? "Memeriksa..." : "Cek Tagihan / Status"}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-zinc-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Tidak perlu memasukkan password internet Anda.
        </p>
      </form>

      {result && (
        <div className="portal-enter rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_40px_-28px_rgba(24,24,27,0.35)] sm:rounded-3xl sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-5">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900">
                {result.lookupType === "paymentCode" ? "Detail Tagihan" : "Tagihan aktif"}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                {result.lookupType === "paymentCode" ? "Tagihan yang terkait dengan kode bayar ini." : "Rincian tagihan yang masih perlu dibayar."}
              </p>
            </div>
            <button
              type="button"
              className={`${secondaryButtonClass} min-h-9 !px-3 !py-1.5 !text-xs transition duration-200 hover:-translate-y-0.5 active:translate-y-0`}
              disabled={busy}
              onClick={() => void lookup(lookupValue)}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`}
              />{" "}
              Refresh
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {result.invoices.length ? (
              result.invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="group flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-gradient-to-br from-white to-zinc-50 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:p-5"
                >
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-bold text-zinc-900 sm:text-base">
                        #{invoice.invoiceNumber}
                      </p>
                      <InvoiceStatusBadge invoice={invoice} />
                    </div>
                    <p className="text-xs leading-relaxed text-zinc-500">
                      {invoice.periodMonth} · Jatuh tempo {invoice.dueDate}
                    </p>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
                      {rupiah(invoice.totalAmount)}
                    </p>
                    {invoice.latestPaymentMethod && (
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Via: {invoice.latestPaymentMethod}
                      </p>
                    )}
                  </div>
                  {invoice.status === "unpaid" && (
                    <button
                      type="button"
                      className={`${buttonClass} min-h-11 w-full shadow-none transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 sm:w-auto`}
                      onClick={() =>
                        setSelectedInvoice({ invoice, lookupValue })
                      }
                    >
                      <CreditCard className="h-4 w-4" /> Bayar Tagihan
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-500 text-center py-6">Tidak ada tagihan yang belum dibayar.</p>
            )}
          </div>
        </div>
      )}

      {voucherResult && (
        <div className="portal-enter rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 shadow-sm sm:rounded-3xl sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-200 pb-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Status Pesanan Voucher</h2>
              <p className="mt-1 text-xs text-amber-800">Kode bayar {voucherResult.paymentCode}</p>
            </div>
            <button
              type="button"
              className={`${secondaryButtonClass} min-h-9 !px-3 !py-1.5 !text-xs`}
              disabled={busy}
              onClick={() => void lookup(lookupValue)}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
          <div className="mt-4 grid gap-2 rounded-xl bg-white/80 p-3.5 text-xs sm:grid-cols-2">
            <p>Pesanan: <b className="font-mono">{voucherResult.paymentCode || voucherResult.orderId}</b></p>
            <p>Status: <b>{voucherResult.status === "settlement" ? "Lunas — terverifikasi" : voucherResult.status === "pending" ? "Menunggu pembayaran" : voucherResult.status}</b></p>
            <p>Paket: <b>{voucherResult.packageName}</b></p>
            <p>Nominal: <b>{rupiah(voucherResult.amount)}</b></p>
          </div>
          {voucherResult.status === "pending" && voucherResult.qrString && (
            <div className="mt-4 flex flex-col items-center rounded-xl border border-amber-200 bg-white p-4">
              <p className="mb-3 text-xs font-semibold">Scan QRIS untuk membayar</p>
              <QrCode value={voucherResult.qrString} size={220} />
            </div>
          )}
          {voucherResult.voucher && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Kode Voucher Hotspot</p>
              <p className="mt-1 font-mono text-2xl font-bold">{voucherResult.voucher.code}</p>
              <p className="mt-2 text-xs">Password: <b className="font-mono">{voucherResult.voucher.password || voucherResult.voucher.code}</b></p>
              <p className="text-xs">Masa berlaku: <b>{voucherResult.voucher.validityDuration}</b></p>
            </div>
          )}
          {voucherResult.manualMethod && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4 text-xs">
              <p className="font-bold">Instruksi pembayaran: {voucherResult.manualMethod.name}</p>
              <p>{voucherResult.manualMethod.accountNumber} a.n. {voucherResult.manualMethod.accountHolder}</p>
              {voucherResult.manualMethod.instructions && <p className="mt-2 whitespace-pre-wrap">{voucherResult.manualMethod.instructions}</p>}
            </div>
          )}
          {voucherResult.operatorUrl && voucherResult.status === "pending" && (
            <a className="mt-4 inline-flex items-center gap-1 font-semibold underline" href={voucherResult.operatorUrl} target="_blank" rel="noreferrer">
              Konfirmasi ke operator <ChevronRight className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {selectedInvoice && (
        <PortalPaymentDialog
          {...selectedInvoice}
          options={options}
          onClose={() => {
            setSelectedInvoice(null);
            void lookup(lookupValue);
          }}
        />
      )}
    </section>
  );
}

export function PortalPage() {
  const [portalStatus, setPortalStatus] = useState<PortalStatus>({
    connected: false,
  });
  const [paymentOptions, setPaymentOptions] = useState<PaymentOptions | null>(
    null,
  );
  const [hotspotProfiles, setHotspotProfiles] = useState<VoucherProfile[]>([]);
  const [selectedInvoice, setSelectedInvoice] =
    useState<PaymentSelection | null>(null);
  const [activeTab, setActiveTab] = useState<"customer" | "voucher" | "check_voucher">(() => {
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (tabParam === "voucher") return "voucher";
    if (tabParam === "check_voucher" || tabParam === "cek") return "check_voucher";
    return "customer";
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [voucherName, setVoucherName] = useState("");
  const [voucherPhone, setVoucherPhone] = useState("");
  const [voucherEmail, setVoucherEmail] = useState("");
  const [voucherProfileId, setVoucherProfileId] = useState("");
  const [voucherMode, setVoucherMode] = useState<"automatic" | "manual">(
    "automatic",
  );
  const [voucherMethodId, setVoucherMethodId] = useState("");
  const [voucherOrder, setVoucherOrder] = useState<VoucherOrder | null>(() => {
    try {
      const stored = sessionStorage.getItem("smartbilling_voucher_order");
      return stored ? (JSON.parse(stored) as VoucherOrder) : null;
    } catch {
      return null;
    }
  });
  const [voucherStatus, setVoucherStatus] = useState<VoucherOrderStatus | null>(
    null,
  );
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupResult, setLookupResult] = useState<VoucherLookupData | null>(null);
  const [copiedKey, setCopiedKey] = useState("");
  const [recentVouchers, setRecentVouchers] = useState<RecentVoucher[]>(() => {
    try {
      const stored = localStorage.getItem("smartbilling_recent_vouchers");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [billingLink, setBillingLink] = useState<BillingLink | null>(null);
  const [linkToken, setLinkToken] = useState("");
  const pathname = window.location.pathname;
  const isBillingLink = pathname === "/portal/billing";
  const isCustomerDashboard = pathname === "/portal/dashboard";
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardPhone, setDashboardPhone] = useState("");
  const [dashboardCode, setDashboardCode] = useState("");
  const [dashboardVerificationToken, setDashboardVerificationToken] = useState("");
  const [dashboardAuthenticated, setDashboardAuthenticated] = useState(false);
  const [dashboardCustomer, setDashboardCustomer] = useState<CustomerDashboard | null>(null);
  const query = new URLSearchParams(window.location.search);
  const paymentReturn = query.get("payment");
  const returnInvoiceId = query.get("invoiceId");
  const returnOrderId = query.get("orderId");
  const brandName =
    portalStatus.companyName ||
    portalStatus.brandName ||
    portalStatus.appName ||
    "SmartBilling";

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        if (paymentReturn === "success" || paymentReturn === "return") {
          setNotice(
            "Anda kembali dari halaman pembayaran. Kami sedang memeriksa status transaksi dari server Billing.",
          );
        } else if (paymentReturn === "failed") {
          setNotice(
            "Pembayaran dibatalkan atau belum berhasil. Jika saldo sudah terpotong, status akan diperbarui setelah konfirmasi resmi dari server.",
          );
        }
        const [status, options, vouchers] = await Promise.all([
          apiRequest<PortalStatus>("/api/portal/status"),
          apiRequest<PaymentOptions>("/api/portal/payment-options"),
          apiRequest<{ profiles: VoucherProfile[] }>("/api/portal/vouchers"),
        ]);
        if (!mounted) return;
        setPortalStatus(status);
        setPaymentOptions(options);
        setHotspotProfiles(vouchers.profiles);
        setVoucherMode(options.automaticAvailable ? "automatic" : "manual");
        setVoucherMethodId(options.manualMethods[0]?.id || "");
        setVoucherProfileId(vouchers.profiles[0]?.id || "");

        if (isBillingLink) {
          const token =
            new URLSearchParams(window.location.search).get("token") || "";
          setLinkToken(token);
          if (!token) throw new Error("Tautan tagihan tidak valid.");
          const link = await apiRequest<BillingLink>(
            "/api/portal/billing-link",
            {
              method: "POST",
              body: jsonBody({ token }),
            },
          );
          if (mounted) setBillingLink(link);
        }
      } catch (loadError) {
        if (mounted)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Portal belum dapat dimuat.",
          );
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [isBillingLink, paymentReturn]);

  useEffect(() => {
    if (
      !isBillingLink ||
      !linkToken ||
      !billingLink?.invoices.some((invoice) => invoice.status === "unpaid")
    )
      return;
    let active = true;
    const refreshLink = async () => {
      try {
        const link = await apiRequest<BillingLink>("/api/portal/billing-link", {
          method: "POST",
          body: jsonBody({ token: linkToken }),
        });
        if (active) setBillingLink(link);
      } catch (refreshError) {
        if (active)
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : "Status tagihan belum dapat diperbarui.",
          );
      }
    };
    const timer = window.setInterval(() => void refreshLink(), 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [billingLink, isBillingLink, linkToken]);

  useEffect(() => {
    if (paymentReturn !== "success" && paymentReturn !== "return") return;
    const invoicePaid = (invoices: PortalInvoice[] | undefined) =>
      invoices?.some(
        (invoice) =>
          (!returnInvoiceId || invoice.id === returnInvoiceId) &&
          invoice.status === "paid",
      ) || false;
    if (invoicePaid(billingLink?.invoices)) {
      setNotice(
        "Pembayaran terverifikasi. Status tagihan sudah diperbarui oleh Billing.",
      );
    } else if (
      returnOrderId &&
      voucherOrder?.orderId === returnOrderId &&
      voucherStatus?.status === "settlement"
    ) {
      setNotice("Pembayaran terverifikasi. Voucher siap digunakan.");
    }
  }, [
    billingLink,
    paymentReturn,
    returnInvoiceId,
    returnOrderId,
    voucherOrder,
    voucherStatus,
  ]);

  useEffect(() => {
    if (!voucherOrder) return;
    sessionStorage.setItem(
      "smartbilling_voucher_order",
      JSON.stringify(voucherOrder),
    );
    let active = true;
    const checkStatus = async () => {
      try {
        const next = await apiRequest<VoucherOrderStatus>(
          "/api/portal/voucher-orders/status",
          {
            method: "POST",
            body: jsonBody({
              orderId: voucherOrder.orderId,
              phone: voucherOrder.phone,
            }),
          },
        );
        if (!active) return;
        setVoucherStatus(next);
        if (next.status !== "pending") {
          sessionStorage.removeItem("smartbilling_voucher_order");
          if (next.status === "settlement")
            setNotice("Pembayaran terverifikasi. Voucher siap digunakan.");
        }
      } catch {
        if (active) setVoucherStatus(null);
      }
    };
    void checkStatus();
    const timer = window.setInterval(() => void checkStatus(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [voucherOrder]);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 2000);
    } catch {
      // fallback
    }
  };

  const addRecentVoucher = (voucherItem: RecentVoucher) => {
    setRecentVouchers(current => {
      const filtered = current.filter(v => v.orderId !== voucherItem.orderId && v.paymentCode !== voucherItem.paymentCode);
      const next = [voucherItem, ...filtered].slice(0, 8);
      try {
        localStorage.setItem("smartbilling_recent_vouchers", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleLookupVoucher = async (queryToUse?: string) => {
    const q = (queryToUse !== undefined ? queryToUse : lookupQuery).trim();
    if (!q) {
      setLookupError("Silakan masukkan Kode Bayar atau nomor WhatsApp.");
      return;
    }
    setLookupBusy(true);
    setLookupError("");
    try {
      const result = await apiRequest<VoucherLookupData>("/api/portal/voucher-lookup", {
        method: "POST",
        body: jsonBody({ query: q }),
      });
      setLookupResult(result);
      if (result.orderId) {
        addRecentVoucher({
          orderId: result.orderId,
          paymentCode: result.paymentCode || result.orderId,
          packageName: result.packageName,
          amount: result.amount,
          phone: result.customerPhone,
          createdAt: result.createdAt,
        });
      }
    } catch (err: any) {
      setLookupResult(null);
      setLookupError(err.message || "Pesanan voucher tidak ditemukan.");
    } finally {
      setLookupBusy(false);
    }
  };

  // Auto-poll when lookupResult is pending
  useEffect(() => {
    if (activeTab !== "check_voucher" || !lookupResult || lookupResult.status !== "pending") return;
    const interval = window.setInterval(async () => {
      try {
        const updated = await apiRequest<VoucherLookupData>("/api/portal/voucher-lookup", {
          method: "POST",
          body: jsonBody({ query: lookupResult.paymentCode || lookupResult.orderId }),
        });
        setLookupResult(updated);
      } catch {}
    }, 4000);
    return () => window.clearInterval(interval);
  }, [activeTab, lookupResult]);

  const createVoucherOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<VoucherOrder & PaymentResult>(
        "/api/portal/voucher-orders",
        {
          method: "POST",
          body: jsonBody({
            profileId: voucherProfileId,
            customerName: voucherName,
            phone: voucherPhone,
            ...(voucherEmail ? { email: voucherEmail } : {}),
            paymentMode: voucherMode,
            ...(voucherMode === "manual" ? { methodId: voucherMethodId } : {}),
          }),
        },
      );
      if (result.redirectUrl) {
        sessionStorage.setItem(
          "smartbilling_voucher_order",
          JSON.stringify({
            orderId: result.orderId,
            phone: voucherPhone,
            status: "pending",
          }),
        );
        window.location.assign(result.redirectUrl);
        return;
      }
      if (result.orderId) {
        setVoucherOrder({
          orderId: result.orderId,
          phone: voucherPhone,
          status: result.status,
          paymentCode: result.paymentCode,
          expiresAt: result.expiresAt,
          qrString: result.qrString,
          amount: result.amount,
          operatorUrl: result.operatorUrl,
          message: result.message,
        });
        const selectedProf = hotspotProfiles.find(p => p.id === voucherProfileId);
        addRecentVoucher({
          orderId: result.orderId,
          paymentCode: result.paymentCode || result.orderId,
          packageName: selectedProf?.name || "Voucher Hotspot",
          amount: selectedProf?.price || 0,
          phone: voucherPhone,
          createdAt: new Date().toISOString(),
        });
        setNotice(
          result.message || "Pesanan dibuat. Ikuti instruksi pembayaran.",
        );
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Pesanan belum dapat dibuat.",
      );
    } finally {
      setBusy(false);
    }
  };

  const openPayment = (
    invoice: PortalInvoice,
    token?: string,
    lookup?: string,
  ) => {
    setSelectedInvoice({ invoice, portalToken: token, lookupValue: lookup });
  };

  const loadCustomerDashboard = useCallback(async () => {
    const result = await apiRequest<CustomerDashboard>("/api/internal/portal/customer", {
      method: "POST",
      body: jsonBody({}),
    });
    setDashboardCustomer(result);
  }, []);

  useEffect(() => {
    if (!isCustomerDashboard) return;
    let active = true;
    void (async () => {
      setDashboardLoading(true);
      setDashboardError("");
      try {
        const session = await apiRequest<{
          authenticated: boolean;
          customer?: { phone: string };
        }>("/api/portal/auth/session");
        if (!active) return;
        setDashboardAuthenticated(session.authenticated);
        if (session.authenticated) {
          if (session.customer?.phone) setDashboardPhone(session.customer.phone);
          await loadCustomerDashboard();
        }
      } catch (loadError) {
        if (active) {
          setDashboardError(loadError instanceof Error ? loadError.message : "Dashboard pelanggan belum dapat dimuat.");
        }
      } finally {
        if (active) setDashboardLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isCustomerDashboard, loadCustomerDashboard]);

  const requestDashboardCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setDashboardBusy(true);
    setDashboardError("");
    try {
      const result = await apiRequest<{ verificationToken: string }>("/api/portal/auth/send-otp", {
        method: "POST",
        body: jsonBody({ phone: dashboardPhone }),
      });
      setDashboardVerificationToken(result.verificationToken);
      setNotice("Kode verifikasi sudah dikirim ke WhatsApp terdaftar dan berlaku selama 5 menit.");
    } catch (requestError) {
      setDashboardError(requestError instanceof Error ? requestError.message : "Kode verifikasi belum dapat dikirim.");
    } finally {
      setDashboardBusy(false);
    }
  };

  const verifyDashboardCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setDashboardBusy(true);
    setDashboardError("");
    try {
      await apiRequest<{ ok: boolean }>("/api/portal/auth/verify-otp", {
        method: "POST",
        body: jsonBody({
          phone: dashboardPhone,
          code: dashboardCode,
          verificationToken: dashboardVerificationToken,
        }),
      });
      setDashboardAuthenticated(true);
      setDashboardCode("");
      setNotice("");
      await loadCustomerDashboard();
    } catch (requestError) {
      setDashboardError(requestError instanceof Error ? requestError.message : "Kode verifikasi tidak dapat diperiksa.");
    } finally {
      setDashboardBusy(false);
    }
  };

  const logoutCustomerDashboard = async () => {
    setDashboardBusy(true);
    setDashboardError("");
    try {
      await apiRequest<{ ok: boolean }>("/api/portal/auth/logout", { method: "POST" });
      setDashboardAuthenticated(false);
      setDashboardCustomer(null);
      setDashboardVerificationToken("");
      setDashboardCode("");
    } catch (requestError) {
      setDashboardError(requestError instanceof Error ? requestError.message : "Gagal keluar dari dashboard.");
    } finally {
      setDashboardBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-50 text-zinc-500">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-900" />
          <p className="text-sm font-medium">Memuat Portal Pelanggan...</p>
        </div>
      </main>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-clip bg-gradient-to-b from-white via-zinc-50 to-zinc-100 font-sans text-zinc-900 selection:bg-zinc-200">
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 shadow-[0_4px_20px_-18px_rgba(24,24,27,0.35)] backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-4">
          <a href="/" className="group inline-flex min-w-0 items-center gap-3">
            {portalStatus.brandMainLogoDataUrl ? (
              <img src={portalStatus.brandMainLogoDataUrl} alt={brandName} className="h-12 w-48 max-w-[55vw] object-contain transition duration-300 group-hover:scale-[1.02]" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl bg-zinc-900 text-white shadow-md shadow-zinc-900/15 transition duration-300 group-hover:-rotate-3 group-hover:scale-105">
                <Wifi className="h-4 w-4" />
              </span>
            )}
            {!portalStatus.brandMainLogoDataUrl && (
              <b className="min-w-0 truncate text-[15px] tracking-tight text-zinc-900">{brandName}</b>
            )}
          </a>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {isCustomerDashboard ? (
              <>
                <a href="/" className={`${secondaryButtonClass} min-h-10 flex-1 !px-3 !py-2 text-xs sm:flex-none`}>
                  <ChevronRight className="h-3.5 w-3.5 rotate-180" /> Portal utama
                </a>
                {dashboardAuthenticated && (
                  <button
                    type="button"
                    className={`${secondaryButtonClass} min-h-10 flex-1 !px-3 !py-2 text-xs sm:flex-none`}
                    onClick={() => void logoutCustomerDashboard()}
                    disabled={dashboardBusy}
                  >
                    Keluar
                  </button>
                )}
              </>
            ) : !isBillingLink && (
              <div className="grid w-full grid-cols-2 rounded-xl border border-zinc-200 bg-zinc-100 p-1 sm:w-auto">
                <button
                  type="button"
                  className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-all duration-200 active:scale-[0.98] sm:min-h-9 sm:px-3 ${activeTab === "customer" ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-500 hover:text-zinc-900"}`}
                  onClick={() => setActiveTab("customer")}
                  aria-pressed={activeTab === "customer"}
                >
                  <CreditCard className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Cek Tagihan / Status</span>
                </button>
                <button
                  type="button"
                  className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-all duration-200 active:scale-[0.98] sm:min-h-9 sm:px-3 ${activeTab === "voucher" ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-500 hover:text-zinc-900"}`}
                  onClick={() => setActiveTab("voucher")}
                  aria-pressed={activeTab === "voucher"}
                >
                  <Wifi className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Beli Voucher</span>
                </button>
              </div>
            )}
          </div>
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-5 sm:py-10">
        {!portalStatus.connected && (
          <div
            role="alert"
            className="mb-6 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          >
            <AlertCircle className="h-5 w-5 shrink-0" /> Server Billing belum
            terhubung. Beberapa layanan Portal sementara tidak tersedia.
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 shadow-sm"
          >
            {notice}
          </div>
        )}

        {!isBillingLink && !isCustomerDashboard && recentVouchers.length > 0 && activeTab !== "check_voucher" && (
          <div className="mx-auto mb-4 max-w-5xl">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-900 shadow-sm">
              <div className="flex items-center gap-2">
                <Ticket className="h-4 w-4 shrink-0 text-amber-700" />
                <span>
                  Pesanan voucher terakhir: <b className="font-mono">{recentVouchers[0].paymentCode}</b> ({recentVouchers[0].packageName})
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLookupQuery(recentVouchers[0].paymentCode);
                  const url = new URL(window.location.href);
                  url.searchParams.set("tab", "customer");
                  url.searchParams.set("code", recentVouchers[0].paymentCode);
                  window.location.assign(url.toString());
                }}
                className="inline-flex items-center gap-1 font-bold text-amber-800 underline hover:text-amber-950"
              >
                Cek Status Pesanan <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {!isBillingLink && !isCustomerDashboard && activeTab === "customer" && (
          <div className="portal-enter mx-auto mb-5 max-w-3xl sm:mb-7">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              Tagihan internet lebih terpantau
            </h1>
          </div>
        )}

        {isCustomerDashboard ? (
          <section className="portal-enter mx-auto max-w-5xl">
            {dashboardLoading ? (
              <div className="grid min-h-64 place-items-center">
                <div className="flex items-center gap-3 text-sm text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin" /> Memuat dashboard pelanggan...
                </div>
              </div>
            ) : dashboardAuthenticated && dashboardCustomer ? (
              <>
                <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Dashboard pelanggan</p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
                      Halo, {dashboardCustomer.customer.name}
                    </h1>
                    <p className="mt-1 text-sm text-zinc-500">
                      ID pelanggan <span className="font-mono font-semibold text-zinc-700">{dashboardCustomer.customer.customerId}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`${secondaryButtonClass} min-h-10 !px-3 !py-2 text-xs`}
                    onClick={() => {
                      setDashboardBusy(true);
                      setDashboardError("");
                      void loadCustomerDashboard()
                        .catch((refreshError) => setDashboardError(refreshError instanceof Error ? refreshError.message : "Data belum dapat diperbarui."))
                        .finally(() => setDashboardBusy(false));
                    }}
                    disabled={dashboardBusy}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${dashboardBusy ? "animate-spin" : ""}`} /> Perbarui
                  </button>
                </div>

                {dashboardError && (
                  <p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{dashboardError}</p>
                )}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold text-zinc-500">Status layanan</p>
                    <div className="mt-3 flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${dashboardCustomer.customer.status === "active" ? "bg-emerald-500" : "bg-amber-500"}`} />
                      <p className="text-lg font-bold text-zinc-900">
                        {dashboardCustomer.customer.status === "active" ? "Aktif" : dashboardCustomer.customer.status === "isolated" ? "Terisolir" : dashboardCustomer.customer.status === "expiring" ? "Segera jatuh tempo" : "Dinonaktifkan"}
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">Masa layanan sampai {dashboardCustomer.customer.expiredDate || "—"}</p>
                  </article>
                  <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold text-zinc-500">Paket internet</p>
                    <p className="mt-3 text-lg font-bold text-zinc-900">{dashboardCustomer.customer.profileName}</p>
                    <p className="mt-1 text-xs text-zinc-500">{dashboardCustomer.customer.bandwidthLimit || "Kecepatan tidak tersedia"}</p>
                    {dashboardCustomer.customer.pendingPackageName && (
                      <p className="mt-2 text-xs text-indigo-700">Perubahan paket berikutnya: {dashboardCustomer.customer.pendingPackageName}</p>
                    )}
                  </article>
                  <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold text-zinc-500">Biaya bulanan</p>
                    <p className="mt-3 text-lg font-bold text-zinc-900">{rupiah(dashboardCustomer.customer.monthlyFee)}</p>
                    <p className="mt-1 text-xs text-zinc-500">Jatuh tempo setiap tanggal {dashboardCustomer.customer.billingDate}</p>
                  </article>
                </div>

                <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-4 flex items-center justify-between gap-3 border-b border-zinc-100 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-zinc-900">Tagihan & riwayat pembayaran</h2>
                      <p className="mt-1 text-xs text-zinc-500">Tagihan terbaru dan status pembayarannya.</p>
                    </div>
                    <CreditCard className="h-5 w-5 text-zinc-400" />
                  </div>
                  <div className="space-y-3">
                    {dashboardCustomer.invoices.length ? dashboardCustomer.invoices.map((invoice) => (
                      <article key={invoice.id} className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-mono text-sm font-bold text-zinc-900">{invoice.invoiceNumber}</p>
                            <InvoiceStatusBadge invoice={invoice} />
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">{invoice.periodMonth} · Jatuh tempo {invoice.dueDate}</p>
                          {invoice.latestPaymentMethod && <p className="mt-1 text-[11px] text-zinc-500">Pembayaran: {invoice.latestPaymentMethod}</p>}
                          <p className="mt-2 text-lg font-bold text-zinc-900">{rupiah(invoice.totalAmount)}</p>
                        </div>
                        {invoice.status === "unpaid" && (
                          <button
                            type="button"
                            className={`${buttonClass} min-h-10 w-full sm:w-auto`}
                            onClick={() => openPayment(invoice, undefined, dashboardCustomer.customer.customerId)}
                          >
                            <CreditCard className="h-4 w-4" /> Bayar sekarang
                          </button>
                        )}
                      </article>
                    )) : (
                      <p className="py-8 text-center text-sm text-zinc-500">Belum ada riwayat tagihan.</p>
                    )}
                  </div>
                </section>

                <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                  <h2 className="text-sm font-bold text-zinc-900">Bantuan</h2>
                  <p className="mt-1 text-xs text-zinc-500">Hubungi Customer Service jika layanan atau pembayaran Anda memerlukan bantuan.</p>
                  {portalStatus.operatorWhatsapp && (
                    <a className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700" href={`https://wa.me/${portalStatus.operatorWhatsapp}`} target="_blank" rel="noreferrer">
                      Hubungi via WhatsApp <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  )}
                </section>
              </>
            ) : dashboardAuthenticated ? (
              <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
                <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
                <p className="mt-3 font-semibold text-zinc-900">Dashboard belum dapat dimuat</p>
                <p role="alert" className="mt-2 text-sm text-rose-700">{dashboardError || "Silakan coba perbarui kembali."}</p>
                <button
                  type="button"
                  className={`${buttonClass} mt-4`}
                  onClick={() => {
                    setDashboardBusy(true);
                    void loadCustomerDashboard()
                      .catch((refreshError) => setDashboardError(refreshError instanceof Error ? refreshError.message : "Data belum dapat diperbarui."))
                      .finally(() => setDashboardBusy(false));
                  }}
                  disabled={dashboardBusy}
                >
                  <RefreshCw className={`h-4 w-4 ${dashboardBusy ? "animate-spin" : ""}`} /> Coba lagi
                </button>
              </div>
            ) : (
              <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_40px_-28px_rgba(24,24,27,0.35)] sm:p-8">
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Akses aman dengan WhatsApp</p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">Dashboard pelanggan</h1>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500">Masuk menggunakan nomor WhatsApp yang terdaftar. Kami akan mengirim kode verifikasi sekali pakai.</p>
                </div>
                {!dashboardVerificationToken ? (
                  <form onSubmit={(event) => void requestDashboardCode(event)} className="space-y-4">
                    <label className="block text-xs font-semibold text-zinc-700">
                      Nomor WhatsApp terdaftar
                      <input
                        type="tel"
                        autoComplete="tel"
                        maxLength={32}
                        required
                        value={dashboardPhone}
                        onChange={(event) => setDashboardPhone(event.target.value)}
                        className={`${inputClass} mt-1`}
                        placeholder="08xxxxxxxxxx"
                      />
                    </label>
                    <button type="submit" className={`${buttonClass} min-h-11 w-full`} disabled={dashboardBusy || !dashboardPhone.trim()}>
                      {dashboardBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      Kirim kode WhatsApp
                    </button>
                  </form>
                ) : (
                  <form onSubmit={(event) => void verifyDashboardCode(event)} className="space-y-4">
                    <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                      Kode dikirim ke WhatsApp {dashboardPhone}. Kode berlaku 5 menit.
                    </p>
                    <label className="block text-xs font-semibold text-zinc-700">
                      Kode verifikasi 6 digit
                      <input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        value={dashboardCode}
                        onChange={(event) => setDashboardCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                        className={`${inputClass} mt-1 text-center font-mono text-xl tracking-[0.35em]`}
                        placeholder="000000"
                      />
                    </label>
                    <button type="submit" className={`${buttonClass} min-h-11 w-full`} disabled={dashboardBusy || dashboardCode.length !== 6}>
                      {dashboardBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      Verifikasi & masuk
                    </button>
                    <button type="button" className="w-full py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900" onClick={() => {
                      setDashboardVerificationToken("");
                      setDashboardCode("");
                      setDashboardError("");
                    }}>
                      Gunakan nomor lain
                    </button>
                  </form>
                )}
                {dashboardError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{dashboardError}</p>}
                <p className="mt-5 text-center text-[11px] leading-relaxed text-zinc-400">Jangan bagikan kode verifikasi kepada siapa pun.</p>
              </div>
            )}
          </section>
        ) : isBillingLink ? (
          <section className="portal-enter mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_18px_60px_-40px_rgba(24,24,27,0.32)] sm:rounded-3xl sm:p-8">
            <div className="text-center pb-6 border-b border-zinc-100">
              <div className="w-12 h-12 bg-zinc-50 border border-zinc-200 text-zinc-600 rounded-xl mx-auto flex items-center justify-center mb-4">
                <CreditCard className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Pembayaran
              </p>
              <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
                Detail Tagihan
              </h1>
            </div>
            {billingLink ? (
              <>
                <div className="mt-6 mb-4">
                  <p className="text-sm text-zinc-500">Nama Pelanggan</p>
                  <p className="text-lg font-bold text-zinc-900">
                    {billingLink.customer.name}
                  </p>
                  <p className="text-xs font-mono text-zinc-500 mt-1">
                    {billingLink.customer.customerId}
                  </p>
                </div>
                <div className="space-y-3">
                  {billingLink.invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex flex-col gap-4 rounded-xl border border-zinc-100 bg-zinc-50/50 p-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <p className="font-mono font-bold text-zinc-900">
                            #{invoice.invoiceNumber}
                          </p>
                          <InvoiceStatusBadge invoice={invoice} />
                        </div>
                        <p className="text-xs text-zinc-500">
                          {invoice.periodMonth} · Jatuh tempo {invoice.dueDate}
                        </p>
                        <p className="mt-2 text-xl font-bold text-zinc-900">
                          {rupiah(invoice.totalAmount)}
                        </p>
                      </div>
                      {invoice.status === "unpaid" && (
                        <button
                          className={`${buttonClass} shadow-none w-full sm:w-auto`}
                          type="button"
                          onClick={() => openPayment(invoice, linkToken)}
                        >
                          <CreditCard className="h-4 w-4" />
                          Bayar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-5 text-sm text-zinc-500 text-center">
                Memeriksa tautan tagihan...
              </p>
            )}
            <div className="mt-8 pt-6 border-t border-zinc-100 text-center">
              <a
                href="/"
                className="text-sm font-semibold text-zinc-500 hover:text-zinc-900 transition inline-flex items-center gap-1"
              >
                <ChevronRight className="w-4 h-4 rotate-180" /> Kembali ke
                halaman utama
              </a>
            </div>
          </section>
        ) : activeTab === "customer" ? (
          <PublicBillingLookup options={paymentOptions} />
        ) : activeTab === "check_voucher" ? (
          <PublicBillingLookup options={paymentOptions} />
        ) : (
          <section className="portal-enter">
            {/* Header Voucher dengan Sub-menu Beli vs Cek Status */}
            <div className="mx-auto mb-6 max-w-5xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
                    Voucher Hotspot
                  </h1>
                  <p className="mt-1 text-xs text-zinc-500">
                    Beli paket voucher hotspot internet atau periksa status pesanan Anda.
                  </p>
                </div>
                <div className="inline-flex rounded-xl bg-zinc-100 p-1 border border-zinc-200 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setActiveTab("voucher")}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                  >
                    Beli Voucher Baru
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("customer")}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg text-zinc-600 hover:text-zinc-900 transition flex items-center gap-1.5"
                  >
                    <Ticket className="h-3.5 w-3.5 text-amber-600" />
                    Cek Tagihan / Status
                  </button>
                </div>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl gap-4 sm:gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_40px_-28px_rgba(24,24,27,0.35)] sm:rounded-3xl sm:p-8">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Langkah 1</p>
                    <h2 className="mt-1 text-lg font-bold text-zinc-900">Pilih Paket</h2>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-100 text-zinc-600"><Wifi className="h-4 w-4" /></span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {hotspotProfiles.map((profile) => (
                    <button
                      type="button"
                      key={profile.id}
                      onClick={() => setVoucherProfileId(profile.id)}
                      aria-pressed={voucherProfileId === profile.id}
                      className={`group relative rounded-2xl border p-4 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 sm:p-5 ${voucherProfileId === profile.id ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900 shadow-sm" : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"}`}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <b className="block truncate text-base text-zinc-900">{profile.name}</b>
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            <span className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-600">{profile.speedLimit}</span>
                            <span className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-600">{profile.validityDuration}</span>
                          </span>
                        </span>
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition ${voucherProfileId === profile.id ? "bg-zinc-900 text-white" : "border border-zinc-200 text-transparent group-hover:border-zinc-400"}`}>
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                      </span>
                      {profile.dataLimitMb && <span className="mt-3 block text-[11px] text-zinc-400">Kuota {profile.dataLimitMb} MB</span>}
                      <span className="mt-2 block text-[10px] text-zinc-500">Masa berlaku dimulai saat voucher pertama kali digunakan.</span>
                      <span className="mt-4 flex items-end justify-between border-t border-zinc-100 pt-3">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Harga</span>
                        <span className="text-xl font-bold tracking-tight text-zinc-900">{rupiah(profile.price)}</span>
                      </span>
                    </button>
                  ))}
                  {!hotspotProfiles.length && (
                    <p className="text-sm text-zinc-500 col-span-2 py-8 text-center border border-dashed border-zinc-200 rounded-xl">
                      Belum ada paket hotspot yang tersedia.
                    </p>
                  )}
                </div>
              </div>

              <form
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_40px_-28px_rgba(24,24,27,0.35)] sm:sticky sm:top-36 sm:rounded-3xl sm:p-8"
                onSubmit={(event) => void createVoucherOrder(event)}
              >
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Langkah 2</p>
                    <h2 className="mt-1 text-lg font-bold text-zinc-900">Data & Pembayaran</h2>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-100 text-zinc-600"><CreditCard className="h-4 w-4" /></span>
                </div>
                <div className="space-y-3">
                  <input
                    className={inputClass}
                    value={voucherName}
                    onChange={(event) => setVoucherName(event.target.value)}
                    placeholder="Nama lengkap"
                    required
                    maxLength={100}
                  />
                  <input
                    className={inputClass}
                    value={voucherPhone}
                    onChange={(event) => setVoucherPhone(event.target.value)}
                    placeholder="Nomor WhatsApp"
                    required
                    maxLength={32}
                  />
                  <input
                    className={inputClass}
                    type="email"
                    value={voucherEmail}
                    onChange={(event) => setVoucherEmail(event.target.value)}
                    placeholder="Email (opsional)"
                    maxLength={254}
                  />
                </div>
                <div className="mt-5 space-y-2">
                  {paymentOptions?.automaticAvailable && (
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${voucherMode === "automatic" ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900" : "border-zinc-200"}`}
                    >
                      <input
                        type="radio"
                        className="accent-zinc-900"
                        checked={voucherMode === "automatic"}
                        onChange={() => setVoucherMode("automatic")}
                      />
                      <span className="text-sm font-medium text-zinc-900">
                        Otomatis ({paymentOptions.provider.toUpperCase()})
                      </span>
                    </label>
                  )}
                  {paymentOptions?.manualMethods.map((method) => (
                    <label
                      key={method.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${voucherMode === "manual" && voucherMethodId === method.id ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900" : "border-zinc-200"}`}
                    >
                      <input
                        type="radio"
                        className="mt-0.5 accent-zinc-900"
                        checked={
                          voucherMode === "manual" &&
                          voucherMethodId === method.id
                        }
                        onChange={() => {
                          setVoucherMode("manual");
                          setVoucherMethodId(method.id);
                        }}
                      />
                      <span className="text-sm font-medium text-zinc-900">
                        {method.name}
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  className={`${buttonClass} mt-6 min-h-12 w-full transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0`}
                  disabled={
                    busy ||
                    !voucherProfileId ||
                    (voucherMode === "manual" && !voucherMethodId)
                  }
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  {busy ? "Membuat pesanan..." : "Buat Pesanan Sekarang"}
                </button>
                {voucherOrder && (
                  <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="flex items-center gap-2 font-semibold mb-2">
                      <Clock3 className="w-4 h-4" />
                      Kode pesanan: {voucherOrder.paymentCode || voucherOrder.orderId}
                    </div>
                    <p>
                      Status:{" "}
                      {voucherStatus?.status === "settlement"
                        ? "Lunas — terverifikasi"
                        : voucherStatus?.status === "pending"
                          ? "Menunggu pembayaran"
                          : voucherStatus?.status || voucherOrder.status}
                    </p>
                    {voucherOrder.qrString && (voucherStatus?.status || voucherOrder.status) === "pending" && (
                      <div className="mt-4 flex flex-col items-center rounded-xl border border-amber-200 bg-white p-4">
                        <p className="mb-3 text-xs font-semibold">Scan QRIS untuk membayar</p>
                        {voucherOrder.amount !== undefined && (
                          <p className="mb-3 font-semibold">{rupiah(voucherOrder.amount)}</p>
                        )}
                        <QrCode value={voucherOrder.qrString} size={220} />
                        {voucherOrder.expiresAt && (
                          <p className="mt-3 text-[11px]">
                            Berlaku sampai {new Date(voucherOrder.expiresAt).toLocaleString("id-ID")}
                          </p>
                        )}
                      </div>
                    )}
                    {voucherOrder.message && (
                      <p className="mt-2 text-xs">{voucherOrder.message}</p>
                    )}
                    {voucherOrder.operatorUrl && (
                      <a
                        className="mt-3 inline-flex items-center gap-1 font-semibold underline"
                        href={voucherOrder.operatorUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Konfirmasi ke operator{" "}
                        <ChevronRight className="w-3 h-3" />
                      </a>
                    )}
                    {voucherStatus?.voucher && (
                      <div className="mt-3 rounded-xl bg-white border border-amber-200 p-3 text-amber-900">
                        <p className="font-bold text-lg font-mono">
                          {voucherStatus.voucher.code}
                        </p>
                        <p className="text-xs mt-1">
                          Password:{" "}
                          {voucherStatus.voucher.password ||
                            voucherStatus.voucher.code}
                        </p>
                        <p className="text-xs">
                          Masa berlaku: {voucherStatus.voucher.validityDuration}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </div>
          </section>
        )}
      </main>

      <footer className="mt-auto border-t border-zinc-200 bg-zinc-100 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8 text-zinc-700">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <a href="/" className="inline-flex items-center gap-3">
                {portalStatus.brandMainLogoDataUrl ? (
                  <img src={portalStatus.brandMainLogoDataUrl} alt={brandName} className="h-14 w-56 max-w-[65vw] object-contain" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-white text-zinc-700 ring-1 ring-zinc-200">
                    <Wifi className="h-5 w-5" />
                  </span>
                )}
                <span>
                  {!portalStatus.brandMainLogoDataUrl && (
                    <b className="block text-base font-bold tracking-tight text-zinc-900">{brandName}</b>
                  )}
                </span>
              </a>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-600">
                {portalStatus.tagline || "Kelola tagihan internet dan beli voucher hotspot dengan mudah."}
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1.5 text-[11px]">
                <span className={`h-2 w-2 rounded-full ${portalStatus.connected ? "bg-emerald-500" : "bg-rose-500"}`} />
                <span className="text-zinc-600">{portalStatus.connected ? "Layanan portal aktif" : "Layanan sedang terganggu"}</span>
              </div>
            </div>

            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">Butuh bantuan?</h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                Hubungi tim layanan pelanggan jika membutuhkan bantuan terkait koneksi atau pembayaran.
              </p>
              {portalStatus.operatorWhatsapp ? (
                <a
                  className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
                  href={`https://wa.me/${portalStatus.operatorWhatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Hubungi Customer Service <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              ) : (
                <p className="mt-3 text-xs text-zinc-500">Kontak Customer Service belum tersedia.</p>
              )}
              {portalStatus.officeAddress && (
                <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-zinc-600">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  <span>{portalStatus.officeAddress}</span>
                </p>
              )}
            </div>

            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">Portal & pembayaran</h2>
              <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-zinc-600">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                <span>Periksa tagihan atau pilih menu Beli Voucher untuk membeli paket hotspot.</span>
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4 border-t border-zinc-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-zinc-500">© {new Date().getFullYear()} {brandName}. Hak cipta dilindungi.</p>
            <div className="flex flex-wrap gap-2">
              {!isCustomerDashboard && (
                <a href="/portal/dashboard" className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 sm:self-auto">
                  Dashboard Pelanggan <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}
              <a
                href="/admin"
                className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 sm:self-auto"
              >
                Login Admin <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
      {selectedInvoice && (
        <PortalPaymentDialog
          {...selectedInvoice}
          options={paymentOptions}
          onClose={() => {
            setSelectedInvoice(null);
            if (isCustomerDashboard && dashboardAuthenticated) void loadCustomerDashboard();
          }}
        />
      )}
    </div>
  );
}
