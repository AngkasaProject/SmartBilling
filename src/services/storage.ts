import {
  Customer,
  Invoice,
  HotspotProfile,
  HotspotServiceProfile,
  PppoePackage,
  Voucher,
  RouterConfig,
  WhatsAppLog,
  PaymentGatewayConfig,
  WhatsAppGatewayConfig,
  PaymentTransaction,
  AppSettings,
  AppDataSnapshot
} from '../types';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../utils/whatsappTemplates';

const LEGACY_STORAGE_KEYS = {
  APP_SETTINGS: 'mikrotik_billing_app_settings_v1',
  CUSTOMERS: 'mikrotik_billing_customers_v1',
  INVOICES: 'mikrotik_billing_invoices_v1',
  PPPOE_PACKAGES: 'mikrotik_billing_pppoe_packages_v1',
  HOTSPOT_PROFILES: 'mikrotik_billing_hotspot_profiles_v1',
  HOTSPOT_SERVICE_PROFILES: 'mikrotik_billing_hotspot_service_profiles_v1',
  VOUCHERS: 'mikrotik_billing_vouchers_v1',
  ROUTERS: 'mikrotik_billing_routers_v1',
  WA_LOGS: 'mikrotik_billing_wa_logs_v1',
  PAYMENT_CONFIG: 'mikrotik_billing_payment_config_v1',
  WA_CONFIG: 'mikrotik_billing_wa_config_v1',
  TRANSACTIONS: 'mikrotik_billing_transactions_v1',
};

let dataSyncQueue: Promise<void> = Promise.resolve();

