import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac, timingSafeEqual } from 'crypto';
import { AppDataSnapshot, AppSettings, Customer, HotspotProfile, HotspotServiceProfile, Invoice, PaymentTransaction, PppoePackage, Voucher } from '../src/types';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../src/utils/whatsappTemplates';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory for persistent SQLite database
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'billing.sqlite');

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let encryptionKeyMaterial: Buffer | null = null;
let previousEncryptionKeys: Buffer[] = [];

export const DEFAULT_APP_SETTINGS: AppSettings = {
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
    throw err;
  }
}

export async function restoreDbFromBackup(backup: Buffer): Promise<string> {
  const database = await getDb();
  if (!SQL) throw new Error('SQLite belum siap');
  if (backup.length < 100 || backup.length > 100 * 1024 * 1024) {
    throw new Error('Ukuran file backup tidak valid (maksimal 100 MB)');
  }

  let restored: Database | undefined;
  try {
    restored = new SQL.Database(new Uint8Array(backup));
    const integrity = restored.exec('PRAGMA integrity_check');
    if (integrity[0]?.values[0]?.[0] !== 'ok') {
      throw new Error('Pemeriksaan integritas SQLite gagal');
    }

    const tables = new Set(
      restored.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values
        .map(row => String(row[0])) || []
    );
    for (const table of ['app_settings', 'app_data', 'admin_users', 'router_credentials']) {
      if (!tables.has(table)) throw new Error(`Backup bukan database SmartBilling yang valid (tabel ${table} tidak ditemukan)`);
    }

    const appData = restored.exec('SELECT collection, value FROM app_data');
    for (const [collection, value] of appData[0]?.values || []) {
      if (typeof collection !== 'string' || typeof value !== 'string') {
        throw new Error('Data aplikasi di dalam backup tidak valid');
      }
      JSON.parse(value);
    }
    const appSettings = restored.exec("SELECT value FROM app_settings WHERE key = 'app_config'");
    if (appSettings[0]?.values[0]?.[0]) {
      JSON.parse(String(appSettings[0].values[0][0]));
    }
  } catch (error) {
    restored?.close();
    if (error instanceof Error) throw new Error(`Backup tidak dapat dipulihkan: ${error.message}`);
    throw new Error('Backup tidak dapat dipulihkan');
  }
  if (!restored) throw new Error('Backup tidak dapat dipulihkan');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(DATA_DIR, `billing-before-restore-${timestamp}.sqlite`);
  const temporaryPath = path.join(DATA_DIR, `billing-restore-${randomBytes(8).toString('hex')}.tmp`);
  let currentMoved = false;
  try {
    fs.renameSync(DB_FILE, backupPath);
    currentMoved = true;
    fs.writeFileSync(temporaryPath, backup);
    fs.renameSync(temporaryPath, DB_FILE);
    db = restored;
    database.close();
    return path.basename(backupPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    if (currentMoved && !fs.existsSync(DB_FILE)) fs.renameSync(backupPath, DB_FILE);
    restored.close();
    throw error;
  }
}

export async function resetAllBusinessDataDb(): Promise<string> {
  const database = await getDb();
  const currentSettings = await getAppSettingsDb();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(
    DATA_DIR,
    `billing-before-reset-${timestamp}-${randomBytes(4).toString('hex')}.sqlite`
  );
  const resetSettings: AppSettings = {
    ...currentSettings,
    mikrotikHost: DEFAULT_APP_SETTINGS.mikrotikHost,
    mikrotikPort: DEFAULT_APP_SETTINGS.mikrotikPort,
    mikrotikUser: DEFAULT_APP_SETTINGS.mikrotikUser,
    mikrotikPass: DEFAULT_APP_SETTINGS.mikrotikPass,
    mikrotikApiType: DEFAULT_APP_SETTINGS.mikrotikApiType,
    mikrotikTimeoutSec: DEFAULT_APP_SETTINGS.mikrotikTimeoutSec,
    waProvider: DEFAULT_APP_SETTINGS.waProvider,
    openwaUrl: DEFAULT_APP_SETTINGS.openwaUrl,
    openwaApiKey: DEFAULT_APP_SETTINGS.openwaApiKey,
    openwaSessionId: DEFAULT_APP_SETTINGS.openwaSessionId,
    openwaSenderNumber: DEFAULT_APP_SETTINGS.openwaSenderNumber,
    autoSendReminderH3: DEFAULT_APP_SETTINGS.autoSendReminderH3,
    autoSendReminderH1: DEFAULT_APP_SETTINGS.autoSendReminderH1,
    autoSendIsolir: DEFAULT_APP_SETTINGS.autoSendIsolir,
    autoSendReceipt: DEFAULT_APP_SETTINGS.autoSendReceipt,
    paymentProvider: DEFAULT_APP_SETTINGS.paymentProvider,
    paymentIsProduction: DEFAULT_APP_SETTINGS.paymentIsProduction,
    paymentServerKey: DEFAULT_APP_SETTINGS.paymentServerKey,
    paymentClientKey: DEFAULT_APP_SETTINGS.paymentClientKey,
    paymentMerchantCode: DEFAULT_APP_SETTINGS.paymentMerchantCode,
    paymentWebhookSecret: DEFAULT_APP_SETTINGS.paymentWebhookSecret,
    paymentAutoVerify: DEFAULT_APP_SETTINGS.paymentAutoVerify,
    updatedAt: new Date().toISOString(),
  };
  const emptySnapshot: AppDataSnapshot = {
    customers: [],
    invoices: [],
    pppoePackages: [],
    hotspotProfiles: [],
    hotspotServiceProfiles: [],
    vouchers: [],
    routers: [],
    whatsappLogs: [],
    paymentConfig: {
      provider: 'none',
      isProduction: false,
      serverKey: '',
      clientKey: '',
      webhookSecret: '',
      autoVerify: false,
      manualPaymentMethods: [],
      uniqueAmountEnabled: false,
    },
    whatsappConfig: {
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
    },
    transactions: [],
  };

  saveDbToDisk();
  fs.copyFileSync(DB_FILE, backupPath);
  database.run('BEGIN TRANSACTION');
  try {
    database.run('DELETE FROM app_data');
    for (const [collection, value] of Object.entries(emptySnapshot)) {
      database.run(
        'INSERT INTO app_data (collection, value, updated_at) VALUES (?, ?, ?)',
        [collection, JSON.stringify(value), new Date().toISOString()]
      );
    }
    for (const table of ['customers', 'invoices', 'hotspot_profiles', 'vouchers', 'whatsapp_logs', 'payment_transactions']) {
      database.run(`DELETE FROM ${table}`);
    }
    for (const table of ['router_credentials', 'payment_gateway_credentials', 'admin_sessions', 'portal_otp_challenges']) {
      database.run(`DELETE FROM ${table}`);
    }
    database.run(
      `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('app_config', ?, ?)`,
      [JSON.stringify(resetSettings), resetSettings.updatedAt]
    );
    database.run(
      'DELETE FROM app_settings WHERE key IN (?, ?, ?, ?)',
      ['payment_public_urls', 'portal_payment_link_secret', 'portal_session_secret', 'pppoe_usage']
    );
    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    throw error;
  }
  saveDbToDisk();
  return path.basename(backupPath);
}

function initSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portal_otp_challenges (
      token_hash TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payment_gateway_credentials (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      secret TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS app_data (
      collection TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS router_credentials (
      router_id TEXT PRIMARY KEY,
      secret TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      expires_at TEXT NOT NULL
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

const ENCRYPTION_KEY_PLACEHOLDERS = new Set([
  'GENERATE_A_LONG_RANDOM_ENCRYPTION_KEY',
  'YOUR_ENCRYPTION_KEY',
  'CHANGE_ME',
]);

function encryptionKeyPath(): string {
  return path.join(DATA_DIR, 'router-secrets.key');
}

function configuredEncryptionKey(): Buffer | null {
  const configured = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!configured || ENCRYPTION_KEY_PLACEHOLDERS.has(configured)) return null;
  if (configured.startsWith('base64:')) {
    const decoded = Buffer.from(configured.slice(7), 'base64');
    if (decoded.length !== 32) throw new Error('APP_ENCRYPTION_KEY base64 value must decode to 32 bytes');
    return decoded;
  }
  return Buffer.from(configured, 'utf8');
}

function loadEncryptionKeyMaterial(): Buffer {
  if (encryptionKeyMaterial) return encryptionKeyMaterial;
  const configured = configuredEncryptionKey();
  if (configured) {
    encryptionKeyMaterial = configured;
    return configured;
  }

  const keyPath = encryptionKeyPath();
  if (!fs.existsSync(keyPath)) {
    try {
      fs.writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  const stored = fs.readFileSync(keyPath);
  try {
    const keyring = JSON.parse(stored.toString('utf8')) as { version: number; active: string; previous?: string[] };
    if (keyring.version === 1 && typeof keyring.active === 'string') {
      encryptionKeyMaterial = Buffer.from(keyring.active, 'base64');
      previousEncryptionKeys = (keyring.previous || []).map(key => Buffer.from(key, 'base64'));
      if (encryptionKeyMaterial.length !== 32 || previousEncryptionKeys.some(key => key.length !== 32)) {
        throw new Error('Stored application encryption key is invalid');
      }
      return encryptionKeyMaterial;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Stored application encryption key is invalid') throw error;
  }

  if (stored.length !== 32) throw new Error('Stored application encryption key file is invalid');
  encryptionKeyMaterial = stored;
  return stored;
}

function encryptionKeyFromMaterial(material: Buffer): Buffer {
  return createHash('sha256').update(material).digest();
}

function decryptRouterSecret(secret: string, keyMaterials: Buffer[]): string {
  const packed = Buffer.from(secret, 'base64');
  if (packed.length < 28) throw new Error('Stored router credential is invalid');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  let lastError: unknown;
  for (const material of keyMaterials) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', encryptionKeyFromMaterial(material), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error('Router credential cannot be decrypted with the configured application key', { cause: lastError });
}

function encryptRouterSecret(password: string, material = loadEncryptionKeyMaterial()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKeyFromMaterial(material), iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export interface PaymentGatewayCredentials {
  provider: 'none' | 'midtrans' | 'doku' | 'xendit' | 'tripay';
  isProduction: boolean;
  serverKey?: string;
  clientKey?: string;
  dokuClientId?: string;
  dokuSecretKey?: string;
  xenditApiKey?: string;
  xenditCallbackToken?: string;
  tripayMerchantCode?: string;
  tripayApiKey?: string;
  tripayPrivateKey?: string;
  tripayPaymentMethod?: string;
}

function isPaymentGatewayCredentials(value: unknown): value is PaymentGatewayCredentials {
  if (typeof value !== 'object' || value === null) return false;
  const credentials = value as Record<string, unknown>;
  return (
    (credentials.provider === 'midtrans' ||
      credentials.provider === 'doku' ||
      credentials.provider === 'xendit' ||
      credentials.provider === 'tripay' ||
      credentials.provider === 'none') &&
    typeof credentials.isProduction === 'boolean' &&
    ['serverKey', 'clientKey', 'dokuClientId', 'dokuSecretKey', 'xenditApiKey', 'xenditCallbackToken', 'tripayMerchantCode', 'tripayApiKey', 'tripayPrivateKey', 'tripayPaymentMethod'].every(key =>
      credentials[key] === undefined || typeof credentials[key] === 'string'
    )
  );
}

export async function savePaymentGatewayCredentialsDb(
  credentials: PaymentGatewayCredentials
): Promise<void> {
  const database = await getDb();
  database.run(
    'INSERT OR REPLACE INTO payment_gateway_credentials (id, secret, updated_at) VALUES (1, ?, ?)',
    [encryptRouterSecret(JSON.stringify(credentials)), new Date().toISOString()]
  );
  saveDbToDisk();
}

export async function getPaymentGatewayCredentialsDb(): Promise<PaymentGatewayCredentials | null> {
  const database = await getDb();
  const result = database.exec('SELECT secret FROM payment_gateway_credentials WHERE id = 1');
  const secret = result[0]?.values[0]?.[0];
  if (typeof secret !== 'string') return null;
  const compatibilityKeys = ENCRYPTION_KEY_PLACEHOLDERS.has(process.env.APP_ENCRYPTION_KEY?.trim() || '')
    ? [Buffer.from(process.env.APP_ENCRYPTION_KEY!.trim(), 'utf8')]
    : [];
  const decoded = decryptRouterSecret(secret, [
    loadEncryptionKeyMaterial(),
    ...previousEncryptionKeys,
    ...compatibilityKeys,
  ]);
  const credentials: unknown = JSON.parse(decoded);
  if (typeof credentials === 'object' && credentials !== null && 'provider' in credentials && credentials.provider === 'manual') {
    credentials.provider = 'none';
  }
  if (!isPaymentGatewayCredentials(credentials)) {
    throw new Error('Stored payment gateway configuration is invalid');
  }
  return credentials;
}

function writeEncryptionKeyring(active: Buffer, previous: Buffer[] = []): void {
  const keyPath = encryptionKeyPath();
  const temporaryPath = `${keyPath}.${randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify({
    version: 1,
    active: active.toString('base64'),
    previous: previous.map(key => key.toString('base64')),
  }), { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporaryPath, keyPath);
}

export function getEncryptionKeyInfo(): { key: string; source: 'environment' | 'generated' } {
  const configured = configuredEncryptionKey();
  const material = configured || loadEncryptionKeyMaterial();
  return {
    key: `base64:${material.toString('base64')}`,
    source: configured ? 'environment' : 'generated',
  };
}

export async function rotateEncryptionKeyDb(): Promise<{ key: string }> {
  if (configuredEncryptionKey()) {
    throw new Error('APP_ENCRYPTION_KEY is set in the environment; update it there instead of rotating from the panel');
  }
  const database = await getDb();
  const oldMaterial = loadEncryptionKeyMaterial();
  const newMaterial = randomBytes(32);
  const previous = [oldMaterial, ...previousEncryptionKeys.filter(key => !key.equals(oldMaterial))];
  writeEncryptionKeyring(newMaterial, previous);
  encryptionKeyMaterial = newMaterial;
  previousEncryptionKeys = previous;

  const result = database.exec('SELECT router_id, secret FROM router_credentials');
  const rows = result[0]?.values ?? [];
  const paymentResult = database.exec('SELECT secret FROM payment_gateway_credentials WHERE id = 1');
  const paymentSecret = paymentResult[0]?.values[0]?.[0];
  const portalSessionResult = database.exec('SELECT value FROM app_settings WHERE key = ?', ['portal_session_secret']);
  const portalSessionSecret = portalSessionResult[0]?.values[0]?.[0];
  database.run('BEGIN TRANSACTION');
  try {
    for (const [routerId, secret] of rows) {
      const password = decryptRouterSecret(String(secret), [oldMaterial, ...previous]);
      database.run(
        'UPDATE router_credentials SET secret = ?, updated_at = ? WHERE router_id = ?',
        [encryptRouterSecret(password, newMaterial), new Date().toISOString(), String(routerId)]
      );
    }
    if (typeof paymentSecret === 'string') {
      const credentials = decryptRouterSecret(paymentSecret, [oldMaterial, ...previous]);
      database.run(
        'UPDATE payment_gateway_credentials SET secret = ?, updated_at = ? WHERE id = 1',
        [encryptRouterSecret(credentials, newMaterial), new Date().toISOString()]
      );
    }
    if (typeof portalSessionSecret === 'string') {
      const secret = decryptRouterSecret(portalSessionSecret, [oldMaterial, ...previous]);
      database.run(
        'UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?',
        [encryptRouterSecret(secret, newMaterial), new Date().toISOString(), 'portal_session_secret']
      );
    }
    saveDbToDisk();
    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    throw error;
  }

  writeEncryptionKeyring(newMaterial);
  previousEncryptionKeys = [];
  return { key: `base64:${newMaterial.toString('base64')}` };
}

export async function saveRouterCredentialDb(routerId: string, password: string): Promise<void> {
  const database = await getDb();
  const secret = encryptRouterSecret(password);
  database.run(
    'INSERT OR REPLACE INTO router_credentials (router_id, secret, updated_at) VALUES (?, ?, ?)',
    [routerId, secret, new Date().toISOString()]
  );
  saveDbToDisk();
}

export async function deleteRouterCredentialDb(routerId: string): Promise<void> {
  const database = await getDb();
  database.run('DELETE FROM router_credentials WHERE router_id = ?', [routerId]);
  saveDbToDisk();
}

export async function getRouterCredentialDb(routerId: string): Promise<string | null> {
  const database = await getDb();
  const result = database.exec('SELECT secret FROM router_credentials WHERE router_id = ?', [routerId]);
  if (!result.length || !result[0].values.length) return null;
  const current = loadEncryptionKeyMaterial();
  const compatibilityKeys = ENCRYPTION_KEY_PLACEHOLDERS.has(process.env.APP_ENCRYPTION_KEY?.trim() || '')
    ? [Buffer.from(process.env.APP_ENCRYPTION_KEY!.trim(), 'utf8')]
    : [];
  return decryptRouterSecret(result[0].values[0][0] as string, [current, ...previousEncryptionKeys, ...compatibilityKeys]);
}

export async function countAdminUsersDb(): Promise<number> {
  const database = await getDb();
  const result = database.exec('SELECT COUNT(*) FROM admin_users');
  return Number(result[0]?.values[0]?.[0] || 0);
}

export async function getAdminUserDb(username: string): Promise<{ id: string; username: string; passwordHash: string } | null> {
  const database = await getDb();
  const result = database.exec('SELECT id, username, password_hash FROM admin_users WHERE username = ?', [username]);
  const row = result[0]?.values[0];
  return row ? { id: String(row[0]), username: String(row[1]), passwordHash: String(row[2]) } : null;
}

export async function getAdminUsersDb(): Promise<Array<{ id: string; username: string; createdAt: string }>> {
  const database = await getDb();
  const result = database.exec('SELECT id, username, created_at FROM admin_users ORDER BY created_at');
  return (result[0]?.values || []).map(row => ({
    id: String(row[0]),
    username: String(row[1]),
    createdAt: String(row[2]),
  }));
}

export async function createAdminUserDb(id: string, username: string, passwordHash: string): Promise<void> {
  const database = await getDb();
  database.run(
    'INSERT INTO admin_users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    [id, username, passwordHash, new Date().toISOString()]
  );
  saveDbToDisk();
}

export async function createInitialAdminUserDb(id: string, username: string, passwordHash: string): Promise<void> {
  const database = await getDb();
  database.run('BEGIN TRANSACTION');
  try {
    const count = database.exec('SELECT COUNT(*) FROM admin_users');
    if (Number(count[0]?.values[0]?.[0] || 0) > 0) throw new Error('Admin registration is already closed');
    database.run(
      'INSERT INTO admin_users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
      [id, username, passwordHash, new Date().toISOString()]
    );
    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    throw error;
  }
  saveDbToDisk();
}

export async function deleteAdminUserDb(id: string): Promise<void> {
  const database = await getDb();
  database.run('DELETE FROM admin_sessions WHERE user_id = ?', [id]);
  database.run('DELETE FROM admin_users WHERE id = ?', [id]);
  saveDbToDisk();
}

export async function createAdminSessionDb(tokenHash: string, userId: string, username: string, expiresAt: string): Promise<void> {
  const database = await getDb();
  database.run('DELETE FROM admin_sessions WHERE expires_at <= ?', [new Date().toISOString()]);
  database.run(
    'INSERT INTO admin_sessions (token_hash, user_id, username, expires_at) VALUES (?, ?, ?, ?)',
    [tokenHash, userId, username, expiresAt]
  );
  saveDbToDisk();
}

export async function getAdminSessionDb(tokenHash: string): Promise<{ userId: string; username: string } | null> {
  const database = await getDb();
  const result = database.exec(
    'SELECT user_id, username FROM admin_sessions WHERE token_hash = ? AND expires_at > ?',
    [tokenHash, new Date().toISOString()]
  );
  const row = result[0]?.values[0];
  return row ? { userId: String(row[0]), username: String(row[1]) } : null;
}

export async function deleteAdminSessionDb(tokenHash: string): Promise<void> {
  const database = await getDb();
  database.run('DELETE FROM admin_sessions WHERE token_hash = ?', [tokenHash]);
  saveDbToDisk();
}

export async function saveAppDataCollectionDb<K extends keyof AppDataSnapshot>(
  collection: K,
  value: AppDataSnapshot[K]
): Promise<void> {
  const database = await getDb();
  database.run(
    'INSERT OR REPLACE INTO app_data (collection, value, updated_at) VALUES (?, ?, ?)',
    [collection, JSON.stringify(value), new Date().toISOString()]
  );
  saveDbToDisk();
}

export async function saveHotspotProfileDataDb(
  serviceProfiles: HotspotServiceProfile[],
  profiles: HotspotProfile[]
): Promise<void> {
  const database = await getDb();
  const updatedAt = new Date().toISOString();
  database.run('BEGIN TRANSACTION');
  try {
    database.run(
      'INSERT OR REPLACE INTO app_data (collection, value, updated_at) VALUES (?, ?, ?)',
      ['hotspotServiceProfiles', JSON.stringify(serviceProfiles), updatedAt]
    );
    database.run(
      'INSERT OR REPLACE INTO app_data (collection, value, updated_at) VALUES (?, ?, ?)',
      ['hotspotProfiles', JSON.stringify(profiles), updatedAt]
    );
    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    throw error;
  }
  saveDbToDisk();
}

export async function savePppoeProfileDataDb(
  packages: PppoePackage[],
  customers: Customer[]
): Promise<void> {
  const database = await getDb();
  const updatedAt = new Date().toISOString();
  database.run('BEGIN TRANSACTION');
  try {
    database.run(
      'INSERT OR REPLACE INTO app_data (collection, value, updated_at) VALUES (?, ?, ?)',
      ['pppoePackages', JSON.stringify(packages), updatedAt]
    );
    database.run(
      'INSERT OR REPLACE INTO app_data (collection, value, updated_at) VALUES (?, ?, ?)',
      ['customers', JSON.stringify(customers), updatedAt]
    );
    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    throw error;
  }
  saveDbToDisk();
}

export async function savePublicPaymentUpdateDb(
  customers: Customer[],
  invoices: Invoice[],
  transactions: PaymentTransaction[],
  vouchers?: Voucher[]
): Promise<void> {
  const database = await getDb();
  const updatedAt = new Date().toISOString();
  database.run('BEGIN TRANSACTION');
  try {
    database.run(
      'INSERT OR REPLACE INTO app_data (collection, value, updated_at) VALUES (?, ?, ?)',
      ['customers', JSON.stringify(customers), updatedAt]
    );
    database.run(
      'INSERT OR REPLACE INTO app_data (collection, value, updated_at) VALUES (?, ?, ?)',
      ['invoices', JSON.stringify(invoices), updatedAt]
    );
    database.run(
      'INSERT OR REPLACE INTO app_data (collection, value, updated_at) VALUES (?, ?, ?)',
      ['transactions', JSON.stringify(transactions), updatedAt]
    );
    if (vouchers) {
      database.run(
        'INSERT OR REPLACE INTO app_data (collection, value, updated_at) VALUES (?, ?, ?)',
        ['vouchers', JSON.stringify(vouchers), updatedAt]
      );
    }
    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    throw error;
  }
  saveDbToDisk();
}

export async function getOrCreatePortalLinkSecretDb(): Promise<string> {
  const database = await getDb();
  const current = database.exec('SELECT value FROM app_settings WHERE key = ?', ['portal_payment_link_secret']);
  const existing = current[0]?.values[0]?.[0];
  if (typeof existing === 'string' && existing.length >= 40) return existing;
  const secret = randomBytes(48).toString('base64url');
  database.run(
    'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
    ['portal_payment_link_secret', secret, new Date().toISOString()]
  );
  saveDbToDisk();
  return secret;
}

export async function getPortalSessionSecretDb(): Promise<string | null> {
  const database = await getDb();
  const result = database.exec('SELECT value FROM app_settings WHERE key = ?', ['portal_session_secret']);
  const encryptedSecret = result[0]?.values[0]?.[0];
  if (typeof encryptedSecret !== 'string') return null;
  const compatibilityKeys = ENCRYPTION_KEY_PLACEHOLDERS.has(process.env.APP_ENCRYPTION_KEY?.trim() || '')
    ? [Buffer.from(process.env.APP_ENCRYPTION_KEY!.trim(), 'utf8')]
    : [];
  return decryptRouterSecret(encryptedSecret, [
    loadEncryptionKeyMaterial(),
    ...previousEncryptionKeys,
    ...compatibilityKeys,
  ]);
}

export async function generatePortalSessionSecretDb(): Promise<string> {
  const database = await getDb();
  const secret = randomBytes(48).toString('base64url');
  database.run(
    'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
    ['portal_session_secret', encryptRouterSecret(secret), new Date().toISOString()]
  );
  saveDbToDisk();
  return secret;
}

function getPortalOtpTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function getPortalOtpCodeHash(secret: string, phone: string, token: string, code: string): string {
  return createHmac('sha256', secret)
    .update(`${phone}\n${token}\n${code}`)
    .digest('hex');
}

export async function savePortalOtpChallengeDb(
  phone: string,
  token: string,
  code: string,
  expiresAt: number
): Promise<void> {
  const secret = await getPortalSessionSecretDb();
  if (!secret) throw new Error('Portal session secret is not configured');
  const database = await getDb();
  database.run('DELETE FROM portal_otp_challenges WHERE expires_at <= ?', [Date.now()]);
  database.run(
    'INSERT OR REPLACE INTO portal_otp_challenges (token_hash, phone, code_hash, expires_at, attempts) VALUES (?, ?, ?, ?, 0)',
    [
      getPortalOtpTokenHash(token),
      phone,
      getPortalOtpCodeHash(secret, phone, token, code),
      expiresAt,
    ]
  );
  saveDbToDisk();
}

export async function consumePortalOtpChallengeDb(
  phone: string,
  token: string,
  code: string
): Promise<boolean> {
  const secret = await getPortalSessionSecretDb();
  if (!secret) throw new Error('Portal session secret is not configured');
  const database = await getDb();
  const tokenHash = getPortalOtpTokenHash(token);
  const result = database.exec(
    'SELECT phone, code_hash, expires_at, attempts FROM portal_otp_challenges WHERE token_hash = ?',
    [tokenHash]
  );
  const row = result[0]?.values[0];
  if (!row) return false;

  const [storedPhone, storedCodeHash, expiresAt, attempts] = row;
  const nextAttempts = Number(attempts) + 1;
  const suppliedCodeHash = getPortalOtpCodeHash(secret, phone, token, code);
  const expected = Buffer.from(String(storedCodeHash), 'hex');
  const supplied = Buffer.from(suppliedCodeHash, 'hex');
  const matches = String(storedPhone) === phone &&
    Number(expiresAt) > Date.now() &&
    Number(attempts) < 5 &&
    expected.length === supplied.length &&
    timingSafeEqual(expected, supplied);

  if (matches || Number(expiresAt) <= Date.now() || nextAttempts >= 5) {
    database.run('DELETE FROM portal_otp_challenges WHERE token_hash = ?', [tokenHash]);
  } else {
    database.run(
      'UPDATE portal_otp_challenges SET attempts = ? WHERE token_hash = ?',
      [nextAttempts, tokenHash]
    );
  }
  saveDbToDisk();
  return matches;
}

export async function discardPortalOtpChallengeDb(token: string): Promise<void> {
  const database = await getDb();
  database.run('DELETE FROM portal_otp_challenges WHERE token_hash = ?', [getPortalOtpTokenHash(token)]);
  saveDbToDisk();
}

export async function getRevenueResetStateDb(): Promise<{
  statisticsResetAt?: string;
  historyResetAt?: string;
}> {
  const database = await getDb();
  const result = database.exec(
    'SELECT key, value FROM app_settings WHERE key IN (?, ?)',
    ['revenue_statistics_reset_at', 'revenue_history_reset_at']
  );
  const values = new Map<string, string>();
  for (const [key, value] of result[0]?.values ?? []) {
    if (typeof key === 'string' && typeof value === 'string') values.set(key, value);
  }
  return {
    ...(values.has('revenue_statistics_reset_at')
      ? { statisticsResetAt: values.get('revenue_statistics_reset_at') }
      : {}),
    ...(values.has('revenue_history_reset_at')
      ? { historyResetAt: values.get('revenue_history_reset_at') }
      : {}),
  };
}

export async function resetRevenueReportingDb(
  mode: 'statistics' | 'history'
): Promise<{ resetAt: string }> {
  const database = await getDb();
  const resetAt = new Date().toISOString();
  const rows: Array<[string, string, string]> = [
    ['revenue_statistics_reset_at', resetAt, resetAt],
  ];
  if (mode === 'history') {
    rows.push(['revenue_history_reset_at', resetAt, resetAt]);
  }
  database.run('BEGIN TRANSACTION');
  try {
    for (const [key, value, updatedAt] of rows) {
      database.run(
        'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
        [key, value, updatedAt]
      );
    }
    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    throw error;
  }
  saveDbToDisk();
  return { resetAt };
}

export async function saveVoucherOrderDb(vouchers: Voucher[], transactions: PaymentTransaction[]): Promise<void> {
  const database = await getDb();
  const updatedAt = new Date().toISOString();
  database.run('BEGIN TRANSACTION');
  try {
    database.run(
      'INSERT OR REPLACE INTO app_data (collection, value, updated_at) VALUES (?, ?, ?)',
      ['vouchers', JSON.stringify(vouchers), updatedAt]
    );
    database.run(
      'INSERT OR REPLACE INTO app_data (collection, value, updated_at) VALUES (?, ?, ?)',
      ['transactions', JSON.stringify(transactions), updatedAt]
    );
    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    throw error;
  }
  saveDbToDisk();
}

const APP_DATA_COLLECTIONS = [
  'customers',
  'invoices',
  'pppoePackages',
  'hotspotProfiles',
  'hotspotServiceProfiles',
  'vouchers',
  'routers',
  'whatsappLogs',
  'paymentConfig',
  'whatsappConfig',
  'transactions',
] as const satisfies readonly (keyof AppDataSnapshot)[];

export async function getAppDataDb(): Promise<{
  initialized: boolean;
  data: Partial<AppDataSnapshot>;
}> {
  const database = await getDb();
  const result = database.exec('SELECT collection, value FROM app_data');
  const data: Partial<AppDataSnapshot> = {};

  for (const [collection, serialized] of result[0]?.values ?? []) {
    if (!APP_DATA_COLLECTIONS.includes(collection as keyof AppDataSnapshot)) continue;
    try {
      (data as Record<string, unknown>)[collection as string] = JSON.parse(serialized as string);
    } catch (err) {
      throw new Error(`Stored app data for "${String(collection)}" is invalid JSON`, { cause: err });
    }
  }
  if (!Array.isArray(data.hotspotServiceProfiles)) data.hotspotServiceProfiles = [];
  if (!Array.isArray(data.pppoePackages)) data.pppoePackages = [];

  return {
    initialized: APP_DATA_COLLECTIONS.every(collection => collection in data),
    data,
  };
}

export async function saveAppDataDb(data: AppDataSnapshot): Promise<void> {
  const database = await getDb();
  const updatedAt = new Date().toISOString();
  database.run('BEGIN TRANSACTION');
  try {
    for (const collection of APP_DATA_COLLECTIONS) {
      database.run(
        `INSERT OR REPLACE INTO app_data (collection, value, updated_at) VALUES (?, ?, ?)`,
        [collection, JSON.stringify(data[collection]), updatedAt]
      );
    }
    database.run('COMMIT');
  } catch (err) {
    database.run('ROLLBACK');
    throw err;
  }
  saveDbToDisk();
}

// DB Helper Queries
export async function getAppSettingsDb(): Promise<AppSettings> {
  const database = await getDb();
  const res = database.exec(`SELECT value FROM app_settings WHERE key = 'app_config'`);
  if (res.length && res[0].values.length) {
    try {
      const parsed = JSON.parse(res[0].values[0][0] as string);
      const settings = { ...DEFAULT_APP_SETTINGS, ...parsed };
      const previousDefaultVoucherTemplate = [
        'Yth. Bapak/Ibu {{customer_name}},',
        '',
        'Pembayaran Anda telah berhasil diverifikasi. Voucher hotspot sudah aktif.',
        '• Paket: {{package_name}}',
        '• Username: {{voucher_code}}',
        '• Password: {{voucher_password}}',
        '• Masa penggunaan: {{validity}}',
        '',
        'Silakan masuk melalui halaman login hotspot.',
        'Terima kasih,',
        '{{business_name}}',
      ].join('\n');
      if (settings.whatsappTemplates?.voucherDelivery === previousDefaultVoucherTemplate) {
        settings.whatsappTemplates = {
          ...DEFAULT_WHATSAPP_TEMPLATES,
          ...settings.whatsappTemplates,
          voucherDelivery: DEFAULT_WHATSAPP_TEMPLATES.voucherDelivery,
        };
      }
      return settings;
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  }
  return DEFAULT_APP_SETTINGS;
}

export async function getPaymentPublicUrlsDb(): Promise<{ appUrl: string; webhookUrl: string }> {
  const database = await getDb();
  const result = database.exec('SELECT value FROM app_settings WHERE key = ?', ['payment_public_urls']);
  const value = result[0]?.values[0]?.[0];
  if (typeof value !== 'string') return { appUrl: '', webhookUrl: '' };
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Stored payment public URLs are invalid');
  }
  const urls = parsed as Record<string, unknown>;
  return {
    appUrl: typeof urls.appUrl === 'string' ? urls.appUrl : '',
    webhookUrl: typeof urls.webhookUrl === 'string' ? urls.webhookUrl : '',
  };
}

export async function savePaymentPublicUrlsDb(urls: { appUrl: string; webhookUrl: string }): Promise<void> {
  const database = await getDb();
  database.run(
    'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
    ['payment_public_urls', JSON.stringify(urls), new Date().toISOString()]
  );
  saveDbToDisk();
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

export interface PppoeUsageRecord {
  billingCycle: string;
  totalBytes: number;
  lastSessionBytes: number;
  sampledAt: string;
}

export async function getPppoeUsageDb(): Promise<Record<string, PppoeUsageRecord>> {
  const database = await getDb();
  const result = database.exec('SELECT value FROM app_settings WHERE key = ?', ['pppoe_usage']);
  const serialized = result[0]?.values[0]?.[0];
  if (typeof serialized !== 'string') return {};
  const parsed: unknown = JSON.parse(serialized);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Stored PPPoE usage data is invalid');
  }
  return parsed as Record<string, PppoeUsageRecord>;
}

export async function savePppoeUsageDb(usage: Record<string, PppoeUsageRecord>): Promise<void> {
  const database = await getDb();
  database.run(
    'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
    ['pppoe_usage', JSON.stringify(usage), new Date().toISOString()]
  );
  saveDbToDisk();
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

  const appData = await getAppDataDb();
  const dataCounts = {
    customers: appData.data.customers?.length ?? 0,
    invoices: appData.data.invoices?.length ?? 0,
    pppoe_packages: appData.data.pppoePackages?.length ?? 0,
    hotspot_profiles: appData.data.hotspotProfiles?.length ?? 0,
    hotspot_service_profiles: appData.data.hotspotServiceProfiles?.length ?? 0,
    vouchers: appData.data.vouchers?.length ?? 0,
    routers: appData.data.routers?.length ?? 0,
    whatsapp_logs: appData.data.whatsappLogs?.length ?? 0,
    payment_transactions: appData.data.transactions?.length ?? 0,
  };

  return {
    engine: 'SQLite 3 (WASM)',
    dbPath: DB_FILE,
    fileSizeBytes: fileSize,
    fileSizeKb: (fileSize / 1024).toFixed(2),
    tables: [
      { name: 'app_settings', count: countQuery('app_settings') },
      { name: 'customers', count: dataCounts.customers },
      { name: 'invoices', count: dataCounts.invoices },
      { name: 'hotspot_profiles', count: dataCounts.hotspot_profiles },
      { name: 'hotspot_service_profiles', count: dataCounts.hotspot_service_profiles },
      { name: 'vouchers', count: dataCounts.vouchers },
      { name: 'routers', count: dataCounts.routers },
      { name: 'whatsapp_logs', count: dataCounts.whatsapp_logs },
      { name: 'payment_transactions', count: dataCounts.payment_transactions },
    ],
    updatedAt: new Date().toISOString(),
  };
}
