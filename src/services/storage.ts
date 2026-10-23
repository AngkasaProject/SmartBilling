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

const STORAGE_KEYS = {
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

function readStoredList<T>(storageKey: string, demoIds: string[] = []): T[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    localStorage.setItem(storageKey, '[]');
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Expected a list');
    const filtered = parsed.filter(item => !demoIds.includes(item?.id));
    if (filtered.length !== parsed.length) {
      localStorage.setItem(storageKey, JSON.stringify(filtered));
    }
    return filtered as T[];
  } catch (error) {
    console.error(`Invalid local application data in ${storageKey}`, error);
    throw error;
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

// Storage helper functions
export const StorageService = {
  getSettings(): AppSettings {
    const raw = localStorage.getItem(STORAGE_KEYS.APP_SETTINGS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.APP_SETTINGS, JSON.stringify(INITIAL_SETTINGS));
      return INITIAL_SETTINGS;
    }
    try {
      return { ...INITIAL_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return INITIAL_SETTINGS;
    }
  },

  async saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    const current = this.getSettings();
    const updated: AppSettings = {
      ...current,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Settings API returned ${response.status}`);
    const persisted = result.settings
      ? { ...updated, ...result.settings }
      : updated;
    localStorage.setItem(STORAGE_KEYS.APP_SETTINGS, JSON.stringify(persisted));
    return persisted;
  },

  async syncFromSqlite(): Promise<AppSettings> {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const fromDb = await res.json();
        const merged = { ...INITIAL_SETTINGS, ...fromDb };
        localStorage.setItem(STORAGE_KEYS.APP_SETTINGS, JSON.stringify(merged));
        return merged;
      }
    } catch {
      // Fallback to localStorage
    }
    return this.getSettings();
  },

  async syncDataFromSqlite(): Promise<void> {
    const response = await fetch('/api/data');
    const result: { initialized: boolean; data: Partial<AppDataSnapshot>; error?: string } =
      await readApiJson(response, '/api/data');
    if (!response.ok) {
      throw new Error(result.error || `Data API returned ${response.status}`);
    }

    if (!result.initialized) {
      await this.syncDataToSqlite();
      return;
    }

    const mappings: Array<[keyof AppDataSnapshot, string]> = [
      ['customers', STORAGE_KEYS.CUSTOMERS],
      ['invoices', STORAGE_KEYS.INVOICES],
      ['pppoePackages', STORAGE_KEYS.PPPOE_PACKAGES],
      ['hotspotProfiles', STORAGE_KEYS.HOTSPOT_PROFILES],
      ['hotspotServiceProfiles', STORAGE_KEYS.HOTSPOT_SERVICE_PROFILES],
      ['vouchers', STORAGE_KEYS.VOUCHERS],
      ['routers', STORAGE_KEYS.ROUTERS],
      ['whatsappLogs', STORAGE_KEYS.WA_LOGS],
      ['paymentConfig', STORAGE_KEYS.PAYMENT_CONFIG],
      ['whatsappConfig', STORAGE_KEYS.WA_CONFIG],
      ['transactions', STORAGE_KEYS.TRANSACTIONS],
    ];

    let removedDemoData = false;
    for (const [collection, storageKey] of mappings) {
      const value = result.data[collection];
      if (value !== undefined) {
        const demoIds: Partial<Record<keyof AppDataSnapshot, string[]>> = {
          customers: ['cust-1', 'cust-2', 'cust-3', 'cust-4', 'cust-5', 'cust-6'],
          invoices: ['inv-1', 'inv-2', 'inv-3', 'inv-4', 'inv-5'],
          hotspotProfiles: ['hp-1', 'hp-2', 'hp-3', 'hp-4'],
          vouchers: ['vch-1', 'vch-2', 'vch-3', 'vch-4', 'vch-5'],
          routers: ['rtr-1', 'rtr-2'],
          whatsappLogs: ['wa-1', 'wa-2', 'wa-3'],
        };
        const blockedIds = demoIds[collection] || [];
        if (Array.isArray(value)) {
          const cleaned = value.filter((item: { id?: string }) => !item?.id || !blockedIds.includes(item.id));
          removedDemoData ||= cleaned.length !== value.length;
          localStorage.setItem(storageKey, JSON.stringify(cleaned));
        } else {
          localStorage.setItem(storageKey, JSON.stringify(value));
        }
      }
    }
    if (removedDemoData) await this.syncDataToSqlite();
  },

  async syncDataToSqlite(): Promise<void> {
    const snapshot: AppDataSnapshot = {
      customers: this.getCustomers(),
      invoices: this.getInvoices(),
      pppoePackages: this.getPppoePackages(),
      hotspotProfiles: this.getHotspotProfiles(),
      hotspotServiceProfiles: this.getHotspotServiceProfiles(),
      vouchers: this.getVouchers(),
      routers: this.getRouters(),
      whatsappLogs: this.getWaLogs(),
      paymentConfig: this.getPaymentConfig(),
      whatsappConfig: this.getWaConfig(),
      transactions: this.getTransactions(),
    };

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
    return readStoredList<Customer>(STORAGE_KEYS.CUSTOMERS, ['cust-1', 'cust-2', 'cust-3', 'cust-4', 'cust-5', 'cust-6']);
  },

  saveCustomer(customer: Customer): Customer[] {
    const list = this.getCustomers();
    const idx = list.findIndex(c => c.id === customer.id);
    if (idx >= 0) {
      list[idx] = customer;
    } else {
      list.unshift(customer);
    }
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(list));
    return list;
  },

  deleteCustomer(id: string): Customer[] {
    const list = this.getCustomers().filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(list));
    return list;
  },

  getInvoices(): Invoice[] {
    return readStoredList<Invoice>(STORAGE_KEYS.INVOICES, ['inv-1', 'inv-2', 'inv-3', 'inv-4', 'inv-5']);
  },

  getPppoePackages(): PppoePackage[] {
    return readStoredList<PppoePackage>(STORAGE_KEYS.PPPOE_PACKAGES);
  },

  savePppoePackages(packages: PppoePackage[]): PppoePackage[] {
    localStorage.setItem(STORAGE_KEYS.PPPOE_PACKAGES, JSON.stringify(packages));
    return packages;
  },

  saveInvoice(inv: Invoice): Invoice[] {
    const list = this.getInvoices();
    const idx = list.findIndex(i => i.id === inv.id);
    if (idx >= 0) {
      list[idx] = inv;
    } else {
      list.unshift(inv);
    }
    localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(list));
    return list;
  },

  getHotspotProfiles(): HotspotProfile[] {
    return readStoredList<HotspotProfile>(STORAGE_KEYS.HOTSPOT_PROFILES, ['hp-1', 'hp-2', 'hp-3', 'hp-4']);
  },

  getHotspotServiceProfiles(): HotspotServiceProfile[] {
    return readStoredList<HotspotServiceProfile>(STORAGE_KEYS.HOTSPOT_SERVICE_PROFILES);
  },

  getVouchers(): Voucher[] {
    return readStoredList<Voucher>(STORAGE_KEYS.VOUCHERS, ['vch-1', 'vch-2', 'vch-3', 'vch-4', 'vch-5']);
  },

  saveVouchers(vouchers: Voucher[]): Voucher[] {
    const list = this.getVouchers();
    const combined = [...vouchers, ...list];
    localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(combined));
    return combined;
  },

  getRouters(): RouterConfig[] {
    return readStoredList<RouterConfig>(STORAGE_KEYS.ROUTERS, ['rtr-1', 'rtr-2']);
  },

  saveRouters(routers: RouterConfig[]): void {
    localStorage.setItem(STORAGE_KEYS.ROUTERS, JSON.stringify(routers));
  },

  getWaLogs(): WhatsAppLog[] {
    return readStoredList<WhatsAppLog>(STORAGE_KEYS.WA_LOGS, ['wa-1', 'wa-2', 'wa-3']);
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
    localStorage.setItem(STORAGE_KEYS.WA_LOGS, JSON.stringify(list));
    return newEntry;
  },

  getPaymentConfig(): PaymentGatewayConfig {
    const raw = localStorage.getItem(STORAGE_KEYS.PAYMENT_CONFIG);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.PAYMENT_CONFIG, JSON.stringify(INITIAL_PAYMENT_CONFIG));
      return INITIAL_PAYMENT_CONFIG;
    }
    try {
      const parsed = JSON.parse(raw) as PaymentGatewayConfig;
      const safeConfig = { ...parsed, serverKey: '', clientKey: '', webhookSecret: '' };
      if (JSON.stringify(parsed) !== JSON.stringify(safeConfig)) {
        localStorage.setItem(STORAGE_KEYS.PAYMENT_CONFIG, JSON.stringify(safeConfig));
      }
      return safeConfig;
    } catch {
      return INITIAL_PAYMENT_CONFIG;
    }
  },

  savePaymentConfig(cfg: PaymentGatewayConfig): void {
    localStorage.setItem(STORAGE_KEYS.PAYMENT_CONFIG, JSON.stringify({
      ...cfg,
      serverKey: '',
      clientKey: '',
      webhookSecret: '',
    }));
  },

  getWaConfig(): WhatsAppGatewayConfig {
    const raw = localStorage.getItem(STORAGE_KEYS.WA_CONFIG);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.WA_CONFIG, JSON.stringify(INITIAL_WA_CONFIG));
      return INITIAL_WA_CONFIG;
    }
    try {
      const parsed = JSON.parse(raw) as WhatsAppGatewayConfig;
      const safeConfig = { ...parsed, apiKey: '' };
      if (JSON.stringify(parsed) !== JSON.stringify(safeConfig)) {
        localStorage.setItem(STORAGE_KEYS.WA_CONFIG, JSON.stringify(safeConfig));
      }
      return safeConfig;
    } catch {
      return INITIAL_WA_CONFIG;
    }
  },

  saveWaConfig(cfg: WhatsAppGatewayConfig): void {
    localStorage.setItem(STORAGE_KEYS.WA_CONFIG, JSON.stringify({ ...cfg, apiKey: '' }));
  },

  getTransactions(): PaymentTransaction[] {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  saveTransaction(tx: PaymentTransaction): void {
    const list = this.getTransactions();
    const idx = list.findIndex(t => t.id === tx.id);
    if (idx >= 0) {
      list[idx] = tx;
    } else {
      list.unshift(tx);
    }
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(list));
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
    localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(invoices));

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
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
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
    localStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
    localStorage.removeItem(STORAGE_KEYS.INVOICES);
    localStorage.removeItem(STORAGE_KEYS.PPPOE_PACKAGES);
    localStorage.removeItem(STORAGE_KEYS.HOTSPOT_PROFILES);
    localStorage.removeItem(STORAGE_KEYS.VOUCHERS);
    localStorage.removeItem(STORAGE_KEYS.ROUTERS);
    localStorage.removeItem(STORAGE_KEYS.WA_LOGS);
    localStorage.removeItem(STORAGE_KEYS.PAYMENT_CONFIG);
    localStorage.removeItem(STORAGE_KEYS.WA_CONFIG);
    localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
  }
};
