import {
  Customer,
  Invoice,
  HotspotProfile,
  Voucher,
  RouterConfig,
  WhatsAppLog,
  PaymentGatewayConfig,
  WhatsAppGatewayConfig,
  PaymentTransaction
} from '../types';

const STORAGE_KEYS = {
  CUSTOMERS: 'mikrotik_billing_customers_v1',
  INVOICES: 'mikrotik_billing_invoices_v1',
  HOTSPOT_PROFILES: 'mikrotik_billing_hotspot_profiles_v1',
  VOUCHERS: 'mikrotik_billing_vouchers_v1',
  ROUTERS: 'mikrotik_billing_routers_v1',
  WA_LOGS: 'mikrotik_billing_wa_logs_v1',
  PAYMENT_CONFIG: 'mikrotik_billing_payment_config_v1',
  WA_CONFIG: 'mikrotik_billing_wa_config_v1',
  TRANSACTIONS: 'mikrotik_billing_transactions_v1',
};

// Initial Indonesian ISP Seed Data
export const INITIAL_HOTSPOT_PROFILES: HotspotProfile[] = [
  {
    id: 'hp-1',
    name: 'Kilat 3 Jam',
    speedLimit: '5M/5M',
    validityDuration: '3 Jam',
    validityHours: 3,
    price: 3000,
    sharedUsers: 1,
    color: 'emerald',
  },
  {
    id: 'hp-2',
    name: 'Harian 24 Jam',
    speedLimit: '10M/10M',
    validityDuration: '1 Hari',
    validityHours: 24,
    price: 7000,
    sharedUsers: 1,
    color: 'blue',
  },
  {
    id: 'hp-3',
    name: 'Mingguan 7 Hari',
    speedLimit: '15M/15M',
    validityDuration: '7 Hari',
    validityHours: 168,
    price: 35000,
    sharedUsers: 2,
    color: 'violet',
  },
  {
    id: 'hp-4',
    name: 'Bulanan 30 Hari',
    speedLimit: '20M/20M',
    validityDuration: '30 Hari',
    validityHours: 720,
    price: 110000,
    sharedUsers: 3,
    color: 'amber',
  },
];

