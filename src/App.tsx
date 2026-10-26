import React, { useState, useEffect } from "react";
import {
  Customer,
  Invoice,
  Voucher,
  HotspotProfile,
  PppoePackage,
  RouterConfig,
  WhatsAppLog,
  WhatsAppGatewayConfig,
  AppSettings,
} from "./types";
import { StorageService } from "./services/storage";
import { Navbar } from "./components/Navbar";
import { DashboardTab } from "./components/admin/DashboardTab";
import { FinanceTab } from "./components/admin/FinanceTab";
import { CustomersTab } from "./components/admin/CustomersTab";
import { VouchersTab } from "./components/admin/VouchersTab";
import { RoutersTab } from "./components/admin/RoutersTab";
import { WhatsAppTab } from "./components/admin/WhatsAppTab";
import { PaymentGatewayTab } from "./components/admin/PaymentGatewayTab";
import { SettingsTab } from "./components/admin/SettingsTab";
import { AdminAuthPage } from "./components/AdminAuthPage";
import { InvoicePrintModal } from "./components/InvoicePrintModal";
import { VoucherPrintModal } from "./components/VoucherPrintModal";
import { PortalPage } from "./components/PortalPage";
import {
  Send,
  X,
  Check,
  ShieldAlert,
  CheckCircle2,
  Database,
  MessageCircle,
  Router,
} from "lucide-react";
import { ToastProvider, useToast } from "./components/ui/toast";
import { ThemeProvider } from "./components/ui/theme";
import { renderWhatsAppTemplate } from "./utils/whatsappTemplates";

