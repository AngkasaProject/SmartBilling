import express from 'express';
import path from 'path';
import fs from 'fs';
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { AppDataSnapshot, Customer, HotspotProfile, HotspotServiceProfile, HotspotValidityPreset, ManualPaymentMethod, PaymentTransaction, RouterConfig, Voucher } from './src/types/index.js';
import {
  getRouterCredentialDb,
  countAdminUsersDb,
  createInitialAdminUserDb,
  createAdminSessionDb,
  createAdminUserDb,
  deleteAdminSessionDb,
  deleteAdminUserDb,
  getAppDataDb,
  getAdminSessionDb,
  getAdminUserDb,
  getAdminUsersDb,
  getAppSettingsDb,
  saveRouterCredentialDb,
  saveAppDataCollectionDb,
  saveAppDataDb,
  savePublicPaymentUpdateDb,
  saveVoucherOrderDb,
  saveAppSettingsDb,
  getDbStats,
  getDb,
  saveDbToDisk,
  getEncryptionKeyInfo,
  rotateEncryptionKeyDb,
  getOrCreatePortalLinkSecretDb,
} from './server/db.js';
import {
  addPppoeSecret,
  configurePppoeServer,
  deletePppoeSecret,
  getRouterInterfaces,
  getRouterPools,
  getPppProfiles,
  getHotspotUserProfiles,
  getHotspotServerProfiles,
  addPppProfile,
  addHotspotUserProfile,
  addHotspotServerProfile,
  addHotspotServer,
  getRouterServiceRecords,
  updateRouterServiceRecord,
  deleteRouterServiceRecord,
  ensureHotspotUserProfile,
  addHotspotUser,
  PppoeSetup,
  RouterConnection,
  testRouterConnection,
  updatePppoeSecret,
  getPppoeSecrets,
} from './server/mikrotik.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAppDataSnapshot(value: unknown): value is AppDataSnapshot {
  if (!isRecord(value)) return false;
  const arrayCollections = [
    'customers',
    'invoices',
    'hotspotProfiles',
    'hotspotServiceProfiles',
    'vouchers',
    'routers',
    'whatsappLogs',
    'transactions',
  ];
  return (
    arrayCollections.every(key => Array.isArray(value[key])) &&
    isRecord(value.paymentConfig) &&
    isRecord(value.whatsappConfig)
  );
}

function envRouterConnection(): RouterConnection | null {
  const { MIKROTIK_HOST, MIKROTIK_USER, MIKROTIK_PASS } = process.env;
  if (!MIKROTIK_HOST || !MIKROTIK_USER || !MIKROTIK_PASS) return null;
  return {
    id: 'env-default',
    name: `MikroTik ${MIKROTIK_HOST}`,
    host: MIKROTIK_HOST,
    port: Number(process.env.MIKROTIK_PORT) || 8728,
    username: MIKROTIK_USER,
    password: MIKROTIK_PASS,
    apiType: process.env.MIKROTIK_API_TYPE === 'api-ssl' || process.env.MIKROTIK_API_TYPE === 'rest'
      ? process.env.MIKROTIK_API_TYPE
      : 'api',
    timeoutSec: Number(process.env.MIKROTIK_TIMEOUT_SEC) || 10,
  };
}

function validRouterInput(value: unknown): value is Omit<RouterConnection, 'password' | 'timeoutSec'> & { password?: string } {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    typeof value.host === 'string' &&
    Number.isInteger(value.port) &&
    typeof value.username === 'string' &&
    (value.apiType === 'api' || value.apiType === 'api-ssl' || value.apiType === 'rest') &&
    (value.password === undefined || typeof value.password === 'string')
  );
}

function validPppoeSetup(value: unknown): value is PppoeSetup {
  if (!isRecord(value)) return false;
  return ['interface', 'serviceName', 'poolName', 'poolRange', 'localAddress', 'profileName', 'rateLimit', 'dnsServers']
    .every(key => typeof value[key] === 'string' && value[key].trim().length > 0);
}

function isValidPppoeSetup(value: PppoeSetup): boolean {
  const namePattern = /^[A-Za-z0-9_. -]{1,64}$/;
  const addressPattern = /^(?:\d{1,3}\.){3}\d{1,3}(?:-(?:\d{1,3}\.){3}\d{1,3})?$/;
  const speedPattern = /^\d+[KMG]\/\d+[KMG](?: \d+[KMG]\/\d+[KMG])?$/i;
  const ipv4 = (address: string) => address.split('.').length === 4 && address.split('.').every(part => Number(part) <= 255);
  return (
    namePattern.test(value.interface) &&
    namePattern.test(value.serviceName) &&
    namePattern.test(value.poolName) &&
    namePattern.test(value.profileName) &&
    addressPattern.test(value.poolRange) &&
    value.poolRange.split('-').every(ipv4) &&
    ipv4(value.localAddress) &&
    value.dnsServers.split(',').every(address => ipv4(address.trim())) &&
    speedPattern.test(value.rateLimit)
  );
}

