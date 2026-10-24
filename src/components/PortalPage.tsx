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
} from "lucide-react";

interface PortalStatus {
  connected: boolean;
  appName?: string;
  brandName?: string;
  companyName?: string;
  tagline?: string;
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
  timeoutMinutes: number;
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
}

interface VoucherOrderStatus {
  status: string;
  expiresAt?: string;
  voucher?: { code: string; password?: string; validityDuration: string };
}

interface BillingLink {
  customer: { name: string; customerId: string; profileName: string };
  invoices: PortalInvoice[];
}

interface PaymentResult {
  redirectUrl?: string;
  orderId?: string;
  paymentCode?: string;
  expiresAt?: string;
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

        {result?.paymentCode ? (
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
            {result.expiresAtFormatted && (
              <p className="mt-4 text-xs text-zinc-500">
                Batas konfirmasi: {result.expiresAtFormatted}
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

function PublicBillingLookup({ options }: { options: PaymentOptions | null }) {
  const [lookupValue, setLookupValue] = useState("");
  const [result, setResult] = useState<BillingLink | null>(null);
  const [selectedInvoice, setSelectedInvoice] =
    useState<PaymentSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Fungsi pencarian (Hanya mengambil data, tanpa menyimpan ke sessionStorage)
  const lookup = useCallback(async (value: string) => {
    setBusy(true);
    setError("");
    try {
      const billing = await apiRequest<BillingLink>("/api/portal/billing", {
        method: "POST",
        body: jsonBody({ lookupValue: value }),
      });
      setResult(billing);
    } catch (lookupError) {
      setResult(null);
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : "Tagihan belum dapat diperiksa.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  // Logika auto-refresh dan sessionStorage DIHAPUS sesuai permintaan.
  // Jika user me-refresh browser, state akan kosong kembali.

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = lookupValue.trim();
    if (value) {
      void lookup(value);
    }
  };

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <form
        className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm"
        onSubmit={submit}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-600">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              Cek Tagihan Anda
            </h2>
            <p className="text-xs text-zinc-500">
              Masukkan ID Pelanggan atau Nomor WhatsApp terdaftar.
            </p>
          </div>
        </div>

        <label className="block">
          <input
            className={`${inputClass} text-center font-mono text-lg tracking-wider`}
            value={lookupValue}
            onChange={(event) => setLookupValue(event.target.value)}
            placeholder="ID Pelanggan / No. WhatsApp"
            autoComplete="off"
            maxLength={128}
            required
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-600 text-center">
            {error}
          </p>
        )}
        <button
          className={`${buttonClass} mt-4 w-full`}
          disabled={busy || !lookupValue.trim()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {busy ? "Memeriksa Data..." : "Cek Tagihan Sekarang"}
        </button>
      </form>

      {result && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm animate-[fadeInUp_0.3s_ease-out]">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-5 border-b border-zinc-100">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Data Ditemukan
              </p>
              <h2 className="text-xl font-bold text-zinc-900">
                {result.customer.name}
              </h2>
              <p className="text-sm text-zinc-500 mt-0.5">
                ID:{" "}
                <span className="font-mono text-zinc-700">
                  {result.customer.customerId}
                </span>
              </p>
            </div>
            <button
              type="button"
              className={`${secondaryButtonClass} !px-3 !py-1.5 !text-xs`}
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
                  className="group flex flex-col gap-4 rounded-xl border border-zinc-100 bg-zinc-50/50 p-5 transition hover:border-zinc-200 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <p className="font-mono font-bold text-zinc-900 text-base">
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
                    {invoice.latestPaymentMethod && (
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Via: {invoice.latestPaymentMethod}
                      </p>
                    )}
                  </div>
                  {invoice.status === "unpaid" && (
                    <button
                      type="button"
                      className={`${buttonClass} w-full sm:w-auto shadow-none`}
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
              <p className="text-sm text-zinc-500 text-center py-6">
                Belum ada riwayat tagihan.
              </p>
            )}
          </div>
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
  const [activeTab, setActiveTab] = useState<"customer" | "voucher">(() =>
    new URLSearchParams(window.location.search).get("tab") === "voucher"
      ? "voucher"
      : "customer",
  );
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
  const [billingLink, setBillingLink] = useState<BillingLink | null>(null);
  const [linkToken, setLinkToken] = useState("");
  const pathname = window.location.pathname;
  const isBillingLink = pathname === "/portal/billing";
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
          operatorUrl: result.operatorUrl,
          message: result.message,
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
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col font-sans selection:bg-zinc-200">
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-40">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <a href="/" className="flex items-center gap-3 group">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 text-white shadow-sm group-hover:scale-105 transition">
              <Wifi className="h-4 w-4" />
            </span>
            <span>
              <b className="block text-[15px] tracking-tight text-zinc-900">
                {brandName}
              </b>
              <span className="text-[11px] font-medium text-zinc-500">
                Portal Pelanggan
              </span>
            </span>
          </a>
          <div className="flex items-center gap-2">
            {!isBillingLink && (
              <div className="flex bg-zinc-100 rounded-lg p-1 border border-zinc-200">
                <button
                  type="button"
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === "customer" ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-500 hover:text-zinc-900"}`}
                  onClick={() => setActiveTab("customer")}
                >
                  Cek Tagihan
                </button>
                <button
                  type="button"
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === "voucher" ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-500 hover:text-zinc-900"}`}
                  onClick={() => setActiveTab("voucher")}
                >
                  Beli Voucher
                </button>
              </div>
            )}
            <a
              href="/admin"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-900"
            >
              Login Admin
            </a>
          </div>
        </nav>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-5 py-8 sm:py-12">
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

        {!isBillingLink && activeTab === "customer" && (
          <div className="mb-8 text-center max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
              Cek & Bayar Tagihan
            </h1>
            <p className="mt-3 text-sm text-zinc-500 leading-relaxed">
              Masukkan ID pelanggan atau nomor WhatsApp terdaftar untuk melihat
              tagihan dan masa aktif layanan Anda.
            </p>
          </div>
        )}

        {isBillingLink ? (
          <section className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm animate-[fadeInUp_0.3s_ease-out]">
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
        ) : (
          <section className="animate-[fadeInUp_0.3s_ease-out]">
            <div className="mx-auto max-w-2xl text-center mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
                Beli Voucher Hotspot
              </h1>
              <p className="mt-3 text-sm text-zinc-500 leading-relaxed">
                Pilih paket hotspot dan selesaikan pembayaran untuk menerima
                kode akses internet.
              </p>
            </div>
            <div className="mx-auto max-w-5xl grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm">
                <h2 className="text-lg font-bold text-zinc-900 mb-5">
                  1. Pilih Paket
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {hotspotProfiles.map((profile) => (
                    <button
                      type="button"
                      key={profile.id}
                      onClick={() => setVoucherProfileId(profile.id)}
                      className={`rounded-xl border p-5 text-left transition-all ${voucherProfileId === profile.id ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900" : "border-zinc-200 bg-white hover:bg-zinc-50"}`}
                    >
                      <b className="block text-base text-zinc-900">
                        {profile.name}
                      </b>
                      <span className="mt-1.5 block text-xs font-medium text-zinc-500">
                        {profile.speedLimit} · {profile.validityDuration}
                      </span>
                      {profile.dataLimitMb && (
                        <span className="mt-1 block text-[11px] text-zinc-400">
                          Kuota: {profile.dataLimitMb} MB
                        </span>
                      )}
                      <span className="mt-4 block text-xl font-bold text-zinc-900">
                        {rupiah(profile.price)}
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
                className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm"
                onSubmit={(event) => void createVoucherOrder(event)}
              >
                <h2 className="text-lg font-bold text-zinc-900 mb-5">
                  2. Data & Pembayaran
                </h2>
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
                  className={`${buttonClass} mt-6 w-full`}
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
                      Pesanan {voucherOrder.orderId}
                    </div>
                    <p>
                      Status:{" "}
                      {voucherStatus?.status === "settlement"
                        ? "Lunas — terverifikasi"
                        : voucherStatus?.status === "pending"
                          ? "Menunggu pembayaran"
                          : voucherStatus?.status || voucherOrder.status}
                    </p>
                    {voucherOrder.paymentCode && (
                      <p className="mt-2">
                        Kode bayar:{" "}
                        <b className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200">
                          {voucherOrder.paymentCode}
                        </b>
                      </p>
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

      <footer className="mt-auto border-t border-zinc-200 px-5 py-8 text-center text-xs text-zinc-500">
        <p>{brandName} · Portal Pelanggan</p>
        {portalStatus.operatorWhatsapp && (
          <p className="mt-2">
            <a
              className="text-zinc-900 hover:text-zinc-600 font-medium transition underline"
              href={`https://wa.me/${portalStatus.operatorWhatsapp}`}
              target="_blank"
              rel="noreferrer"
            >
              Hubungi Customer Service
            </a>
          </p>
        )}
      </footer>
      {selectedInvoice && (
        <PortalPaymentDialog
          {...selectedInvoice}
          options={paymentOptions}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}
