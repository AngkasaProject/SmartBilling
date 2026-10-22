export type CustomerStatus = 'active' | 'expiring' | 'isolated' | 'disabled';

export interface Customer {
  id: string;
  customerId: string; // e.g. CUST-2026-001
  name: string;
  phone: string;
  email: string;
  address: string;
  pppoeUsername: string;
  pppoePassword: string;
  profileName: string; // e.g. "Paket Home 20 Mbps"
  bandwidthLimit: string; // e.g. "20M/20M"
  monthlyFee: number; // e.g. 175000
  billingDate: number; // e.g. tanggal 5 setiap bulan
  expiredDate: string; // YYYY-MM-DD
  status: CustomerStatus;
  autoIsolir: boolean;
  routerId: string;
  ipAddress?: string;
  notes?: string;
}

export type InvoiceStatus = 'unpaid' | 'paid' | 'expired' | 'canceled';

export interface Invoice {
  id: string;
  invoiceNumber: string; // e.g. INV-202610-001
  customerId: string;
  customerName: string;
  customerPhone: string;
  profileName: string;
  periodMonth: string; // e.g. "Oktober 2026"
  amount: number;
  uniqueCode: number;
  totalAmount: number;
  status: InvoiceStatus;
  dueDate: string; // YYYY-MM-DD
  paidAt?: string;
  paymentMethod?: string;
  paymentChannel?: string;
  paymentRef?: string;
}

export interface HotspotProfile {
  id: string;
  name: string;
  serviceProfileId?: string;
  speedLimit: string; // e.g. "5M/5M"
  routerId?: string;
  routerProfileName?: string;
  validityDuration: string; // e.g. "3 Jam", "1 Hari", "7 Hari", "30 Hari"
  validityHours: number;
  price: number;
  sharedUsers: number;
  dataLimitMb?: number;
  color: string;
  enabled?: boolean;
}

export type HotspotValidityPreset = '1 jam' | '12 jam' | '1 hari' | '1 minggu' | '2 minggu' | '1 bulan';

export interface HotspotServiceProfile {
  id: string;
  name: string;
  routerId: string;
  routerProfileName: string;
  speedLimit: string;
  validityPreset: HotspotValidityPreset;
  validityHours: number;
  sharedUsers: number;
  dataLimitMb?: number;
}

export type VoucherStatus = 'pending' | 'unused' | 'active' | 'expired';

export interface Voucher {
  id: string;
  code: string;
  password?: string;
  profileId: string;
  profileName: string;
  price: number;
  validityHours: number;
  validityDuration: string;
  speedLimit: string;
  status: VoucherStatus;
  batchCode: string;
  createdAt: string;
  activatedAt?: string;
  expiredAt?: string;
  customerPhone?: string;
  paymentMethod?: string;
  paymentRef?: string;
  routerId?: string;
  orderId?: string;
}

export interface RouterConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  apiType: 'api' | 'api-ssl' | 'rest';
  status: 'connected' | 'offline';
  model: string;
  rosVersion: string;
  cpuLoad: number;
  memoryFreeMb: number;
  uptime: string;
  activePppoe: number;
  activeHotspot: number;
}

export type WhatsAppMsgType =
  | 'reminder_h3'
  | 'reminder_h1'
  | 'due_today'
  | 'isolated'
  | 'payment_success'
  | 'voucher_delivery'
  | 'custom';

export interface WhatsAppLog {
  id: string;
  recipientPhone: string;
  recipientName: string;
  type: WhatsAppMsgType;
  message: string;
  status: 'sent' | 'pending' | 'failed';
  timestamp: string;
  responseInfo?: string;
}

export interface PaymentGatewayConfig {
  provider: 'midtrans' | 'xendit' | 'tripay';
  isProduction: boolean;
  serverKey: string;
  clientKey: string;
  merchantCode?: string;
  webhookSecret: string;
  autoVerify: boolean;
  manualPaymentMethods?: ManualPaymentMethod[];
  manualTimeoutMinutes?: number;
}

export interface ManualPaymentMethod {
  id: string;
  name: string;
  serviceName?: string;
  accountNumber?: string;
  instructions: string;
  enabled: boolean;
}

export interface WhatsAppGatewayConfig {
  provider: 'openwa' | 'fonnte' | 'wablas' | 'baileys';
  // OpenWA (rmyndharis/OpenWA) configuration
  openwaUrl: string; // e.g. http://localhost:2785 or http://openwa:2785
  apiKey: string; // X-API-Key header
  sessionId: string; // e.g. "billing-isp"
  sessionStatus: 'connected' | 'scan_qr' | 'disconnected' | 'starting';
  sessionPhone?: string;
  senderNumber: string;
  autoSendReminderH3: boolean;
  autoSendReminderH1: boolean;
  autoSendIsolir: boolean;
  autoSendReceipt: boolean;
  token?: string;
  endpointUrl?: string;
}

export interface PaymentTransaction {
  id: string;
  orderId: string;
  orderType: 'invoice' | 'voucher';
  amount: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  paymentMethod: string;
  paymentChannel: string;
  status: 'pending' | 'settlement' | 'expired' | 'canceled';
  qrCodeUrl?: string;
  paymentUrl?: string;
  vaNumber?: string;
  expiryMinutes: number;
  createdAt: string;
  paidAt?: string;
  voucherCode?: string;
  invoiceId?: string;
  expiresAt?: string;
  proofData?: string;
}

export interface AppDataSnapshot {
  customers: Customer[];
  invoices: Invoice[];
  hotspotProfiles: HotspotProfile[];
  hotspotServiceProfiles: HotspotServiceProfile[];
  vouchers: Voucher[];
  routers: RouterConfig[];
  whatsappLogs: WhatsAppLog[];
  paymentConfig: PaymentGatewayConfig;
  whatsappConfig: WhatsAppGatewayConfig;
  transactions: PaymentTransaction[];
}

export interface AppSettings {
  // 1. General & Branding
  appName: string;
  brandName: string;
  companyName: string;
  tagline: string;
  officeAddress: string;
  phoneContact: string;
  emailContact: string;
  defaultSsid: string;
  currencySymbol: string;
  timezone: string;

  // 2. MikroTik Router Connection
  mikrotikHost: string;
  mikrotikPort: number;
  mikrotikUser: string;
  mikrotikPass?: string;
  mikrotikApiType: 'api' | 'api-ssl' | 'rest';
  mikrotikTimeoutSec: number;

  // 3. OpenWA WhatsApp Gateway (rmyndharis/OpenWA)
  waProvider: 'openwa' | 'fonnte' | 'wablas' | 'baileys';
  openwaUrl: string;
  openwaApiKey: string;
  openwaSessionId: string;
  openwaSenderNumber: string;
  autoSendReminderH3: boolean;
  autoSendReminderH1: boolean;
  autoSendIsolir: boolean;
  autoSendReceipt: boolean;

  // 4. Payment Gateway (Midtrans / Xendit / Tripay)
  paymentProvider: 'midtrans' | 'xendit' | 'tripay';
  paymentIsProduction: boolean;
  paymentServerKey: string;
  paymentClientKey: string;
  paymentMerchantCode?: string;
  paymentWebhookSecret: string;
  paymentAutoVerify: boolean;

  // 5. Billing & Hotspot Defaults
  gracePeriodDays: number;
  defaultVoucherPrefix: string;
  voucherLength: number;
  updatedAt: string;
}

export interface DatabaseStats {
  engine: 'sqlite';
  dbPath: string;
  fileSizeBytes: number;
  tablesCount: number;
  customersCount: number;
  invoicesCount: number;
  vouchersCount: number;
  lastBackupTime?: string;
}