export const INITIAL_ROUTERS: RouterConfig[] = [
  {
    id: 'rtr-1',
    name: 'NOC-Pusat (RB4011iGS+)',
    host: '103.180.12.5',
    port: 8728,
    username: 'api_billing',
    apiType: 'api',
    status: 'connected',
    model: 'RB4011iGS+RM',
    rosVersion: 'RouterOS v7.16',
    cpuLoad: 18,
    memoryFreeMb: 842,
    uptime: '42d 18h 32m',
    activePppoe: 154,
    activeHotspot: 92,
  },
  {
    id: 'rtr-2',
    name: 'Tower-Barat (RB750Gr3)',
    host: '192.168.88.1',
    port: 8728,
    username: 'admin',
    apiType: 'api',
    status: 'connected',
    model: 'hEX (RB750Gr3)',
    rosVersion: 'RouterOS v7.15.2',
    cpuLoad: 34,
    memoryFreeMb: 184,
    uptime: '15d 04h 11m',
    activePppoe: 48,
    activeHotspot: 67,
  },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    customerId: 'CUST-2026-001',
    name: 'Budi Santoso',
    phone: '081234567890',
    email: 'budi.santoso@gmail.com',
    address: 'Jl. Merak No. 14, RT 03/RW 02',
    pppoeUsername: 'budi_merak14',
    pppoePassword: 'pass' + Math.floor(1000 + Math.random() * 9000),
    profileName: 'Paket Home 20 Mbps',
    bandwidthLimit: '20M/20M',
    monthlyFee: 175000,
    billingDate: 25,
    expiredDate: '2026-10-25',
    status: 'active',
    autoIsolir: true,
    routerId: 'rtr-1',
    ipAddress: '10.10.20.14',
    notes: 'ONT ZTE F609 port 1',
  },
  {
    id: 'cust-2',
    customerId: 'CUST-2026-002',
    name: 'Siti Rahmawati',
    phone: '085712345678',
    email: 'siti.rahma@yahoo.com',
    address: 'Perumahan Griya Indah Blok C-08',
    pppoeUsername: 'siti_griya08',
    pppoePassword: 'pass' + Math.floor(1000 + Math.random() * 9000),
    profileName: 'Paket Home 10 Mbps',
    bandwidthLimit: '10M/10M',
    monthlyFee: 125000,
    billingDate: 22,
    expiredDate: '2026-10-22',
    status: 'expiring', // H-1 dari jatuh tempo
    autoIsolir: true,
    routerId: 'rtr-1',
    ipAddress: '10.10.20.19',
    notes: 'Sudah dikirim WA Reminder H-3',
  },
  {
    id: 'cust-3',
    customerId: 'CUST-2026-003',
    name: 'Ahmad Fauzi (Warkop Berkah)',
    phone: '081987654321',
    email: 'fauzi.warkop@gmail.com',
    address: 'Jl. Pemuda No. 88 (Dekat Lapangan)',
    pppoeUsername: 'fauzi_warkop',
    pppoePassword: 'pass' + Math.floor(1000 + Math.random() * 9000),
    profileName: 'Paket Bisnis 50 Mbps',
    bandwidthLimit: '50M/50M',
    monthlyFee: 350000,
    billingDate: 19,
    expiredDate: '2026-10-19',
    status: 'isolated', // Lewat jatuh tempo -> Ter-Isolir otomatis
    autoIsolir: true,
    routerId: 'rtr-1',
    ipAddress: '10.10.20.35',
    notes: 'Ter-isolir otomatis oleh sistem tanggal 20 Oktober',
  },
  {
    id: 'cust-4',
    customerId: 'CUST-2026-004',
    name: 'Dewi Lestari',
    phone: '082144556677',
    email: 'dewi.lestari@gmail.com',
    address: 'Jl. Kenanga Timur No. 4B',
    pppoeUsername: 'dewi_kenanga4b',
    pppoePassword: 'pass' + Math.floor(1000 + Math.random() * 9000),
    profileName: 'Paket Home 30 Mbps',
    bandwidthLimit: '30M/30M',
    monthlyFee: 220000,
    billingDate: 28,
    expiredDate: '2026-10-28',
    status: 'active',
    autoIsolir: true,
    routerId: 'rtr-1',
    ipAddress: '10.10.20.42',
  },
  {
    id: 'cust-5',
    customerId: 'CUST-2026-005',
    name: 'Hendra Gunawan',
    phone: '087811223344',
    email: 'hendra.gunawan@office.id',
    address: 'Ruko Sentra Niaga No. 12',
    pppoeUsername: 'hendra_ruko12',
    pppoePassword: 'pass' + Math.floor(1000 + Math.random() * 9000),
    profileName: 'Paket Bisnis 100 Mbps',
    bandwidthLimit: '100M/100M',
    monthlyFee: 650000,
    billingDate: 23,
    expiredDate: '2026-10-23',
    status: 'expiring',
    autoIsolir: true,
    routerId: 'rtr-2',
    ipAddress: '10.10.30.12',
  },
  {
    id: 'cust-6',
    customerId: 'CUST-2026-006',
    name: 'Rian Pratama',
    phone: '089677889900',
    email: 'rian.pratama@gmail.com',
    address: 'Gg. Mawar 2 No. 05',
    pppoeUsername: 'rian_mawar05',
    pppoePassword: 'pass' + Math.floor(1000 + Math.random() * 9000),
    profileName: 'Paket Home 20 Mbps',
    bandwidthLimit: '20M/20M',
    monthlyFee: 175000,
    billingDate: 15,
    expiredDate: '2026-11-15',
    status: 'active',
    autoIsolir: true,
    routerId: 'rtr-2',
    ipAddress: '10.10.30.22',
    notes: 'Lunas periode Okt-Nov',
  },
];