async function readApiJson<T>(response: Response, endpoint: string): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();
  if (!contentType.toLowerCase().includes('application/json')) {
    const preview = body.replace(/\s+/g, ' ').trim().slice(0, 120);
    throw new Error(
      `${endpoint} returned ${response.status} ${response.statusText} as ${contentType || 'unknown content type'}, not JSON. ` +
      `Make sure the Express/SQLite API server is running and the dev proxy is configured. Response: ${preview}`
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new Error(`${endpoint} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const INITIAL_PAYMENT_CONFIG: PaymentGatewayConfig = {
  provider: 'none',
  isProduction: false,
  serverKey: '',
  clientKey: '',
  merchantCode: '',
  webhookSecret: '',
  autoVerify: false,
  uniqueAmountEnabled: false,
};

export const INITIAL_WA_CONFIG: WhatsAppGatewayConfig = {
  provider: 'openwa',
  openwaUrl: 'http://localhost:2785',
  apiKey: '',
  sessionId: 'billing-isp',
  sessionStatus: 'disconnected',
  senderNumber: '',
  autoSendReminderH3: false,
  autoSendReminderH1: false,
  autoSendIsolir: true,
  autoSendReceipt: false,
  endpointUrl: '',
};

export const INITIAL_SETTINGS: AppSettings = {
  appName: 'SmartBilling',
  brandName: 'SmartBilling',
  brandMainLogoDataUrl: '',
  brandIconDataUrl: '',
  companyName: '',
  tagline: '',
  officeAddress: '',
  phoneContact: '',
  emailContact: '',
  defaultSsid: '',
  currencySymbol: 'Rp',
  timezone: 'Asia/Jakarta',
  timeFormat: '24h',
  whatsappTemplates: DEFAULT_WHATSAPP_TEMPLATES,

  mikrotikHost: '',
  mikrotikPort: 8728,
  mikrotikUser: '',
  mikrotikPass: '',
  mikrotikApiType: 'api',
  mikrotikTimeoutSec: 10,

  waProvider: 'openwa',
  openwaUrl: 'http://openwa:2785',
  openwaApiKey: '',
  openwaSessionId: 'billing-isp',
  openwaSenderNumber: '',
  autoSendReminderH3: false,
  autoSendReminderH1: false,
  autoSendIsolir: true,
  autoSendReceipt: false,

  paymentProvider: 'none',
  paymentIsProduction: false,
  paymentServerKey: '',
  paymentClientKey: '',
  paymentMerchantCode: '',
  paymentWebhookSecret: '',
  paymentAutoVerify: false,

  gracePeriodDays: 0,
  defaultVoucherPrefix: 'NET-',
  voucherLength: 5,
  updatedAt: new Date().toISOString(),
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createEmptyAppData(): AppDataSnapshot {
  return {
    customers: [],
    invoices: [],
    pppoePackages: [],
    hotspotProfiles: [],
    hotspotServiceProfiles: [],
    vouchers: [],
    routers: [],
    whatsappLogs: [],
    paymentConfig: clone(INITIAL_PAYMENT_CONFIG),
    whatsappConfig: clone(INITIAL_WA_CONFIG),
    transactions: [],
  };
}

let appData = createEmptyAppData();
let appSettings = clone(INITIAL_SETTINGS);

function clearLegacyBrowserData(): void {
  try {
    for (const key of Object.values(LEGACY_STORAGE_KEYS)) localStorage.removeItem(key);
    localStorage.removeItem('smartbilling_recent_vouchers');
    localStorage.removeItem('smartbilling-theme');
  } catch (error) {
    console.error('Unable to clear legacy browser-stored application data', error);
  }
}

// Storage helper functions
export const StorageService = {
  getSettings(): AppSettings {
    return clone(appSettings);
  },

  async saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Settings API returned ${response.status}`);
    appSettings = { ...appSettings, ...result.settings, ...partial };
    return clone(appSettings);
  },

  async syncFromSqlite(): Promise<AppSettings> {
    const response = await fetch('/api/settings');
    const result = await readApiJson<Partial<AppSettings> & { error?: string }>(response, '/api/settings');
    if (!response.ok) throw new Error(result.error || `Settings API returned ${response.status}`);
    appSettings = { ...INITIAL_SETTINGS, ...result };
    clearLegacyBrowserData();
    return clone(appSettings);
  },

  async syncDataFromSqlite(): Promise<void> {
    const response = await fetch('/api/data');
    const result: { initialized: boolean; data: Partial<AppDataSnapshot>; error?: string } =
      await readApiJson(response, '/api/data');
    if (!response.ok) {
      throw new Error(result.error || `Data API returned ${response.status}`);
    }

    appData = { ...createEmptyAppData(), ...result.data };
    appData.whatsappConfig = {
      ...INITIAL_WA_CONFIG,
      ...result.data.whatsappConfig,
      apiKey: '',
      token: '',
    };
    if (!result.initialized) {
      await this.syncDataToSqlite();
    }
    clearLegacyBrowserData();
  },

  async syncDataToSqlite(): Promise<void> {
    const snapshot = clone(appData);

    const pendingSync = dataSyncQueue.catch(() => undefined).then(async () => {
      const response = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      const result = await readApiJson<{ error?: string }>(response, '/api/data');
      if (!response.ok) {
        throw new Error(result?.error || `Data API returned ${response.status}`);
      }
    });
    dataSyncQueue = pendingSync;
    await pendingSync;
  },

  async getDbStats(): Promise<{ dbPath: string; fileSizeKb: string; tables: Array<{ name: string; count: number }> }> {
    const response = await fetch('/api/db/stats');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Database API returned ${response.status}`);
    return result;
  },

  async vacuumDatabase(): Promise<{ status: string; message: string }> {
    const response = await fetch('/api/db/vacuum', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Database API returned ${response.status}`);
    return result;
  },

  getCustomers(): Customer[] {
    return clone(appData.customers);
  },

  saveCustomer(customer: Customer): Customer[] {
    const list = this.getCustomers();
    const idx = list.findIndex(c => c.id === customer.id);
    if (idx >= 0) {
      list[idx] = customer;
    } else {
      list.unshift(customer);
    }
    appData.customers = list;
    return list;
  },

  deleteCustomer(id: string): Customer[] {
    const list = this.getCustomers().filter(c => c.id !== id);
    appData.customers = list;
    return list;
  },

  getInvoices(): Invoice[] {
    return clone(appData.invoices);
  },

  getPppoePackages(): PppoePackage[] {
    return clone(appData.pppoePackages);
  },

  savePppoePackages(packages: PppoePackage[]): PppoePackage[] {
    appData.pppoePackages = clone(packages);
    return clone(appData.pppoePackages);
  },

  saveInvoice(inv: Invoice): Invoice[] {
    const list = this.getInvoices();
    const idx = list.findIndex(i => i.id === inv.id);
    if (idx >= 0) {
      list[idx] = inv;
    } else {
      list.unshift(inv);
    }
    appData.invoices = list;
    return clone(list);
  },

  deleteInvoices(ids: string[]): Invoice[] {
    const deletedIds = new Set(ids);
    const list = this.getInvoices().filter(invoice => !deletedIds.has(invoice.id));
    appData.invoices = list;
    return clone(list);
  },

  getHotspotProfiles(): HotspotProfile[] {
    return clone(appData.hotspotProfiles);
  },

  getHotspotServiceProfiles(): HotspotServiceProfile[] {
    return clone(appData.hotspotServiceProfiles);
  },

  getVouchers(): Voucher[] {
    return clone(appData.vouchers);
  },

  saveVouchers(vouchers: Voucher[]): Voucher[] {
    const list = this.getVouchers();
    const combined = [...vouchers, ...list];
    appData.vouchers = combined;
    return clone(combined);
  },

  getRouters(): RouterConfig[] {
    return clone(appData.routers);
  },

  saveRouters(routers: RouterConfig[]): void {
    appData.routers = clone(routers);
  },

  getWaLogs(): WhatsAppLog[] {
    return clone(appData.whatsappLogs);
  },

  addWaLog(log: Omit<WhatsAppLog, 'id' | 'timestamp'>): WhatsAppLog {
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
    const newEntry: WhatsAppLog = {
      ...log,
      id: 'wa-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      timestamp,
    };
    const list = [newEntry, ...this.getWaLogs()];
    appData.whatsappLogs = list;
    return newEntry;
  },

  getPaymentConfig(): PaymentGatewayConfig {
    return {
      ...clone(appData.paymentConfig),
      serverKey: '',
      clientKey: '',
      webhookSecret: '',
    };
  },

  savePaymentConfig(cfg: PaymentGatewayConfig): void {
    appData.paymentConfig = clone({
      ...cfg,
      serverKey: '',
      clientKey: '',
      webhookSecret: '',
    });
  },

  getWaConfig(): WhatsAppGatewayConfig {
    return { ...clone(appData.whatsappConfig), apiKey: '', token: '' };
  },

  saveWaConfig(cfg: WhatsAppGatewayConfig): void {
    appData.whatsappConfig = clone({ ...cfg, apiKey: '', token: '' });
  },

  getTransactions(): PaymentTransaction[] {
    return clone(appData.transactions);
  },

  saveTransaction(tx: PaymentTransaction): void {
    const list = this.getTransactions();
    const idx = list.findIndex(t => t.id === tx.id);
    if (idx >= 0) {
      list[idx] = tx;
    } else {
      list.unshift(tx);
    }
    appData.transactions = list;
  },

  // Record an operator-confirmed manual payment.
  settleInvoice(invoiceId: string, paymentMethod: string, paymentChannel: string): {
    success: boolean;
    customer?: Customer;
    invoice?: Invoice;
    message: string;
  } {
    const invoices = this.getInvoices();
    const invIdx = invoices.findIndex(i => i.id === invoiceId);
    if (invIdx === -1) {
      return { success: false, message: 'Invoice tidak ditemukan' };
    }

    const inv = invoices[invIdx];
    const now = new Date();
    const paidAt = now.toISOString().replace('T', ' ').substring(0, 19);

    inv.status = 'paid';
    inv.paidAt = paidAt;
    inv.paymentMethod = paymentMethod;
    inv.paymentChannel = paymentChannel;
    inv.paymentRef = undefined;
    invoices[invIdx] = inv;
    appData.invoices = invoices;

    // Update customer: extend expiration date by 30 days and reset to active
    const customers = this.getCustomers();
    const custIdx = customers.findIndex(c => c.id === inv.customerId);
    let updatedCust: Customer | undefined;

    if (custIdx !== -1) {
      const cust = customers[custIdx];
      // Calculate new expired date: current expired + 1 month
      const currentExp = new Date(cust.expiredDate + 'T00:00:00');
      const baseDate = currentExp > now ? currentExp : now;
      const newExp = new Date(baseDate);
      newExp.setDate(newExp.getDate() + 30);
      const newExpStr = newExp.toISOString().substring(0, 10);

      updatedCust = {
        ...cust,
        expiredDate: newExpStr,
        notes: `Pembayaran manual dicatat via ${paymentMethod} pada ${paidAt}. Status akses router harus diverifikasi terpisah.`,
      };
      customers[custIdx] = updatedCust;
      appData.customers = customers;
    }

    return {
      success: true,
      customer: updatedCust,
      invoice: inv,
      message: 'Pembayaran manual berhasil dicatat.',
    };
  },

  // Reset to default data
  resetDefaults(): void {
    appData = createEmptyAppData();
  }
};
