import React, { useState, useEffect } from 'react';
import { Customer, Invoice, Voucher, HotspotProfile, RouterConfig, WhatsAppLog, PaymentGatewayConfig, WhatsAppGatewayConfig } from './types';
import { StorageService } from './services/storage';
import { Navbar } from './components/Navbar';
import { DashboardTab } from './components/admin/DashboardTab';
import { CustomersTab } from './components/admin/CustomersTab';
import { InvoicesTab } from './components/admin/InvoicesTab';
import { VouchersTab } from './components/admin/VouchersTab';
import { RoutersTab } from './components/admin/RoutersTab';
import { WhatsAppTab } from './components/admin/WhatsAppTab';
import { PaymentGatewayTab } from './components/admin/PaymentGatewayTab';
import { DockerGuideTab } from './components/admin/DockerGuideTab';
import { VoucherStorePortal } from './components/portal/VoucherStorePortal';
import { CustomerBillPortal } from './components/portal/CustomerBillPortal';
import { HotspotLoginPage } from './components/portal/HotspotLoginPage';
import { InvoicePrintModal } from './components/InvoicePrintModal';
import { VoucherPrintModal } from './components/VoucherPrintModal';
import { Send, X, Check, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<'admin' | 'voucher_portal' | 'hotspot_login' | 'customer_bill'>('admin');
  const [adminTab, setAdminTab] = useState('dashboard');

  // App Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
  const [routers, setRouters] = useState<RouterConfig[]>([]);
  const [waLogs, setWaLogs] = useState<WhatsAppLog[]>([]);
  const [waConfig, setWaConfig] = useState<WhatsAppGatewayConfig>(StorageService.getWaConfig());
  const [paymentConfig, setPaymentConfig] = useState<PaymentGatewayConfig>(StorageService.getPaymentConfig());

  // Print Modals
  const [printInvoiceData, setPrintInvoiceData] = useState<{ invoice: Invoice; customer?: Customer } | null>(null);
  const [printVouchersData, setPrintVouchersData] = useState<Voucher[] | null>(null);

  // Quick WhatsApp Dispatch Modal
  const [quickWaModal, setQuickWaModal] = useState<{ customer: Customer; type: 'reminder' | 'isolir'; text: string } | null>(null);
  const [waSending, setWaSending] = useState(false);
  const [waSuccess, setWaSuccess] = useState(false);

  // Pass voucher code from purchase store into hotspot login
  const [prefilledVoucherCode, setPrefilledVoucherCode] = useState('');

  const refreshAllData = () => {
    setCustomers(StorageService.getCustomers());
    setInvoices(StorageService.getInvoices());
    setVouchers(StorageService.getVouchers());
    setProfiles(StorageService.getHotspotProfiles());
    setRouters(StorageService.getRouters());
    setWaLogs(StorageService.getWaLogs());
    setWaConfig(StorageService.getWaConfig());
    setPaymentConfig(StorageService.getPaymentConfig());
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  // Handle WhatsApp Reminder from Table / Dashboard
  const handleOpenSendWa = (customer: Customer, type: 'reminder' | 'isolir') => {
    const inv = invoices.find(i => i.customerId === customer.id && i.status !== 'paid');
    const amountStr = inv ? `sebesar Rp ${inv.totalAmount.toLocaleString('id-ID')}` : `sebesar Rp ${customer.monthlyFee.toLocaleString('id-ID')}`;

    let text = '';
    if (type === 'reminder') {
      text = `Halo Bpk/Ibu ${customer.name}, ini pengingat tagihan internet paket ${customer.profileName} ${amountStr} akan jatuh tempo pada ${customer.expiredDate}. Bayar mudah online via QRIS/VA: https://isp.net/pay/${inv?.invoiceNumber || 'INV-001'}`;
    } else {
      text = `PEMBERITAHUAN ISOLIR: Yth. ${customer.name}, akses internet paket ${customer.profileName} telah dinonaktifkan sementara karena masa aktif berakhir pada ${customer.expiredDate}. Segera lakukan pelunasan untuk membuka blokir seketika.`;
    }

    setQuickWaModal({ customer, type, text });
    setWaSuccess(false);
  };

  const handleConfirmSendWa = () => {
    if (!quickWaModal) return;
    setWaSending(true);

    setTimeout(() => {
      const msgId = 'wamid.HBgM' + Date.now().toString(36).toUpperCase() + '==';
      StorageService.addWaLog({
        recipientPhone: quickWaModal.customer.phone,
        recipientName: quickWaModal.customer.name,
        type: quickWaModal.type === 'reminder' ? 'reminder_h3' : 'isolated',
        message: quickWaModal.text,
        status: 'sent',
        responseInfo: `OpenWA (rmyndharis/OpenWA): 200 OK (${msgId})`,
      });

      setWaSending(false);
      setWaSuccess(true);
      refreshAllData();

      setTimeout(() => {
        setQuickWaModal(null);
      }, 1500);
    }, 700);
  };

  // Toggle Isolir
  const handleToggleIsolir = (customer: Customer) => {
    const newStatus = customer.status === 'isolated' ? 'active' : 'isolated';
    const updated: Customer = {
      ...customer,
      status: newStatus,
      notes: newStatus === 'isolated' ? 'Diisolir manual oleh NOC' : 'Isolir dibuka manual oleh NOC',
    };
    StorageService.saveCustomer(updated);

    // If isolated, dispatch notification
    if (newStatus === 'isolated') {
      StorageService.addWaLog({
        recipientPhone: customer.phone,
        recipientName: customer.name,
        type: 'isolated',
        message: `PEMBERITAHUAN ISOLIR: Akses internet PPPoE Anda (${customer.pppoeUsername}) telah dinonaktifkan oleh administrator NOC. Hubungi billing untuk informasi lebih lanjut.`,
        status: 'sent',
        responseInfo: 'Manual NOC Toggle',
      });
    }

    refreshAllData();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        onSelectView={setCurrentView}
        adminTab={adminTab}
        onSelectAdminTab={setAdminTab}
        customers={customers}
        invoices={invoices}
        onRefreshData={refreshAllData}
      />

      {/* Main Content View Switcher */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {currentView === 'admin' && (
          <>
            {adminTab === 'dashboard' && (
              <DashboardTab
                customers={customers}
                invoices={invoices}
                vouchers={vouchers}
                routers={routers}
                onRefreshData={refreshAllData}
                onNavigateTab={setAdminTab}
                onSendWaNotification={handleOpenSendWa}
                onToggleIsolir={handleToggleIsolir}
              />
            )}
            {adminTab === 'customers' && (
              <CustomersTab
                customers={customers}
                invoices={invoices}
                onRefreshData={refreshAllData}
                onSendWa={handleOpenSendWa}
                onViewInvoice={(inv, cust) => setPrintInvoiceData({ invoice: inv, customer: cust })}
                onToggleIsolir={handleToggleIsolir}
              />
            )}
            {adminTab === 'invoices' && (
              <InvoicesTab
                invoices={invoices}
                customers={customers}
                onRefreshData={refreshAllData}
                onViewInvoice={(inv, cust) => setPrintInvoiceData({ invoice: inv, customer: cust })}
                onSendWa={handleOpenSendWa}
              />
            )}
            {adminTab === 'vouchers' && (
              <VouchersTab
                vouchers={vouchers}
                profiles={profiles}
                onRefreshData={refreshAllData}
                onOpenPrintModal={vouchersToPrint => setPrintVouchersData(vouchersToPrint)}
              />
            )}
            {adminTab === 'routers' && (
              <RoutersTab
                routers={routers}
                onRefreshData={refreshAllData}
              />
            )}
            {adminTab === 'whatsapp' && (
              <WhatsAppTab
                waLogs={waLogs}
                waConfig={waConfig}
                onRefreshData={refreshAllData}
              />
            )}
            {adminTab === 'payment' && (
              <PaymentGatewayTab
                invoices={invoices}
                paymentConfig={paymentConfig}
                onRefreshData={refreshAllData}
              />
            )}
            {adminTab === 'docker' && <DockerGuideTab />}
          </>
        )}

        {currentView === 'voucher_portal' && (
          <VoucherStorePortal
            profiles={profiles}
            onVoucherPurchased={refreshAllData}
            onNavigateToLogin={code => {
              if (code) setPrefilledVoucherCode(code);
              setCurrentView('hotspot_login');
            }}
          />
        )}

        {currentView === 'customer_bill' && (
          <CustomerBillPortal
            customers={customers}
            invoices={invoices}
            onRefreshData={refreshAllData}
          />
        )}

        {currentView === 'hotspot_login' && (
          <HotspotLoginPage
            initialVoucherCode={prefilledVoucherCode}
            onNavigateToStore={() => setCurrentView('voucher_portal')}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>NetFlow MikroTik ISP Billing & Hotspot Platform • Docker Ready Container</span>
          <span>RouterOS v6 & v7 API Compatible • Multi-Gateway (Midtrans / Xendit / Tripay)</span>
        </div>
      </footer>

      {/* Invoice Printable Sheet Modal */}
      {printInvoiceData && (
        <InvoicePrintModal
          invoice={printInvoiceData.invoice}
          customer={printInvoiceData.customer}
          onClose={() => setPrintInvoiceData(null)}
        />
      )}

      {/* Hotspot Voucher Print Sheet Modal (A4 Grid / Thermal POS) */}
      {printVouchersData && (
        <VoucherPrintModal
          vouchers={printVouchersData}
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
                  <div className="font-bold text-white text-sm">{quickWaModal.customer.name}</div>
                  <div className="text-[11px] font-mono text-emerald-400 mt-0.5">
                    WhatsApp: {quickWaModal.customer.phone}
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
                  {quickWaModal.customer.profileName}
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Preview Isi Pesan:</label>
                <textarea
                  rows={4}
                  value={quickWaModal.text}
                  onChange={e => setQuickWaModal({ ...quickWaModal, text: e.target.value })}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-indigo-500 leading-relaxed"
                />
              </div>

              {waSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Pesan berhasil dikirim ke nomor {quickWaModal.customer.phone}!</span>
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
                disabled={waSending || waSuccess}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/30 transition flex items-center gap-1.5"
              >
                <Send className={`w-3.5 h-3.5 ${waSending ? 'animate-spin' : ''}`} />
                <span>{waSending ? 'Mengirim...' : waSuccess ? 'Terkirim!' : 'Kirim Sekarang'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