export const INITIAL_INVOICES: Invoice[] = [
  {
    id: 'inv-1',
    invoiceNumber: 'INV-202610-001',
    customerId: 'cust-1',
    customerName: 'Budi Santoso',
    customerPhone: '081234567890',
    profileName: 'Paket Home 20 Mbps',
    periodMonth: 'Oktober 2026',
    amount: 175000,
    uniqueCode: 120,
    totalAmount: 175120,
    status: 'unpaid',
    dueDate: '2026-10-25',
  },
  {
    id: 'inv-2',
    invoiceNumber: 'INV-202610-002',
    customerId: 'cust-2',
    customerName: 'Siti Rahmawati',
    customerPhone: '085712345678',
    profileName: 'Paket Home 10 Mbps',
    periodMonth: 'Oktober 2026',
    amount: 125000,
    uniqueCode: 304,
    totalAmount: 125304,
    status: 'unpaid',
    dueDate: '2026-10-22',
  },
  {
    id: 'inv-3',
    invoiceNumber: 'INV-202610-003',
    customerId: 'cust-3',
    customerName: 'Ahmad Fauzi (Warkop Berkah)',
    customerPhone: '081987654321',
    profileName: 'Paket Bisnis 50 Mbps',
    periodMonth: 'Oktober 2026',
    amount: 350000,
    uniqueCode: 450,
    totalAmount: 350450,
    status: 'expired',
    dueDate: '2026-10-19',
  },
  {
    id: 'inv-4',
    invoiceNumber: 'INV-202610-004',
    customerId: 'cust-4',
    customerName: 'Dewi Lestari',
    customerPhone: '082144556677',
    profileName: 'Paket Home 30 Mbps',
    periodMonth: 'Oktober 2026',
    amount: 220000,
    uniqueCode: 88,
    totalAmount: 220088,
    status: 'unpaid',
    dueDate: '2026-10-28',
  },
  {
    id: 'inv-5',
    invoiceNumber: 'INV-202610-005',
    customerId: 'cust-6',
    customerName: 'Rian Pratama',
    customerPhone: '089677889900',
    profileName: 'Paket Home 20 Mbps',
    periodMonth: 'Oktober 2026',
    amount: 175000,
    uniqueCode: 0,
    totalAmount: 175000,
    status: 'paid',
    dueDate: '2026-10-15',
    paidAt: '2026-10-14 14:22:05',
    paymentMethod: 'QRIS',
    paymentChannel: 'GoPay / BCA QRIS',
    paymentRef: 'QRIS-OCT-99824',
  },
];

export const INITIAL_VOUCHERS: Voucher[] = [
  {
    id: 'vch-1',
    code: 'NET-73921',
    profileId: 'hp-1',
    profileName: 'Kilat 3 Jam',
    price: 3000,
    validityHours: 3,
    validityDuration: '3 Jam',
    speedLimit: '5M/5M',
    status: 'unused',
    batchCode: 'BATCH-20261020-A',
    createdAt: '2026-10-20 09:00:00',
  },
  {
    id: 'vch-2',
    code: 'NET-48192',
    profileId: 'hp-1',
    profileName: 'Kilat 3 Jam',
    price: 3000,
    validityHours: 3,
    validityDuration: '3 Jam',
    speedLimit: '5M/5M',
    status: 'unused',
    batchCode: 'BATCH-20261020-A',
    createdAt: '2026-10-20 09:00:00',
  },
  {
    id: 'vch-3',
    code: 'NET-99120',
    profileId: 'hp-2',
    profileName: 'Harian 24 Jam',
    price: 7000,
    validityHours: 24,
    validityDuration: '1 Hari',
    speedLimit: '10M/10M',
    status: 'active',
    batchCode: 'BATCH-20261020-A',
    createdAt: '2026-10-20 09:00:00',
    activatedAt: '2026-10-20 20:15:00',
    customerPhone: '081299887766',
    paymentMethod: 'QRIS Mandiri',
  },
  {
    id: 'vch-4',
    code: 'NET-62819',
    profileId: 'hp-2',
    profileName: 'Harian 24 Jam',
    price: 7000,
    validityHours: 24,
    validityDuration: '1 Hari',
    speedLimit: '10M/10M',
    status: 'unused',
    batchCode: 'BATCH-20261020-A',
    createdAt: '2026-10-20 09:00:00',
  },
  {
    id: 'vch-5',
    code: 'NET-11294',
    profileId: 'hp-3',
    profileName: 'Mingguan 7 Hari',
    price: 35000,
    validityHours: 168,
    validityDuration: '7 Hari',
    speedLimit: '15M/15M',
    status: 'unused',
    batchCode: 'BATCH-20261020-B',
    createdAt: '2026-10-20 10:30:00',
  },
];