function createInvoicePortalToken(invoiceId: string, expiresAt: number, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ invoiceId, expiresAt })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyInvoicePortalToken(token: unknown, secret: string): { invoiceId: string; expiresAt: number } | null {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { invoiceId?: unknown; expiresAt?: unknown };
    if (
      typeof value.invoiceId !== 'string' ||
      !Number.isSafeInteger(value.expiresAt) ||
      Number(value.expiresAt) <= Date.now()
    ) return null;
    return { invoiceId: value.invoiceId, expiresAt: Number(value.expiresAt) };
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Initialize SQLite database
  await getDb();

  const OPENWA_BASE_URL = process.env.OPENWA_BASE_URL || '';
  const OPENWA_API_KEY = process.env.OPENWA_API_KEY || '';
  const OPENWA_SESSION_ID = process.env.OPENWA_SESSION_ID || 'billing-isp';
  const FONNTE_API_URL = process.env.FONNTE_API_URL || 'https://api.fonnte.com/send';
  const FONNTE_TOKEN = process.env.FONNTE_TOKEN || '';

  async function getWhatsAppConfig() {
    const settings = await getAppSettingsDb();
    const environmentProvider = process.env.WA_PROVIDER?.trim().toLowerCase();
    const provider = environmentProvider || settings.waProvider || 'openwa';
    if (provider !== 'openwa' && provider !== 'fonnte') {
      throw new Error('WA_PROVIDER must be either "openwa" or "fonnte"');
    }
    return {
      provider,
      managedByEnvironment: Boolean(environmentProvider),
      baseUrl: OPENWA_BASE_URL,
      sessionId: OPENWA_SESSION_ID,
      apiKeyConfigured: Boolean(OPENWA_API_KEY),
      fonnteApiUrl: FONNTE_API_URL,
      tokenConfigured: provider === 'openwa' ? Boolean(OPENWA_API_KEY && OPENWA_BASE_URL) : Boolean(FONNTE_TOKEN),
    };
  }

  async function sendWhatsAppMessage(phone: string, message: string): Promise<{ provider: string; data: unknown }> {
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.length < 8 || clean.length > 15) throw new Error('Nomor WhatsApp tidak valid');
    if (clean.startsWith('0')) clean = `62${clean.substring(1)}`;
    else if (!clean.startsWith('62')) clean = `62${clean}`;
    const config = await getWhatsAppConfig();
    if (!config.tokenConfigured) {
      throw new Error(config.provider === 'fonnte'
        ? 'FONNTE_TOKEN belum dikonfigurasi di environment server'
        : 'OPENWA_BASE_URL dan OPENWA_API_KEY belum dikonfigurasi di environment server');
    }
    const response = config.provider === 'fonnte'
      ? await fetch(FONNTE_API_URL, {
        method: 'POST',
        headers: {
          Authorization: FONNTE_TOKEN,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ target: clean, message }),
        signal: AbortSignal.timeout(15000),
      })
      : await fetch(`${OPENWA_BASE_URL.replace(/\/+$/, '')}/api/sessions/${encodeURIComponent(OPENWA_SESSION_ID)}/messages/send-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': OPENWA_API_KEY,
        },
        body: JSON.stringify({ chatId: `${clean}@c.us`, text: message }),
        signal: AbortSignal.timeout(15000),
      });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`${config.provider} returned ${response.status}: ${responseText.slice(0, 300)}`);
    let data: unknown = {};
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`${config.provider} returned a non-JSON response`);
      }
    }
    if (config.provider === 'fonnte' && isRecord(data) && data.status === false) {
      throw new Error('Fonnte did not accept the message');
    }
    return { provider: config.provider, data };
  }

  async function recordWhatsAppLog(
    phone: string,
    name: string,
    type: AppDataSnapshot['whatsappLogs'][number]['type'],
    message: string,
    status: 'sent' | 'failed',
    responseInfo: string
  ): Promise<void> {
    const stored = await getAppDataDb();
    const log = {
      id: randomUUID(),
      recipientPhone: phone,
      recipientName: name,
      type,
      message,
      status,
      timestamp: new Date().toISOString(),
      responseInfo,
    };
    await saveAppDataCollectionDb('whatsappLogs', [log, ...(stored.data.whatsappLogs || [])].slice(0, 2000));
  }

  function configuredPaymentAppUrl(): URL | null {
    try {
      const configuredUrl = new URL(process.env.APP_URL || '');
      const localDevelopmentHost = ['localhost', '127.0.0.1', '::1'].includes(configuredUrl.hostname);
      if (
        configuredUrl.username ||
        configuredUrl.password ||
        !['http:', 'https:'].includes(configuredUrl.protocol) ||
        (isProd && configuredUrl.protocol !== 'https:') ||
        (configuredUrl.protocol === 'http:' && !localDevelopmentHost)
      ) {
        return null;
      }
      return configuredUrl;
    } catch {
      return null;
    }
  }

  app.use(express.json({ limit: '5mb' }));

  const SESSION_COOKIE = 'smartbilling_session';
  const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
  const envAdminUsername = process.env.ADMIN_USERNAME?.trim() || '';
  const envAdminPassword = process.env.ADMIN_PASSWORD || '';
  const envAdminConfigured = Boolean(envAdminUsername && envAdminPassword);
  const authAttempts = new Map<string, { count: number; resetAt: number }>();

  function sessionToken(req: express.Request): string {
    const cookieHeader = req.header('Cookie') || '';
    const cookie = cookieHeader.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
    return cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : '';
  }

  function setSessionCookie(req: express.Request, res: express.Response, token: string, maxAge: number): void {
    const secure = req.secure || req.header('x-forwarded-proto')?.split(',')[0].trim() === 'https';
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
  }

  function safeEqual(left: string, right: string): boolean {
    const leftHash = createHash('sha256').update(left).digest();
    const rightHash = createHash('sha256').update(right).digest();
    return timingSafeEqual(leftHash, rightHash) && left === right;
  }

  function passwordHash(password: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    return `${salt.toString('base64')}:${hash.toString('base64')}`;
  }

  function passwordMatches(password: string, stored: string): boolean {
    const [saltText, hashText] = stored.split(':');
    if (!saltText || !hashText) return false;
    const expected = Buffer.from(hashText, 'base64');
    const actual = scryptSync(password, Buffer.from(saltText, 'base64'), expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  function validCredentials(username: unknown, password: unknown): username is string {
    return typeof username === 'string' &&
      /^[A-Za-z0-9_.@-]{3,64}$/.test(username.trim()) &&
      typeof password === 'string' &&
      password.length >= 12 &&
      password.length <= 256;
  }

  async function issueSession(req: express.Request, res: express.Response, userId: string, username: string): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    await createAdminSessionDb(createHash('sha256').update(token).digest('hex'), userId, username, expiresAt);
    setSessionCookie(req, res, token, Math.floor(SESSION_DURATION_MS / 1000));
  }

  async function currentAdmin(req: express.Request): Promise<{ userId: string; username: string } | null> {
    const token = sessionToken(req);
    return token ? getAdminSessionDb(createHash('sha256').update(token).digest('hex')) : null;
  }

  const requireAdminSession: express.RequestHandler = (req, res, next) => {
    void currentAdmin(req).then(admin => {
      if (!admin) {
        res.status(401).json({ error: 'Admin login required' });
        return;
      }
      res.locals.admin = admin;
      next();
    }).catch(next);
  };

  app.get('/api/auth/status', async (req, res) => {
    const admin = await currentAdmin(req);
    const adminCount = await countAdminUsersDb();
    res.json({
      authenticated: Boolean(admin),
      username: admin?.username || '',
      envLoginConfigured: envAdminConfigured,
      envLoginIncomplete: Boolean(envAdminUsername) !== Boolean(envAdminPassword),
      registrationRequired: !envAdminConfigured && adminCount === 0,
    });
  });

  app.post('/api/auth/register', async (req, res) => {
    if (envAdminConfigured) return res.status(403).json({ error: 'Admin login is managed by ADMIN_USERNAME and ADMIN_PASSWORD in .env' });
    const { username, password } = req.body || {};
    if (!validCredentials(username, password) || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username must be 3-64 characters; password must be 12-256 characters' });
    }
    const userId = randomUUID();
    try {
      await createInitialAdminUserDb(userId, username.trim(), passwordHash(password));
      await issueSession(req, res, userId, username.trim());
      res.status(201).json({ authenticated: true, username: username.trim() });
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const attempt = authAttempts.get(ip);
    if (attempt && attempt.resetAt > Date.now() && attempt.count >= 10) {
      return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
    }
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    let userId = '';
    let storedUsername = username.trim();
    let valid = false;
    if (envAdminConfigured && safeEqual(storedUsername, envAdminUsername) && safeEqual(password, envAdminPassword)) {
      userId = `env:${envAdminUsername}`;
      storedUsername = envAdminUsername;
      valid = true;
    } else {
      const user = await getAdminUserDb(storedUsername);
      if (user && passwordMatches(password, user.passwordHash)) {
        userId = user.id;
        storedUsername = user.username;
        valid = true;
      }
    }
    if (!valid) {
      const current = authAttempts.get(ip);
      authAttempts.set(ip, {
        count: current && current.resetAt > Date.now() ? current.count + 1 : 1,
        resetAt: current && current.resetAt > Date.now() ? current.resetAt : Date.now() + 15 * 60 * 1000,
      });
      return res.status(401).json({ error: 'Username atau password salah' });
    }
    authAttempts.delete(ip);
    await issueSession(req, res, userId, storedUsername);
    res.json({ authenticated: true, username: storedUsername });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const token = sessionToken(req);
    if (token) await deleteAdminSessionDb(createHash('sha256').update(token).digest('hex'));
    setSessionCookie(req, res, '', 0);
    res.json({ status: 'success' });
  });

  app.get('/api/admin/users', requireAdminSession, async (_req, res) => {
    res.json({ users: await getAdminUsersDb() });
  });

  app.post('/api/admin/users', requireAdminSession, async (req, res) => {
    const { username, password } = req.body || {};
    if (!validCredentials(username, password) || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username must be 3-64 characters; password must be 12-256 characters' });
    }
    try {
      await createAdminUserDb(randomUUID(), username.trim(), passwordHash(password));
      res.status(201).json({ status: 'success' });
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/admin/users/:id', requireAdminSession, async (req, res) => {
    const admin = res.locals.admin as { userId: string; username: string };
    if (req.params.id === admin.userId) return res.status(400).json({ error: 'You cannot delete your own account' });
    if (!envAdminConfigured && await countAdminUsersDb() <= 1) {
      return res.status(400).json({ error: 'At least one admin account must remain' });
    }
    await deleteAdminUserDb(req.params.id);
    res.json({ status: 'success' });
  });

  async function resolveRouterConnection(routerId: string): Promise<RouterConnection | null> {
    const envRouter = envRouterConnection();
    if (routerId === 'env-default') return envRouter;

    const appData = await getAppDataDb();
    const router = appData.data.routers?.find(item => item.id === routerId);
    if (!router) return null;
    const password = await getRouterCredentialDb(routerId);
    if (!password && envRouter?.host === router.host && envRouter.port === router.port) {
      return { ...router, password: envRouter.password, timeoutSec: 10 };
    }
    if (!password) return null;
    return { ...router, password, timeoutSec: 10 };
  }

  app.post('/api/admin/customers/sync-mikrotik', requireAdminSession, async (_req, res) => {
    try {
      const stored = await getAppDataDb();
      const customers = stored.data.customers || [];
      const customersByRouter = new Map<string, Customer[]>();
      for (const customer of customers) {
        const grouped = customersByRouter.get(customer.routerId) || [];
        grouped.push(customer);
        customersByRouter.set(customer.routerId, grouped);
      }

      const liveDataByRouter = new Map<string, {
        secrets: Awaited<ReturnType<typeof getPppoeSecrets>>;
        profiles: Awaited<ReturnType<typeof getPppProfiles>>;
      }>();
      for (const routerId of customersByRouter.keys()) {
        const router = await resolveRouterConnection(routerId);
        if (!router) {
          throw new Error(`Router "${routerId}" tidak memiliki kredensial. Sinkronisasi dibatalkan tanpa mengubah data.`);
        }
        const [secrets, profiles] = await Promise.all([getPppoeSecrets(router), getPppProfiles(router)]);
        liveDataByRouter.set(routerId, { secrets, profiles });
      }

      let removed = 0;
      let updated = 0;
      const syncedCustomers = customers.flatMap(customer => {
        const routerData = liveDataByRouter.get(customer.routerId);
        if (!routerData) return [customer];
        const secret = routerData.secrets.find(item => item.name === customer.pppoeUsername);
        if (!secret) {
          removed += 1;
          return [];
        }
        const profile = routerData.profiles.find(item => item.name === secret.profile);
        const nextCustomer: Customer = {
          ...customer,
          profileName: secret.profile || customer.profileName,
          bandwidthLimit: profile?.rateLimit || customer.bandwidthLimit,
          status: secret.disabled ? 'isolated' : customer.status === 'isolated' ? 'active' : customer.status,
          ...(secret.remoteAddress ? { ipAddress: secret.remoteAddress } : {}),
        };
        if (
          nextCustomer.profileName !== customer.profileName ||
          nextCustomer.bandwidthLimit !== customer.bandwidthLimit ||
          nextCustomer.status !== customer.status ||
          nextCustomer.ipAddress !== customer.ipAddress
        ) updated += 1;
        return [nextCustomer];
      });

      if (removed || updated) await saveAppDataCollectionDb('customers', syncedCustomers);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ removed, updated, total: syncedCustomers.length });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  const voucherApprovalsInProgress = new Set<string>();
  async function activateAndSettleVoucher(orderId: string, paymentChannel: string): Promise<void> {
    const stored = await getAppDataDb();
    const transactions = stored.data.transactions || [];
    const transaction = transactions.find(item => item.orderId === orderId && item.orderType === 'voucher');
    if (!transaction || !transaction.voucherCode) throw new Error('Pesanan voucher tidak ditemukan');
    if (transaction.status === 'settlement') return;
    if (transaction.status !== 'pending') throw new Error('Pesanan voucher tidak lagi menunggu pembayaran');
    if (transaction.expiresAt && new Date(transaction.expiresAt).getTime() <= Date.now()) {
      throw new Error('Batas waktu pembayaran pesanan sudah berakhir');
    }
    const vouchers = stored.data.vouchers || [];
    const voucher = vouchers.find(item => item.orderId === orderId && item.code === transaction.voucherCode);
    if (!voucher) throw new Error('Data voucher pesanan tidak ditemukan');
    const profile = (stored.data.hotspotProfiles || []).find(item => item.id === voucher.profileId);
    if (!profile?.routerId || !profile.routerProfileName) throw new Error('Konfigurasi router atau profil hotspot paket tidak tersedia');
    const router = await resolveRouterConnection(profile.routerId);
    if (!router) throw new Error('Kredensial router hotspot tidak tersedia');
    await ensureHotspotUserProfile(router, {
      name: profile.routerProfileName,
      rateLimit: profile.speedLimit,
      sharedUsers: profile.sharedUsers,
    });
    await addHotspotUser(router, {
      name: voucher.code,
      password: voucher.password || voucher.code,
      profile: profile.routerProfileName,
      limitUptime: `${profile.validityHours}h`,
      limitBytesTotal: profile.dataLimitMb ? profile.dataLimitMb * 1024 * 1024 : undefined,
      comment: `SmartBilling ${orderId}`.slice(0, 100),
    });

    const paidAt = new Date().toISOString();
    const updatedTransactions = transactions.map(item => item.orderId === orderId
      ? { ...item, status: 'settlement' as const, paymentChannel, paidAt }
      : item);
    const updatedVouchers = vouchers.map(item => item.orderId === orderId
      ? { ...item, status: 'unused' as const, paymentMethod: transaction.paymentMethod, paymentRef: orderId }
      : item);
    await savePublicPaymentUpdateDb(
      stored.data.customers || [],
      stored.data.invoices || [],
      updatedTransactions,
      updatedVouchers
    );

    const deliveryMessage =
      `Pembayaran berhasil. Voucher hotspot ${voucher.profileName}:\n` +
      `Username: ${voucher.code}\nPassword: ${voucher.password || voucher.code}\n` +
      `Masa penggunaan: ${voucher.validityDuration}\n` +
      `Kode sudah aktif di router. Gunakan pada halaman login hotspot.`;
    try {
      const sent = await sendWhatsAppMessage(transaction.customerPhone, deliveryMessage);
      await recordWhatsAppLog(transaction.customerPhone, transaction.customerName, 'voucher_delivery', deliveryMessage, 'sent', JSON.stringify(sent.data));
    } catch (error) {
      const failure = error instanceof Error ? error.message : String(error);
      console.error(`[Voucher] Voucher ${voucher.code} is active, but WhatsApp delivery failed: ${failure}`);
      await recordWhatsAppLog(transaction.customerPhone, transaction.customerName, 'voucher_delivery', deliveryMessage, 'failed', failure);
    }
  }

  async function approveInvoicePayment(orderId: string, paymentChannel: string): Promise<void> {
    const stored = await getAppDataDb();
    const transactions = stored.data.transactions || [];
    const transaction = transactions.find(item =>
      item.orderId === orderId && item.orderType === 'invoice' && item.paymentMethod === 'manual'
    );
    if (!transaction?.invoiceId) throw new Error('Permintaan pembayaran invoice tidak ditemukan');
    if (transaction.status === 'settlement') return;
    if (transaction.status !== 'pending') throw new Error('Permintaan pembayaran tidak lagi menunggu persetujuan');
    if (transaction.expiresAt && new Date(transaction.expiresAt).getTime() <= Date.now()) {
      throw new Error('Batas waktu pembayaran invoice sudah berakhir');
    }

    const invoices = stored.data.invoices || [];
    const invoice = invoices.find(item => item.id === transaction.invoiceId);
    if (!invoice) throw new Error('Invoice tidak ditemukan');
    if (invoice.status !== 'unpaid' && invoice.status !== 'paid') throw new Error('Invoice tidak dapat diselesaikan');
    let updatedCustomers = stored.data.customers || [];
    let updatedInvoices = invoices;
    if (invoice.status !== 'paid') {
      const now = new Date();
      const paidAt = now.toISOString();
      updatedInvoices = invoices.map(item => item.id === invoice.id
        ? { ...item, status: 'paid' as const, paidAt, paymentMethod: 'manual', paymentChannel, paymentRef: orderId }
        : item);
      const customer = updatedCustomers.find(item => item.id === invoice.customerId);
      if (customer) {
        const currentExpiry = new Date(`${customer.expiredDate}T00:00:00`);
        const newExpiry = new Date(currentExpiry > now ? currentExpiry : now);
        newExpiry.setDate(newExpiry.getDate() + 30);
        let routerActivated = false;
        let activationNote = 'Akses router belum diaktifkan.';
        try {
          const router = await resolveRouterConnection(customer.routerId);
          if (!router) throw new Error('Kredensial router tidak tersedia');
          await updatePppoeSecret(router, customer.pppoeUsername, { disabled: false });
          routerActivated = true;
          activationNote = 'Akses PPPoE diaktifkan di RouterOS.';
        } catch (activationError) {
          activationNote = `Akses router belum aktif: ${activationError instanceof Error ? activationError.message : String(activationError)}`;
          console.error(`[Payment] Manual invoice ${invoice.invoiceNumber} approved; RouterOS activation failed: ${activationNote}`);
        }
        updatedCustomers = updatedCustomers.map(item => item.id === customer.id
          ? {
            ...item,
            expiredDate: newExpiry.toISOString().slice(0, 10),
            status: routerActivated ? 'active' as const : item.status,
            notes: `Pembayaran manual diverifikasi pada ${paidAt}. ${activationNote}`,
          }
          : item);
      }
    }
    const paidAt = new Date().toISOString();
    const updatedTransactions = transactions.map(item => item.orderId === orderId
      ? { ...item, status: 'settlement' as const, paymentChannel, paidAt }
      : item);
    await savePublicPaymentUpdateDb(updatedCustomers, updatedInvoices, updatedTransactions);

    const customer = updatedCustomers.find(item => item.id === invoice.customerId);
    if (customer) {
      const token = createInvoicePortalToken(invoice.id, Date.now() + 30 * 24 * 60 * 60 * 1000, await getOrCreatePortalLinkSecretDb());
      const appUrl = configuredPaymentAppUrl();
      const billingUrl = appUrl ? `${appUrl.origin}/portal/billing?token=${encodeURIComponent(token)}` : '';
      const message = `Pembayaran invoice ${invoice.invoiceNumber} telah disetujui. Masa aktif layanan hingga ${customer.expiredDate}.${billingUrl ? ` Cek detail atau bayar tagihan berikutnya: ${billingUrl}` : ''}`;
      try {
        const sent = await sendWhatsAppMessage(customer.phone, message);
        await recordWhatsAppLog(customer.phone, customer.name, 'payment_success', message, 'sent', JSON.stringify(sent.data));
      } catch (error) {
        const failure = error instanceof Error ? error.message : String(error);
        console.error(`[WhatsApp] Invoice ${invoice.invoiceNumber} paid, but receipt delivery failed: ${failure}`);
        await recordWhatsAppLog(customer.phone, customer.name, 'payment_success', message, 'failed', failure);
      }
    }
  }

  // Health check endpoint (for Docker healthcheck)
  app.get('/api/health', async (_req, res) => {
    const stats = await getDbStats();
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'MikroTik ISP Billing & Hotspot Platform',
      database: {
        engine: 'SQLite 3 (Persistent)',
        path: stats.dbPath,
        sizeKb: stats.fileSizeKb,
      },
    });
  });

  const publicLookupAttempts = new Map<string, { count: number; resetAt: number }>();
  app.get('/api/portal/vouchers', async (_req, res) => {
    try {
      const stored = await getAppDataDb();
      const profiles = (stored.data.hotspotProfiles || [])
        .filter(profile => profile.enabled !== false && Boolean(profile.routerId && profile.routerProfileName))
        .map(({ id, name, speedLimit, validityDuration, validityHours, price, sharedUsers, dataLimitMb }) => ({
        id, name, speedLimit, validityDuration, validityHours, price, sharedUsers, dataLimitMb,
      }));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ profiles });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/portal/payment-options', async (_req, res) => {
    try {
      const stored = await getAppDataDb();
      const config = stored.data.paymentConfig;
      const settings = await getAppSettingsDb();
      const operatorPhone = settings.phoneContact.replace(/[^0-9]/g, '');
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        automaticAvailable: Boolean(
          (!process.env.PAYMENT_GATEWAY || process.env.PAYMENT_GATEWAY === 'midtrans') &&
          process.env.MIDTRANS_SERVER_KEY &&
          configuredPaymentAppUrl()
        ),
        manualMethods: (config?.manualPaymentMethods || []).filter(method => method.enabled),
        timeoutMinutes: config?.manualTimeoutMinutes ?? 60,
        operatorWhatsapp: operatorPhone
          ? (operatorPhone.startsWith('0') ? `62${operatorPhone.slice(1)}` : operatorPhone)
          : '',
        proofRequired: false,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/portal/voucher-orders', async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const current = publicLookupAttempts.get(ip);
    if (current && current.resetAt > Date.now() && current.count >= 30) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi dalam satu menit.' });
    }
    publicLookupAttempts.set(ip, {
      count: current && current.resetAt > Date.now() ? current.count + 1 : 1,
      resetAt: current && current.resetAt > Date.now() ? current.resetAt : Date.now() + 60_000,
    });

    const { profileId, customerName, phone, email, paymentMode, methodId } = req.body || {};
    if (
      typeof profileId !== 'string' || !profileId ||
      typeof customerName !== 'string' || !customerName.trim() || customerName.length > 100 ||
      typeof phone !== 'string' || phone.length > 32 ||
      (email !== undefined && (typeof email !== 'string' || email.length > 254)) ||
      (paymentMode !== 'automatic' && paymentMode !== 'manual')
    ) {
      return res.status(400).json({ error: 'Nama, nomor WhatsApp, paket, dan metode pembayaran wajib valid' });
    }
    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    if (normalizedPhone.length < 8 || normalizedPhone.length > 15) {
      return res.status(400).json({ error: 'Nomor WhatsApp tidak valid' });
    }
    try {
      const stored = await getAppDataDb();
      const profile = (stored.data.hotspotProfiles || []).find(item =>
        item.id === profileId && item.enabled !== false
      );
      if (!profile) return res.status(404).json({ error: 'Paket hotspot tidak tersedia' });
      if (!profile.routerId || !profile.routerProfileName) {
        return res.status(409).json({ error: 'Paket belum terhubung ke profil MikroTik. Hubungi operator.' });
      }
      const paymentConfig = stored.data.paymentConfig;
      let manualMethod: ManualPaymentMethod | undefined;
      if (paymentMode === 'manual') {
        manualMethod = paymentConfig?.manualPaymentMethods?.find(method => method.id === methodId && method.enabled);
        if (!manualMethod) return res.status(400).json({ error: 'Pilih metode pembayaran manual yang tersedia' });
      } else if (
        !process.env.MIDTRANS_SERVER_KEY ||
        !configuredPaymentAppUrl() ||
        (process.env.PAYMENT_GATEWAY && process.env.PAYMENT_GATEWAY !== 'midtrans')
      ) {
        return res.status(503).json({ error: 'Pembayaran otomatis belum tersedia. Pilih metode manual atau hubungi operator.' });
      }
      if (!Number.isSafeInteger(profile.price) || profile.price <= 0) {
        return res.status(400).json({ error: 'Harga paket tidak valid untuk checkout' });
      }

      const now = new Date();
      const createdAt = now.toISOString();
      const orderId = `SBV-${randomUUID()}`;
      const expiresMinutes = Math.max(1, Math.min(1440, Number(paymentConfig?.manualTimeoutMinutes) || 60));
      const expiresAt = new Date(now.getTime() + (paymentMode === 'manual' ? expiresMinutes : 1440) * 60_000).toISOString();
      const vouchers = stored.data.vouchers || [];
      let code: string;
      do {
        code = `SB-${randomBytes(4).toString('hex').toUpperCase()}`;
      } while (vouchers.some(item => item.code === code));
      const voucher: Voucher = {
        id: randomUUID(),
        code,
        password: code,
        profileId: profile.id,
        profileName: profile.name,
        price: profile.price,
        validityHours: profile.validityHours,
        validityDuration: profile.validityDuration,
        speedLimit: profile.speedLimit,
        status: 'pending',
        batchCode: orderId,
        createdAt,
        customerPhone: phone.trim(),
        paymentMethod: paymentMode === 'manual' ? manualMethod!.name : 'midtrans',
        routerId: profile.routerId,
        orderId,
      };
      const transactions = stored.data.transactions || [];
      const transaction: PaymentTransaction = {
        id: randomUUID(),
        orderId,
        orderType: 'voucher',
        amount: profile.price,
        customerName: customerName.trim(),
        customerPhone: phone.trim(),
        customerEmail: typeof email === 'string' && email.trim() ? email.trim() : undefined,
        paymentMethod: paymentMode === 'manual' ? 'manual' : 'midtrans',
        paymentChannel: paymentMode === 'manual' ? manualMethod!.id : 'snap',
        status: 'pending',
        expiryMinutes: paymentMode === 'manual' ? expiresMinutes : 1440,
        createdAt,
        expiresAt,
        voucherCode: code,
      };

      if (paymentMode === 'manual') {
        await saveVoucherOrderDb([voucher, ...vouchers], [transaction, ...transactions]);
        const settings = await getAppSettingsDb();
        const operatorPhone = settings.phoneContact.replace(/[^0-9]/g, '');
        const operatorWhatsapp = operatorPhone
          ? (operatorPhone.startsWith('0') ? `62${operatorPhone.slice(1)}` : operatorPhone)
          : '';
        const contactMessage =
          `Halo operator, saya ingin konfirmasi pembayaran voucher.\n` +
          `Kode bayar: ${orderId}\nPaket: ${profile.name}\nNominal: Rp ${profile.price.toLocaleString('id-ID')}\n` +
          `Metode: ${manualMethod!.name}\nNama: ${customerName.trim()}\nNomor: ${phone.trim()}`;
        const operatorUrl = operatorWhatsapp
          ? `https://wa.me/${operatorWhatsapp}?text=${encodeURIComponent(contactMessage)}`
          : '';
        try {
          await sendWhatsAppMessage(
            phone,
            `Pesanan voucher ${profile.name} (${orderId}) dibuat. Kode bayar: ${orderId}. ` +
            `Nominal Rp ${profile.price.toLocaleString('id-ID')} melalui ${manualMethod!.name}. ` +
            `${manualMethod!.instructions} Selesaikan pembayaran lalu konfirmasi ke operator melalui ${operatorUrl || 'nomor WhatsApp operator yang tersedia'}. ` +
            `Batas waktu: ${expiresAt}. Voucher aktif setelah pembayaran diverifikasi.`
          );
        } catch (error) {
          console.error(`[WhatsApp] Could not send manual voucher payment instructions for ${orderId}:`, error);
        }
        return res.status(201).json({
          orderId,
          status: 'pending',
          method: manualMethod,
          amount: profile.price,
          expiresAt,
          operatorUrl,
          message: 'Pesanan dibuat. Gunakan kode bayar dan hubungi operator melalui WhatsApp untuk konfirmasi pembayaran.',
        });
      }

      const appUrl = configuredPaymentAppUrl()!;
      const response = await fetch(
        process.env.MIDTRANS_IS_PRODUCTION === 'true'
          ? 'https://app.midtrans.com/snap/v1/transactions'
          : 'https://app.sandbox.midtrans.com/snap/v1/transactions',
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${process.env.MIDTRANS_SERVER_KEY}:`).toString('base64')}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            transaction_details: { order_id: orderId, gross_amount: profile.price },
            item_details: [{ id: profile.id.slice(0, 50), price: profile.price, quantity: 1, name: `Voucher ${profile.name}`.slice(0, 50) }],
            customer_details: {
              first_name: customerName.trim().slice(0, 50),
              email: typeof email === 'string' ? email.trim() || undefined : undefined,
              phone: phone.trim(),
            },
            callbacks: { finish: `${appUrl.origin}/?payment=complete` },
            expiry: { unit: 'minute', duration: 1440 },
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      const payload = await response.json() as { redirect_url?: string; error_messages?: string[] };
      if (!response.ok || typeof payload.redirect_url !== 'string') {
        const providerError = Array.isArray(payload.error_messages) ? payload.error_messages.join('; ') : `HTTP ${response.status}`;
        return res.status(502).json({ error: `Midtrans gagal membuat checkout: ${providerError}` });
      }
      const redirectUrl = new URL(payload.redirect_url);
      if (redirectUrl.protocol !== 'https:' ||
        !['app.midtrans.com', 'app.sandbox.midtrans.com'].includes(redirectUrl.hostname)) {
        return res.status(502).json({ error: 'Midtrans returned an unexpected checkout URL' });
      }
      transaction.paymentUrl = redirectUrl.toString();
      await saveVoucherOrderDb([voucher, ...vouchers], [transaction, ...transactions]);
      res.status(201).json({ orderId, redirectUrl: transaction.paymentUrl, status: 'pending' });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/portal/voucher-orders/status', async (req, res) => {
    const { orderId, phone } = req.body || {};
    if (typeof orderId !== 'string' || typeof phone !== 'string') {
      return res.status(400).json({ error: 'Nomor pesanan dan nomor WhatsApp diperlukan' });
    }
    try {
      const stored = await getAppDataDb();
      const transaction = (stored.data.transactions || []).find(item =>
        item.orderId === orderId &&
        item.orderType === 'voucher' &&
        item.customerPhone.replace(/[^0-9]/g, '') === phone.replace(/[^0-9]/g, '')
      );
      if (!transaction) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
      const voucher = (stored.data.vouchers || []).find(item => item.orderId === orderId);
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        status: transaction.status,
        expiresAt: transaction.expiresAt,
        voucher: transaction.status === 'settlement' && voucher
          ? { code: voucher.code, password: voucher.password, validityDuration: voucher.validityDuration }
          : undefined,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put('/api/payment/manual-options', requireAdminSession, async (req, res) => {
    const { manualPaymentMethods, manualTimeoutMinutes } = req.body || {};
    if (
      !Array.isArray(manualPaymentMethods) ||
      manualPaymentMethods.length > 8 ||
      !Number.isInteger(manualTimeoutMinutes) ||
      manualTimeoutMinutes < 1 || manualTimeoutMinutes > 1440 ||
      manualPaymentMethods.some((method: unknown) =>
        !isRecord(method) ||
        typeof method.id !== 'string' || !/^[a-z0-9-]{1,32}$/.test(method.id) ||
        typeof method.name !== 'string' || !method.name.trim() || method.name.length > 64 ||
        (method.serviceName !== undefined && (typeof method.serviceName !== 'string' || method.serviceName.length > 64)) ||
        (method.accountNumber !== undefined && (typeof method.accountNumber !== 'string' || method.accountNumber.length > 64)) ||
        typeof method.instructions !== 'string' || method.instructions.length > 1000 ||
        (method.enabled && (!method.instructions.trim() || !String(method.serviceName || '').trim() || !String(method.accountNumber || '').trim())) ||
        typeof method.enabled !== 'boolean'
      )
    ) {
      return res.status(400).json({ error: 'Lengkapi nama layanan, nomor rekening/akun, instruksi, dan batas waktu pembayaran manual yang valid' });
    }
    const ids = manualPaymentMethods.map((method: ManualPaymentMethod) => method.id);
    if (new Set(ids).size !== ids.length) return res.status(400).json({ error: 'ID metode pembayaran tidak boleh duplikat' });
    try {
      const stored = await getAppDataDb();
      const paymentConfig = {
        ...stored.data.paymentConfig,
        manualPaymentMethods: manualPaymentMethods.map((method: ManualPaymentMethod) => ({
          ...method,
          name: method.name.trim(),
          serviceName: method.serviceName?.trim() || '',
          accountNumber: method.accountNumber?.trim() || '',
          instructions: method.instructions.trim(),
        })),
        manualTimeoutMinutes,
      };
      await saveAppDataCollectionDb('paymentConfig', paymentConfig as AppDataSnapshot['paymentConfig']);
      res.json({ manualPaymentMethods: paymentConfig.manualPaymentMethods, manualTimeoutMinutes });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  const hotspotValidityHours: Record<HotspotValidityPreset, number> = {
    '1 jam': 1,
    '12 jam': 12,
    '1 hari': 24,
    '1 minggu': 168,
    '2 minggu': 336,
    '1 bulan': 720,
  };
  const isHotspotValidityPreset = (value: unknown): value is HotspotValidityPreset =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(hotspotValidityHours, value);

  app.post('/api/admin/hotspot/service-profiles', requireAdminSession, async (req, res) => {
    const { id, name, routerId, routerProfileName, speedLimit, validityPreset, sharedUsers, dataLimitMb } = req.body || {};
    if (
      (id !== undefined && (typeof id !== 'string' || id.length > 128)) ||
      typeof name !== 'string' || !name.trim() || name.length > 64 ||
      typeof routerId !== 'string' || !routerId ||
      typeof routerProfileName !== 'string' || !/^[A-Za-z0-9_. -]{1,64}$/.test(routerProfileName) ||
      typeof speedLimit !== 'string' || !/^\d+[KMGkmg]\/\d+[KMGkmg]$/.test(speedLimit) ||
      !isHotspotValidityPreset(validityPreset) ||
      !Number.isInteger(sharedUsers) || sharedUsers < 1 || sharedUsers > 100 ||
      (dataLimitMb !== undefined && (!Number.isSafeInteger(dataLimitMb) || dataLimitMb < 0 || dataLimitMb > 1_000_000_000))
    ) {
      return res.status(400).json({ error: 'Data profil layanan hotspot tidak valid' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      await ensureHotspotUserProfile(router, { name: routerProfileName, rateLimit: speedLimit, sharedUsers });
      const stored = await getAppDataDb();
      const serviceProfiles = stored.data.hotspotServiceProfiles || [];
      const profileId = id || randomUUID();
      const profile: HotspotServiceProfile = {
        id: profileId,
        name: name.trim(),
        routerId,
        routerProfileName,
        speedLimit,
        validityPreset,
        validityHours: hotspotValidityHours[validityPreset],
        sharedUsers,
        dataLimitMb: dataLimitMb || undefined,
      };
      await saveAppDataCollectionDb(
        'hotspotServiceProfiles',
        serviceProfiles.some(item => item.id === profileId)
          ? serviceProfiles.map(item => item.id === profileId ? profile : item)
          : [profile, ...serviceProfiles]
      );
      res.json({ profile });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/admin/hotspot/packages', requireAdminSession, async (req, res) => {
    const { id, name, serviceProfileId, price, enabled } = req.body || {};
    if (
      (id !== undefined && (typeof id !== 'string' || id.length > 128)) ||
      typeof name !== 'string' || !name.trim() || name.length > 64 ||
      (serviceProfileId !== undefined && (typeof serviceProfileId !== 'string' || !serviceProfileId)) ||
      !Number.isSafeInteger(price) || price < 1 ||
      typeof enabled !== 'boolean'
    ) {
      return res.status(400).json({ error: 'Nama, profil layanan, harga, dan status paket tidak valid' });
    }
    try {
      const stored = await getAppDataDb();
      const profiles = stored.data.hotspotProfiles || [];
      const packageId = id || randomUUID();
      const existing = profiles.find(item => item.id === packageId);
      const serviceProfile = typeof serviceProfileId === 'string'
        ? (stored.data.hotspotServiceProfiles || []).find(item => item.id === serviceProfileId)
        : undefined;
      if (serviceProfileId && !serviceProfile) return res.status(404).json({ error: 'Profil layanan tidak ditemukan' });
      if (!serviceProfile && !existing) return res.status(400).json({ error: 'Pilih profil layanan untuk paket baru' });
      const profile: HotspotProfile = serviceProfile
        ? {
          id: packageId,
          name: name.trim(),
          serviceProfileId: serviceProfile.id,
          routerId: serviceProfile.routerId,
          routerProfileName: serviceProfile.routerProfileName,
          speedLimit: serviceProfile.speedLimit,
          validityDuration: serviceProfile.validityPreset,
          validityHours: serviceProfile.validityHours,
          price,
          sharedUsers: serviceProfile.sharedUsers,
          dataLimitMb: serviceProfile.dataLimitMb,
          color: 'indigo',
          enabled,
        }
        : { ...existing!, name: name.trim(), price, enabled };
      await saveAppDataCollectionDb(
        'hotspotProfiles',
        profiles.some(item => item.id === packageId)
          ? profiles.map(item => item.id === packageId ? profile : item)
          : [profile, ...profiles]
      );
      res.json({ profile });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/admin/hotspot/vouchers/generate', requireAdminSession, async (req, res) => {
    const { profileId, count, prefix = '' } = req.body || {};
    if (
      typeof profileId !== 'string' || !profileId ||
      !Number.isInteger(count) || count < 1 || count > 100 ||
      typeof prefix !== 'string' || prefix.length > 16 || !/^[A-Za-z0-9_-]*$/.test(prefix)
    ) {
      return res.status(400).json({ error: 'Paket, jumlah (1-100), atau prefix voucher tidak valid' });
    }
    try {
      const stored = await getAppDataDb();
      const profile = (stored.data.hotspotProfiles || []).find(item =>
        item.id === profileId && item.enabled !== false
      );
      if (!profile?.routerId || !profile.routerProfileName) {
        return res.status(404).json({ error: 'Paket aktif dengan profil MikroTik tidak ditemukan' });
      }
      const router = await resolveRouterConnection(profile.routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      await ensureHotspotUserProfile(router, {
        name: profile.routerProfileName,
        rateLimit: profile.speedLimit,
        sharedUsers: profile.sharedUsers,
      });

      const vouchers = [...(stored.data.vouchers || [])];
      const created: Voucher[] = [];
      const batchCode = `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`;
      for (let index = 0; index < count; index++) {
        let code: string;
        do {
          code = `${prefix}${randomBytes(3).toString('hex').toUpperCase()}`;
        } while (vouchers.some(item => item.code === code));
        await addHotspotUser(router, {
          name: code,
          password: code,
          profile: profile.routerProfileName,
          limitUptime: `${profile.validityHours}h`,
          limitBytesTotal: profile.dataLimitMb ? profile.dataLimitMb * 1024 * 1024 : undefined,
          comment: `SmartBilling ${batchCode}`.slice(0, 100),
        });
        const voucher: Voucher = {
          id: randomUUID(),
          code,
          password: code,
          profileId: profile.id,
          profileName: profile.name,
          price: profile.price,
          validityHours: profile.validityHours,
          validityDuration: profile.validityDuration,
          speedLimit: profile.speedLimit,
          status: 'unused',
          batchCode,
          createdAt: new Date().toISOString(),
          routerId: profile.routerId,
        };
        vouchers.unshift(voucher);
        created.push(voucher);
        await saveAppDataCollectionDb('vouchers', vouchers);
      }
      res.status(201).json({ vouchers: created, batchCode });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/mikrotik/hotspot/profiles', requireAdminSession, async (req, res) => {
    const routerId = String(req.query.routerId || '');
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      res.json({ profiles: await getHotspotUserProfiles(router) });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/mikrotik/hotspot/server-profiles', requireAdminSession, async (req, res) => {
    const routerId = String(req.query.routerId || '');
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      res.json({ profiles: await getHotspotServerProfiles(router) });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/mikrotik/hotspot/server-profiles', requireAdminSession, async (req, res) => {
    const { routerId, profile } = req.body || {};
    if (
      typeof routerId !== 'string' || !isRecord(profile) ||
      typeof profile.name !== 'string' || !/^[A-Za-z0-9_. -]{1,64}$/.test(profile.name) ||
      ['hotspotAddress', 'dnsName', 'htmlDirectory', 'loginBy'].some(key =>
        profile[key] !== undefined && (typeof profile[key] !== 'string' || profile[key].length > 128)
      ) ||
      (profile.useRadius !== undefined && typeof profile.useRadius !== 'boolean')
    ) return res.status(400).json({ error: 'Konfigurasi Hotspot Server Profile tidak valid' });
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      await addHotspotServerProfile(router, profile as Parameters<typeof addHotspotServerProfile>[1]);
      res.status(201).json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/mikrotik/hotspot/user-profiles', requireAdminSession, async (req, res) => {
    const { routerId, profile } = req.body || {};
    if (
      typeof routerId !== 'string' || !isRecord(profile) ||
      typeof profile.name !== 'string' || !/^[A-Za-z0-9_. -]{1,64}$/.test(profile.name) ||
      ['rateLimit', 'sessionTimeout', 'idleTimeout'].some(key =>
        profile[key] !== undefined && (typeof profile[key] !== 'string' || profile[key].length > 128)
      ) ||
      (profile.sharedUsers !== undefined && (!Number.isInteger(profile.sharedUsers) || Number(profile.sharedUsers) < 1 || Number(profile.sharedUsers) > 1000))
    ) return res.status(400).json({ error: 'Konfigurasi Hotspot User Profile tidak valid' });
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      await addHotspotUserProfile(router, profile as Parameters<typeof addHotspotUserProfile>[1]);
      res.status(201).json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/mikrotik/hotspot/servers', requireAdminSession, async (req, res) => {
    const { routerId, server } = req.body || {};
    if (
      typeof routerId !== 'string' || !isRecord(server) ||
      ['name', 'interface', 'profile'].some(key =>
        typeof server[key] !== 'string' || !(server[key] as string).trim() || (server[key] as string).length > 128
      ) ||
      (server.addressPool !== undefined && (typeof server.addressPool !== 'string' || server.addressPool.length > 128))
    ) return res.status(400).json({ error: 'Konfigurasi Hotspot Server tidak valid' });
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      const [interfaces, profiles, pools] = await Promise.all([
        getRouterInterfaces(router),
        getHotspotServerProfiles(router),
        getRouterPools(router),
      ]);
      if (!interfaces.includes(server.interface as string)) return res.status(400).json({ error: 'Interface tidak ditemukan pada router' });
      if (!profiles.some(item => item.name === server.profile)) return res.status(400).json({ error: 'Hotspot Server Profile tidak ditemukan' });
      if (server.addressPool && !pools.includes(server.addressPool as string)) return res.status(400).json({ error: 'Address pool tidak ditemukan pada router' });
      await addHotspotServer(router, server as Parameters<typeof addHotspotServer>[1]);
      res.status(201).json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/mikrotik/servers', requireAdminSession, async (req, res) => {
    const routerId = String(req.query.routerId || '');
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      const [pppoeServers, hotspotServers] = await Promise.all([
        getRouterServiceRecords(router, 'pppoe'),
        getRouterServiceRecords(router, 'hotspot'),
      ]);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ pppoeServers, hotspotServers });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch('/api/mikrotik/servers/:routerId/:kind/:id', requireAdminSession, async (req, res) => {
    const { routerId, kind } = req.params;
    if (kind !== 'pppoe' && kind !== 'hotspot') {
      return res.status(400).json({ error: 'Jenis server MikroTik tidak valid' });
    }
    const allowedFields = kind === 'pppoe'
      ? ['service-name', 'interface', 'default-profile', 'disabled']
      : ['name', 'interface', 'profile', 'address-pool', 'disabled'];
    const entries = Object.entries(req.body || {});
    if (entries.some(([key]) => !allowedFields.includes(key))) {
      return res.status(400).json({ error: 'Properti server yang diminta tidak dapat diubah' });
    }
    const fields = Object.fromEntries(entries) as Record<string, string | boolean>;
    if (
      !Object.keys(fields).length ||
      Object.entries(fields).some(([key, value]) =>
        key === 'disabled'
          ? typeof value !== 'boolean'
          : typeof value !== 'string' || !value.trim() || value.length > 128
      )
    ) {
      return res.status(400).json({ error: 'Perubahan server tidak valid' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      await updateRouterServiceRecord(router, kind, req.params.id, fields);
      res.json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/mikrotik/servers/:routerId/:kind/:id', requireAdminSession, async (req, res) => {
    const { routerId, kind } = req.params;
    if (kind !== 'pppoe' && kind !== 'hotspot') {
      return res.status(400).json({ error: 'Jenis server MikroTik tidak valid' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      await deleteRouterServiceRecord(router, kind, req.params.id);
      res.json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/portal/billing', async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const current = publicLookupAttempts.get(ip);
    if (current && current.resetAt > Date.now() && current.count >= 30) {
      return res.status(429).json({ error: 'Too many lookups. Try again in a minute.' });
    }
    publicLookupAttempts.set(ip, {
      count: current && current.resetAt > Date.now() ? current.count + 1 : 1,
      resetAt: current && current.resetAt > Date.now() ? current.resetAt : Date.now() + 60_000,
    });

    const { lookupValue } = req.body || {};
    if (typeof lookupValue !== 'string' || !lookupValue.trim() || lookupValue.length > 128) {
      return res.status(400).json({ error: 'Masukkan ID pelanggan atau nomor terdaftar' });
    }
    try {
      const stored = await getAppDataDb();
      const customers = stored.data.customers || [];
      const searchValue = lookupValue.trim();
      const normalizedPhone = searchValue.replace(/[^0-9]/g, '');
      const customer = customers.find(item =>
        item.customerId.toLowerCase() === searchValue.toLowerCase()
      ) || (normalizedPhone.length >= 8
        ? customers.find(item => item.phone.replace(/[^0-9]/g, '') === normalizedPhone)
        : undefined);
      if (!customer) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
      const invoices = (stored.data.invoices || [])
        .filter(invoice => invoice.customerId === customer.id)
        .map(({ id, invoiceNumber, profileName, periodMonth, amount, uniqueCode, totalAmount, status, dueDate, paidAt, paymentMethod }) => ({
          id, invoiceNumber, profileName, periodMonth, amount, uniqueCode, totalAmount, status, dueDate, paidAt, paymentMethod,
        }));
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        customer: {
          id: customer.id,
          customerId: customer.customerId,
          name: customer.name,
          profileName: customer.profileName,
          bandwidthLimit: customer.bandwidthLimit,
          monthlyFee: customer.monthlyFee,
          expiredDate: customer.expiredDate,
          status: customer.status,
        },
        invoices,
        paymentAvailable: Boolean(
          process.env.MIDTRANS_SERVER_KEY &&
          configuredPaymentAppUrl() &&
          (!process.env.PAYMENT_GATEWAY || process.env.PAYMENT_GATEWAY === 'midtrans')
        ),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/portal/billing-link', async (req, res) => {
    try {
      const secret = await getOrCreatePortalLinkSecretDb();
      const token = verifyInvoicePortalToken(req.body?.token, secret);
      if (!token) return res.status(410).json({ error: 'Tautan tagihan tidak valid atau sudah kedaluwarsa' });
      const stored = await getAppDataDb();
      const invoice = (stored.data.invoices || []).find(item => item.id === token.invoiceId);
      if (!invoice) return res.status(404).json({ error: 'Tagihan tidak ditemukan' });
      const customer = (stored.data.customers || []).find(item => item.id === invoice.customerId);
      if (!customer) return res.status(404).json({ error: 'Data pelanggan tidak ditemukan' });
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        customer: {
          id: customer.id,
          customerId: customer.customerId,
          name: customer.name,
          profileName: customer.profileName,
          bandwidthLimit: customer.bandwidthLimit,
          monthlyFee: customer.monthlyFee,
          expiredDate: customer.expiredDate,
          status: customer.status,
        },
        invoices: [{
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          profileName: invoice.profileName,
          periodMonth: invoice.periodMonth,
          amount: invoice.amount,
          uniqueCode: invoice.uniqueCode,
          totalAmount: invoice.totalAmount,
          status: invoice.status,
          dueDate: invoice.dueDate,
          paidAt: invoice.paidAt,
          paymentMethod: invoice.paymentMethod,
        }],
        paymentAvailable: Boolean(
          process.env.MIDTRANS_SERVER_KEY &&
          configuredPaymentAppUrl() &&
          (!process.env.PAYMENT_GATEWAY || process.env.PAYMENT_GATEWAY === 'midtrans')
        ),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  const paymentCheckoutInProgress = new Set<string>();
  app.post('/api/admin/invoices/:invoiceId/payment-link', requireAdminSession, async (req, res) => {
    try {
      const stored = await getAppDataDb();
      const invoice = (stored.data.invoices || []).find(item => item.id === req.params.invoiceId && item.status === 'unpaid');
      if (!invoice) return res.status(404).json({ error: 'Invoice belum lunas tidak ditemukan' });
      const appUrl = configuredPaymentAppUrl() || (!isProd ? new URL('http://localhost:3000') : null);
      if (!appUrl) return res.status(503).json({ error: 'APP_URL HTTPS harus dikonfigurasi sebelum membuat tautan pembayaran' });
      const secret = await getOrCreatePortalLinkSecretDb();
      const token = createInvoicePortalToken(invoice.id, Date.now() + 30 * 24 * 60 * 60 * 1000, secret);
      res.json({ url: `${appUrl.origin}/portal/billing?token=${encodeURIComponent(token)}` });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/portal/payment', async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const attempts = publicLookupAttempts.get(ip);
    if (attempts && attempts.resetAt > Date.now() && attempts.count >= 30) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
    }
    publicLookupAttempts.set(ip, {
      count: attempts && attempts.resetAt > Date.now() ? attempts.count + 1 : 1,
      resetAt: attempts && attempts.resetAt > Date.now() ? attempts.resetAt : Date.now() + 60_000,
    });

    const { lookupValue, invoiceId, portalToken, paymentMode = 'automatic', methodId } = req.body || {};
    if (
      ((typeof lookupValue !== 'string' || !lookupValue.trim() || lookupValue.length > 128) &&
        typeof portalToken !== 'string') ||
      typeof invoiceId !== 'string' || !invoiceId.trim() || invoiceId.length > 128 ||
      (paymentMode !== 'automatic' && paymentMode !== 'manual')
    ) {
      return res.status(400).json({ error: 'Identitas pelanggan atau tautan tagihan, invoice, dan metode pembayaran wajib valid' });
    }

    try {
      const stored = await getAppDataDb();
      const customers = stored.data.customers || [];
      let customer: Customer | undefined;
      if (typeof portalToken === 'string') {
        const secret = await getOrCreatePortalLinkSecretDb();
        const token = verifyInvoicePortalToken(portalToken, secret);
        if (!token || token.invoiceId !== invoiceId) {
          return res.status(410).json({ error: 'Tautan tagihan tidak valid atau sudah kedaluwarsa' });
        }
        const linkedInvoice = (stored.data.invoices || []).find(item => item.id === token.invoiceId);
        customer = customers.find(item => item.id === linkedInvoice?.customerId);
      } else {
        const searchValue = lookupValue.trim();
        const normalizedPhone = searchValue.replace(/[^0-9]/g, '');
        customer = customers.find(item =>
          item.customerId.toLowerCase() === searchValue.toLowerCase()
        ) || (normalizedPhone.length >= 8
          ? customers.find(item => item.phone.replace(/[^0-9]/g, '') === normalizedPhone)
          : undefined);
      }
      if (!customer) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

      const invoice = (stored.data.invoices || []).find(item =>
        item.id === invoiceId && item.customerId === customer.id
      );
      if (!invoice) return res.status(404).json({ error: 'Tagihan tidak ditemukan' });
      if (invoice.status === 'paid') return res.status(409).json({ error: 'Tagihan ini sudah lunas' });
      if (invoice.status !== 'unpaid') return res.status(409).json({ error: 'Tagihan ini tidak dapat dibayar secara online' });
      if (!Number.isSafeInteger(invoice.totalAmount) || invoice.totalAmount <= 0) {
        return res.status(400).json({ error: 'Nominal tagihan tidak valid untuk checkout' });
      }
      if (paymentMode === 'manual') {
        const paymentConfig = stored.data.paymentConfig;
        const method = paymentConfig?.manualPaymentMethods?.find(item => item.id === methodId && item.enabled);
        if (!method) return res.status(400).json({ error: 'Pilih metode pembayaran manual yang tersedia' });
        const existingManualRequest = (stored.data.transactions || []).find(item =>
          item.invoiceId === invoice.id &&
          item.paymentMethod === 'manual' &&
          item.status === 'pending'
        );
        if (existingManualRequest) {
          return res.status(409).json({ error: `Pembayaran manual sudah menunggu persetujuan (${existingManualRequest.orderId})` });
        }
        const timeoutMinutes = Math.max(1, Math.min(1440, Number(paymentConfig?.manualTimeoutMinutes) || 60));
        const createdAt = new Date();
        const transaction: PaymentTransaction = {
          id: randomUUID(),
          orderId: `SBM-${randomUUID()}`,
          orderType: 'invoice',
          amount: invoice.totalAmount,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email || undefined,
          paymentMethod: 'manual',
          paymentChannel: method.id,
          status: 'pending',
          expiryMinutes: timeoutMinutes,
          createdAt: createdAt.toISOString(),
          expiresAt: new Date(createdAt.getTime() + timeoutMinutes * 60_000).toISOString(),
          invoiceId: invoice.id,
        };
        await saveAppDataCollectionDb('transactions', [transaction, ...(stored.data.transactions || [])]);
        const appSettings = await getAppSettingsDb();
        const operatorNumber = appSettings.phoneContact.replace(/[^0-9]/g, '');
        const operatorWhatsapp = operatorNumber
          ? (operatorNumber.startsWith('0') ? `62${operatorNumber.slice(1)}` : operatorNumber)
          : '';
        const contactMessage =
          `Halo operator, saya ingin konfirmasi pembayaran tagihan.\nKode bayar: ${transaction.orderId}\n` +
          `Invoice: ${invoice.invoiceNumber}\nNominal: Rp ${invoice.totalAmount.toLocaleString('id-ID')}\n` +
          `Metode: ${method.name}\nNama: ${customer.name}\nNomor: ${customer.phone}`;
        const operatorUrl = operatorWhatsapp
          ? `https://wa.me/${operatorWhatsapp}?text=${encodeURIComponent(contactMessage)}`
          : '';
        try {
          await sendWhatsAppMessage(
            customer.phone,
            `Permintaan pembayaran invoice ${invoice.invoiceNumber} (${transaction.orderId}) dibuat. Kode bayar: ${transaction.orderId}. ` +
            `Nominal Rp ${invoice.totalAmount.toLocaleString('id-ID')} melalui ${method.name}. ${method.instructions} ` +
            `Konfirmasi kepada operator melalui ${operatorUrl || 'nomor WhatsApp operator yang tersedia'}. Batas waktu: ${transaction.expiresAt}.`
          );
        } catch (error) {
          console.error(`[WhatsApp] Could not send manual invoice payment instructions for ${transaction.orderId}:`, error);
        }
        return res.status(201).json({
          status: 'pending',
          orderId: transaction.orderId,
          expiresAt: transaction.expiresAt,
          operatorUrl,
          message: 'Kode bayar dibuat. Hubungi operator melalui WhatsApp setelah menyelesaikan transfer.',
        });
      }

      const appUrl = configuredPaymentAppUrl();
      if (!process.env.MIDTRANS_SERVER_KEY || !appUrl ||
        (process.env.PAYMENT_GATEWAY && process.env.PAYMENT_GATEWAY !== 'midtrans')) {
        return res.status(503).json({ error: 'Checkout Midtrans belum dikonfigurasi oleh administrator' });
      }
      if (paymentCheckoutInProgress.has(invoice.id)) {
        return res.status(409).json({ error: 'Checkout tagihan sedang dibuat. Silakan coba lagi.' });
      }
      const existing = (stored.data.transactions || []).find(item =>
        item.invoiceId === invoice.id && item.status === 'pending' && item.paymentUrl
      );
      if (existing?.paymentUrl) return res.json({ redirectUrl: existing.paymentUrl });

      paymentCheckoutInProgress.add(invoice.id);
      try {
        const orderId = `SB-${randomUUID()}`;
        const response = await fetch(
          process.env.MIDTRANS_IS_PRODUCTION === 'true'
            ? 'https://app.midtrans.com/snap/v1/transactions'
            : 'https://app.sandbox.midtrans.com/snap/v1/transactions',
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${Buffer.from(`${process.env.MIDTRANS_SERVER_KEY}:`).toString('base64')}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              transaction_details: { order_id: orderId, gross_amount: invoice.totalAmount },
              item_details: [{
                id: invoice.id.slice(0, 50),
                price: invoice.totalAmount,
                quantity: 1,
                name: `Tagihan ${invoice.invoiceNumber}`.slice(0, 50),
              }],
              customer_details: {
                first_name: customer.name.slice(0, 50),
                email: customer.email || undefined,
                phone: customer.phone,
              },
              callbacks: {
                finish: `${appUrl.origin}/portal/billing?payment=complete`,
              },
              expiry: { unit: 'minute', duration: 1440 },
            }),
            signal: AbortSignal.timeout(15000),
          }
        );
        const payload = await response.json() as { token?: string; redirect_url?: string; error_messages?: string[] };
        if (!response.ok || typeof payload.redirect_url !== 'string') {
          const providerError = Array.isArray(payload.error_messages) ? payload.error_messages.join('; ') : `HTTP ${response.status}`;
          return res.status(502).json({ error: `Midtrans gagal membuat checkout: ${providerError}` });
        }
        const redirectUrl = new URL(payload.redirect_url);
        if (
          redirectUrl.protocol !== 'https:' ||
          !['app.midtrans.com', 'app.sandbox.midtrans.com'].includes(redirectUrl.hostname)
        ) {
          return res.status(502).json({ error: 'Midtrans mengembalikan URL checkout yang tidak valid' });
        }

        const transaction: PaymentTransaction = {
          id: randomUUID(),
          orderId,
          orderType: 'invoice',
          amount: invoice.totalAmount,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email || undefined,
          paymentMethod: 'midtrans',
          paymentChannel: 'snap',
          status: 'pending',
          paymentUrl: redirectUrl.toString(),
          expiryMinutes: 1440,
          createdAt: new Date().toISOString(),
          invoiceId: invoice.id,
        };
        await saveAppDataCollectionDb('transactions', [...(stored.data.transactions || []), transaction]);
        res.json({ redirectUrl: transaction.paymentUrl });
      } finally {
        paymentCheckoutInProgress.delete(invoice.id);
      }
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/payment/config', requireAdminSession, (_req, res) => {
    const provider = process.env.PAYMENT_GATEWAY || 'midtrans';
    const appOrigin = configuredPaymentAppUrl()?.origin || '';
    res.json({
      provider,
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
      serverKeyConfigured: Boolean(process.env.MIDTRANS_SERVER_KEY),
      clientKeyConfigured: Boolean(process.env.MIDTRANS_CLIENT_KEY),
      appUrlConfigured: Boolean(appOrigin),
      checkoutEnabled: provider === 'midtrans' && Boolean(process.env.MIDTRANS_SERVER_KEY && appOrigin),
      webhookUrl: appOrigin ? `${appOrigin}/api/payment/webhook` : '',
    });
  });

  app.get('/api/payment/manual-options', requireAdminSession, async (_req, res) => {
    try {
      const stored = await getAppDataDb();
      res.json({
        manualPaymentMethods: stored.data.paymentConfig?.manualPaymentMethods || [],
        manualTimeoutMinutes: stored.data.paymentConfig?.manualTimeoutMinutes ?? 60,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/admin/payment-requests', requireAdminSession, async (_req, res) => {
    try {
      const stored = await getAppDataDb();
      const vouchers = stored.data.vouchers || [];
      const invoices = stored.data.invoices || [];
      const requests = (stored.data.transactions || [])
        .filter(transaction => transaction.paymentMethod === 'manual' && transaction.status === 'pending')
        .map(transaction => ({
          ...transaction,
          voucher: vouchers.find(voucher => voucher.orderId === transaction.orderId) || null,
          invoice: transaction.invoiceId
            ? invoices.find(invoice => invoice.id === transaction.invoiceId) || null
            : null,
        }));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ requests });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/admin/payment-requests/:orderId/:action', requireAdminSession, async (req, res) => {
    const { orderId, action } = req.params;
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ error: 'Aksi persetujuan pembayaran tidak valid' });
    }
    if (voucherApprovalsInProgress.has(orderId)) {
      return res.status(409).json({ error: 'Pesanan sedang diproses' });
    }
    voucherApprovalsInProgress.add(orderId);
    try {
      const stored = await getAppDataDb();
      const transaction = (stored.data.transactions || []).find(item =>
        item.orderId === orderId && item.paymentMethod === 'manual' && item.status === 'pending'
      );
      if (!transaction) return res.status(404).json({ error: 'Permintaan pembayaran tidak ditemukan atau sudah diproses' });
      if (transaction.expiresAt && new Date(transaction.expiresAt).getTime() <= Date.now()) {
        const expiredTransactions = (stored.data.transactions || []).map(item =>
          item.orderId === orderId ? { ...item, status: 'expired' as const } : item
        );
        const expiredVouchers = (stored.data.vouchers || []).map(item =>
          item.orderId === orderId ? { ...item, status: 'expired' as const } : item
        );
        await savePublicPaymentUpdateDb(
          stored.data.customers || [],
          stored.data.invoices || [],
          expiredTransactions,
          expiredVouchers
        );
        return res.status(409).json({ error: 'Batas waktu pembayaran sudah berakhir' });
      }

      if (action === 'approve') {
        if (transaction.orderType === 'voucher') {
          await activateAndSettleVoucher(orderId, 'manual-admin-approved');
        } else await approveInvoicePayment(orderId, 'manual-admin-approved');
      } else {
        const updatedTransactions = (stored.data.transactions || []).map(item =>
          item.orderId === orderId ? { ...item, status: 'canceled' as const } : item
        );
        const updatedVouchers = (stored.data.vouchers || []).map(item =>
          item.orderId === orderId ? { ...item, status: 'expired' as const } : item
        );
        await savePublicPaymentUpdateDb(
          stored.data.customers || [],
          stored.data.invoices || [],
          updatedTransactions,
          updatedVouchers
        );
      }
      res.json({ status: action === 'approve' ? 'settlement' : 'canceled' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      voucherApprovalsInProgress.delete(orderId);
    }
  });

  // ==========================================
  // SQLite Database & Settings REST Endpoints
  // ==========================================

  // Get App Settings from SQLite
  app.get('/api/settings', requireAdminSession, async (_req, res) => {
    try {
      const settings = await getAppSettingsDb();
      const envRouter = envRouterConnection();
      res.json({
        ...settings,
        ...(envRouter ? {
          mikrotikHost: envRouter.host,
          mikrotikPort: envRouter.port,
          mikrotikUser: envRouter.username,
          mikrotikApiType: envRouter.apiType,
          mikrotikTimeoutSec: envRouter.timeoutSec,
        } : {}),
        ...(process.env.PAYMENT_GATEWAY ? { paymentProvider: process.env.PAYMENT_GATEWAY } : {}),
        ...(process.env.MIDTRANS_IS_PRODUCTION !== undefined
          ? { paymentIsProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true' }
          : {}),
        ...(process.env.MIDTRANS_CLIENT_KEY ? { paymentClientKey: process.env.MIDTRANS_CLIENT_KEY } : {}),
        ...(process.env.WA_PROVIDER ? { waProvider: process.env.WA_PROVIDER } : {}),
        openwaUrl: OPENWA_BASE_URL,
        openwaSessionId: OPENWA_SESSION_ID,
        ...(process.env.WA_SENDER_NUMBER ? { openwaSenderNumber: process.env.WA_SENDER_NUMBER } : {}),
        mikrotikPass: '',
        openwaApiKey: '',
        paymentServerKey: '',
        paymentWebhookSecret: '',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Save App Settings to SQLite
  app.post('/api/settings', requireAdminSession, async (req, res) => {
    try {
      const settingsInput = isRecord(req.body) ? { ...req.body } : {};
      delete settingsInput.mikrotikPass;
      delete settingsInput.openwaApiKey;
      delete settingsInput.paymentServerKey;
      delete settingsInput.paymentWebhookSecret;
      const updated = await saveAppSettingsDb(settingsInput);
      res.json({ status: 'success', settings: { ...updated, mikrotikPass: '', openwaApiKey: '', paymentServerKey: '', paymentWebhookSecret: '' } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Persist application records in SQLite.
  app.get('/api/data', requireAdminSession, async (_req, res) => {
    try {
      res.json(await getAppDataDb());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put('/api/data', requireAdminSession, async (req, res) => {
    if (!isAppDataSnapshot(req.body)) {
      return res.status(400).json({ error: 'Invalid application data snapshot' });
    }
    try {
      await saveAppDataDb(req.body);
      res.json({ status: 'success' });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/mikrotik/config', requireAdminSession, (_req, res) => {
    const router = envRouterConnection();
    res.json({
      configured: Boolean(router),
      host: router?.host || '',
      port: router?.port || 8728,
      username: router?.username || '',
      apiType: router?.apiType || 'api',
      managedByEnvironment: Boolean(envRouterConnection()),
    });
  });

  app.get('/api/security/encryption-key', requireAdminSession, (_req, res) => {
    try {
      res.json(getEncryptionKeyInfo());
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/security/encryption-key/rotate', requireAdminSession, async (_req, res) => {
    try {
      const result = await rotateEncryptionKeyDb();
      res.json({ ...result, source: 'generated' });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/mikrotik/routers', requireAdminSession, async (_req, res) => {
    try {
      const appData = await getAppDataDb();
      const routers = [...(appData.data.routers || [])];
      const envRouter = envRouterConnection();
      if (envRouter && !routers.some(item => item.host === envRouter.host && item.port === envRouter.port)) {
        routers.unshift({
          id: 'env-default',
          name: envRouter.name,
          host: envRouter.host,
          port: envRouter.port,
          username: envRouter.username,
          apiType: envRouter.apiType,
          status: 'offline',
          model: 'Unknown',
          rosVersion: 'Unknown',
          cpuLoad: 0,
          memoryFreeMb: 0,
          uptime: 'Unknown',
          activePppoe: 0,
          activeHotspot: 0,
        });
      }

      const results = await Promise.all(routers.map(async router => {
        try {
          const connection = await resolveRouterConnection(router.id);
          if (!connection) throw new Error('Router credential is not configured');
          return { router: await testRouterConnection(connection), error: null };
        } catch (error) {
          return {
            router: { ...router, status: 'offline' as const },
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }));
      res.json({ routers: results.map(result => result.router), errors: results });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/mikrotik/interfaces', requireAdminSession, async (req, res) => {
    const routerId = String(req.query.routerId || '');
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      res.json({ interfaces: await getRouterInterfaces(router) });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/mikrotik/pools', requireAdminSession, async (req, res) => {
    const routerId = String(req.query.routerId || '');
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      res.json({ pools: await getRouterPools(router) });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/mikrotik/pppoe/profiles', requireAdminSession, async (req, res) => {
    const routerId = String(req.query.routerId || '');
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      res.json({ profiles: await getPppProfiles(router) });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/mikrotik/pppoe/profiles', requireAdminSession, async (req, res) => {
    const { routerId, profile } = req.body || {};
    if (
      typeof routerId !== 'string' || !isRecord(profile) ||
      typeof profile.name !== 'string' || !/^[A-Za-z0-9_. -]{1,64}$/.test(profile.name) ||
      ['localAddress', 'remoteAddress', 'rateLimit', 'dnsServers'].some(key =>
        profile[key] !== undefined && (typeof profile[key] !== 'string' || profile[key].length > 128)
      )
    ) return res.status(400).json({ error: 'Konfigurasi PPP Profile tidak valid' });
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      if (profile.remoteAddress) {
        const pools = await getRouterPools(router);
        if (!pools.includes(profile.remoteAddress as string)) return res.status(400).json({ error: 'Remote address harus menggunakan IP pool yang tersedia pada router' });
      }
      await addPppProfile(router, profile as Parameters<typeof addPppProfile>[1]);
      res.status(201).json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/mikrotik/pppoe/secrets', requireAdminSession, async (req, res) => {
    const { routerId, name, password, profile, comment, disabled } = req.body || {};
    if (
      typeof routerId !== 'string' ||
      typeof name !== 'string' || !/^[A-Za-z0-9_.@-]{1,64}$/.test(name) ||
      typeof password !== 'string' || password.length < 1 || password.length > 128 ||
      typeof profile !== 'string' || !/^[A-Za-z0-9_. -]{1,64}$/.test(profile) ||
      (disabled !== undefined && typeof disabled !== 'boolean')
    ) {
      return res.status(400).json({ error: 'Invalid PPPoE secret settings' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      await addPppoeSecret(router, {
        name,
        password,
        profile,
        comment: typeof comment === 'string' ? comment.slice(0, 200) : undefined,
        disabled,
      });
      res.status(201).json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch('/api/mikrotik/pppoe/secrets/:routerId/:username', requireAdminSession, async (req, res) => {
    const { password, profile, disabled } = req.body || {};
    if (
      (password !== undefined && (typeof password !== 'string' || !password || password.length > 128)) ||
      (profile !== undefined && (typeof profile !== 'string' || !/^[A-Za-z0-9_. -]{1,64}$/.test(profile))) ||
      (disabled !== undefined && typeof disabled !== 'boolean') ||
      (password === undefined && profile === undefined && disabled === undefined)
    ) {
      return res.status(400).json({ error: 'Invalid PPPoE secret update' });
    }
    try {
      const router = await resolveRouterConnection(req.params.routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      await updatePppoeSecret(router, req.params.username, { password, profile, disabled });
      res.json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/mikrotik/pppoe/secrets/:routerId/:username', requireAdminSession, async (req, res) => {
    try {
      const router = await resolveRouterConnection(req.params.routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      await deletePppoeSecret(router, req.params.username);
      res.json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/mikrotik/test', requireAdminSession, async (req, res) => {
    if (!validRouterInput(req.body)) {
      return res.status(400).json({ error: 'Invalid MikroTik connection settings' });
    }
    try {
      const envRouter = envRouterConnection();
      const sameAsEnv = envRouter?.host === req.body.host && envRouter.port === req.body.port;
      const password = req.body.password || (sameAsEnv ? envRouter.password : '');
      if (!password) return res.status(400).json({ error: 'Router password is required' });
      const router = await testRouterConnection({
        ...req.body,
        password,
        timeoutSec: Number(process.env.MIKROTIK_TIMEOUT_SEC) || 10,
      });
      res.json({ status: 'connected', router });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/mikrotik/routers', requireAdminSession, async (req, res) => {
    if (!validRouterInput(req.body)) {
      return res.status(400).json({ error: 'Router name, host, port, username, protocol, and password are required' });
    }
    const password = req.body.password;
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Router name, host, port, username, protocol, and password are required' });
    }
    try {
      const appData = await getAppDataDb();
      const routers = appData.data.routers || [];
      if (routers.some(router => router.host === req.body.host && router.port === req.body.port)) {
        return res.status(409).json({ error: 'A router with this host and port is already registered' });
      }

      const routerId = randomUUID();
      const connection: RouterConnection = {
        ...req.body,
        password,
        id: routerId,
        timeoutSec: Number(process.env.MIKROTIK_TIMEOUT_SEC) || 10,
      };
      const liveRouter = await testRouterConnection(connection);
      const savedRouter: RouterConfig = { ...liveRouter, id: routerId };
      await saveRouterCredentialDb(routerId, password);
      await saveAppDataCollectionDb('routers', [...routers, savedRouter]);
      res.status(201).json({ router: savedRouter });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/mikrotik/pppoe/setup', requireAdminSession, async (req, res) => {
    const { routerId, config } = req.body || {};
    if (typeof routerId !== 'string' || !validPppoeSetup(config) || !isValidPppoeSetup(config)) {
      return res.status(400).json({ error: 'Invalid PPPoE server configuration' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      const result = await configurePppoeServer(router, config);
      res.json({ status: 'success', ...result });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Database statistics
  app.get('/api/db/stats', requireAdminSession, async (_req, res) => {
    try {
      const stats = await getDbStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Download SQLite database backup file
  app.get('/api/db/backup', requireAdminSession, async (_req, res) => {
    try {
      const dbPath = path.resolve(__dirname, 'data/billing.sqlite');
      if (fs.existsSync(dbPath)) {
        res.download(dbPath, `backup-billing-${new Date().toISOString().substring(0, 10)}.sqlite`);
      } else {
        res.status(404).json({ error: 'Database file not found on disk' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // SQLite Optimize / VACUUM
  app.post('/api/db/vacuum', requireAdminSession, async (_req, res) => {
    try {
      const database = await getDb();
      database.run('VACUUM;');
      saveDbToDisk();
      const stats = await getDbStats();
      res.json({ status: 'success', message: 'SQLite database optimized (VACUUM completed)', stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/payment/webhook', async (req, res) => {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) return res.status(503).json({ error: 'Midtrans server key is not configured' });
    const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status, payment_type } = req.body || {};
    if (
      typeof order_id !== 'string' ||
      typeof status_code !== 'string' ||
      typeof gross_amount !== 'string' ||
      typeof signature_key !== 'string' ||
      typeof transaction_status !== 'string'
    ) {
      return res.status(400).json({ error: 'Invalid Midtrans notification payload' });
    }

    const expectedSignature = createHash('sha512')
      .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
      .digest('hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const receivedBuffer = Buffer.from(signature_key, 'hex');
    if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
      return res.status(403).json({ error: 'Invalid Midtrans notification signature' });
    }

    const settled = transaction_status === 'settlement' ||
      (transaction_status === 'capture' && fraud_status === 'accept');
    const newStatus: PaymentTransaction['status'] | null = settled
      ? 'settlement'
      : transaction_status === 'expire'
        ? 'expired'
        : transaction_status === 'cancel' || transaction_status === 'deny'
          ? 'canceled'
          : transaction_status === 'pending' || transaction_status === 'capture'
            ? 'pending'
            : null;
    if (!newStatus) return res.json({ status: 'ignored' });

    try {
      const stored = await getAppDataDb();
      const transactions = stored.data.transactions || [];
      const transaction = transactions.find(item => item.orderId === order_id);
      if (!transaction) return res.status(404).json({ error: 'Payment order not found' });
      if (Number(gross_amount) !== transaction.amount) {
        return res.status(400).json({ error: 'Payment amount does not match the order' });
      }
      if (transaction.status === 'settlement') return res.json({ status: 'success' });

      if (transaction.orderType === 'voucher') {
        if (settled) {
          await activateAndSettleVoucher(order_id, typeof payment_type === 'string' ? payment_type : 'midtrans');
        } else {
          const updatedAt = new Date().toISOString();
          const updatedTransactions = transactions.map(item => item.orderId === order_id
            ? { ...item, status: newStatus, ...(newStatus === 'expired' ? { paidAt: undefined } : {}) }
            : item);
          const vouchers = (stored.data.vouchers || []).map(voucher =>
            voucher.orderId === order_id && (newStatus === 'expired' || newStatus === 'canceled')
              ? { ...voucher, status: 'expired' as const }
              : voucher
          );
          await savePublicPaymentUpdateDb(
            stored.data.customers || [],
            stored.data.invoices || [],
            updatedTransactions,
            vouchers
          );
          console.info(`[Payment] Voucher order ${order_id} status updated to ${newStatus} at ${updatedAt}`);
        }
        return res.json({ status: 'success' });
      }

      if (!transaction.invoiceId) return res.status(404).json({ error: 'Invoice for payment order not found' });
      const updatedAt = new Date().toISOString();
      const updatedTransactions = transactions.map(item =>
        item.orderId === order_id
          ? { ...item, status: newStatus, ...(settled ? { paidAt: updatedAt } : {}) }
          : item
      );
      const invoices = stored.data.invoices || [];
      const invoice = invoices.find(item => item.id === transaction.invoiceId);
      if (!invoice) return res.status(404).json({ error: 'Invoice for payment order not found' });
      const customers = stored.data.customers || [];
      let updatedCustomers = customers;
      if (settled && invoice.status !== 'paid') {
        const customer = customers.find(item => item.id === invoice.customerId);
        if (customer) {
          const now = new Date();
          const currentExpiry = new Date(`${customer.expiredDate}T00:00:00`);
          const newExpiry = new Date(currentExpiry > now ? currentExpiry : now);
          newExpiry.setDate(newExpiry.getDate() + 30);
          let routerActivated = false;
          let activationNote = 'RouterOS belum diaktifkan otomatis.';
          try {
            const router = await resolveRouterConnection(customer.routerId);
            if (!router) throw new Error('Kredensial router tidak tersedia');
            await updatePppoeSecret(router, customer.pppoeUsername, { disabled: false });
            routerActivated = true;
            activationNote = 'Akses PPPoE diaktifkan melalui RouterOS.';
          } catch (activationError) {
            activationNote = `Akses router belum aktif: ${activationError instanceof Error ? activationError.message : String(activationError)}`;
            console.error(`[Payment] Verified invoice ${invoice.invoiceNumber}; RouterOS activation failed: ${activationNote}`);
          }
          const updatedCustomer: Customer = {
            ...customer,
            expiredDate: newExpiry.toISOString().slice(0, 10),
            status: routerActivated ? 'active' : customer.status,
            notes: `Pembayaran Midtrans terverifikasi pada ${updatedAt}. ${activationNote}`,
          };
          updatedCustomers = customers.map(item => item.id === customer.id ? updatedCustomer : item);
        }
      }
      const updatedInvoices = settled
        ? invoices.map(currentInvoice => currentInvoice.id === transaction.invoiceId && currentInvoice.status !== 'paid'
          ? {
            ...currentInvoice,
            status: 'paid' as const,
            paidAt: updatedAt,
            paymentMethod: 'midtrans',
            paymentChannel: typeof payment_type === 'string' ? payment_type : 'midtrans',
            paymentRef: order_id,
          }
          : currentInvoice)
        : invoices;
      await savePublicPaymentUpdateDb(updatedCustomers, updatedInvoices, updatedTransactions);
      res.json({ status: 'success' });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/wa/config', requireAdminSession, async (_req, res) => {
    try {
      res.json(await getWhatsAppConfig());
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/wa/config', requireAdminSession, async (req, res) => {
    if (req.body?.provider !== 'openwa' && req.body?.provider !== 'fonnte') {
      return res.status(400).json({ error: 'Provider must be openwa or fonnte' });
    }
    if (process.env.WA_PROVIDER?.trim()) {
      return res.status(409).json({ error: 'WhatsApp provider selection is managed by WA_PROVIDER in the server environment' });
    }
    try {
      await saveAppSettingsDb({ waProvider: req.body.provider });
      res.json(await getWhatsAppConfig());
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // WhatsApp providers are separate services; SmartBilling only calls their REST APIs.
  app.post('/api/wa/send', requireAdminSession, async (req, res) => {
    const { phone, message } = req.body || {};
    if (
      typeof phone !== 'string' || !phone.trim() ||
      typeof message !== 'string' || !message.trim() || message.length > 4096
    ) {
      return res.status(400).json({ error: 'Phone and message are required' });
    }
    try {
      const result = await sendWhatsAppMessage(phone, message);
      res.json({ status: 'success', ...result });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'WhatsApp provider request failed' });
    }
  });

  let backgroundTasksRunning = false;
  async function runBillingBackgroundTasks(): Promise<void> {
    if (backgroundTasksRunning) return;
    backgroundTasksRunning = true;
    try {
      const stored = await getAppDataDb();
      const transactions = stored.data.transactions || [];
      const expiredOrderIds = new Set(transactions
        .filter(item => item.paymentMethod === 'manual' && item.status === 'pending' && item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now())
        .map(item => item.orderId));
      if (expiredOrderIds.size) {
        const updatedTransactions = transactions.map(item => expiredOrderIds.has(item.orderId)
          ? { ...item, status: 'expired' as const }
          : item);
        const updatedVouchers = (stored.data.vouchers || []).map(item =>
          item.orderId && expiredOrderIds.has(item.orderId)
            ? { ...item, status: 'expired' as const }
            : item
        );
        await savePublicPaymentUpdateDb(
          stored.data.customers || [],
          stored.data.invoices || [],
          updatedTransactions,
          updatedVouchers
        );
      }

      const settings = await getAppSettingsDb();
      if (!settings.autoSendReminderH1) return;
      const jakartaDate = (date: Date) => {
        const parts = new Intl.DateTimeFormat('en', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(date);
        const getPart = (type: 'year' | 'month' | 'day') => {
          const value = parts.find(part => part.type === type)?.value;
          if (!value) throw new Error(`Could not determine Jakarta ${type}`);
          return value;
        };
        return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
      };
      const today = jakartaDate(new Date());
      const tomorrow = new Date(`${today}T12:00:00+07:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dueTomorrow = jakartaDate(tomorrow);
      const whatsappLogs = stored.data.whatsappLogs || [];
      for (const invoice of (stored.data.invoices || []).filter(item =>
        item.status === 'unpaid' && item.dueDate === dueTomorrow
      )) {
        const marker = `auto-h1:${invoice.id}:${today}`;
        const attempts = whatsappLogs
          .filter(log => log.type === 'reminder_h1' && log.responseInfo?.includes(marker))
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        if (attempts.some(log => log.status === 'sent') || attempts.length >= 3) continue;
        if (attempts[0] && Date.now() - new Date(attempts[0].timestamp).getTime() < 30 * 60 * 1000) continue;
        const customer = (stored.data.customers || []).find(item => item.id === invoice.customerId);
        if (!customer) continue;
        const secret = await getOrCreatePortalLinkSecretDb();
        const token = createInvoicePortalToken(invoice.id, Date.now() + 30 * 24 * 60 * 60 * 1000, secret);
        const appUrl = configuredPaymentAppUrl();
        if (!appUrl) {
          console.error(`[Reminder] Skipping invoice ${invoice.invoiceNumber}: APP_URL is not configured.`);
          continue;
        }
        const paymentUrl = `${appUrl.origin}/portal/billing?token=${encodeURIComponent(token)}`;
        const message =
          `PENGINGAT TAGIHAN H-1: Halo ${customer.name}, invoice ${invoice.invoiceNumber} sebesar Rp ${invoice.totalAmount.toLocaleString('id-ID')} jatuh tempo besok (${invoice.dueDate}). ` +
          `Cek detail dan bayar melalui tautan resmi: ${paymentUrl}`;
        try {
          const sent = await sendWhatsAppMessage(customer.phone, message);
          await recordWhatsAppLog(customer.phone, customer.name, 'reminder_h1', message, 'sent', `${marker}:${sent.provider}`);
        } catch (error) {
          const failure = error instanceof Error ? error.message : String(error);
          console.error(`[Reminder] H-1 WhatsApp failed for ${invoice.invoiceNumber}: ${failure}`);
          await recordWhatsAppLog(customer.phone, customer.name, 'reminder_h1', message, 'failed', `${marker}:${failure}`);
        }
      }
    } catch (error) {
      console.error('[Billing scheduler] Background billing task failed:', error);
    } finally {
      backgroundTasksRunning = false;
    }
  }

  const backgroundTaskTimer = setInterval(() => void runBillingBackgroundTasks(), 5 * 60 * 1000);
  backgroundTaskTimer.unref();
  void runBillingBackgroundTasks();

  app.get('/api/wa/session/status', requireAdminSession, async (_req, res) => {
    try {
      const config = await getWhatsAppConfig();
      if (config.provider !== 'openwa') {
        return res.status(409).json({ error: 'Session status is only available when OpenWA is selected' });
      }
      if (!config.tokenConfigured) {
        return res.status(503).json({ error: 'OPENWA_BASE_URL and OPENWA_API_KEY are not configured' });
      }
      const response = await fetch(`${OPENWA_BASE_URL}/api/sessions/${OPENWA_SESSION_ID}/status`, {
        headers: { 'X-API-Key': OPENWA_API_KEY },
        signal: AbortSignal.timeout(5000),
      });
      const text = await response.text();
      if (!response.ok) return res.status(502).json({ error: `OpenWA returned ${response.status}: ${text.slice(0, 300)}` });
      res.json(text ? JSON.parse(text) : { status: 'unknown' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'OpenWA status request failed' });
    }
  });

  // In production, serve dist folder; in dev, Vite handles it or can be started via vite CLI
  if (isProd) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 NetFlow MikroTik Billing Server running at http://0.0.0.0:${PORT}`);
    console.log(`📦 Persistent SQLite database loaded at data/billing.sqlite`);
    console.log('📱 WhatsApp notifications use the externally configured provider REST API');
  });
}

// Only start when invoked directly
if (process.env.RUN_EXPRESS === 'true' || process.env.NODE_ENV === 'production') {
  startServer().catch(console.error);
}

export default startServer;
