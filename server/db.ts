import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppSettings, Customer, Invoice, HotspotProfile, Voucher, WhatsAppLog, PaymentTransaction } from '../src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory for persistent SQLite database
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'billing.sqlite');

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  appName: 'NetFlow MikroTik ISP Billing & Hotspot Platform',
  brandName: 'NetFlow ISP',
  companyName: 'PT Netflow Solusi Nusantara',
  tagline: 'Sistem Billing & Voucher Hotspot MikroTik Siap Docker',
  officeAddress: 'Gedung Cyber 2 Lt. 4, Jl. H.R. Rasuna Said, Jakarta Selatan',
  phoneContact: '0812-8899-0011',
  emailContact: 'billing@ispnet.id',
  defaultSsid: 'NETFLOW_HOTSPOT_5G',
  currencySymbol: 'Rp',
  timezone: 'Asia/Jakarta',

  mikrotikHost: '103.180.12.5',
  mikrotikPort: 8728,
  mikrotikUser: 'api_billing',
  mikrotikPass: 'SuperSecurePassword!',
  mikrotikApiType: 'api',
  mikrotikTimeoutSec: 10,

  waProvider: 'openwa',
  openwaUrl: 'http://openwa:2785',
  openwaApiKey: 'openwa_admin_sec_88921a9f02b',
  openwaSessionId: 'billing-isp',
  openwaSenderNumber: '081288990011',
  autoSendReminderH3: true,
  autoSendReminderH1: true,
  autoSendIsolir: true,
  autoSendReceipt: true,

  paymentProvider: 'midtrans',
  paymentIsProduction: false,
  paymentServerKey: 'SB-Mid-server-xX88sampleKey992834',
  paymentClientKey: 'SB-Mid-client-88sampleKey1192',
  paymentMerchantCode: 'G8291039',
  paymentWebhookSecret: 'whsec_sample_netflow_isp_token',
  paymentAutoVerify: true,

  gracePeriodDays: 0,
  defaultVoucherPrefix: 'NET-',
  voucherLength: 5,
  updatedAt: new Date().toISOString(),
};

// Initialize SQLite database
export async function getDb(): Promise<Database> {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE);
      db = new SQL.Database(fileBuffer);
      console.log(`📦 Loaded existing SQLite database from: ${DB_FILE}`);
    } catch (err) {
      console.error(`⚠️ Failed to load existing SQLite file, creating new:`, err);
      db = new SQL.Database();
    }
  } else {
    console.log(`📦 Creating new SQLite database at: ${DB_FILE}`);
    db = new SQL.Database();
  }

  // Ensure tables exist
  initSchema(db);
  saveDbToDisk();

  return db;
}

// Persist SQLite database to disk
export function saveDbToDisk(): void {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_FILE, Buffer.from(data));
  } catch (err) {
    console.error(`❌ Failed to write SQLite to disk:`, err);
  }
}

function initSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT,
      pppoe_username TEXT NOT NULL,
      pppoe_password TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      bandwidth_limit TEXT NOT NULL,
      monthly_fee REAL NOT NULL,
      billing_date INTEGER NOT NULL,
      expired_date TEXT NOT NULL,
      status TEXT NOT NULL,
      auto_isolir INTEGER NOT NULL DEFAULT 1,
      router_id TEXT NOT NULL,
      ip_address TEXT,
      notes TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      period_month TEXT NOT NULL,
      amount REAL NOT NULL,
      unique_code REAL NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT NOT NULL,
      due_date TEXT NOT NULL,
      paid_at TEXT,
      payment_method TEXT,
      payment_channel TEXT,
      payment_ref TEXT
    );

    CREATE TABLE IF NOT EXISTS hotspot_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      speed_limit TEXT NOT NULL,
      validity_duration TEXT NOT NULL,
      validity_hours INTEGER NOT NULL,
      price REAL NOT NULL,
      shared_users INTEGER NOT NULL DEFAULT 1,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS vouchers (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      password TEXT,
      profile_id TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      price REAL NOT NULL,
      validity_hours INTEGER NOT NULL,
      validity_duration TEXT NOT NULL,
      speed_limit TEXT NOT NULL,
      status TEXT NOT NULL,
      batch_code TEXT NOT NULL,
      created_at TEXT NOT NULL,
      activated_at TEXT,
      expired_at TEXT,
      customer_phone TEXT,
      payment_method TEXT,
      payment_ref TEXT
    );

    CREATE TABLE IF NOT EXISTS whatsapp_logs (
      id TEXT PRIMARY KEY,
      recipient_phone TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      response_info TEXT
    );

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      order_type TEXT NOT NULL,
      amount REAL NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      payment_channel TEXT NOT NULL,
      status TEXT NOT NULL,
      voucher_code TEXT,
      invoice_id TEXT,
      created_at TEXT NOT NULL,
      paid_at TEXT
    );
  `);

  // Check if app_settings initialized
  const res = database.exec(`SELECT value FROM app_settings WHERE key = 'app_config'`);
  if (!res.length || !res[0].values.length) {
    database.run(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
      ['app_config', JSON.stringify(DEFAULT_APP_SETTINGS), new Date().toISOString()]
    );
  }
}

// DB Helper Queries
export async function getAppSettingsDb(): Promise<AppSettings> {
  const database = await getDb();
  const res = database.exec(`SELECT value FROM app_settings WHERE key = 'app_config'`);
  if (res.length && res[0].values.length) {
    try {
      const parsed = JSON.parse(res[0].values[0][0] as string);
      return { ...DEFAULT_APP_SETTINGS, ...parsed };
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  }
  return DEFAULT_APP_SETTINGS;
}

export async function saveAppSettingsDb(settings: Partial<AppSettings>): Promise<AppSettings> {
  const database = await getDb();
  const current = await getAppSettingsDb();
  const updated: AppSettings = {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString(),
  };

  database.run(
    `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
    ['app_config', JSON.stringify(updated), updated.updatedAt]
  );
  saveDbToDisk();
  return updated;
}

export async function getDbStats() {
  const database = await getDb();
  let fileSize = 0;
  if (fs.existsSync(DB_FILE)) {
    const stat = fs.statSync(DB_FILE);
    fileSize = stat.size;
  }

  const countQuery = (tbl: string) => {
    try {
      const res = database.exec(`SELECT COUNT(*) FROM ${tbl}`);
      return (res[0]?.values[0][0] as number) || 0;
    } catch {
      return 0;
    }
  };

  return {
    engine: 'SQLite 3 (WASM)',
    dbPath: DB_FILE,
    fileSizeBytes: fileSize,
    fileSizeKb: (fileSize / 1024).toFixed(2),
    tables: [
      { name: 'app_settings', count: countQuery('app_settings') },
      { name: 'customers', count: countQuery('customers') },
      { name: 'invoices', count: countQuery('invoices') },
      { name: 'hotspot_profiles', count: countQuery('hotspot_profiles') },
      { name: 'vouchers', count: countQuery('vouchers') },
      { name: 'whatsapp_logs', count: countQuery('whatsapp_logs') },
      { name: 'payment_transactions', count: countQuery('payment_transactions') },
    ],
    updatedAt: new Date().toISOString(),
  };
}