export const INITIAL_WA_LOGS: WhatsAppLog[] = [
  {
    id: 'wa-1',
    recipientPhone: '085712345678',
    recipientName: 'Siti Rahmawati',
    type: 'reminder_h3',
    message: 'Halo Ibu Siti Rahmawati, tagihan internet Paket Home 10 Mbps Rp 125.304 akan jatuh tempo pada 22 Oktober 2026. Bayar mudah via QRIS/VA: https://isp.net/pay/INV-202610-002',
    status: 'sent',
    timestamp: '2026-10-19 09:00:15',
    responseInfo: 'OpenWA (rmyndharis/OpenWA): 200 OK (wamid.HBgMNDU3MTI0NTY3OAA=)',
  },
  {
    id: 'wa-2',
    recipientPhone: '081987654321',
    recipientName: 'Ahmad Fauzi',
    type: 'isolated',
    message: 'PEMBERITAHUAN ISOLIR: Akses internet PPPoE Anda telah dialihkan ke halaman isolir karena masa aktif telah berakhir per 19 Oktober 2026. Lakukan pembayaran untuk aktivasi otomatis seketika.',
    status: 'sent',
    timestamp: '2026-10-20 00:05:02',
    responseInfo: 'OpenWA (rmyndharis/OpenWA): 200 OK (wamid.HBgMOTE5ODc2NTQzMgA=)',
  },
  {
    id: 'wa-3',
    recipientPhone: '089677889900',
    recipientName: 'Rian Pratama',
    type: 'payment_success',
    message: 'PEMBAYARAN DITERIMA: Terima kasih Bapak Rian Pratama, tagihan Paket Home 20 Mbps Rp 175.000 telah lunas. Masa aktif internet Anda diperpanjang hingga 15 November 2026.',
    status: 'sent',
    timestamp: '2026-10-14 14:22:10',
    responseInfo: 'OpenWA (rmyndharis/OpenWA): 200 OK (wamid.HBgMOTk2Nzc4ODk5MAA=)',
  },
];

export const INITIAL_PAYMENT_CONFIG: PaymentGatewayConfig = {
  provider: 'midtrans',
  isProduction: false,
  serverKey: 'SB-Mid-server-xX88sampleKey992834',
  clientKey: 'SB-Mid-client-88sampleKey1192',
  merchantCode: 'G8291039',
  webhookSecret: 'whsec_sample_netflow_isp_token',
  autoVerify: true,
};

export const INITIAL_WA_CONFIG: WhatsAppGatewayConfig = {
  provider: 'openwa',
  openwaUrl: 'http://localhost:2785',
  apiKey: 'openwa_admin_sec_88921a9f02b',
  sessionId: 'billing-isp',
  sessionStatus: 'connected',
  sessionPhone: '6281288990011',
  senderNumber: '081288990011',
  autoSendReminderH3: true,
  autoSendReminderH1: true,
  autoSendIsolir: true,
  autoSendReceipt: true,
  endpointUrl: 'http://localhost:2785/api/sessions/billing-isp/messages/send-text',
};