function AppContent() {
  const { toast, confirm: confirmAction } = useToast();
  const [adminTab, setAdminTab] = useState("dashboard");
  const [financeSection, setFinanceSection] = useState<"invoices" | "revenue">("invoices");
  const [authStatus, setAuthStatus] = useState<{
    authenticated: boolean;
    username: string;
    envLoginConfigured: boolean;
    envLoginIncomplete: boolean;
    registrationRequired: boolean;
  } | null>(null);

  // App Settings (Persistent in SQLite database)
  const [appSettings, setAppSettings] = useState<AppSettings>(
    StorageService.getSettings(),
  );

  useEffect(() => {
    const name = appSettings.brandName.trim() || appSettings.appName.trim() || "SmartBilling";
    const initial = Array.from(name)[0]?.toLocaleUpperCase() || "S";
    const escapedInitial = initial.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    })[character] || character);
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#10b981"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="#0b1222"/><rect x="5" y="5" width="54" height="54" rx="15" fill="url(#g)"/><text x="32" y="44" fill="#fff" font-family="Arial,sans-serif" font-size="39" font-weight="800" text-anchor="middle">${escapedInitial}</text></svg>`;
    document.title = `${name} — ISP Billing & Hotspot`;
    const description = appSettings.tagline.trim()
      ? `${appSettings.tagline.trim()} — Kelola pelanggan PPPoE, voucher hotspot, dan tagihan dengan ${name}.`
      : `Kelola pelanggan PPPoE, voucher hotspot, tagihan, pendapatan, dan router MikroTik dengan ${name}.`;
    const socialImage = new URL("/og-image.svg", window.location.origin).href;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') || document.createElement("link");
    favicon.rel = "icon";
    const logoMimeType = appSettings.brandIconDataUrl?.match(/^data:(image\/(?:png|jpeg|webp));base64,/)?.[1];
    favicon.type = logoMimeType || "image/svg+xml";
    favicon.href = appSettings.brandIconDataUrl || `data:image/svg+xml,${encodeURIComponent(icon)}`;
    if (!favicon.isConnected) document.head.appendChild(favicon);

    const updateMeta = (selector: string, content: string) => {
      const meta = document.querySelector<HTMLMetaElement>(selector);
      if (meta) meta.content = content;
    };
    updateMeta('meta[property="og:title"]', `${name} — ISP Billing & Hotspot`);
    updateMeta('meta[name="description"]', description);
    updateMeta('meta[property="og:description"]', description);
    updateMeta('meta[property="og:site_name"]', name);
    updateMeta('meta[property="og:image"]', socialImage);
    updateMeta('meta[name="twitter:description"]', description);
    updateMeta('meta[name="twitter:image"]', socialImage);
    updateMeta('meta[name="twitter:title"]', `${name} — ISP Billing & Hotspot`);
  }, [appSettings.appName, appSettings.brandName, appSettings.brandIconDataUrl, appSettings.tagline]);

  // App Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pppoePackages, setPppoePackages] = useState<PppoePackage[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
  const [routers, setRouters] = useState<RouterConfig[]>([]);
  const [waLogs, setWaLogs] = useState<WhatsAppLog[]>([]);
  const [waConfig, setWaConfig] = useState<WhatsAppGatewayConfig>(
    StorageService.getWaConfig(),
  );
  const [dataSyncError, setDataSyncError] = useState<string | null>(null);

  // Print Modals
  const [printInvoiceData, setPrintInvoiceData] = useState<{
    invoice: Invoice;
    customer?: Customer;
  } | null>(null);
  const [printVouchersData, setPrintVouchersData] = useState<Voucher[] | null>(
    null,
  );

  // Quick WhatsApp Dispatch Modal
  const [quickWaModal, setQuickWaModal] = useState<{
    customer: Customer;
    type: "reminder" | "isolir";
    text: string;
    needsPaymentLink: boolean;
  } | null>(null);
  const [waSending, setWaSending] = useState(false);
  const [waSuccess, setWaSuccess] = useState(false);
  const [waError, setWaError] = useState("");

  const handleSelectAdminTab = (tab: string) => {
    if (tab === "invoices" || tab === "revenue") {
      setFinanceSection(tab);
      setAdminTab("finance");
      return;
    }
    setAdminTab(tab);
  };

  const refreshAllData = (persist = true) => {
    const freshSettings = StorageService.getSettings();
    setAppSettings(freshSettings);
    setCustomers(StorageService.getCustomers());
    setInvoices(StorageService.getInvoices());
    setPppoePackages(StorageService.getPppoePackages());
    setVouchers(StorageService.getVouchers());
    setProfiles(StorageService.getHotspotProfiles());
    setRouters(StorageService.getRouters());
    setWaLogs(StorageService.getWaLogs());
    setWaConfig(StorageService.getWaConfig());

    if (persist) {
      StorageService.syncDataToSqlite()
        .then(() => setDataSyncError(null))
        .catch((error) => {
          setDataSyncError(
            error instanceof Error ? error.message : String(error),
          );
        });
    }
  };

  const loadAdminData = async () => {
    await StorageService.syncDataFromSqlite();
    let syncError: string | null = null;
    try {
      const response = await fetch("/api/admin/customers/sync-mikrotik", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || `HTTP ${response.status}`);
      await StorageService.syncDataFromSqlite();
      if (result.removed || result.updated) {
        toast(
          "Data pelanggan tersinkron dengan MikroTik",
          "success",
          `${result.removed} pelanggan dihapus dari billing, ${result.updated} data diperbarui.`,
        );
      }
    } catch (error) {
      syncError = error instanceof Error ? error.message : String(error);
    }
    const latestSettings = await StorageService.syncFromSqlite();
    setAppSettings(latestSettings);
    setDataSyncError(syncError);
    refreshAllData(false);
  };

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      try {
        const path = window.location.pathname;
        if (path === "/" || path === "/portal" || path === "/portal/billing" || path === "/portal/dashboard") return;
        if (path !== "/admin") {
          window.location.replace("/");
          return;
        }

        const response = await fetch("/api/auth/status");
        const status = await response.json();
        if (!response.ok)
          throw new Error(status.error || `HTTP ${response.status}`);
        if (!mounted) return;
        setAuthStatus(status);
        if (status.authenticated) await loadAdminData();
      } catch (error) {
        if (mounted) {
          setDataSyncError(
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    };

    void initialize();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (
      !authStatus?.authenticated ||
      (window.location.pathname !== "/" && window.location.pathname !== "/admin")
    )
      return;
    let syncing = false;
    const timer = window.setInterval(async () => {
      if (syncing) return;
      syncing = true;
      try {
        const response = await fetch("/api/admin/customers/sync-mikrotik", {
          method: "POST",
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || `HTTP ${response.status}`);
        if (result.removed || result.updated) {
          await StorageService.syncDataFromSqlite();
          refreshAllData(false);
          toast(
            "Pelanggan disinkronkan dari MikroTik",
            "success",
            `${result.removed} dihapus dari billing · ${result.updated} diperbarui.`,
          );
        }
        setDataSyncError(null);
      } catch (error) {
        setDataSyncError(
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        syncing = false;
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [authStatus?.authenticated, toast]);

  const handleLogout = async () => {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || `HTTP ${response.status}`);
      setAuthStatus((current) =>
        current ? { ...current, authenticated: false, username: "" } : current,
      );
    } catch (error) {
      setDataSyncError(error instanceof Error ? error.message : String(error));
    }
  };

  // Handle WhatsApp Reminder from Table / Dashboard
  const handleOpenSendWa = async (
    customer: Customer,
    type: "reminder" | "isolir",
  ) => {
    let text = "";
    let needsPaymentLink = false;
    let paymentLinkCreated = false;
    if (type === "reminder") {
      needsPaymentLink = true;
      setWaError("");
      text = `Halo Bapak/Ibu ${customer.name}, pengingat tagihan layanan PPPoE paket ${customer.servicePackageName || customer.profileName}.`;
      try {
        const response = await fetch(
          `/api/admin/customers/${encodeURIComponent(customer.id)}/payment-link`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ createUpcomingInvoice: true }),
          },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || `HTTP ${response.status}`);
        if (typeof result.url !== "string" || !result.url) throw new Error("Tautan tagihan tidak dibuat oleh server");
        paymentLinkCreated = true;
        const invoice = result.invoice as Invoice | null;
        if (invoice) {
          text =
            typeof result.message === "string"
              ? result.message
              : `Halo Bapak/Ibu ${customer.name}, invoice ${invoice.invoiceNumber} sebesar ${appSettings.currencySymbol} ${invoice.totalAmount.toLocaleString("id-ID")} jatuh tempo pada ${invoice.dueDate}.\n\nDetail pelanggan dan pembayaran: ${result.url}`;
        } else {
          text += ` Masa aktif hingga ${customer.expiredDate}.`;
          text += `\n\nLihat detail pelanggan: ${result.url}`;
        }
      } catch (error) {
        setWaError(error instanceof Error ? error.message : String(error));
      }
    } else {
      needsPaymentLink = true;
      setWaError("");
      text = `PEMBERITAHUAN: Yth. ${customer.name}, akses PPPoE paket ${customer.servicePackageName || customer.profileName} telah dinonaktifkan oleh operator.`;
      try {
        const response = await fetch(
          `/api/admin/customers/${encodeURIComponent(customer.id)}/payment-link`,
          { method: "POST" },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || `HTTP ${response.status}`);
        if (typeof result.url !== "string" || !result.url) throw new Error("Tautan tagihan tidak dibuat oleh server");
        paymentLinkCreated = true;
        text = renderWhatsAppTemplate("isolir", appSettings.whatsappTemplates, {
          customer_name: customer.name,
          business_name: appSettings.companyName.trim() || appSettings.brandName.trim() || appSettings.appName,
          payment_url: result.url,
        });
      } catch (error) {
        setWaError(error instanceof Error ? error.message : String(error));
      }
    }

    setQuickWaModal({
      customer,
      type,
      text,
      needsPaymentLink: needsPaymentLink && !paymentLinkCreated,
    });
    setWaSuccess(false);
    if (!needsPaymentLink) setWaError("");
  };

  const handleConfirmSendWa = async () => {
    if (!quickWaModal) return;
    setWaSending(true);
    setWaError("");
    try {
      const response = await fetch("/api/wa/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: quickWaModal.customer.phone,
          message: quickWaModal.text,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || `OpenWA returned ${response.status}`);
      StorageService.addWaLog({
        recipientPhone: quickWaModal.customer.phone,
        recipientName: quickWaModal.customer.name,
        type: quickWaModal.type === "reminder" ? "reminder_h3" : "isolated",
        message: quickWaModal.text,
        status: "sent",
        responseInfo: JSON.stringify(result.data),
      });
      setWaSuccess(true);
      refreshAllData();
      setTimeout(() => {
        setQuickWaModal(null);
      }, 1500);
    } catch (error) {
      setWaError(error instanceof Error ? error.message : String(error));
      StorageService.addWaLog({
        recipientPhone: quickWaModal.customer.phone,
        recipientName: quickWaModal.customer.name,
        type: quickWaModal.type === "reminder" ? "reminder_h3" : "isolated",
        message: quickWaModal.text,
        status: "failed",
        responseInfo: error instanceof Error ? error.message : String(error),
      });
      refreshAllData();
    } finally {
      setWaSending(false);
    }
  };

  // A single billing action also synchronizes the PPPoE secret on RouterOS.
  const handleToggleIsolir = async (customer: Customer) => {
    const isBlocked =
      customer.status === "isolated" || customer.status === "disabled";
    const newStatus = isBlocked ? "active" : "isolated";
    if (!await confirmAction(
      `${newStatus === "isolated" ? "Isolir pelanggan" : "Aktifkan pelanggan"}?`,
      `Status billing ${customer.name} dan secret PPPoE "${customer.pppoeUsername}" di RouterOS akan ${newStatus === "isolated" ? "dinonaktifkan" : "diaktifkan"}.`
    )) return;

    let routerUpdated = false;
    let routerUpdateError = "";
    try {
      const response = await fetch(
        `/api/mikrotik/pppoe/secrets/${encodeURIComponent(customer.routerId)}/${encodeURIComponent(customer.pppoeUsername)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disabled: newStatus === "isolated" }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `RouterOS returned ${response.status}`);
      routerUpdated = true;
    } catch (error) {
      routerUpdateError = error instanceof Error ? error.message : String(error);
    }
    try {
      const updated: Customer = {
        ...customer,
        status: newStatus,
        notes:
          newStatus === "isolated"
            ? `Status billing diisolir manual oleh NOC.${routerUpdated ? " Secret RouterOS juga dinonaktifkan." : " Gagal menyelaraskan akses RouterOS."}`
            : `Status billing diaktifkan manual oleh NOC.${routerUpdated ? " Secret RouterOS juga diaktifkan." : " Gagal menyelaraskan akses RouterOS."}`,
      };
      StorageService.saveCustomer(updated);

      if (newStatus === "isolated" && appSettings.autoSendIsolir && routerUpdated) {
        let status: "sent" | "failed" = "sent";
        let responseInfo = "";
        let message = `PEMBERITAHUAN ISOLIR: Akses internet PPPoE ${customer.name} pada paket ${customer.servicePackageName || customer.profileName} telah dinonaktifkan.`;
        try {
          const linkResponse = await fetch(
            `/api/admin/customers/${encodeURIComponent(customer.id)}/payment-link`,
            { method: "POST" },
          );
          const linkResult = await linkResponse.json();
          if (!linkResponse.ok)
            throw new Error(linkResult.error || `HTTP ${linkResponse.status}`);
          message = renderWhatsAppTemplate("isolir", appSettings.whatsappTemplates, {
            customer_name: customer.name,
            business_name: appSettings.companyName.trim() || appSettings.brandName.trim() || appSettings.appName,
            payment_url: linkResult.url,
          });
          const waResponse = await fetch("/api/wa/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: customer.phone, message }),
          });
          const waResult = await waResponse.json();
          if (!waResponse.ok)
            throw new Error(
              waResult.error || `OpenWA returned ${waResponse.status}`,
            );
          responseInfo = JSON.stringify(waResult.data);
        } catch (error) {
          status = "failed";
          responseInfo = error instanceof Error ? error.message : String(error);
        }
        StorageService.addWaLog({
          recipientPhone: customer.phone,
          recipientName: customer.name,
          type: "isolated",
          message,
          status,
          responseInfo,
        });
      }

      refreshAllData();
      toast(
        newStatus === "isolated" ? "Status billing diisolir." : "Status billing diaktifkan.",
        routerUpdateError ? "error" : "success",
        routerUpdateError
          ? `Status billing tersimpan, tetapi RouterOS gagal diubah: ${routerUpdateError}`
          : routerUpdated
            ? "Billing dan secret RouterOS berhasil diselaraskan."
            : "RouterOS tidak berhasil diselaraskan."
      );
    } catch (error) {
      toast(
        "Gagal menyimpan status billing",
        "error",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const pathname = window.location.pathname;
  if (pathname === "/" || pathname === "/portal" || pathname === "/portal/billing" || pathname === "/portal/dashboard") {
    return <PortalPage />;
  }
  if (pathname !== "/admin") return null;

  if (!authStatus) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-200 grid place-items-center">
        {dataSyncError || "Memuat..."}
      </main>
    );
  }
  if (!authStatus.authenticated) {
    return (
      <AdminAuthPage
        registrationRequired={authStatus.registrationRequired}
        envLoginConfigured={authStatus.envLoginConfigured}
        envLoginIncomplete={authStatus.envLoginIncomplete}
        onAuthenticated={async (username) => {
          setAuthStatus((current) =>
            current ? { ...current, authenticated: true, username } : current,
          );
          try {
            await loadAdminData();
          } catch (error) {
            setDataSyncError(
              error instanceof Error ? error.message : String(error),
            );
          }
        }}
      />
    );
  }

  return (
    <div className="admin-shell min-h-screen bg-background text-foreground flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Navbar */}
      <Navbar
        adminTab={adminTab}
        onSelectAdminTab={handleSelectAdminTab}
        settings={appSettings}
        onRefreshData={refreshAllData}
        onLogout={handleLogout}
      />

      {dataSyncError && (
        <div
          role="alert"
          className="border-b border-amber-500/30 bg-amber-950/60 px-4 py-2 text-center text-xs text-amber-200"
        >
          Sinkronisasi data gagal: {dataSyncError}
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {adminTab === "dashboard" && (
          <DashboardTab
            customers={customers}
            invoices={invoices}
            vouchers={vouchers}
            routers={routers}
            onRefreshData={refreshAllData}
            onNavigateTab={handleSelectAdminTab}
            onSendWaNotification={handleOpenSendWa}
            onToggleIsolir={handleToggleIsolir}
          />
        )}
        {adminTab === "finance" && (
          <FinanceTab
            section={financeSection}
            onSelectSection={setFinanceSection}
            invoices={invoices}
            customers={customers}
            onRefreshData={refreshAllData}
            onViewInvoice={(inv, cust) =>
              setPrintInvoiceData({ invoice: inv, customer: cust })
            }
            onSendWa={handleOpenSendWa}
          />
        )}
        {adminTab === "customers" && (
          <CustomersTab
            customers={customers}
            invoices={invoices}
            pppoePackages={pppoePackages}
            routers={routers}
            onRefreshData={refreshAllData}
            onSendWa={handleOpenSendWa}
            onViewInvoice={(inv, cust) =>
              setPrintInvoiceData({ invoice: inv, customer: cust })
            }
            onToggleIsolir={handleToggleIsolir}
          />
        )}
        {adminTab === "vouchers" && (
          <VouchersTab
            vouchers={vouchers}
            profiles={profiles}
            serviceProfiles={StorageService.getHotspotServiceProfiles()}
            routers={routers}
            onRefreshData={refreshAllData}
            onManageRouters={() => setAdminTab("routers")}
            onOpenPrintModal={(vouchersToPrint) =>
              setPrintVouchersData(vouchersToPrint)
            }
          />
        )}
        {adminTab === "routers" && (
          <RoutersTab routers={routers} onRefreshData={refreshAllData} />
        )}
        {adminTab === "whatsapp" && (
          <WhatsAppTab
            waLogs={waLogs}
            waConfig={waConfig}
            onRefreshData={refreshAllData}
          />
        )}
        {adminTab === "payment" && <PaymentGatewayTab />}
        {adminTab === "settings" && (
          <SettingsTab
            settings={appSettings}
            onRefreshSettings={refreshAllData}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/70 px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Database className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">
                {appSettings.brandName || appSettings.appName}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Smart billing untuk operasional MikroTik
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-2 text-[11px] text-muted-foreground">
              <Database className="h-3.5 w-3.5 text-primary" />
              <span>SQLite persistent</span>
              <span className="hidden text-border sm:inline">·</span>
              <code className="hidden font-mono text-[10px] text-foreground/70 sm:inline">
                /app/data/billing.sqlite
              </code>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-2 text-[11px] text-muted-foreground">
              <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
              <span>OpenWA API</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-2 text-[11px] text-muted-foreground">
              <Router className="h-3.5 w-3.5 text-sky-500" />
              <span>RouterOS v6 &amp; v7</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Invoice Printable Sheet Modal */}
      {printInvoiceData && (
        <InvoicePrintModal
          invoice={printInvoiceData.invoice}
          customer={printInvoiceData.customer}
          settings={appSettings}
          onClose={() => setPrintInvoiceData(null)}
        />
      )}

      {/* Hotspot Voucher Print Sheet Modal (A4 Grid / Thermal POS) */}
      {printVouchersData && (
        <VoucherPrintModal
          vouchers={printVouchersData}
          settings={appSettings}
          onClose={() => setPrintVouchersData(null)}
        />
      )}

      {/* Quick WhatsApp Dispatch Confirmation Modal */}
      {quickWaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg text-white shadow-2xl p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-400" />
                <span>Kirim Notifikasi WhatsApp Langsung</span>
              </h3>
              <button
                onClick={() => setQuickWaModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <div className="font-bold text-white text-sm">
                    {quickWaModal.customer.name}
                  </div>
                  <div className="text-[11px] font-mono text-emerald-400 mt-0.5">
                    WhatsApp: {quickWaModal.customer.phone}
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
                  {quickWaModal.customer.servicePackageName ||
                    quickWaModal.customer.profileName}
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Preview Isi Pesan:
                </label>
                <textarea
                  rows={4}
                  value={quickWaModal.text}
                  onChange={(e) =>
                    setQuickWaModal({ ...quickWaModal, text: e.target.value })
                  }
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-indigo-500 leading-relaxed"
                />
              </div>

              {waSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>
                    Pesan berhasil dikirim ke nomor{" "}
                    {quickWaModal.customer.phone}!
                  </span>
                </div>
              )}
              {waError && (
                <div
                  role="alert"
                  className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300"
                >
                  {waError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-800 mt-5">
              <button
                onClick={() => setQuickWaModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium text-xs"
              >
                Tutup
              </button>
              <button
                onClick={handleConfirmSendWa}
                disabled={
                  waSending || waSuccess || quickWaModal.needsPaymentLink
                }
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/30 transition flex items-center gap-1.5"
              >
                <Send
                  className={`w-3.5 h-3.5 ${waSending ? "animate-spin" : ""}`}
                />
                <span>
                  {waSending
                    ? "Mengirim..."
                    : waSuccess
                      ? "Terkirim!"
                      : "Kirim Sekarang"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
}