// Storage helper functions
export const StorageService = {
  getCustomers(): Customer[] {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(INITIAL_CUSTOMERS));
      return INITIAL_CUSTOMERS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_CUSTOMERS;
    }
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
    const raw = localStorage.getItem(STORAGE_KEYS.INVOICES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(INITIAL_INVOICES));
      return INITIAL_INVOICES;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_INVOICES;
    }
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
    const raw = localStorage.getItem(STORAGE_KEYS.HOTSPOT_PROFILES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.HOTSPOT_PROFILES, JSON.stringify(INITIAL_HOTSPOT_PROFILES));
      return INITIAL_HOTSPOT_PROFILES;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_HOTSPOT_PROFILES;
    }
  },

  getVouchers(): Voucher[] {
    const raw = localStorage.getItem(STORAGE_KEYS.VOUCHERS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(INITIAL_VOUCHERS));
      return INITIAL_VOUCHERS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_VOUCHERS;
    }
  },

  saveVouchers(vouchers: Voucher[]): Voucher[] {
    const list = this.getVouchers();
    const combined = [...vouchers, ...list];
    localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(combined));
    return combined;
  },

  getRouters(): RouterConfig[] {
    const raw = localStorage.getItem(STORAGE_KEYS.ROUTERS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.ROUTERS, JSON.stringify(INITIAL_ROUTERS));
      return INITIAL_ROUTERS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_ROUTERS;
    }
  },

  saveRouters(routers: RouterConfig[]): void {
    localStorage.setItem(STORAGE_KEYS.ROUTERS, JSON.stringify(routers));
  },

  getWaLogs(): WhatsAppLog[] {
    const raw = localStorage.getItem(STORAGE_KEYS.WA_LOGS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.WA_LOGS, JSON.stringify(INITIAL_WA_LOGS));
      return INITIAL_WA_LOGS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_WA_LOGS;
    }
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
      return JSON.parse(raw);
    } catch {
      return INITIAL_PAYMENT_CONFIG;
    }
  },

  savePaymentConfig(cfg: PaymentGatewayConfig): void {
    localStorage.setItem(STORAGE_KEYS.PAYMENT_CONFIG, JSON.stringify(cfg));
  },

  getWaConfig(): WhatsAppGatewayConfig {
    const raw = localStorage.getItem(STORAGE_KEYS.WA_CONFIG);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.WA_CONFIG, JSON.stringify(INITIAL_WA_CONFIG));
      return INITIAL_WA_CONFIG;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_WA_CONFIG;
    }
  },

  saveWaConfig(cfg: WhatsAppGatewayConfig): void {
    localStorage.setItem(STORAGE_KEYS.WA_CONFIG, JSON.stringify(cfg));
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

  // Auto-isolir logic engine
  runAutoIsolirScan(todayStr = '2026-10-21'): {
    isolatedCount: number;
    expiringCount: number;
    logs: string[];
  } {
    const customers = this.getCustomers();
    const invoices = this.getInvoices();
    let isolatedCount = 0;
    let expiringCount = 0;
    const logs: string[] = [];

    const updated = customers.map(cust => {
      if (cust.status === 'disabled') return cust;

      const expDate = new Date(cust.expiredDate + 'T00:00:00');
      const curDate = new Date(todayStr + 'T00:00:00');
      const diffDays = Math.ceil((expDate.getTime() - curDate.getTime()) / (1000 * 3600 * 24));

      // Expired -> trigger auto-isolir
      if (diffDays <= 0 && cust.status !== 'isolated') {
        isolatedCount++;
        logs.push(`[ISOLIR OTOMATIS] Pelanggan ${cust.name} (${cust.pppoeUsername}) telah jatuh tempo pada ${cust.expiredDate}. IP ${cust.ipAddress || 'Dynamic'} dimasukkan ke address-list "ISOLIR_EXPIRED".`);

        // Send WhatsApp notification via OpenWA (rmyndharis/OpenWA)
        this.addWaLog({
          recipientPhone: cust.phone,
          recipientName: cust.name,
          type: 'isolated',
          message: `PEMBERITAHUAN ISOLIR OTOMATIS: Yth. ${cust.name}, akses internet paket ${cust.profileName} telah dinonaktifkan sementara karena masa aktif berakhir pada ${cust.expiredDate}. Segera lakukan pelunasan untuk membuka blokir seketika.`,
          status: 'sent',
          responseInfo: 'OpenWA (rmyndharis/OpenWA): 200 OK [Auto-Scheduler]',
        });

        // Mark associated invoice as expired if unpaid
        const inv = invoices.find(i => i.customerId === cust.id && i.status === 'unpaid');
        if (inv) {
          inv.status = 'expired';
          this.saveInvoice(inv);
        }

        return { ...cust, status: 'isolated' as const };
      }

      // Expiring in 1-3 days
      if (diffDays > 0 && diffDays <= 3 && cust.status === 'active') {
        expiringCount++;
        return { ...cust, status: 'expiring' as const };
      }

      return cust;
    });

    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(updated));
    return { isolatedCount, expiringCount, logs };
  },

  // Process payment & auto-extend customer expiration + un-isolir
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
    inv.paymentRef = 'PAY-' + Date.now().toString(36).toUpperCase();
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
        status: 'active',
        notes: `Pembayaran lunas via ${paymentMethod} pada ${paidAt}. Isolir dicabut otomatis.`,
      };
      customers[custIdx] = updatedCust;
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));

      // Dispatch WhatsApp receipt via OpenWA (rmyndharis/OpenWA)
      this.addWaLog({
        recipientPhone: cust.phone,
        recipientName: cust.name,
        type: 'payment_success',
        message: `PEMBAYARAN LUNAS TERVERIFIKASI: Terima kasih Bapak/Ibu ${cust.name}. Tagihan #${inv.invoiceNumber} sebesar Rp ${inv.totalAmount.toLocaleString('id-ID')} telah sukses dibayar via ${paymentMethod}. Masa aktif internet Anda diperpanjang hingga ${newExpStr}. Status: AKTIF NORMAL.`,
        status: 'sent',
        responseInfo: 'OpenWA (rmyndharis/OpenWA): 200 OK [Session: billing-isp]',
      });
    }

    return {
      success: true,
      customer: updatedCust,
      invoice: inv,
      message: 'Pembayaran berhasil diverifikasi. Masa aktif diperpanjang dan isolir MikroTik dicabut!',
    };
  },

  // Self-service purchase voucher online
  purchaseVoucherOnline(params: {
    profileId: string;
    phone: string;
    paymentMethod: string;
    paymentChannel: string;
  }): { voucher: Voucher; transaction: PaymentTransaction } {
    const profiles = this.getHotspotProfiles();
    const profile = profiles.find(p => p.id === params.profileId) || profiles[0];

    // Generate clean voucher code (e.g. NET-83921)
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const voucherCode = `NET-${randomNum}`;
    const now = new Date();
    const nowStr = now.toISOString().replace('T', ' ').substring(0, 19);

    const newVoucher: Voucher = {
      id: 'vch-' + Date.now(),
      code: voucherCode,
      profileId: profile.id,
      profileName: profile.name,
      price: profile.price,
      validityHours: profile.validityHours,
      validityDuration: profile.validityDuration,
      speedLimit: profile.speedLimit,
      status: 'unused',
      batchCode: 'ONLINE-' + now.toISOString().substring(0, 10),
      createdAt: nowStr,
      customerPhone: params.phone,
      paymentMethod: `${params.paymentMethod} (${params.paymentChannel})`,
      paymentRef: 'VCH-PAY-' + Date.now().toString(36).toUpperCase(),
    };

    // Save voucher
    this.saveVouchers([newVoucher]);

    // Create payment transaction
    const tx: PaymentTransaction = {
      id: 'tx-' + Date.now(),
      orderId: 'ORD-VCH-' + Date.now().toString().slice(-6),
      orderType: 'voucher',
      amount: profile.price,
      customerName: 'User Hotspot ' + params.phone.slice(-4),
      customerPhone: params.phone,
      paymentMethod: params.paymentMethod,
      paymentChannel: params.paymentChannel,
      status: 'settlement',
      voucherCode: voucherCode,
      expiryMinutes: 15,
      createdAt: nowStr,
      paidAt: nowStr,
    };
    this.saveTransaction(tx);

    // Send WhatsApp with Voucher Code via OpenWA (rmyndharis/OpenWA)
    this.addWaLog({
      recipientPhone: params.phone,
      recipientName: 'Pelanggan Hotspot',
      type: 'voucher_delivery',
      message: `TERIMA KASIH! Pembelian Voucher Hotspot Berhasil.\n\nPaket: ${profile.name} (${profile.validityDuration})\nKecepatan: ${profile.speedLimit}\nKode Voucher: *${voucherCode}*\n\nCara Pakai:\n1. Hubungkan WiFi ke SSID Hotspot\n2. Buka browser dan ketik: http://login.hotspot\n3. Masukkan Kode Voucher: *${voucherCode}*\nSelamat berselancar!`,
      status: 'sent',
      responseInfo: 'OpenWA (rmyndharis/OpenWA): 200 OK (wamid.HBgM...)',
    });

    return { voucher: newVoucher, transaction: tx };
  },

  // Reset to default data
  resetDefaults(): void {
    localStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
    localStorage.removeItem(STORAGE_KEYS.INVOICES);
    localStorage.removeItem(STORAGE_KEYS.HOTSPOT_PROFILES);
    localStorage.removeItem(STORAGE_KEYS.VOUCHERS);
    localStorage.removeItem(STORAGE_KEYS.ROUTERS);
    localStorage.removeItem(STORAGE_KEYS.WA_LOGS);
    localStorage.removeItem(STORAGE_KEYS.PAYMENT_CONFIG);
    localStorage.removeItem(STORAGE_KEYS.WA_CONFIG);
    localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
  }
};
