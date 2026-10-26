import express from 'express';
import path from 'path';
import fs from 'fs';
import { createHash, createHmac, randomBytes, randomUUID, randomInt, scryptSync, timingSafeEqual } from 'crypto';
import { renderWhatsAppTemplate } from './src/utils/whatsappTemplates';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { AppDataSnapshot, Customer, HotspotProfile, HotspotServiceProfile, HotspotValidityPreset, Invoice, ManualPaymentMethod, PaymentTransaction, RouterConfig, Voucher } from './src/types/index.js';
import {
  getRouterCredentialDb,
  deleteRouterCredentialDb,
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
  getPaymentPublicUrlsDb,
  savePaymentPublicUrlsDb,
  saveRouterCredentialDb,
  saveAppDataCollectionDb,
  saveHotspotProfileDataDb,
  savePppoeProfileDataDb,
  saveAppDataDb,
  savePublicPaymentUpdateDb,
  saveVoucherOrderDb,
  saveAppSettingsDb,
  getDbStats,
  getDb,
  saveDbToDisk,
  restoreDbFromBackup,
  resetAllBusinessDataDb,
  getEncryptionKeyInfo,
  rotateEncryptionKeyDb,
  getOrCreatePortalLinkSecretDb,
  getPortalSessionSecretDb,
  generatePortalSessionSecretDb,
  getPppoeUsageDb,
  savePppoeUsageDb,
  savePortalOtpChallengeDb,
  consumePortalOtpChallengeDb,
  discardPortalOtpChallengeDb,
  getRevenueResetStateDb,
  resetRevenueReportingDb,
  getPaymentGatewayCredentialsDb,
  savePaymentGatewayCredentialsDb,
  PaymentGatewayCredentials,
} from './server/db.js';
import {
  addPppoeSecret,
  configurePppoeServer,
  deletePppoeSecret,
  getRouterInterfaces,
  getRouterInterfaceTraffic,
  getRouterPools,
  getPppProfiles,
  updatePppProfile,
  deletePppProfile,
  getHotspotUserProfiles,
  getHotspotUsers,
  getHotspotServerProfiles,
  getHotspotFileListing,
  deleteHotspotFile,
  updateHotspotServerProfile,
  deleteHotspotServerProfile,
  addPppProfile,
  addHotspotUserProfile,
  updateHotspotUserProfile,
  deleteHotspotUserProfile,
  deleteHotspotUser,
  disconnectHotspotUser,
  addHotspotServerProfile,
  addHotspotServer,
  getRouterServiceRecords,
  updateRouterServiceRecord,
  deleteRouterServiceRecord,
  ensureHotspotUserProfile,
  addHotspotUser,
  updateHotspotUser,
  PppoeSetup,
  RouterConnection,
  closeRouterApiSessions,
  testRouterConnection,
  getPppoeActiveSessionStats,
  getPppoeActiveSessions,
  disconnectPppoeSessions,
  getRouterLogs,
  updatePppoeSecret,
  getPppoeSecrets,
} from './server/mikrotik.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const portalOtpRequestNonces = new Map<string, number>();
const portalInternalRequestNonces = new Map<string, number>();
const portalLoginRateLimits = new Map<string, { count: number; resetAt: number }>();
const PORTAL_CUSTOMER_SESSION_COOKIE = 'smartbilling_portal_session';
const PORTAL_CUSTOMER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface PortalCustomerSession {
  customerId: string;
  phone: string;
  exp: number;
}

function normalizePortalPhone(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function canonicalPortalPhone(value: string): string {
  const digits = normalizePortalPhone(value);
  return (digits.startsWith('62') ? digits.slice(2) : digits).replace(/^0+/, '');
}

function allowPortalLoginAttempt(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  if (portalLoginRateLimits.size > 10_000) {
    for (const [rateKey, value] of portalLoginRateLimits) {
      if (value.resetAt <= now) portalLoginRateLimits.delete(rateKey);
    }
  }
  if (portalLoginRateLimits.size >= 20_000 && !portalLoginRateLimits.has(key)) {
    return { allowed: false, retryAfterSeconds: 60 };
  }
  const current = portalLoginRateLimits.get(key);
  if (!current || current.resetAt <= now) {
    portalLoginRateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

async function getPortalCustomerSession(request: express.Request): Promise<PortalCustomerSession | null> {
  const cookieHeader = request.get('Cookie') || '';
  const cookie = cookieHeader
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${PORTAL_CUSTOMER_SESSION_COOKIE}=`));
  if (!cookie) return null;

  let token: string;
  try {
    token = decodeURIComponent(cookie.slice(PORTAL_CUSTOMER_SESSION_COOKIE.length + 1));
  } catch {
    return null;
  }
  if (!token || token.length > 4096) return null;
  const separator = token.indexOf('.');
  if (separator <= 0 || separator !== token.lastIndexOf('.')) return null;
  const encodedPayload = token.slice(0, separator);
  const encodedSignature = token.slice(separator + 1);
  if (!encodedPayload || !encodedSignature) return null;

  const secret = await getPortalSessionSecretDb();
  if (!secret) return null;
  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest();
  const receivedSignature = Buffer.from(encodedSignature, 'base64url');
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    !isRecord(payload) ||
    typeof payload.customerId !== 'string' ||
    !payload.customerId ||
    typeof payload.phone !== 'string' ||
    !/^\d{8,15}$/.test(payload.phone) ||
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= Date.now()
  ) return null;

  return {
    customerId: payload.customerId,
    phone: payload.phone,
    exp: payload.exp,
  };
}

async function setPortalCustomerSession(
  request: express.Request,
  response: express.Response,
  customer: Customer
): Promise<void> {
  const secret = await getPortalSessionSecretDb();
  if (!secret) throw new Error('Portal session secret is not configured');
  const phone = normalizePortalPhone(customer.phone);
  if (phone.length < 8 || phone.length > 15) throw new Error('Nomor WhatsApp pelanggan tidak valid');

  const payload: PortalCustomerSession = {
    customerId: customer.id,
    phone,
    exp: Date.now() + PORTAL_CUSTOMER_SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  const secure = request.secure || request.get('x-forwarded-proto')?.split(',')[0].trim() === 'https';
  response.setHeader(
    'Set-Cookie',
    `${PORTAL_CUSTOMER_SESSION_COOKIE}=${encodedPayload}.${signature}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(PORTAL_CUSTOMER_SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`
  );
}

function clearPortalCustomerSession(request: express.Request, response: express.Response): void {
  const secure = request.secure || request.get('x-forwarded-proto')?.split(',')[0].trim() === 'https';
  response.setHeader(
    'Set-Cookie',
    `${PORTAL_CUSTOMER_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
  );
}

async function verifyPortalInternalRequest(
  request: express.Request,
  expectedPath: string
): Promise<boolean> {
  const timestamp = request.get('X-Portal-Internal-Timestamp') || '';
  const nonce = request.get('X-Portal-Internal-Nonce') || '';
  const signature = request.get('X-Portal-Internal-Signature') || '';
  const timestampMs = Number(timestamp);
  if (
    request.method !== 'POST' ||
    !isRecord(request.body) ||
    !/^\d{13}$/.test(timestamp) ||
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > 60_000 ||
    !/^[A-Za-z0-9_-]{22}$/.test(nonce) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) return false;

  const secret = await getPortalSessionSecretDb();
  if (!secret) return false;
  const bodyDigest = createHash('sha256').update(JSON.stringify(request.body)).digest('hex');
  const expectedSignature = createHmac('sha256', secret)
    .update(`POST.${expectedPath}.${timestamp}.${nonce}.${bodyDigest}`)
    .digest();
  const receivedSignature = Buffer.from(signature, 'base64url');
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) return false;

  const now = Date.now();
  for (const [key, expiresAt] of portalInternalRequestNonces) {
    if (expiresAt <= now) portalInternalRequestNonces.delete(key);
  }
  if (
    portalInternalRequestNonces.has(nonce) ||
    portalInternalRequestNonces.size >= 20_000
  ) return false;
  portalInternalRequestNonces.set(nonce, now + 60_000);
  return true;
}

function isAppDataSnapshot(value: unknown): value is AppDataSnapshot {
  if (!isRecord(value)) return false;
  const arrayCollections = [
    'customers',
    'invoices',
    'pppoePackages',
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

interface PortalLinkToken {
  invoiceId?: string;
  customerId?: string;
  expiresAt: number;
}

function createPortalLinkToken(
  subject: { invoiceId: string } | { customerId: string },
  expiresAt: number,
  secret: string
): string {
  const type = 'invoiceId' in subject ? 'i' : 'c';
  const id = 'invoiceId' in subject ? subject.invoiceId : subject.customerId;
  const expiresAtSeconds = Math.floor(expiresAt / 1000);
  const payload = `v1.${type}.${Buffer.from(id, 'utf8').toString('base64url')}.${expiresAtSeconds.toString(36)}`;
  const signature = createHmac('sha256', secret).update(payload).digest().subarray(0, 16).toString('base64url');
  return `${payload}.${signature}`;
}

function verifyPortalLinkToken(token: unknown, secret: string): PortalLinkToken | null {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const compactParts = token.split('.');
  if (compactParts.length === 5 && compactParts[0] === 'v1') {
    const [version, type, encodedId, encodedExpiry, signature] = compactParts;
    if (
      version !== 'v1' ||
      (type !== 'i' && type !== 'c') ||
      !/^[A-Za-z0-9_-]{1,512}$/.test(encodedId) ||
      !/^[0-9a-z]{1,8}$/.test(encodedExpiry) ||
      !/^[A-Za-z0-9_-]{22}$/.test(signature)
    ) return null;
    const expected = createHmac('sha256', secret).update(compactParts.slice(0, 4).join('.')).digest().subarray(0, 16);
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const expiresAtSeconds = Number.parseInt(encodedExpiry, 36);
    if (!Number.isSafeInteger(expiresAtSeconds) || expiresAtSeconds * 1000 <= Date.now()) return null;
    const id = Buffer.from(encodedId, 'base64url').toString('utf8');
    if (!id || Buffer.from(id, 'utf8').toString('base64url') !== encodedId) return null;
    return type === 'i'
      ? { invoiceId: id, expiresAt: expiresAtSeconds * 1000 }
      : { customerId: id, expiresAt: expiresAtSeconds * 1000 };
  }

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
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      invoiceId?: unknown;
      customerId?: unknown;
      expiresAt?: unknown;
    };
    if (
      !(
        typeof value.invoiceId === 'string' && value.invoiceId.length > 0 &&
        value.customerId === undefined
      ) &&
      !(
        typeof value.customerId === 'string' && value.customerId.length > 0 &&
        value.invoiceId === undefined
      ) ||
      !Number.isSafeInteger(value.expiresAt) ||
      Number(value.expiresAt) <= Date.now()
    ) return null;
    return {
      ...(typeof value.invoiceId === 'string' ? { invoiceId: value.invoiceId } : {}),
      ...(typeof value.customerId === 'string' ? { customerId: value.customerId } : {}),
      expiresAt: Number(value.expiresAt),
    };
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

  function parsePaymentAppUrl(value: string): URL | null {
    try {
      const configuredUrl = new URL(value);
      const localDevelopmentHost = ['localhost', '127.0.0.1', '::1'].includes(configuredUrl.hostname);
      if (
        configuredUrl.username ||
        configuredUrl.password ||
        !['http:', 'https:'].includes(configuredUrl.protocol) ||
        configuredUrl.pathname !== '/' ||
        configuredUrl.search ||
        configuredUrl.hash ||
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

  function parsePaymentWebhookUrl(value: string): URL | null {
    try {
      const webhookUrl = new URL(value);
      const localDevelopmentHost = ['localhost', '127.0.0.1', '::1'].includes(webhookUrl.hostname);
      if (
        webhookUrl.username ||
        webhookUrl.password ||
        !['http:', 'https:'].includes(webhookUrl.protocol) ||
        webhookUrl.pathname !== '/api/payment/webhook' ||
        webhookUrl.search ||
        webhookUrl.hash ||
        (isProd && webhookUrl.protocol !== 'https:') ||
        (webhookUrl.protocol === 'http:' && !localDevelopmentHost)
      ) {
        return null;
      }
      return webhookUrl;
    } catch {
      return null;
    }
  }

  async function paymentPublicUrlState(): Promise<{
    appUrl: string;
    webhookUrl: string;
    appUrlManagedByEnvironment: boolean;
    webhookUrlManagedByEnvironment: boolean;
    parsedAppUrl: URL | null;
    parsedWebhookUrl: URL | null;
  }> {
    const saved = await getPaymentPublicUrlsDb();
    const appUrlManagedByEnvironment = Boolean(process.env.APP_URL?.trim());
    const webhookUrlManagedByEnvironment = Boolean(process.env.PAYMENT_WEBHOOK_URL?.trim());
    const appUrl = appUrlManagedByEnvironment ? process.env.APP_URL!.trim() : saved.appUrl;
    const webhookUrl = webhookUrlManagedByEnvironment ? process.env.PAYMENT_WEBHOOK_URL!.trim() : saved.webhookUrl;
    return {
      appUrl,
      webhookUrl,
      appUrlManagedByEnvironment,
      webhookUrlManagedByEnvironment,
      parsedAppUrl: appUrl ? parsePaymentAppUrl(appUrl) : null,
      parsedWebhookUrl: webhookUrl ? parsePaymentWebhookUrl(webhookUrl) : null,
    };
  }

  async function configuredPaymentAppUrl(): Promise<URL | null> {
    return (await paymentPublicUrlState()).parsedAppUrl;
  }

  async function configuredPaymentWebhookUrl(): Promise<URL | null> {
    return (await paymentPublicUrlState()).parsedWebhookUrl;
  }

  function formatDateTime(value: string, timezone: string, timeFormat: '24h' | '12h' = '24h'): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    try {
      return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: timeFormat === '12h',
        timeZone: timezone,
        timeZoneName: 'short',
      }).format(date);
    } catch {
      return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: timeFormat === '12h',
        timeZone: 'Asia/Jakarta',
        timeZoneName: 'short',
      }).format(date);
    }
  }

  function createPaymentCode(transactions: PaymentTransaction[], prefix: 'SBM' | 'SBV'): string {
    const existing = new Set(transactions.map(transaction => transaction.paymentCode).filter(Boolean));
    let code = '';
    do {
      code = `${prefix}-${randomBytes(6).toString('hex').toUpperCase()}`;
    } while (existing.has(code));
    return code;
  }

  function normalizeOpenWaSessionStatus(value: unknown): { status?: 'connected' | 'disconnected' | 'scan_qr' | 'starting'; phone?: string } {
    const candidates: unknown[] = [value];
    const visited = new Set<object>();
    while (candidates.length) {
      const candidate = candidates.shift();
      if (!isRecord(candidate) || visited.has(candidate)) continue;
      visited.add(candidate);
      for (const key of ['status', 'state', 'sessionStatus', 'connectionStatus']) {
        const rawStatus = candidate[key];
        if (typeof rawStatus === 'string') {
          const normalized = rawStatus.toLowerCase().replace(/[\s-]+/g, '_');
          if (['connected', 'ready', 'authenticated', 'online', 'open'].includes(normalized)) {
            return { status: 'connected', phone: typeof candidate.phone === 'string' ? candidate.phone : undefined };
          }
          if (['disconnected', 'offline', 'closed', 'not_connected', 'stopped'].includes(normalized)) {
            return { status: 'disconnected', phone: typeof candidate.phone === 'string' ? candidate.phone : undefined };
          }
          if (['scan_qr', 'qr', 'qr_required', 'pairing'].includes(normalized)) {
            return { status: 'scan_qr', phone: typeof candidate.phone === 'string' ? candidate.phone : undefined };
          }
          if (['starting', 'initializing', 'connecting', 'authenticating'].includes(normalized)) {
            return { status: 'starting', phone: typeof candidate.phone === 'string' ? candidate.phone : undefined };
          }
        }
      }
      if (candidate.connected === true || candidate.isConnected === true) {
        return { status: 'connected', phone: typeof candidate.phone === 'string' ? candidate.phone : undefined };
      }
      if (candidate.connected === false || candidate.isConnected === false) {
        return { status: 'disconnected', phone: typeof candidate.phone === 'string' ? candidate.phone : undefined };
      }
      for (const key of ['data', 'session', 'instance', 'result']) {
        if (candidate[key] && typeof candidate[key] === 'object') candidates.push(candidate[key]);
      }
    }
    return {};
  }

  async function paymentGatewayCredentials(): Promise<PaymentGatewayCredentials> {
    const saved = await getPaymentGatewayCredentialsDb();
    if (saved) return saved;
    const legacyMidtransEnabled =
      (!process.env.PAYMENT_GATEWAY || process.env.PAYMENT_GATEWAY === 'midtrans') &&
      Boolean(process.env.MIDTRANS_SERVER_KEY);
    return {
      provider: legacyMidtransEnabled ? 'midtrans' : 'none',
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
      serverKey: process.env.MIDTRANS_SERVER_KEY || '',
      clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
    };
  }

  async function paymentGatewayReady(config: PaymentGatewayCredentials): Promise<boolean> {
    const [appUrl, webhookUrl] = await Promise.all([
      configuredPaymentAppUrl(),
      configuredPaymentWebhookUrl(),
    ]);
    if (!appUrl || !webhookUrl) return false;
    if (config.provider === 'midtrans') return Boolean(config.serverKey);
    if (config.provider === 'doku') return Boolean(config.dokuClientId && config.dokuSecretKey);
    if (config.provider === 'xendit') return Boolean(config.xenditApiKey && config.xenditCallbackToken);
    if (config.provider === 'tripay') {
      return Boolean(config.tripayMerchantCode && config.tripayApiKey && config.tripayPrivateKey);
    }
    return false;
  }

  async function createOnlineCheckout(input: {
    config: PaymentGatewayCredentials;
    orderId: string;
    amount: number;
    itemId: string;
    itemName: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    returnUrl: string;
    successUrl: string;
    failureUrl: string;
  }): Promise<{ redirectUrl: string; provider: 'midtrans' | 'doku' | 'xendit' | 'tripay' }> {
    const { config } = input;
    if (config.provider === 'midtrans' && config.serverKey) {
      const response = await fetch(
        config.isProduction
          ? 'https://app.midtrans.com/snap/v1/transactions'
          : 'https://app.sandbox.midtrans.com/snap/v1/transactions',
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${config.serverKey}:`).toString('base64')}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            transaction_details: { order_id: input.orderId, gross_amount: input.amount },
            item_details: [{
              id: input.itemId.slice(0, 50),
              price: input.amount,
              quantity: 1,
              name: input.itemName.slice(0, 50),
            }],
            customer_details: {
              first_name: input.customerName.slice(0, 50),
              email: input.customerEmail || undefined,
              phone: input.customerPhone,
            },
            callbacks: { finish: input.returnUrl },
            expiry: { unit: 'minute', duration: 1440 },
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      const payload: unknown = await response.json();
      const redirectUrl = isRecord(payload) ? payload.redirect_url : undefined;
      if (!response.ok || typeof redirectUrl !== 'string') {
        const messages = isRecord(payload) && Array.isArray(payload.error_messages)
          ? payload.error_messages.filter((message): message is string => typeof message === 'string').join('; ')
          : `HTTP ${response.status}`;
        throw new Error(`Midtrans gagal membuat checkout: ${messages}`);
      }
      const parsedUrl = new URL(redirectUrl);
      if (
        parsedUrl.protocol !== 'https:' ||
        !['app.midtrans.com', 'app.sandbox.midtrans.com'].includes(parsedUrl.hostname)
      ) {
        throw new Error('Midtrans mengembalikan URL checkout yang tidak valid');
      }
      return { redirectUrl: parsedUrl.toString(), provider: 'midtrans' };
    }

    if (config.provider === 'doku' && config.dokuClientId && config.dokuSecretKey) {
      const endpoint = config.isProduction
        ? 'https://api.doku.com/checkout/v1/payment'
        : 'https://api-sandbox.doku.com/checkout/v1/payment';
      const requestTarget = '/checkout/v1/payment';
      const body = JSON.stringify({
        order: {
          amount: input.amount,
          invoice_number: input.orderId,
          callback_url: input.returnUrl,
          currency: 'IDR',
          line_items: [{
            id: input.itemId.slice(0, 50),
            name: input.itemName.slice(0, 50),
            quantity: 1,
            price: input.amount,
          }],
        },
        payment: { payment_due_date: 1440 },
        customer: {
          name: input.customerName.slice(0, 50),
          phone: input.customerPhone,
          ...(input.customerEmail ? { email: input.customerEmail } : {}),
        },
      });
      const requestId = randomUUID();
      const requestTimestamp = new Date().toISOString();
      const digest = createHash('sha256').update(body).digest('base64');
      const signatureComponent = [
        `Client-Id:${config.dokuClientId}`,
        `Request-Id:${requestId}`,
        `Request-Timestamp:${requestTimestamp}`,
        `Request-Target:${requestTarget}`,
        `Digest:${digest}`,
      ].join('\n');
      const signature = createHmac('sha256', config.dokuSecretKey)
        .update(signatureComponent)
        .digest('base64');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Client-Id': config.dokuClientId,
          'Request-Id': requestId,
          'Request-Timestamp': requestTimestamp,
          Signature: `HMACSHA256=${signature}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body,
        signal: AbortSignal.timeout(15000),
      });
      const payload: unknown = await response.json();
      const payment = isRecord(payload) && isRecord(payload.response)
        ? payload.response.payment
        : undefined;
      const paymentUrl = isRecord(payment) ? payment.url : undefined;
      if (!response.ok || typeof paymentUrl !== 'string') {
        const message = isRecord(payload) && typeof payload.message === 'string'
          ? payload.message
          : `HTTP ${response.status}`;
        throw new Error(`DOKU gagal membuat checkout: ${message}`);
      }
      const parsedUrl = new URL(paymentUrl);
      if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname.endsWith('.doku.com')) {
        throw new Error('DOKU mengembalikan URL checkout yang tidak valid');
      }
      return { redirectUrl: parsedUrl.toString(), provider: 'doku' };
    }

    if (config.provider === 'xendit' && config.xenditApiKey && config.xenditCallbackToken) {
      const body = {
        external_id: input.orderId,
        amount: input.amount,
        currency: 'IDR',
        description: input.itemName.slice(0, 255),
        invoice_duration: 86400,
        success_redirect_url: input.successUrl,
        failure_redirect_url: input.failureUrl,
        ...(input.customerEmail ? { payer_email: input.customerEmail } : {}),
        customer: {
          given_names: input.customerName.slice(0, 255),
          mobile_number: input.customerPhone,
          ...(input.customerEmail ? { email: input.customerEmail } : {}),
        },
        items: [{
          name: input.itemName.slice(0, 255),
          quantity: 1,
          price: input.amount,
        }],
      };
      const response = await fetch('https://api.xendit.co/v2/invoices', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.xenditApiKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const payload: unknown = await response.json();
      const invoiceUrl = isRecord(payload) ? payload.invoice_url : undefined;
      if (!response.ok || typeof invoiceUrl !== 'string') {
        const message = isRecord(payload) && typeof payload.message === 'string'
          ? payload.message
          : `HTTP ${response.status}`;
        throw new Error(`Xendit gagal membuat invoice: ${message}`);
      }
      const parsedUrl = new URL(invoiceUrl);
      if (
        parsedUrl.protocol !== 'https:' ||
        (parsedUrl.hostname !== 'xendit.co' && !parsedUrl.hostname.endsWith('.xendit.co'))
      ) {
        throw new Error('Xendit mengembalikan URL pembayaran yang tidak valid');
      }
      return { redirectUrl: parsedUrl.toString(), provider: 'xendit' };
    }

    if (
      config.provider === 'tripay' &&
      config.tripayMerchantCode &&
      config.tripayApiKey &&
      config.tripayPrivateKey
    ) {
      const webhookUrl = await configuredPaymentWebhookUrl();
      if (!webhookUrl) {
        throw new Error('PAYMENT_WEBHOOK_URL must point to the public SmartBilling /api/payment/webhook endpoint.');
      }
      const endpoint = config.isProduction
        ? 'https://tripay.co.id/api/transaction/create'
        : 'https://tripay.co.id/api-sandbox/transaction/create';
      const signature = createHmac('sha256', config.tripayPrivateKey)
        .update(`${config.tripayMerchantCode}${input.orderId}${input.amount}`)
        .digest('hex');
      const body = {
        method: config.tripayPaymentMethod || 'QRIS',
        merchant_ref: input.orderId,
        amount: input.amount,
        customer_name: input.customerName.slice(0, 100),
        customer_email: input.customerEmail || 'customer@example.com',
        order_items: [{
          sku: input.itemId.slice(0, 50),
          name: input.itemName.slice(0, 100),
          price: input.amount,
          quantity: 1,
        }],
        callback_url: webhookUrl.toString(),
        return_url: input.returnUrl,
        expired_time: Math.floor(Date.now() / 1000) + 86400,
        signature,
      };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.tripayApiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const payload: unknown = await response.json();
      const data = isRecord(payload) ? payload.data : undefined;
      const checkoutUrl = isRecord(data) ? data.checkout_url : undefined;
      if (!response.ok || !isRecord(payload) || payload.success !== true || typeof checkoutUrl !== 'string') {
        const message = isRecord(payload) && typeof payload.message === 'string'
          ? payload.message
          : `HTTP ${response.status}`;
        throw new Error(`Tripay gagal membuat transaksi: ${message}`);
      }
      const parsedUrl = new URL(checkoutUrl);
      if (
        parsedUrl.protocol !== 'https:' ||
        (parsedUrl.hostname !== 'tripay.co.id' && !parsedUrl.hostname.endsWith('.tripay.co.id'))
      ) {
        throw new Error('Tripay mengembalikan URL pembayaran yang tidak valid');
      }
      return { redirectUrl: parsedUrl.toString(), provider: 'tripay' };
    }

    throw new Error('Payment gateway otomatis belum dikonfigurasi');
  }

  app.use(express.json({
    limit: '5mb',
    verify: (request, _response, buffer) => {
      if (request.url?.startsWith('/api/payment/webhook')) {
        (request as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      }
    },
  }));

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

  function buildInvoiceReminderMessage(
    customer: Customer,
    invoice: Invoice,
    paymentUrl: string,
    settings: Awaited<ReturnType<typeof getAppSettingsDb>>,
    paymentConfig: AppDataSnapshot['paymentConfig'] | undefined,
    automaticPaymentAvailable: boolean
  ): string {
    const [year, month] = invoice.dueDate.split('-');
    const period = year && month ? `${month}/${year}` : invoice.periodMonth;
    const currency = settings.currencySymbol || 'Rp';
    const manualMethods = (paymentConfig?.manualPaymentMethods || []).filter(isManualPaymentMethodReady);
    const paymentOptions = manualMethods.map(method => [
      `${method.name}${method.accountNumber ? `: ${method.accountNumber}` : ''}`,
      method.accountHolder || method.serviceName
        ? `Atas nama: ${method.accountHolder || method.serviceName}`
        : '',
      method.instructions.trim(),
    ].filter(Boolean).join('\n')).join('\n\n');
    const paymentLink = automaticPaymentAvailable
      ? `Pembayaran online tersedia 24 jam melalui tautan berikut:\n${paymentUrl}`
      : `Rincian tagihan dan pilihan pembayaran:\n${paymentUrl}`;
    const options = [paymentLink, paymentOptions].filter(Boolean).join('\n\n');
    return renderWhatsAppTemplate('reminder', settings.whatsappTemplates, {
      customer_name: customer.name,
      business_name: settings.companyName.trim() || settings.brandName.trim() || settings.appName,
      invoice_number: invoice.invoiceNumber,
      package_name: customer.servicePackageName || customer.profileName,
      period,
      amount: `${currency} ${invoice.totalAmount.toLocaleString('id-ID')}`,
      due_date: invoice.dueDate,
      payment_url: paymentUrl,
      payment_options: options,
    });

  }

  const invoiceGenerationInProgress = new Map<string, Promise<Invoice | null>>();
  const manualInvoiceCreationInProgress = new Set<string>();
  let monthlyBillingRunInProgress = false;
  async function ensureDueInvoice(
    customerId: string,
    includeDueTomorrow = false,
    createForUpcomingPeriod = false
  ): Promise<Invoice | null> {
    if (monthlyBillingRunInProgress) return null;
    const running = invoiceGenerationInProgress.get(customerId);
    if (running) return running;

    const operation = (async () => {
      const stored = await getAppDataDb();
      const customer = (stored.data.customers || []).find(item => item.id === customerId);
      if (!customer || !Number.isSafeInteger(customer.monthlyFee) || customer.monthlyFee <= 0) return null;
      if (customer.cancelAtExpiry) return null;
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const tomorrowDate = new Date(`${today}T12:00:00+07:00`);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrow = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(tomorrowDate);
      const isDue = customer.status !== 'active' || customer.expiredDate <= today ||
        (includeDueTomorrow && customer.expiredDate <= tomorrow) ||
        (createForUpcomingPeriod && customer.expiredDate > today);
      if (!isDue) return null;

      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(customer.expiredDate) && customer.expiredDate > today
        ? customer.expiredDate
        : today;
      const dueMonthDate = new Date(`${dueDate}T12:00:00+07:00`);
      const periodMonth = new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      }).format(dueMonthDate);
      const invoices = stored.data.invoices || [];
      const unpaid = invoices.find(invoice =>
        invoice.customerId === customer.id && invoice.status === 'unpaid'
      );
      if (unpaid) return unpaid;
      const periodInvoices = invoices.filter(invoice =>
        invoice.customerId === customer.id && invoice.periodMonth === periodMonth
      );
      if (periodInvoices.some(invoice =>
        invoice.status === 'paid' || invoice.status === 'canceled' || invoice.status === 'expired'
      )) return null;

      const periodCode = dueDate.slice(0, 7).replace('-', '');
      const numberPattern = new RegExp(`^INV-${periodCode}-(\\d+)$`);
      const nextNumber = Math.max(0, ...invoices.map(invoice => {
        const match = invoice.invoiceNumber.match(numberPattern);
        return match ? Number(match[1]) : 0;
      })) + 1;
      const uniqueCode = stored.data.paymentConfig?.uniqueAmountEnabled
        ? randomInt(10, 900)
        : 0;
      const scheduledPackage = (stored.data.pppoePackages || []).find(item =>
        item.id === customer.pendingPppoePackageId &&
        item.enabled &&
        item.routerId === customer.routerId
      );
      const invoice: Invoice = {
        id: randomUUID(),
        invoiceNumber: `INV-${periodCode}-${String(nextNumber).padStart(3, '0')}`,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        profileName: scheduledPackage?.name || customer.servicePackageName || customer.profileName,
        periodMonth,
        amount: scheduledPackage?.monthlyFee || customer.monthlyFee,
        uniqueCode,
        totalAmount: (scheduledPackage?.monthlyFee || customer.monthlyFee) + uniqueCode,
        status: 'unpaid',
        dueDate,
      };
      await saveAppDataCollectionDb('invoices', [invoice, ...invoices]);
      return invoice;
    })();

    invoiceGenerationInProgress.set(customerId, operation);
    try {
      return await operation;
    } finally {
      if (invoiceGenerationInProgress.get(customerId) === operation) {
        invoiceGenerationInProgress.delete(customerId);
      }
    }
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
          status: secret.disabled
            ? 'isolated'
            : customer.status === 'isolated' || customer.status === 'disabled'
              ? 'active'
              : customer.status,
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
      ...(profile.poolName ? { addressPool: profile.poolName } : {}),
    });
    await addHotspotUser(router, {
      name: voucher.code,
      password: voucher.password || voucher.code,
      profile: profile.routerProfileName,
      limitUptime: '0s',
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

    const settings = await getAppSettingsDb();
    const deliveryMessage = renderWhatsAppTemplate('voucherDelivery', settings.whatsappTemplates, {
      customer_name: transaction.customerName,
      business_name: settings.companyName.trim() || settings.brandName.trim() || settings.appName,
      package_name: voucher.profileName,
      voucher_code: voucher.code,
      voucher_password: voucher.password || voucher.code,
      validity: voucher.validityDuration,
    });
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

    const invoices = stored.data.invoices || [];
    const invoice = invoices.find(item => item.id === transaction.invoiceId);
    if (!invoice) throw new Error('Invoice tidak ditemukan');
    if (invoice.status !== 'unpaid' && invoice.status !== 'paid') throw new Error('Invoice tidak dapat diselesaikan');
    let updatedCustomers = stored.data.customers || [];
    if (updatedCustomers.some(item => item.id === invoice.customerId && item.cancelAtExpiry)) {
      throw new Error('Langganan dijadwalkan berhenti; pembayaran ini memerlukan rekonsiliasi');
    }
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
        const scheduledPackage = (stored.data.pppoePackages || []).find(item =>
          item.id === customer.pendingPppoePackageId &&
          item.enabled &&
          item.routerId === customer.routerId &&
          invoice.profileName === item.name
        );
        let routerActivated = false;
        let activationNote = 'Akses router belum diaktifkan.';
        try {
          const router = await resolveRouterConnection(customer.routerId);
          if (!router) throw new Error('Kredensial router tidak tersedia');
          await updatePppoeSecret(router, customer.pppoeUsername, {
            disabled: false,
            ...(scheduledPackage ? { profile: scheduledPackage.routerProfileName } : {}),
          });
          routerActivated = true;
          activationNote = scheduledPackage
            ? `Paket PPPoE diubah ke ${scheduledPackage.name} di RouterOS.`
            : 'Akses PPPoE diaktifkan di RouterOS.';
        } catch (activationError) {
          activationNote = `Akses router belum aktif: ${activationError instanceof Error ? activationError.message : String(activationError)}`;
          console.error(`[Payment] Manual invoice ${invoice.invoiceNumber} approved; RouterOS activation failed: ${activationNote}`);
        }
        updatedCustomers = updatedCustomers.map(item => item.id === customer.id
          ? {
            ...item,
            expiredDate: newExpiry.toISOString().slice(0, 10),
            status: routerActivated ? 'active' as const : item.status,
            ...(scheduledPackage ? {
              pppoePackageId: scheduledPackage.id,
              servicePackageName: scheduledPackage.name,
              profileName: scheduledPackage.routerProfileName,
              bandwidthLimit: scheduledPackage.speedLimit,
              monthlyFee: scheduledPackage.monthlyFee,
              pendingPppoePackageId: undefined,
            } : {}),
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
      const token = createPortalLinkToken({ invoiceId: invoice.id }, Date.now() + 30 * 24 * 60 * 60 * 1000, await getOrCreatePortalLinkSecretDb());
      const appUrl = await configuredPaymentAppUrl();
      const billingUrl = appUrl ? `${appUrl.origin}/portal/billing?token=${encodeURIComponent(token)}` : '';
      const settings = await getAppSettingsDb();
      const message = renderWhatsAppTemplate('paymentSuccess', settings.whatsappTemplates, {
        customer_name: customer.name,
        business_name: settings.companyName.trim() || settings.brandName.trim() || settings.appName,
        invoice_number: invoice.invoiceNumber,
        amount: `${settings.currencySymbol || 'Rp'} ${invoice.totalAmount.toLocaleString('id-ID')}`,
        service_until: customer.expiredDate,
      }) + (billingUrl ? `\n\nLihat tagihan berikutnya:\n${billingUrl}` : '');
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
  const isManualPaymentMethodReady = (method: ManualPaymentMethod): boolean => {
    const accountHolder = method.accountHolder || method.serviceName;
    if (
      !method.enabled ||
      typeof method.name !== 'string' ||
      typeof accountHolder !== 'string' ||
      typeof method.accountNumber !== 'string' ||
      typeof method.instructions !== 'string'
    ) return false;
    return Boolean(
      method.name.trim() &&
      accountHolder.trim() &&
      method.accountNumber.trim() &&
      method.instructions.trim()
    );
  };

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

  app.get('/api/portal/status', async (_req, res) => {
    try {
      const settings = await getAppSettingsDb();
      const digits = settings.phoneContact.replace(/[^0-9]/g, '');
      const operatorWhatsapp = digits
        ? (digits.startsWith('0') ? `62${digits.slice(1)}` : digits.startsWith('62') ? digits : `62${digits}`)
        : '';
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        connected: true,
        appName: settings.appName,
        brandName: settings.brandName,
        brandMainLogoDataUrl: settings.brandMainLogoDataUrl || settings.brandLogoDataUrl || '',
        companyName: settings.companyName,
        tagline: settings.tagline,
        officeAddress: settings.officeAddress,
        phoneContact: settings.phoneContact,
        operatorWhatsapp,
      });
    } catch (error) {
      res.status(503).json({ connected: false, error: error instanceof Error ? error.message : 'Billing unavailable' });
    }
  });

  app.get('/api/portal/pppoe-packages', async (_req, res) => {
    try {
      const stored = await getAppDataDb();
      const packages = (stored.data.pppoePackages || [])
        .filter(item => item.enabled && item.routerId && item.routerProfileName)
        .map(({ id, name, speedLimit, monthlyFee, dataLimitMb }) => ({
          id, name, speedLimit, monthlyFee, dataLimitMb,
        }));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ packages });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/portal/auth/send-otp', async (req, res) => {
    const phoneInput = req.body?.phone;
    if (typeof phoneInput !== 'string' || phoneInput.length > 32) {
      return res.status(400).json({ error: 'Nomor WhatsApp tidak valid' });
    }
    const phone = normalizePortalPhone(phoneInput);
    if (phone.length < 8 || phone.length > 15) {
      return res.status(400).json({ error: 'Nomor WhatsApp tidak valid' });
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ipLimit = allowPortalLoginAttempt(`send:ip:${ip}`, 5, 10 * 60_000);
    const phoneLimit = allowPortalLoginAttempt(`send:phone:${phone}`, 3, 10 * 60_000);
    if (!ipLimit.allowed || !phoneLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, phoneLimit.retryAfterSeconds);
      return res.status(429).setHeader('Retry-After', String(retryAfter))
        .json({ error: 'Terlalu banyak permintaan kode. Coba lagi nanti.' });
    }

    try {
      if (!await getPortalSessionSecretDb()) {
        return res.status(503).json({ error: 'Autentikasi portal belum dikonfigurasi oleh administrator' });
      }
      const stored = await getAppDataDb();
      const matchingCustomers = (stored.data.customers || []).filter(customer =>
        canonicalPortalPhone(customer.phone) === canonicalPortalPhone(phone)
      );
      if (!matchingCustomers.length) {
        return res.status(404).json({ error: 'Nomor WhatsApp belum terdaftar sebagai pelanggan' });
      }
      if (matchingCustomers.length > 1) {
        return res.status(409).json({ error: 'Nomor WhatsApp terhubung ke lebih dari satu akun. Hubungi Customer Service.' });
      }
      const customerPhone = normalizePortalPhone(matchingCustomers[0].phone);
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const verificationToken = randomBytes(32).toString('base64url');
      await savePortalOtpChallengeDb(phone, verificationToken, code, Date.now() + 5 * 60_000);
      const message = [
        `Kode verifikasi SmartBilling Anda: ${code}`,
        '',
        'Kode berlaku selama 5 menit. Jangan berikan kode ini kepada siapa pun.',
        'Jika Anda tidak meminta kode ini, abaikan pesan ini.',
      ].join('\n');
      try {
        await sendWhatsAppMessage(customerPhone, message);
      } catch (error) {
        await discardPortalOtpChallengeDb(verificationToken);
        console.error('[Portal OTP] WhatsApp delivery failed:', error);
        return res.status(502).json({ error: 'Kode verifikasi belum dapat dikirim. Coba lagi nanti.' });
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, verificationToken });
    } catch (error) {
      console.error('[Portal OTP] Could not create a login challenge:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Login portal belum dapat diproses' });
    }
  });

  app.post('/api/portal/auth/verify-otp', async (req, res) => {
    const { phone: phoneInput, code, verificationToken } = req.body || {};
    if (
      typeof phoneInput !== 'string' || phoneInput.length > 32 ||
      typeof code !== 'string' || !/^\d{6}$/.test(code) ||
      typeof verificationToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(verificationToken)
    ) {
      return res.status(400).json({ error: 'Permintaan verifikasi tidak valid' });
    }
    const phone = normalizePortalPhone(phoneInput);
    if (phone.length < 8 || phone.length > 15) {
      return res.status(400).json({ error: 'Nomor WhatsApp tidak valid' });
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const rateLimit = allowPortalLoginAttempt(`verify:ip:${ip}`, 5, 10 * 60_000);
    if (!rateLimit.allowed) {
      return res.status(429).setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
        .json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' });
    }

    try {
      const valid = await consumePortalOtpChallengeDb(phone, verificationToken, code);
      if (!valid) return res.status(401).json({ error: 'Kode salah atau kedaluwarsa' });
      const stored = await getAppDataDb();
      const matchingCustomers = (stored.data.customers || []).filter(customer =>
        canonicalPortalPhone(customer.phone) === canonicalPortalPhone(phone)
      );
      if (matchingCustomers.length !== 1) {
        return res.status(matchingCustomers.length ? 409 : 404).json({
          error: matchingCustomers.length
            ? 'Nomor WhatsApp terhubung ke lebih dari satu akun. Hubungi Customer Service.'
            : 'Nomor WhatsApp belum terdaftar sebagai pelanggan',
        });
      }
      await setPortalCustomerSession(req, res, matchingCustomers[0]);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Verifikasi login gagal' });
    }
  });

  app.get('/api/portal/auth/session', async (req, res) => {
    try {
      const session = await getPortalCustomerSession(req);
      if (!session) {
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ authenticated: false });
      }
      const stored = await getAppDataDb();
      const customer = (stored.data.customers || []).find(item => item.id === session.customerId);
      if (!customer || canonicalPortalPhone(customer.phone) !== canonicalPortalPhone(session.phone)) {
        clearPortalCustomerSession(req, res);
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ authenticated: false });
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        authenticated: true,
        customer: { id: customer.id, name: customer.name, phone: customer.phone },
      });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Sesi portal belum dapat dibaca' });
    }
  });

  app.post('/api/portal/auth/logout', (req, res) => {
    clearPortalCustomerSession(req, res);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true });
  });

  app.post('/api/internal/portal/customer', async (req, res) => {
    let session: PortalCustomerSession | null;
    try {
      session = await getPortalCustomerSession(req);
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Sesi Portal belum dapat diverifikasi' });
    }
    const internalAuthorized = !session && await verifyPortalInternalRequest(req, '/api/internal/portal/customer');
    if (!session && !internalAuthorized) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const customerId = session?.customerId || req.body.customerId;
    if (typeof customerId !== 'string' || !customerId.trim() || customerId.length > 128) {
      return res.status(400).json({ error: 'Invalid customer' });
    }
    try {
      const stored = await getAppDataDb();
      const customer = (stored.data.customers || []).find(item => item.id === customerId);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      if (session && canonicalPortalPhone(customer.phone) !== canonicalPortalPhone(session.phone)) {
        clearPortalCustomerSession(req, res);
        return res.status(401).json({ error: 'Sesi pelanggan tidak lagi valid' });
      }
      const currentPackage = (stored.data.pppoePackages || []).find(item =>
        item.id === customer.pppoePackageId ||
        (item.routerId === customer.routerId && item.routerProfileName === customer.profileName)
      );
      const pendingPackage = (stored.data.pppoePackages || []).find(item =>
        item.id === customer.pendingPppoePackageId
      );
      const usage = (await getPppoeUsageDb())[customer.id];
      const currentDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
      const billingDay = Math.max(1, Math.min(31, Math.floor(customer.billingDate || 1)));
      const [year, month, day] = currentDate.split('-').map(Number);
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const cycleDate = day < Math.min(billingDay, daysInMonth)
        ? new Date(Date.UTC(year, month - 2, 1))
        : new Date(Date.UTC(year, month - 1, 1));
      const cycle = `${cycleDate.getUTCFullYear()}-${String(cycleDate.getUTCMonth() + 1).padStart(2, '0')}`;
      const cycleUsage = usage?.billingCycle === cycle ? usage.totalBytes : 0;
      const dataLimitMb = currentPackage?.dataLimitMb;
      const upgradePackages = (stored.data.pppoePackages || [])
        .filter(item =>
          item.enabled &&
          item.routerId === customer.routerId &&
          item.routerProfileName &&
          item.id !== customer.pppoePackageId &&
          item.routerProfileName !== customer.profileName &&
          Number.isSafeInteger(item.monthlyFee) &&
          item.monthlyFee > 0
        )
        .map(({ id, name, speedLimit, monthlyFee, dataLimitMb }) => ({
          id, name, speedLimit, monthlyFee, dataLimitMb,
        }));
      const invoices = (stored.data.invoices || [])
        .filter(item => item.customerId === customer.id)
        .sort((left, right) => right.dueDate.localeCompare(left.dueDate))
        .slice(0, 12)
        .map(invoice => {
          const payment = (stored.data.transactions || [])
            .filter(item => item.orderType === 'invoice' && item.invoiceId === invoice.id)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
          return {
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
            latestPaymentStatus: payment?.status,
            latestPaymentMethod: payment?.paymentMethod,
            latestPaymentChannel: payment?.paymentChannel,
          };
        });
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        customer: {
          id: customer.id,
          customerId: customer.customerId,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
          pppoeUsername: customer.pppoeUsername,
          profileName: customer.servicePackageName || customer.profileName,
          bandwidthLimit: customer.bandwidthLimit,
          monthlyFee: customer.monthlyFee,
          billingDate: customer.billingDate,
          expiredDate: customer.expiredDate,
          status: customer.status,
          dataLimitMb,
          dataUsedBytes: cycleUsage,
          dataRemainingBytes: typeof dataLimitMb === 'number'
            ? Math.max(0, dataLimitMb * 1024 * 1024 - cycleUsage)
            : undefined,
          dataUsageSampledAt: usage?.billingCycle === cycle ? usage.sampledAt : undefined,
          pendingPackageName: pendingPackage?.name,
          cancellationRequestedAt: customer.cancellationRequestedAt,
          cancelAtExpiry: customer.cancelAtExpiry || false,
        },
        invoices,
        upgradePackages,
        paymentAvailable: await paymentGatewayReady(await paymentGatewayCredentials()),
      });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/internal/portal/customer-action', async (req, res) => {
    let session: PortalCustomerSession | null;
    try {
      session = await getPortalCustomerSession(req);
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Sesi Portal belum dapat diverifikasi' });
    }
    const internalAuthorized = !session && await verifyPortalInternalRequest(req, '/api/internal/portal/customer-action');
    if (!session && !internalAuthorized) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { action, packageId } = req.body || {};
    const customerId = session?.customerId || req.body?.customerId;
    if (
      typeof customerId !== 'string' ||
      !customerId.trim() ||
      customerId.length > 128 ||
      (action !== 'schedule-upgrade' && action !== 'cancel-subscription') ||
      (action === 'schedule-upgrade' && (typeof packageId !== 'string' || !packageId.trim()))
    ) {
      return res.status(400).json({ error: 'Permintaan tidak valid' });
    }

    try {
      const stored = await getAppDataDb();
      const customers = stored.data.customers || [];
      const customer = customers.find(item => item.id === customerId);
      if (!customer) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
      if (session && canonicalPortalPhone(customer.phone) !== canonicalPortalPhone(session.phone)) {
        clearPortalCustomerSession(req, res);
        return res.status(401).json({ error: 'Sesi pelanggan tidak lagi valid' });
      }
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
      if (customer.status === 'disabled' || customer.expiredDate <= today) {
        return res.status(409).json({ error: 'Layanan tidak aktif untuk perubahan langganan mandiri' });
      }
      const invoices = stored.data.invoices || [];
      const transactions = stored.data.transactions || [];
      const upcomingInvoices = invoices.filter(invoice =>
        invoice.customerId === customer.id &&
        invoice.status === 'unpaid' &&
        invoice.dueDate >= today
      );
      const unsettledPayments = transactions.filter(transaction =>
        transaction.invoiceId &&
        upcomingInvoices.some(invoice => invoice.id === transaction.invoiceId) &&
        transaction.status === 'pending'
      );
      if (unsettledPayments.length) {
        return res.status(409).json({
          error: 'Pembayaran tagihan berikutnya sedang diproses. Hubungi Customer Service agar perubahan tidak mengganggu transaksi.',
        });
      }

      if (action === 'schedule-upgrade') {
        if (customer.cancelAtExpiry) {
          return res.status(409).json({ error: 'Pembatalan langganan sudah dijadwalkan. Hubungi Customer Service untuk mengubahnya.' });
        }
        const selectedPackage = (stored.data.pppoePackages || []).find(item =>
          item.id === packageId && item.enabled
        );
        if (!selectedPackage) return res.status(404).json({ error: 'Paket yang dipilih tidak tersedia' });
        if (
          selectedPackage.routerId !== customer.routerId ||
          !selectedPackage.routerProfileName ||
          !Number.isSafeInteger(selectedPackage.monthlyFee) ||
          selectedPackage.monthlyFee <= 0
        ) {
          return res.status(409).json({ error: 'Paket tidak kompatibel dengan router pelanggan' });
        }
        if (
          customer.pppoePackageId === selectedPackage.id ||
          (customer.profileName === selectedPackage.routerProfileName &&
            customer.monthlyFee === selectedPackage.monthlyFee)
        ) {
          return res.status(409).json({ error: 'Paket tersebut sudah menjadi paket aktif Anda' });
        }
        const updatedCustomers = customers.map(item => item.id === customer.id
          ? { ...item, pendingPppoePackageId: selectedPackage.id }
          : item
        );
        const updatedInvoices = invoices.map(invoice =>
          upcomingInvoices.some(upcoming => upcoming.id === invoice.id)
            ? {
              ...invoice,
              profileName: selectedPackage.name,
              amount: selectedPackage.monthlyFee,
              totalAmount: selectedPackage.monthlyFee + invoice.uniqueCode,
            }
            : invoice
        );
        await savePublicPaymentUpdateDb(updatedCustomers, updatedInvoices, transactions);
        return res.json({
          ok: true,
          action,
          packageName: selectedPackage.name,
          monthlyFee: selectedPackage.monthlyFee,
          effectiveDate: customer.expiredDate,
          effectiveWhen: 'invoice_paid',
        });
      }

      if (customer.cancelAtExpiry) {
        return res.status(409).json({ error: 'Pembatalan langganan sudah dijadwalkan sebelumnya' });
      }
      const updatedCustomers = customers.map(item => item.id === customer.id
        ? {
          ...item,
          pendingPppoePackageId: undefined,
          cancelAtExpiry: true,
          cancellationRequestedAt: new Date().toISOString(),
        }
        : item
      );
      const updatedInvoices = invoices.map(invoice =>
        upcomingInvoices.some(upcoming => upcoming.id === invoice.id)
          ? {
            ...invoice,
            status: 'canceled' as const,
            canceledAt: new Date().toISOString(),
            cancellationReason: 'subscription_ending' as const,
          }
          : invoice
      );
      await savePublicPaymentUpdateDb(updatedCustomers, updatedInvoices, transactions);
      return res.json({
        ok: true,
        action,
        effectiveDate: customer.expiredDate,
      });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/internal/portal/send-otp', async (req, res) => {
    const requestBody: unknown = req.body;
    const body = isRecord(requestBody) ? requestBody : {};
    const phone = body.phone;
    const code = body.code;
    const verificationToken = body.verificationToken;
    const timestamp = req.get('X-Portal-OTP-Timestamp') || '';
    const nonce = req.get('X-Portal-OTP-Nonce') || '';
    const signature = req.get('X-Portal-OTP-Signature') || '';
    const timestampMs = Number(timestamp);
    if (
      typeof phone !== 'string' ||
      !/^\d{8,15}$/.test(phone) ||
      typeof code !== 'string' ||
      !/^\d{6}$/.test(code) ||
      typeof verificationToken !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(verificationToken) ||
      !/^\d{13}$/.test(timestamp) ||
      !Number.isSafeInteger(timestampMs) ||
      Math.abs(Date.now() - timestampMs) > 60_000 ||
      !/^[A-Za-z0-9_-]{22}$/.test(nonce) ||
      !/^[A-Za-z0-9_-]{43}$/.test(signature)
    ) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const portalSecret = await getPortalSessionSecretDb();
      if (!portalSecret) return res.status(503).json({ error: 'Portal is not configured' });

      const expectedSignature = createHmac('sha256', portalSecret)
        .update(`${timestamp}.${nonce}.${phone}.${code}.${verificationToken}`)
        .digest();
      const receivedSignature = Buffer.from(signature, 'base64url');
      if (
        receivedSignature.length !== expectedSignature.length ||
        !timingSafeEqual(receivedSignature, expectedSignature)
      ) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const now = Date.now();
      for (const [key, expiresAt] of portalOtpRequestNonces) {
        if (expiresAt <= now) portalOtpRequestNonces.delete(key);
      }
      if (portalOtpRequestNonces.has(nonce)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      portalOtpRequestNonces.set(nonce, now + 60_000);

      await savePortalOtpChallengeDb(phone, verificationToken, code, now + 5 * 60_000);
      const message = [
        `Kode verifikasi SmartBilling Anda: ${code}`,
        '',
        'Kode berlaku selama 5 menit. Jangan berikan kode ini kepada siapa pun.',
        'Jika Anda tidak meminta kode ini, abaikan pesan ini.',
      ].join('\n');
      try {
        await sendWhatsAppMessage(phone, message);
      } catch (error) {
        await discardPortalOtpChallengeDb(verificationToken);
        throw error;
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true });
    } catch {
      return res.status(502).json({ error: 'WhatsApp OTP delivery failed' });
    }
  });

  app.post('/api/internal/portal/verify-otp', async (req, res) => {
    if (!await verifyPortalInternalRequest(req, '/api/internal/portal/verify-otp')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { phone, code, verificationToken } = req.body;
    if (
      typeof phone !== 'string' ||
      !/^\d{8,15}$/.test(phone) ||
      typeof code !== 'string' ||
      !/^\d{6}$/.test(code) ||
      typeof verificationToken !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(verificationToken)
    ) {
      return res.status(400).json({ error: 'Invalid OTP challenge' });
    }
    try {
      const valid = await consumePortalOtpChallengeDb(phone, verificationToken, code);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ valid });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'OTP verification failed' });
    }
  });

  app.get('/api/portal/payment-options', async (_req, res) => {
    try {
      const stored = await getAppDataDb();
      const config = stored.data.paymentConfig;
      const gateway = await paymentGatewayCredentials();
      const settings = await getAppSettingsDb();
      const operatorPhone = settings.phoneContact.replace(/[^0-9]/g, '');
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        automaticAvailable: await paymentGatewayReady(gateway),
        provider: gateway.provider,
        manualMethods: (config?.manualPaymentMethods || []).filter(isManualPaymentMethodReady),
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
      const appSettings = await getAppSettingsDb();
      const gateway = await paymentGatewayCredentials();
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
        manualMethod = paymentConfig?.manualPaymentMethods?.find(method =>
          method.id === methodId && isManualPaymentMethodReady(method)
        );
        if (!manualMethod) return res.status(400).json({ error: 'Pilih metode pembayaran manual yang tersedia' });
      } else if (!await paymentGatewayReady(gateway)) {
        return res.status(503).json({ error: 'Gateway otomatis belum siap. Hubungi operator.' });
      }
      if (!Number.isSafeInteger(profile.price) || profile.price <= 0) {
        return res.status(400).json({ error: 'Harga paket tidak valid untuk checkout' });
      }

      const now = new Date();
      const createdAt = now.toISOString();
      const orderId = `SBV-${randomUUID()}`;
      const expiresAt = paymentMode === 'automatic'
        ? new Date(now.getTime() + 1440 * 60_000).toISOString()
        : undefined;
      const vouchers = stored.data.vouchers || [];
      const voucherPrefix = /^[A-Z0-9-]{0,12}$/.test(appSettings.defaultVoucherPrefix)
        ? appSettings.defaultVoucherPrefix
        : 'NET-';
      const voucherLength = Number.isInteger(appSettings.voucherLength) && appSettings.voucherLength >= 4 && appSettings.voucherLength <= 8
        ? appSettings.voucherLength
        : 5;
      let code: string;
      do {
        code = `${voucherPrefix}${Array.from({ length: voucherLength }, () => randomInt(0, 10)).join('')}`;
      } while (vouchers.some(item => item.code === code));
      const transactions = stored.data.transactions || [];
      const paymentCode = paymentMode === 'manual' ? createPaymentCode(transactions, 'SBV') : undefined;
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
        firstUseExpiryEnabled: true,
        batchCode: orderId,
        createdAt,
        customerPhone: phone.trim(),
        paymentMethod: paymentMode === 'manual' ? manualMethod!.name : gateway.provider,
        routerId: profile.routerId,
        orderId,
      };
      const transaction: PaymentTransaction = {
        id: randomUUID(),
        orderId,
        ...(paymentCode ? { paymentCode } : {}),
        orderType: 'voucher',
        amount: profile.price,
        customerName: customerName.trim(),
        customerPhone: phone.trim(),
        customerEmail: typeof email === 'string' && email.trim() ? email.trim() : undefined,
        paymentMethod: paymentMode === 'manual' ? 'manual' : gateway.provider,
        paymentChannel: paymentMode === 'manual'
          ? manualMethod!.id
          : gateway.provider === 'midtrans' ? 'snap' : 'checkout',
        status: 'pending',
        ...(paymentMode === 'automatic' ? { expiryMinutes: 1440 } : {}),
        createdAt,
        ...(expiresAt ? { expiresAt } : {}),
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
          `Yth. Operator, saya ingin mengonfirmasi pembayaran voucher.\n\n` +
          `Kode pembayaran: ${paymentCode}\nPaket: ${profile.name}\nNominal: Rp ${profile.price.toLocaleString('id-ID')}\n` +
          `Metode: ${manualMethod!.name}\nNama pelanggan: ${customerName.trim()}\nNomor WhatsApp: ${phone.trim()}`;
        const operatorUrl = operatorWhatsapp
          ? `https://wa.me/${operatorWhatsapp}?text=${encodeURIComponent(contactMessage)}`
          : '';
        return res.status(201).json({
          orderId,
          paymentCode,
          status: 'pending',
          method: manualMethod,
          amount: profile.price,
          operatorUrl,
          message: 'Pesanan dibuat. Ikuti instruksi transfer, lalu konfirmasikan pembayaran kepada Customer Service melalui WhatsApp.',
        });
      }

      const appUrl = (await configuredPaymentAppUrl())!;
      const checkout = await createOnlineCheckout({
        config: gateway,
        orderId,
        amount: profile.price,
        itemId: profile.id,
        itemName: `Voucher ${profile.name}`,
        customerName: customerName.trim(),
        customerPhone: phone.trim(),
        customerEmail: typeof email === 'string' ? email.trim() || undefined : undefined,
        returnUrl: `${appUrl.origin}/portal?payment=return&tab=voucher&orderId=${encodeURIComponent(orderId)}`,
        successUrl: `${appUrl.origin}/portal?payment=success&tab=voucher&orderId=${encodeURIComponent(orderId)}`,
        failureUrl: `${appUrl.origin}/portal?payment=failed&tab=voucher&orderId=${encodeURIComponent(orderId)}`,
      });
      transaction.paymentMethod = checkout.provider;
      transaction.paymentChannel = checkout.provider === 'midtrans'
        ? 'snap'
        : checkout.provider === 'doku'
          ? 'checkout'
          : checkout.provider;
      transaction.paymentUrl = checkout.redirectUrl;
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
    const { manualPaymentMethods, uniqueAmountEnabled } = req.body || {};
    if (!Array.isArray(manualPaymentMethods) || manualPaymentMethods.length > 8) {
      return res.status(400).json({ error: 'Maksimal 8 metode pembayaran manual dapat disimpan' });
    }
    if (uniqueAmountEnabled !== undefined && typeof uniqueAmountEnabled !== 'boolean') {
      return res.status(400).json({ error: 'Status kode unik nominal pembayaran tidak valid' });
    }
    if (manualPaymentMethods.some((method: unknown) =>
      !isRecord(method) ||
      typeof method.id !== 'string' || !/^[a-z0-9-]{1,32}$/.test(method.id) ||
      typeof method.name !== 'string' || !method.name.trim() || method.name.length > 64 ||
      (method.accountHolder !== undefined && (typeof method.accountHolder !== 'string' || method.accountHolder.length > 100)) ||
      (method.serviceName !== undefined && (typeof method.serviceName !== 'string' || method.serviceName.length > 64)) ||
      (method.accountNumber !== undefined && (typeof method.accountNumber !== 'string' || method.accountNumber.length > 500)) ||
      (method.instructions !== undefined && (typeof method.instructions !== 'string' || method.instructions.length > 1000)) ||
      typeof method.enabled !== 'boolean'
    )) {
      return res.status(400).json({ error: 'Data metode pembayaran tidak valid. Periksa metode, nomor rekening/akun, atas nama, catatan, dan statusnya.' });
    }
    const ids = manualPaymentMethods.map((method: ManualPaymentMethod) => method.id);
    if (new Set(ids).size !== ids.length) return res.status(400).json({ error: 'ID metode pembayaran tidak boleh duplikat' });
    try {
      const stored = await getAppDataDb();
      const normalizedMethods = manualPaymentMethods.map((method: ManualPaymentMethod) => {
        const normalized = {
          ...method,
          name: method.name.trim(),
          accountHolder: method.accountHolder?.trim() || method.serviceName?.trim() || '',
          accountNumber: method.accountNumber?.trim() || '',
          instructions: method.instructions?.trim() || '',
        };
        return {
          ...normalized,
          enabled: isManualPaymentMethodReady({ ...normalized, enabled: method.enabled }),
        };
      });
      const disabledIncompleteMethodIds = normalizedMethods
        .filter((method: ManualPaymentMethod, index: number) =>
          manualPaymentMethods[index].enabled && !method.enabled
        )
        .map((method: ManualPaymentMethod) => method.id);
      const paymentConfig = {
        ...stored.data.paymentConfig,
        manualPaymentMethods: normalizedMethods,
        uniqueAmountEnabled: uniqueAmountEnabled ?? stored.data.paymentConfig?.uniqueAmountEnabled ?? false,
      };
      await saveAppDataCollectionDb('paymentConfig', paymentConfig as AppDataSnapshot['paymentConfig']);
      res.json({
        manualPaymentMethods: paymentConfig.manualPaymentMethods,
        uniqueAmountEnabled: paymentConfig.uniqueAmountEnabled,
        disabledIncompleteMethodIds,
      });
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
    const { id, name, routerId, routerProfileName, poolName, speedLimit, validityPreset, sharedUsers, dataLimitMb } = req.body || {};
    if (
      (id !== undefined && (typeof id !== 'string' || id.length > 128)) ||
      typeof name !== 'string' || !name.trim() || name.length > 64 ||
      typeof routerId !== 'string' || !routerId ||
      typeof routerProfileName !== 'string' || !routerProfileName.trim() || routerProfileName.length > 64 ||
      typeof poolName !== 'string' || poolName.length > 128 ||
      typeof speedLimit !== 'string' || speedLimit.length > 256 ||
      !isHotspotValidityPreset(validityPreset) ||
      !Number.isInteger(sharedUsers) || sharedUsers < 1 || sharedUsers > 100 ||
      (dataLimitMb !== undefined && (!Number.isSafeInteger(dataLimitMb) || dataLimitMb < 0 || dataLimitMb > 1_000_000_000))
    ) {
      return res.status(400).json({ error: 'Data profil layanan hotspot tidak valid' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      if (poolName) {
        const pools = await getRouterPools(router);
        if (!pools.includes(poolName)) return res.status(400).json({ error: 'IP pool tidak ditemukan pada router yang dipilih' });
      }
      await ensureHotspotUserProfile(router, {
        name: routerProfileName,
        rateLimit: speedLimit,
        sharedUsers,
        ...(poolName ? { addressPool: poolName } : {}),
      });
      const stored = await getAppDataDb();
      const serviceProfiles = stored.data.hotspotServiceProfiles || [];
      const profileId = id || randomUUID();
      const profile: HotspotServiceProfile = {
        id: profileId,
        name: name.trim(),
        routerId,
        routerProfileName,
        poolName: poolName || undefined,
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
          poolName: serviceProfile.poolName,
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
          limitUptime: '0s',
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
          firstUseExpiryEnabled: true,
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
      const [profiles, pools] = await Promise.all([getHotspotUserProfiles(router), getRouterPools(router)]);
      res.json({ profiles, pools });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put('/api/mikrotik/hotspot/user-profiles', requireAdminSession, async (req, res) => {
    const { routerId, existingName, profile } = req.body || {};
    if (
      typeof routerId !== 'string' || !routerId ||
      typeof existingName !== 'string' || !existingName || existingName.length > 64 ||
      !isRecord(profile) ||
      typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 64 ||
      typeof profile.rateLimit !== 'string' || profile.rateLimit.length > 256 ||
      typeof profile.sharedUsers !== 'number' || !Number.isInteger(profile.sharedUsers) || profile.sharedUsers < 1 || profile.sharedUsers > 1000 ||
      typeof profile.addressPool !== 'string' || profile.addressPool.length > 128 ||
      typeof profile.sessionTimeout !== 'string' || profile.sessionTimeout.length > 64 ||
      typeof profile.idleTimeout !== 'string' || profile.idleTimeout.length > 64 ||
      !isHotspotValidityPreset(profile.validityPreset) ||
      (profile.dataLimitMb !== undefined && (typeof profile.dataLimitMb !== 'number' || !Number.isSafeInteger(profile.dataLimitMb) || profile.dataLimitMb < 0 || profile.dataLimitMb > 1_000_000_000))
    ) {
      return res.status(400).json({ error: 'Data user profile Hotspot tidak valid' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      const updatedProfile = {
        name: profile.name,
        rateLimit: profile.rateLimit,
        sharedUsers: profile.sharedUsers,
        addressPool: profile.addressPool,
        sessionTimeout: profile.sessionTimeout,
        idleTimeout: profile.idleTimeout,
      };
      await updateHotspotUserProfile(router, existingName, updatedProfile);
      const stored = await getAppDataDb();
      const serviceProfiles = stored.data.hotspotServiceProfiles || [];
      const linkedServiceProfileIds = new Set<string>();
      const updatedServiceProfiles = serviceProfiles.map(serviceProfile => {
        if (serviceProfile.routerId !== routerId || serviceProfile.routerProfileName !== existingName) return serviceProfile;
        linkedServiceProfileIds.add(serviceProfile.id);
        return {
          ...serviceProfile,
          routerProfileName: updatedProfile.name,
          speedLimit: updatedProfile.rateLimit,
          sharedUsers: updatedProfile.sharedUsers,
          poolName: updatedProfile.addressPool || undefined,
          validityPreset: profile.validityPreset as HotspotValidityPreset,
          validityHours: hotspotValidityHours[profile.validityPreset as HotspotValidityPreset],
          dataLimitMb: typeof profile.dataLimitMb === 'number' && profile.dataLimitMb > 0 ? profile.dataLimitMb : undefined,
        };
      });
      const packages = stored.data.hotspotProfiles || [];
      const hasLinkedPackages = packages.some(packageProfile =>
        (packageProfile.serviceProfileId && linkedServiceProfileIds.has(packageProfile.serviceProfileId)) ||
        (packageProfile.routerId === routerId && packageProfile.routerProfileName === existingName)
      );
      if (linkedServiceProfileIds.size || hasLinkedPackages) {
        const updatedPackages = packages.map(packageProfile =>
          (packageProfile.serviceProfileId && linkedServiceProfileIds.has(packageProfile.serviceProfileId)) ||
          (packageProfile.routerId === routerId && packageProfile.routerProfileName === existingName)
            ? {
              ...packageProfile,
              routerProfileName: updatedProfile.name,
              speedLimit: updatedProfile.rateLimit,
              sharedUsers: updatedProfile.sharedUsers,
              poolName: updatedProfile.addressPool || undefined,
              validityDuration: profile.validityPreset as HotspotValidityPreset,
              validityHours: hotspotValidityHours[profile.validityPreset as HotspotValidityPreset],
              dataLimitMb: typeof profile.dataLimitMb === 'number' && profile.dataLimitMb > 0 ? profile.dataLimitMb : undefined,
            }
            : packageProfile
        );
        await saveHotspotProfileDataDb(
          updatedServiceProfiles,
          updatedPackages
        );
      }
      res.json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/mikrotik/hotspot/user-profiles', requireAdminSession, async (req, res) => {
    const { routerId, name } = req.body || {};
    if (typeof routerId !== 'string' || !routerId || typeof name !== 'string' || !name || name.length > 64) {
      return res.status(400).json({ error: 'Router dan nama user profile wajib diisi' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      await deleteHotspotUserProfile(router, name);
      const stored = await getAppDataDb();
      const serviceProfiles = stored.data.hotspotServiceProfiles || [];
      const removedServiceProfileIds = new Set(serviceProfiles
        .filter(profile => profile.routerId === routerId && profile.routerProfileName === name)
        .map(profile => profile.id));
      await saveHotspotProfileDataDb(
        serviceProfiles.filter(profile => !removedServiceProfileIds.has(profile.id)),
        (stored.data.hotspotProfiles || []).filter(profile =>
          (!profile.serviceProfileId || !removedServiceProfileIds.has(profile.serviceProfileId)) &&
          !(profile.routerId === routerId && profile.routerProfileName === name)
        )
      );
      res.json({ status: 'success' });
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

  app.get('/api/mikrotik/hotspot/files', requireAdminSession, async (req, res) => {
    const routerId = String(req.query.routerId || '');
    const directory = typeof req.query.directory === 'string' ? req.query.directory : undefined;
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      res.json(await getHotspotFileListing(router, directory));
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/mikrotik/hotspot/files', requireAdminSession, async (req, res) => {
    const { routerId, directory, name } = req.body || {};
    if (
      typeof routerId !== 'string' || !routerId ||
      typeof directory !== 'string' || !directory || directory.length > 256 ||
      typeof name !== 'string' || !name || name.length > 512
    ) return res.status(400).json({ error: 'Router, direktori, dan nama file wajib diisi' });
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      await deleteHotspotFile(router, directory, name);
      res.json({ status: 'success' });
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

  app.put('/api/mikrotik/hotspot/server-profiles', requireAdminSession, async (req, res) => {
    const { routerId, existingName, profile } = req.body || {};
    if (
      typeof routerId !== 'string' || !routerId ||
      typeof existingName !== 'string' || !existingName || existingName.length > 64 ||
      !isRecord(profile) ||
      typeof profile.name !== 'string' || !/^[A-Za-z0-9_. -]{1,64}$/.test(profile.name) ||
      typeof profile.hotspotAddress !== 'string' || profile.hotspotAddress.length > 128 ||
      typeof profile.dnsName !== 'string' || profile.dnsName.length > 128 ||
      typeof profile.htmlDirectory !== 'string' || profile.htmlDirectory.length > 128 ||
      typeof profile.loginBy !== 'string' || profile.loginBy.length > 128 ||
      typeof profile.useRadius !== 'boolean'
    ) return res.status(400).json({ error: 'Data Hotspot Server Profile tidak valid' });
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      if (profile.name !== existingName) {
        const servers = await getRouterServiceRecords(router, 'hotspot');
        if (servers.some(server => server.profile === existingName)) {
          return res.status(409).json({ error: 'Nama profile tidak dapat diubah selama masih digunakan Hotspot Server. Pindahkan server ke profile lain terlebih dahulu.' });
        }
      }
      await updateHotspotServerProfile(router, existingName, {
        name: profile.name,
        hotspotAddress: profile.hotspotAddress,
        dnsName: profile.dnsName,
        htmlDirectory: profile.htmlDirectory,
        loginBy: profile.loginBy,
        useRadius: profile.useRadius,
      });
      res.json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/mikrotik/hotspot/server-profiles', requireAdminSession, async (req, res) => {
    const { routerId, name } = req.body || {};
    if (typeof routerId !== 'string' || !routerId || typeof name !== 'string' || !name || name.length > 64) {
      return res.status(400).json({ error: 'Router dan nama Hotspot Server Profile wajib diisi' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      const servers = await getRouterServiceRecords(router, 'hotspot');
      if (servers.some(server => server.profile === name)) {
        return res.status(409).json({ error: 'Server profile masih digunakan Hotspot Server. Pindahkan server ke profile lain terlebih dahulu.' });
      }
      await deleteHotspotServerProfile(router, name);
      res.json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/mikrotik/hotspot/users', requireAdminSession, async (req, res) => {
    const routerId = String(req.query.routerId || '');
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      const [users, routerProfiles, stored] = await Promise.all([
        getHotspotUsers(router),
        getHotspotUserProfiles(router),
        getAppDataDb(),
      ]);
      const billingVouchers = stored.data.vouchers || [];
      const billingProfiles = stored.data.hotspotProfiles || [];
      const profilesByName = new Map(routerProfiles.map(profile => [profile.name, profile]));
      const vouchers = users.map(user => {
        const billingVoucher = billingVouchers.find(voucher =>
          voucher.code === user.name && (!voucher.routerId || voucher.routerId === routerId)
        );
        const billingProfile = billingProfiles.find(profile =>
          profile.routerId === routerId && profile.routerProfileName === user.profile
        );
        const routerProfile = profilesByName.get(user.profile);
        const firstUseExpired = Boolean(
          billingVoucher?.firstUseExpiryEnabled &&
          billingVoucher.expiredAt &&
          Date.parse(billingVoucher.expiredAt) <= Date.now()
        );
        return {
          ...(billingVoucher || {}),
          id: `${routerId}:${user.id}`,
          code: user.name,
          password: user.password || billingVoucher?.password || '',
          profileId: user.profile,
          profileName: user.profile || 'Tanpa profile',
          price: billingVoucher?.price || billingProfile?.price || 0,
          validityHours: billingVoucher?.validityHours || billingProfile?.validityHours || 0,
          validityDuration: user.limitUptime || billingVoucher?.validityDuration || 'Tanpa batas',
          speedLimit: routerProfile?.rateLimit || billingVoucher?.speedLimit || billingProfile?.speedLimit || '',
          status: user.disabled || firstUseExpired
            ? 'expired'
            : user.active || billingVoucher?.activatedAt ? 'active' : 'unused',
          batchCode: user.comment || 'MikroTik',
          createdAt: billingVoucher?.createdAt || 'Data langsung dari MikroTik',
          routerId,
          routerUserId: user.id,
          disabled: user.disabled,
          active: user.active,
          limitUptime: user.limitUptime,
          limitBytesTotal: user.limitBytesTotal,
          bytesIn: user.bytesIn,
          bytesOut: user.bytesOut,
          sessionUptime: user.sessionUptime,
          address: user.address,
          macAddress: user.macAddress,
          ...(billingVoucher?.customerPhone ? { customerPhone: billingVoucher.customerPhone } : {}),
        };
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ vouchers });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/mikrotik/hotspot/users', requireAdminSession, async (req, res) => {
    const { routerId, name } = req.body || {};
    if (typeof routerId !== 'string' || !routerId || typeof name !== 'string' || !name || name.length > 128) {
      return res.status(400).json({ error: 'Router dan username voucher wajib diisi' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      const stored = await getAppDataDb();
      const hasPendingPayment = (stored.data.transactions || []).some(transaction =>
        transaction.orderType === 'voucher' &&
        transaction.voucherCode === name &&
        transaction.status === 'pending'
      );
      if (hasPendingPayment) {
        return res.status(409).json({ error: 'Voucher masih memiliki pembayaran yang menunggu. Selesaikan atau batalkan pembayaran sebelum menghapus voucher.' });
      }
      await deleteHotspotUser(router, name);
      await saveAppDataCollectionDb('vouchers', (stored.data.vouchers || []).filter(voucher =>
        voucher.code !== name || (voucher.routerId && voucher.routerId !== routerId)
      ));
      res.json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch('/api/mikrotik/hotspot/users/:routerId/:name', requireAdminSession, async (req, res) => {
    const { password, profile, limitUptime, limitBytesTotal, comment, disabled } = req.body || {};
    const validUptime = (value: string) =>
      value === '' || /^(?:\d+[wdhms])*(?:\d{1,3}:\d{2}:\d{2})?$/i.test(value);
    if (
      (password !== undefined && (
        typeof password !== 'string' || !password || password.length > 128 ||
        password.trim().toLowerCase() === 'undefined'
      )) ||
      (profile !== undefined && (typeof profile !== 'string' || !/^[A-Za-z0-9_. -]{1,64}$/.test(profile))) ||
      (limitUptime !== undefined && (typeof limitUptime !== 'string' || limitUptime.length > 64 || !validUptime(limitUptime))) ||
      (limitBytesTotal !== undefined && (
        typeof limitBytesTotal !== 'number' || !Number.isSafeInteger(limitBytesTotal) || limitBytesTotal < 0
      )) ||
      (comment !== undefined && (typeof comment !== 'string' || comment.length > 200)) ||
      (disabled !== undefined && typeof disabled !== 'boolean') ||
      (password === undefined && profile === undefined && limitUptime === undefined &&
        limitBytesTotal === undefined && comment === undefined && disabled === undefined)
    ) {
      return res.status(400).json({ error: 'Perubahan user Hotspot tidak valid' });
    }
    try {
      const router = await resolveRouterConnection(req.params.routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      if (profile !== undefined) {
        const profiles = await getHotspotUserProfiles(router);
        if (!profiles.some(item => item.name === profile)) {
          return res.status(400).json({ error: 'User profile tidak ditemukan pada router yang dipilih' });
        }
      }
      await updateHotspotUser(router, req.params.name, {
        password,
        profile,
        limitUptime,
        limitBytesTotal,
        comment,
        disabled,
      });
      res.json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/mikrotik/hotspot/active', requireAdminSession, async (req, res) => {
    const { routerId, name } = req.body || {};
    if (typeof routerId !== 'string' || !routerId || typeof name !== 'string' || !name || name.length > 128) {
      return res.status(400).json({ error: 'Router dan username Hotspot wajib diisi' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      await disconnectHotspotUser(router, name);
      res.json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/mikrotik/hotspot/user-profiles', requireAdminSession, async (req, res) => {
    const { routerId, profile } = req.body || {};
    if (
      typeof routerId !== 'string' || !routerId || !isRecord(profile) ||
      typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 64 ||
      (profile.rateLimit !== undefined && (typeof profile.rateLimit !== 'string' || profile.rateLimit.length > 256)) ||
      (profile.sharedUsers !== undefined && (typeof profile.sharedUsers !== 'number' || !Number.isInteger(profile.sharedUsers) || profile.sharedUsers < 1 || profile.sharedUsers > 1000)) ||
      (profile.addressPool !== undefined && (typeof profile.addressPool !== 'string' || profile.addressPool.length > 128)) ||
      (profile.sessionTimeout !== undefined && (typeof profile.sessionTimeout !== 'string' || profile.sessionTimeout.length > 64)) ||
      (profile.idleTimeout !== undefined && (typeof profile.idleTimeout !== 'string' || profile.idleTimeout.length > 64))
    ) return res.status(400).json({ error: 'Data user profile Hotspot tidak valid' });
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      if (typeof profile.addressPool === 'string' && profile.addressPool && profile.addressPool !== 'none') {
        const pools = await getRouterPools(router);
        if (!pools.includes(profile.addressPool)) return res.status(400).json({ error: 'Address pool tidak ditemukan pada router' });
      }
      await addHotspotUserProfile(router, {
        name: profile.name,
        rateLimit: typeof profile.rateLimit === 'string' ? profile.rateLimit : '',
        sharedUsers: typeof profile.sharedUsers === 'number' ? profile.sharedUsers : 1,
        addressPool: typeof profile.addressPool === 'string' ? profile.addressPool : '',
        sessionTimeout: typeof profile.sessionTimeout === 'string' ? profile.sessionTimeout : '',
        idleTimeout: typeof profile.idleTimeout === 'string' ? profile.idleTimeout : '',
      });
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
      let customer = customers.find(item =>
        item.customerId.toLowerCase() === searchValue.toLowerCase()
      );
      if (!customer && normalizedPhone.length >= 8) {
        const matchingCustomers = customers.filter(item =>
          canonicalPortalPhone(item.phone) === canonicalPortalPhone(normalizedPhone)
        );
        if (matchingCustomers.length > 1) {
          return res.status(409).json({ error: 'Nomor WhatsApp terhubung ke lebih dari satu akun. Gunakan ID pelanggan untuk cek tagihan.' });
        }
        customer = matchingCustomers[0];
      }
      if (!customer) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
      await ensureDueInvoice(customer.id);
      const latest = await getAppDataDb();
      const invoices = (latest.data.invoices || [])
        .filter(invoice => invoice.customerId === customer.id)
        .filter(invoice => invoice.status === 'unpaid')
        .map(invoice => ({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            profileName: invoice.profileName,
            periodMonth: invoice.periodMonth,
            amount: invoice.amount,
            uniqueCode: invoice.uniqueCode,
            totalAmount: invoice.totalAmount,
            status: invoice.status,
            dueDate: invoice.dueDate,
          }));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ invoices });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/portal/billing-link', async (req, res) => {
    try {
      const secret = await getOrCreatePortalLinkSecretDb();
      const token = verifyPortalLinkToken(req.body?.token, secret);
      if (!token) return res.status(410).json({ error: 'Tautan tagihan tidak valid atau sudah kedaluwarsa' });
      const stored = await getAppDataDb();
      const invoice = token.invoiceId
        ? (stored.data.invoices || []).find(item => item.id === token.invoiceId)
        : undefined;
      if (token.invoiceId && !invoice) return res.status(404).json({ error: 'Tagihan tidak ditemukan' });
      const customerId = invoice?.customerId || token.customerId;
      if (token.customerId && invoice && token.customerId !== invoice.customerId) {
        return res.status(403).json({ error: 'Tautan pelanggan tidak cocok dengan tagihan' });
      }
      const customer = (stored.data.customers || []).find(item => item.id === customerId);
      if (!customer) return res.status(404).json({ error: 'Data pelanggan tidak ditemukan' });
      await ensureDueInvoice(customer.id);
      const latest = await getAppDataDb();
      const currentInvoices = (latest.data.invoices || []).filter(item =>
        item.customerId === customer.id && (!invoice || item.id === invoice.id)
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        customer: {
          id: customer.id,
          customerId: customer.customerId,
          name: customer.name,
          profileName: customer.servicePackageName || customer.profileName,
          bandwidthLimit: customer.bandwidthLimit,
          monthlyFee: customer.monthlyFee,
          expiredDate: customer.expiredDate,
          status: customer.status === 'active' && customer.expiredDate <= new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
          }).format(new Date()) ? 'expiring' : customer.status,
        },
        invoices: currentInvoices.map(invoice => {
          const payment = (latest.data.transactions || [])
            .filter(item => item.orderType === 'invoice' && item.invoiceId === invoice.id)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
          return {
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
            latestPaymentStatus: payment?.status,
            latestPaymentMethod: payment?.paymentMethod,
            latestPaymentChannel: payment?.paymentChannel,
          };
        }),
        paymentAvailable: await paymentGatewayReady(await paymentGatewayCredentials()),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/admin/customers/:customerId/payment-link', requireAdminSession, async (req, res) => {
    try {
      const stored = await getAppDataDb();
      const customer = (stored.data.customers || []).find(item => item.id === req.params.customerId);
      if (!customer) return res.status(404).json({ error: 'Data pelanggan tidak ditemukan' });
      const createUpcomingInvoice = req.body?.createUpcomingInvoice === true;
      const invoice = await ensureDueInvoice(customer.id, false, createUpcomingInvoice);
      const appUrl = await configuredPaymentAppUrl() || (!isProd ? new URL('http://localhost:3000') : null);
      if (!appUrl) return res.status(503).json({ error: 'APP_URL HTTPS harus dikonfigurasi sebelum membuat tautan pelanggan' });
      const secret = await getOrCreatePortalLinkSecretDb();
      const token = createPortalLinkToken(
        invoice ? { invoiceId: invoice.id } : { customerId: customer.id },
        Date.now() + 30 * 24 * 60 * 60 * 1000,
        secret
      );
      const url = `${appUrl.origin}/portal/billing?token=${encodeURIComponent(token)}`;
      const latest = await getAppDataDb();
      const message = invoice
        ? buildInvoiceReminderMessage(
          customer,
          invoice,
          url,
          await getAppSettingsDb(),
          latest.data.paymentConfig,
          await paymentGatewayReady(await paymentGatewayCredentials())
        )
        : undefined;
      res.json({ url, invoice, message });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/admin/invoices/generate-monthly', requireAdminSession, async (_req, res) => {
    if (
      monthlyBillingRunInProgress ||
      invoiceGenerationInProgress.size > 0 ||
      manualInvoiceCreationInProgress.size > 0
    ) {
      return res.status(409).json({ error: 'Billing run sedang berlangsung. Silakan coba lagi.' });
    }
    monthlyBillingRunInProgress = true;
    try {
      const stored = await getAppDataDb();
      const invoices = stored.data.invoices || [];
      const customers = (stored.data.customers || []).filter(customer =>
        customer.status !== 'disabled' &&
        !customer.cancelAtExpiry &&
        Number.isSafeInteger(customer.monthlyFee) &&
        customer.monthlyFee > 0
      );
      const parts = new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
      }).formatToParts(new Date());
      const yearPart = Number(parts.find(part => part.type === 'year')?.value);
      const monthPart = Number(parts.find(part => part.type === 'month')?.value);
      if (!Number.isInteger(yearPart) || !Number.isInteger(monthPart)) {
        throw new Error('Tidak dapat menentukan periode billing Jakarta');
      }
      const nextBillingMonth = new Date(Date.UTC(yearPart, monthPart, 1));
      const billingYear = nextBillingMonth.getUTCFullYear();
      const billingMonth = nextBillingMonth.getUTCMonth() + 1;
      const invoicePeriod = `${billingYear}${String(billingMonth).padStart(2, '0')}`;
      const billingMonthDate = new Date(Date.UTC(billingYear, billingMonth - 1, 15));
      const periodMonth = new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      }).format(billingMonthDate);
      const periodInvoices = invoices.filter(invoice =>
        invoice.invoiceNumber.startsWith(`INV-${invoicePeriod}-`)
      );
      let nextNumber = Math.max(0, ...periodInvoices.map(invoice => {
        const match = invoice.invoiceNumber.match(new RegExp(`^INV-${invoicePeriod}-(\\d+)$`));
        return match ? Number(match[1]) : 0;
      })) + 1;
      const lastDay = new Date(Date.UTC(billingYear, billingMonth, 0)).getUTCDate();
      const createdInvoices: Invoice[] = [];
      for (const customer of customers) {
        if (invoices.some(invoice =>
          invoice.customerId === customer.id && invoice.periodMonth === periodMonth
        )) continue;
        const billingDay = Number.isInteger(customer.billingDate)
          ? Math.max(1, Math.min(31, customer.billingDate))
          : 1;
        const dueDate = `${billingYear}-${String(billingMonth).padStart(2, '0')}-${String(Math.min(billingDay, lastDay)).padStart(2, '0')}`;
        const uniqueCode = stored.data.paymentConfig?.uniqueAmountEnabled
          ? randomInt(10, 900)
          : 0;
        createdInvoices.push({
          id: randomUUID(),
          invoiceNumber: `INV-${invoicePeriod}-${String(nextNumber++).padStart(3, '0')}`,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          profileName: customer.servicePackageName || customer.profileName,
          periodMonth,
          amount: customer.monthlyFee,
          uniqueCode,
          totalAmount: customer.monthlyFee + uniqueCode,
          status: 'unpaid',
          dueDate,
        });
      }
      if (createdInvoices.length) {
        await saveAppDataCollectionDb('invoices', [...createdInvoices, ...invoices]);
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ periodMonth, invoices: createdInvoices });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      monthlyBillingRunInProgress = false;
    }
  });

  app.post('/api/admin/invoices', requireAdminSession, async (req, res) => {
    const { customerId } = req.body || {};
    if (typeof customerId !== 'string' || !customerId.trim()) {
      return res.status(400).json({ error: 'Pilih pelanggan yang akan ditagih' });
    }
    if (monthlyBillingRunInProgress) {
      return res.status(409).json({ error: 'Billing run sedang berlangsung. Silakan coba lagi.' });
    }
    if (manualInvoiceCreationInProgress.has(customerId)) {
      return res.status(409).json({ error: 'Pembuatan invoice untuk pelanggan ini sedang diproses' });
    }
    manualInvoiceCreationInProgress.add(customerId);
    try {
      const stored = await getAppDataDb();
      const customers = stored.data.customers || [];
      const customer = customers.find(item => item.id === customerId);
      if (!customer) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
      if (!Number.isSafeInteger(customer.monthlyFee) || customer.monthlyFee <= 0) {
        return res.status(400).json({ error: 'Pelanggan belum memiliki biaya paket bulanan yang valid' });
      }
      const invoices = stored.data.invoices || [];
      const outstandingInvoice = invoices.find(item =>
        item.customerId === customer.id && item.status === 'unpaid'
      );
      if (outstandingInvoice) {
        return res.status(409).json({
          error: `Pelanggan sudah memiliki invoice belum lunas ${outstandingInvoice.invoiceNumber}`,
          invoice: outstandingInvoice,
        });
      }

      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(customer.expiredDate) && customer.expiredDate > today
        ? customer.expiredDate
        : today;
      const dueMonthDate = new Date(`${dueDate}T12:00:00+07:00`);
      const periodMonth = new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      }).format(dueMonthDate);
      const periodCode = dueDate.slice(0, 7).replace('-', '');
      const numberPattern = new RegExp(`^INV-${periodCode}-(\\d+)$`);
      const nextNumber = Math.max(0, ...invoices.map(invoice => {
        const match = invoice.invoiceNumber.match(numberPattern);
        return match ? Number(match[1]) : 0;
      })) + 1;
      const uniqueCode = stored.data.paymentConfig?.uniqueAmountEnabled
        ? randomInt(10, 900)
        : 0;
      const invoice: Invoice = {
        id: randomUUID(),
        invoiceNumber: `INV-${periodCode}-${String(nextNumber).padStart(3, '0')}`,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        profileName: customer.servicePackageName || customer.profileName,
        periodMonth,
        amount: customer.monthlyFee,
        uniqueCode,
        totalAmount: customer.monthlyFee + uniqueCode,
        status: 'unpaid',
        dueDate,
      };
      await saveAppDataCollectionDb('invoices', [invoice, ...invoices]);
      res.status(201).json({ invoice });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      manualInvoiceCreationInProgress.delete(customerId);
    }
  });

  app.post('/api/admin/invoices/:invoiceId/cancel', requireAdminSession, async (req, res) => {
    try {
      const stored = await getAppDataDb();
      const invoices = stored.data.invoices || [];
      const invoice = invoices.find(item => item.id === req.params.invoiceId);
      if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
      if (invoice.status !== 'unpaid') {
        return res.status(409).json({ error: 'Hanya invoice belum dibayar yang dapat dibatalkan' });
      }
      const hasSettledTransaction = (stored.data.transactions || []).some(transaction =>
        transaction.orderType === 'invoice' &&
        transaction.invoiceId === invoice.id &&
        transaction.status === 'settlement'
      );
      if (hasSettledTransaction) {
        return res.status(409).json({ error: 'Invoice memiliki pembayaran yang sudah lunas dan tidak dapat dibatalkan' });
      }

      const canceledAt = new Date().toISOString();
      const updatedInvoice: Invoice = {
        ...invoice,
        status: 'canceled',
        canceledAt,
        cancellationReason: 'operator',
      };
      const updatedInvoices = invoices.map(item => item.id === invoice.id ? updatedInvoice : item);
      const updatedTransactions = (stored.data.transactions || []).map(transaction =>
        transaction.orderType === 'invoice' &&
        transaction.invoiceId === invoice.id &&
        transaction.status === 'pending'
          ? { ...transaction, status: 'canceled' as const }
          : transaction
      );
      await savePublicPaymentUpdateDb(
        stored.data.customers || [],
        updatedInvoices,
        updatedTransactions
      );
      return res.json({ invoice: updatedInvoice });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/admin/invoices/history', requireAdminSession, async (_req, res) => {
    try {
      const stored = await getAppDataDb();
      const invoices = stored.data.invoices || [];
      const historyInvoices = invoices.filter(invoice =>
        invoice.status === 'paid' || invoice.status === 'expired' || invoice.status === 'canceled'
      );
      const historyIds = new Set(historyInvoices.map(invoice => invoice.id));
      const pendingInvoices = (stored.data.transactions || [])
        .filter(transaction =>
          transaction.orderType === 'invoice' &&
          transaction.status === 'pending' &&
          transaction.invoiceId &&
          historyIds.has(transaction.invoiceId)
        )
        .map(transaction => transaction.invoiceId);
      if (pendingInvoices.length) {
        return res.status(409).json({
          error: 'Riwayat tidak dapat dihapus karena masih ada pembayaran invoice yang sedang diproses.',
        });
      }

      const deletedIds = historyInvoices.map(invoice => invoice.id);
      await saveAppDataCollectionDb(
        'invoices',
        invoices.filter(invoice => !historyIds.has(invoice.id))
      );
      return res.json({ deletedIds });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/admin/invoices/:invoiceId', requireAdminSession, async (req, res) => {
    try {
      const stored = await getAppDataDb();
      const invoices = stored.data.invoices || [];
      const invoice = invoices.find(item => item.id === req.params.invoiceId);
      if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
      if (invoice.status !== 'paid' && invoice.status !== 'expired' && invoice.status !== 'canceled') {
        return res.status(409).json({ error: 'Hanya invoice dalam riwayat yang dapat dihapus' });
      }
      const hasPendingPayment = (stored.data.transactions || []).some(transaction =>
        transaction.orderType === 'invoice' &&
        transaction.invoiceId === invoice.id &&
        transaction.status === 'pending'
      );
      if (hasPendingPayment) {
        return res.status(409).json({ error: 'Invoice memiliki pembayaran yang sedang diproses dan belum dapat dihapus' });
      }
      await saveAppDataCollectionDb(
        'invoices',
        invoices.filter(item => item.id !== invoice.id)
      );
      return res.json({ deletedIds: [invoice.id] });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  const paymentCheckoutInProgress = new Set<string>();
  app.post('/api/admin/invoices/:invoiceId/payment-link', requireAdminSession, async (req, res) => {
    try {
      const stored = await getAppDataDb();
      const invoice = (stored.data.invoices || []).find(item => item.id === req.params.invoiceId && item.status === 'unpaid');
      if (!invoice) return res.status(404).json({ error: 'Invoice belum lunas tidak ditemukan' });
      const appUrl = await configuredPaymentAppUrl() || (!isProd ? new URL('http://localhost:3000') : null);
      if (!appUrl) return res.status(503).json({ error: 'APP_URL HTTPS harus dikonfigurasi sebelum membuat tautan pembayaran' });
      const secret = await getOrCreatePortalLinkSecretDb();
      const token = createPortalLinkToken({ invoiceId: invoice.id }, Date.now() + 30 * 24 * 60 * 60 * 1000, secret);
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
      const gateway = await paymentGatewayCredentials();
      const customers = stored.data.customers || [];
      let customer: Customer | undefined;
      if (typeof portalToken === 'string') {
        const secret = await getOrCreatePortalLinkSecretDb();
        const token = verifyPortalLinkToken(portalToken, secret);
        if (!token || (token.invoiceId && token.invoiceId !== invoiceId)) {
          return res.status(410).json({ error: 'Tautan tagihan tidak valid atau sudah kedaluwarsa' });
        }
        const linkedInvoice = (stored.data.invoices || []).find(item => item.id === invoiceId);
        if (token.customerId && linkedInvoice?.customerId !== token.customerId) {
          return res.status(403).json({ error: 'Tautan pelanggan tidak cocok dengan tagihan' });
        }
        customer = customers.find(item => item.id === linkedInvoice?.customerId);
      } else {
        const searchValue = lookupValue.trim();
        const normalizedPhone = searchValue.replace(/[^0-9]/g, '');
        customer = customers.find(item =>
          item.customerId.toLowerCase() === searchValue.toLowerCase()
        ) || (normalizedPhone.length >= 8
          ? customers.find(item =>
            canonicalPortalPhone(item.phone) === canonicalPortalPhone(normalizedPhone)
          )
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
        const method = paymentConfig?.manualPaymentMethods?.find(item => item.id === methodId && isManualPaymentMethodReady(item));
        if (!method) return res.status(400).json({ error: 'Pilih metode pembayaran manual yang tersedia' });
        const existingManualRequest = (stored.data.transactions || []).find(item =>
          item.invoiceId === invoice.id &&
          item.paymentMethod === 'manual' &&
          item.status === 'pending'
        );
        if (existingManualRequest) {
          return res.status(409).json({ error: `Pembayaran manual sudah menunggu persetujuan (${existingManualRequest.paymentCode || 'kode tersimpan'})` });
        }
        const createdAt = new Date();
        const transactions = stored.data.transactions || [];
        const orderId = `SBM-${randomUUID()}`;
        const paymentCode = createPaymentCode(transactions, 'SBM');
        const transaction: PaymentTransaction = {
          id: randomUUID(),
          orderId,
          paymentCode,
          orderType: 'invoice',
          amount: invoice.totalAmount,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email || undefined,
          paymentMethod: 'manual',
          paymentChannel: method.id,
          status: 'pending',
          createdAt: createdAt.toISOString(),
          invoiceId: invoice.id,
        };
        await saveAppDataCollectionDb('transactions', [transaction, ...transactions]);
        const appSettings = await getAppSettingsDb();
        const operatorNumber = appSettings.phoneContact.replace(/[^0-9]/g, '');
        const operatorWhatsapp = operatorNumber
          ? (operatorNumber.startsWith('0') ? `62${operatorNumber.slice(1)}` : operatorNumber)
          : '';
        const contactMessage =
          `Yth. Operator, saya ingin mengonfirmasi pembayaran tagihan.\n\nKode pembayaran: ${paymentCode}\n` +
          `Invoice: ${invoice.invoiceNumber}\nNominal: ${appSettings.currencySymbol || 'Rp'} ${invoice.totalAmount.toLocaleString('id-ID')}\n` +
          `Metode: ${method.name}\nNama pelanggan: ${customer.name}\nNomor WhatsApp: ${customer.phone}`;
        const operatorUrl = operatorWhatsapp
          ? `https://wa.me/${operatorWhatsapp}?text=${encodeURIComponent(contactMessage)}`
          : '';
        try {
          await sendWhatsAppMessage(
            customer.phone,
            renderWhatsAppTemplate('manualInvoice', appSettings.whatsappTemplates, {
              customer_name: customer.name,
              business_name: appSettings.companyName.trim() || appSettings.brandName.trim() || appSettings.appName,
              invoice_number: invoice.invoiceNumber,
              payment_code: paymentCode,
              amount: `${appSettings.currencySymbol || 'Rp'} ${invoice.totalAmount.toLocaleString('id-ID')}`,
              method: method.name,
              account_holder: method.accountHolder || method.serviceName || '-',
              account_number: method.accountNumber || '-',
              notes: method.instructions,
              expires_at: 'Tidak ada batas waktu',
              operator_url: operatorUrl || 'Hubungi nomor WhatsApp operator yang tersedia.',
            })
          );
        } catch (error) {
          console.error(`[WhatsApp] Could not send manual invoice payment instructions for ${transaction.orderId}:`, error);
        }
        return res.status(201).json({
          status: 'pending',
          orderId: transaction.orderId,
          paymentCode,
          operatorUrl,
          message: 'Kode bayar dibuat. Hubungi operator melalui WhatsApp setelah menyelesaikan transfer.',
        });
      }

      const appUrl = await configuredPaymentAppUrl();
      if (!await paymentGatewayReady(gateway) || !appUrl) {
        return res.status(503).json({ error: 'Gateway otomatis belum dikonfigurasi oleh administrator' });
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
        const checkout = await createOnlineCheckout({
          config: gateway,
          orderId,
          amount: invoice.totalAmount,
          itemId: invoice.id,
          itemName: `Tagihan ${invoice.invoiceNumber}`,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email || undefined,
          returnUrl: portalToken
            ? `${appUrl.origin}/portal/billing?token=${encodeURIComponent(portalToken)}&payment=return`
            : `${appUrl.origin}/portal?payment=return&tab=customer&invoiceId=${encodeURIComponent(invoice.id)}`,
          successUrl: portalToken
            ? `${appUrl.origin}/portal/billing?token=${encodeURIComponent(portalToken)}&payment=success`
            : `${appUrl.origin}/portal?payment=success&tab=customer&invoiceId=${encodeURIComponent(invoice.id)}`,
          failureUrl: portalToken
            ? `${appUrl.origin}/portal/billing?token=${encodeURIComponent(portalToken)}&payment=failed`
            : `${appUrl.origin}/portal?payment=failed&tab=customer&invoiceId=${encodeURIComponent(invoice.id)}`,
        });

        const transaction: PaymentTransaction = {
          id: randomUUID(),
          orderId,
          orderType: 'invoice',
          amount: invoice.totalAmount,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email || undefined,
          paymentMethod: checkout.provider,
          paymentChannel: checkout.provider === 'midtrans'
            ? 'snap'
            : checkout.provider === 'doku'
              ? 'checkout'
              : checkout.provider,
          status: 'pending',
          paymentUrl: checkout.redirectUrl,
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

  app.get('/api/payment/config', requireAdminSession, async (_req, res) => {
    try {
      const config = await paymentGatewayCredentials();
      const publicUrls = await paymentPublicUrlState();
      const appOrigin = publicUrls.parsedAppUrl?.origin || '';
      const webhookUrl = publicUrls.webhookUrl;
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        provider: config.provider,
        isProduction: config.isProduction,
        serverKeyConfigured: Boolean(config.serverKey),
        clientKeyConfigured: Boolean(config.clientKey),
        dokuClientIdConfigured: Boolean(config.dokuClientId),
        dokuSecretKeyConfigured: Boolean(config.dokuSecretKey),
        xenditApiKeyConfigured: Boolean(config.xenditApiKey),
        xenditCallbackTokenConfigured: Boolean(config.xenditCallbackToken),
        tripayMerchantCode: config.tripayMerchantCode || '',
        tripayApiKeyConfigured: Boolean(config.tripayApiKey),
        tripayPrivateKeyConfigured: Boolean(config.tripayPrivateKey),
        tripayPaymentMethod: config.tripayPaymentMethod || 'QRIS',
        appUrlConfigured: Boolean(appOrigin),
        webhookUrlConfigured: Boolean(publicUrls.parsedWebhookUrl),
        appUrl: publicUrls.appUrl,
        webhookUrl,
        appUrlManagedByEnvironment: publicUrls.appUrlManagedByEnvironment,
        webhookUrlManagedByEnvironment: publicUrls.webhookUrlManagedByEnvironment,
        checkoutEnabled: await paymentGatewayReady(config),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put('/api/payment/config', requireAdminSession, async (req, res) => {
    const { provider, isProduction } = req.body || {};
    if (
      !['none', 'midtrans', 'doku', 'xendit', 'tripay'].includes(provider) ||
      typeof isProduction !== 'boolean'
    ) {
      return res.status(400).json({ error: 'Pilih satu gateway otomatis valid atau nonaktifkan gateway otomatis' });
    }
    try {
      const savedPublicUrls = await getPaymentPublicUrlsDb();
      const appUrlManagedByEnvironment = Boolean(process.env.APP_URL?.trim());
      const webhookUrlManagedByEnvironment = Boolean(process.env.PAYMENT_WEBHOOK_URL?.trim());
      const appUrl = appUrlManagedByEnvironment
        ? savedPublicUrls.appUrl
        : typeof req.body.appUrl === 'string' ? req.body.appUrl.trim() : savedPublicUrls.appUrl;
      const webhookUrl = webhookUrlManagedByEnvironment
        ? savedPublicUrls.webhookUrl
        : typeof req.body.webhookUrl === 'string' ? req.body.webhookUrl.trim() : savedPublicUrls.webhookUrl;
      if (
        (!appUrlManagedByEnvironment && req.body.appUrl !== undefined &&
          (typeof req.body.appUrl !== 'string' || (appUrl && !parsePaymentAppUrl(appUrl)))) ||
        (!webhookUrlManagedByEnvironment && req.body.webhookUrl !== undefined &&
          (typeof req.body.webhookUrl !== 'string' || (webhookUrl && !parsePaymentWebhookUrl(webhookUrl))))
      ) {
        return res.status(400).json({
          error: 'APP_URL harus berupa origin Portal yang valid, dan webhook harus berakhir tepat di /api/payment/webhook. Gunakan HTTPS untuk domain publik.',
        });
      }

      const previous = await paymentGatewayCredentials();
      const config: PaymentGatewayCredentials = {
        provider,
        isProduction,
      };
      if (provider === 'midtrans') {
        const serverKey = req.body.serverKey || (previous.provider === provider ? previous.serverKey : '');
        const clientKey = req.body.clientKey || (previous.provider === provider ? previous.clientKey : '');
        if (
          typeof serverKey !== 'string' || serverKey.length > 512 ||
          typeof clientKey !== 'string' || clientKey.length > 512 ||
          !serverKey.trim()
        ) {
          return res.status(400).json({ error: 'Server Key Midtrans wajib diisi' });
        }
        config.serverKey = serverKey.trim();
        config.clientKey = clientKey.trim();
      } else if (provider === 'doku') {
        const dokuClientId = req.body.dokuClientId || (previous.provider === provider ? previous.dokuClientId : '');
        const dokuSecretKey = req.body.dokuSecretKey || (previous.provider === provider ? previous.dokuSecretKey : '');
        if (
          typeof dokuClientId !== 'string' || dokuClientId.length > 256 ||
          typeof dokuSecretKey !== 'string' || dokuSecretKey.length > 512 ||
          !dokuClientId.trim() || !dokuSecretKey.trim()
        ) {
          return res.status(400).json({ error: 'Client ID dan Secret Key DOKU wajib diisi' });
        }
        config.dokuClientId = dokuClientId.trim();
        config.dokuSecretKey = dokuSecretKey.trim();
      } else if (provider === 'xendit') {
        const xenditApiKey = req.body.xenditApiKey || (previous.provider === provider ? previous.xenditApiKey : '');
        const xenditCallbackToken = req.body.xenditCallbackToken || (previous.provider === provider ? previous.xenditCallbackToken : '');
        if (
          typeof xenditApiKey !== 'string' || xenditApiKey.length > 512 ||
          typeof xenditCallbackToken !== 'string' || xenditCallbackToken.length > 512 ||
          !xenditApiKey.trim() || !xenditCallbackToken.trim()
        ) {
          return res.status(400).json({ error: 'API Key dan Callback Token Xendit wajib diisi' });
        }
        config.xenditApiKey = xenditApiKey.trim();
        config.xenditCallbackToken = xenditCallbackToken.trim();
      } else if (provider === 'tripay') {
        const tripayMerchantCode = req.body.tripayMerchantCode || (previous.provider === provider ? previous.tripayMerchantCode : '');
        const tripayApiKey = req.body.tripayApiKey || (previous.provider === provider ? previous.tripayApiKey : '');
        const tripayPrivateKey = req.body.tripayPrivateKey || (previous.provider === provider ? previous.tripayPrivateKey : '');
        const tripayPaymentMethod = req.body.tripayPaymentMethod || (previous.provider === provider ? previous.tripayPaymentMethod : 'QRIS');
        if (
          typeof tripayMerchantCode !== 'string' || tripayMerchantCode.length > 128 || !tripayMerchantCode.trim() ||
          typeof tripayApiKey !== 'string' || tripayApiKey.length > 512 || !tripayApiKey.trim() ||
          typeof tripayPrivateKey !== 'string' || tripayPrivateKey.length > 512 || !tripayPrivateKey.trim() ||
          typeof tripayPaymentMethod !== 'string' || !/^[A-Z0-9_]{2,40}$/.test(tripayPaymentMethod)
        ) {
          return res.status(400).json({ error: 'Merchant Code, API Key, Private Key, dan metode pembayaran Tripay wajib valid' });
        }
        config.tripayMerchantCode = tripayMerchantCode.trim();
        config.tripayApiKey = tripayApiKey.trim();
        config.tripayPrivateKey = tripayPrivateKey.trim();
        config.tripayPaymentMethod = tripayPaymentMethod;
      }
      const credentialsChanged =
        config.provider !== previous.provider ||
        config.isProduction !== previous.isProduction ||
        config.serverKey !== previous.serverKey ||
        config.dokuClientId !== previous.dokuClientId ||
        config.dokuSecretKey !== previous.dokuSecretKey ||
        config.xenditApiKey !== previous.xenditApiKey ||
        config.xenditCallbackToken !== previous.xenditCallbackToken ||
        config.tripayMerchantCode !== previous.tripayMerchantCode ||
        config.tripayApiKey !== previous.tripayApiKey ||
        config.tripayPrivateKey !== previous.tripayPrivateKey ||
        config.tripayPaymentMethod !== previous.tripayPaymentMethod;
      if (credentialsChanged && previous.provider !== 'none') {
        const stored = await getAppDataDb();
        const pendingOrders = (stored.data.transactions || []).filter(transaction =>
          transaction.paymentMethod === previous.provider &&
          transaction.status === 'pending' &&
          Boolean(transaction.paymentUrl)
        );
        if (pendingOrders.length) {
          return res.status(409).json({
            error: `Tidak dapat mengganti gateway karena masih ada ${pendingOrders.length} pembayaran ${previous.provider.toUpperCase()} yang menunggu konfirmasi.`,
          });
        }
      }
      await savePaymentGatewayCredentialsDb(config);
      if (
        (!appUrlManagedByEnvironment && req.body.appUrl !== undefined) ||
        (!webhookUrlManagedByEnvironment && req.body.webhookUrl !== undefined)
      ) {
        await savePaymentPublicUrlsDb({ appUrl, webhookUrl });
      }
      const publicUrls = await paymentPublicUrlState();
      res.json({
        provider: config.provider,
        isProduction: config.isProduction,
        serverKeyConfigured: Boolean(config.serverKey),
        clientKeyConfigured: Boolean(config.clientKey),
        dokuClientIdConfigured: Boolean(config.dokuClientId),
        dokuSecretKeyConfigured: Boolean(config.dokuSecretKey),
        xenditApiKeyConfigured: Boolean(config.xenditApiKey),
        xenditCallbackTokenConfigured: Boolean(config.xenditCallbackToken),
        tripayMerchantCode: config.tripayMerchantCode || '',
        tripayApiKeyConfigured: Boolean(config.tripayApiKey),
        tripayPrivateKeyConfigured: Boolean(config.tripayPrivateKey),
        tripayPaymentMethod: config.tripayPaymentMethod || 'QRIS',
        appUrlConfigured: Boolean(publicUrls.parsedAppUrl),
        webhookUrlConfigured: Boolean(publicUrls.parsedWebhookUrl),
        appUrl: publicUrls.appUrl,
        webhookUrl: publicUrls.webhookUrl,
        appUrlManagedByEnvironment: publicUrls.appUrlManagedByEnvironment,
        webhookUrlManagedByEnvironment: publicUrls.webhookUrlManagedByEnvironment,
        checkoutEnabled: await paymentGatewayReady(config),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/payment/manual-options', requireAdminSession, async (_req, res) => {
    try {
      const stored = await getAppDataDb();
      res.json({
        manualPaymentMethods: stored.data.paymentConfig?.manualPaymentMethods || [],
        uniqueAmountEnabled: stored.data.paymentConfig?.uniqueAmountEnabled ?? false,
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
      const logoFields = ['brandMainLogoDataUrl', 'brandIconDataUrl', 'brandLogoDataUrl'] as const;
      for (const field of logoFields) {
        const logoDataUrl = settingsInput[field];
        if (logoDataUrl === undefined) continue;
        if (typeof logoDataUrl !== 'string') {
          return res.status(400).json({ error: 'Format gambar brand tidak valid' });
        }
        if (!logoDataUrl) continue;
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(logoDataUrl);
        if (!match) {
          return res.status(400).json({ error: 'Logo utama dan icon harus berupa PNG, JPG, atau WebP yang valid' });
        }
        const image = Buffer.from(match[2], 'base64');
        if (!image.length || image.length > 1024 * 1024) {
          return res.status(400).json({ error: 'Ukuran setiap logo maksimal 1 MB' });
        }
        const isPng = match[1] === 'image/png' &&
          image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const isJpeg = match[1] === 'image/jpeg' &&
          image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
        const isWebp = match[1] === 'image/webp' &&
          image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP';
        if (!isPng && !isJpeg && !isWebp) {
          return res.status(400).json({ error: 'Isi file tidak cocok dengan format gambar brand' });
        }
      }
      if (
        (settingsInput.defaultVoucherPrefix !== undefined &&
          (typeof settingsInput.defaultVoucherPrefix !== 'string' ||
            settingsInput.defaultVoucherPrefix.length > 12 ||
            !/^[A-Z0-9-]*$/i.test(settingsInput.defaultVoucherPrefix))) ||
        (settingsInput.voucherLength !== undefined &&
          (!Number.isInteger(settingsInput.voucherLength) ||
            Number(settingsInput.voucherLength) < 4 ||
            Number(settingsInput.voucherLength) > 8))
      ) {
        return res.status(400).json({ error: 'Format voucher tidak valid. Prefix hanya boleh berisi huruf, angka, tanda hubung (maks. 12 karakter), dan panjang angka harus 4-8.' });
      }
      if (settingsInput.timezone !== undefined) {
        if (typeof settingsInput.timezone !== 'string' || settingsInput.timezone.length > 80) {
          return res.status(400).json({ error: 'Zona waktu tidak valid' });
        }
        if (settingsInput.timeFormat !== undefined && settingsInput.timeFormat !== '24h' && settingsInput.timeFormat !== '12h') {
          return res.status(400).json({ error: 'Format jam harus 24h atau 12h' });
        }
        try {
          new Intl.DateTimeFormat('id-ID', { timeZone: settingsInput.timezone });
        } catch {
          return res.status(400).json({ error: 'Zona waktu tidak dikenali' });
        }
      }
      if (settingsInput.whatsappTemplates !== undefined) {
        const templateKeys = ['reminder', 'isolir', 'paymentSuccess', 'manualInvoice', 'manualVoucher', 'voucherDelivery'];
        if (!isRecord(settingsInput.whatsappTemplates) || Object.entries(settingsInput.whatsappTemplates).some(([key, value]) =>
          !templateKeys.includes(key) || typeof value !== 'string' || value.length > 4000
        )) {
          return res.status(400).json({ error: 'Template WhatsApp tidak valid atau melebihi 4000 karakter' });
        }
      }
      if (typeof settingsInput.defaultVoucherPrefix === 'string') {
        settingsInput.defaultVoucherPrefix = settingsInput.defaultVoucherPrefix.toUpperCase();
      }
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

  app.get('/api/security/portal-session-secret', requireAdminSession, async (req, res) => {
    try {
      const secret = await getPortalSessionSecretDb();
      res.json({
        configured: Boolean(secret),
        ...(req.query.reveal === 'true' ? { secret } : {}),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/security/portal-session-secret', requireAdminSession, async (_req, res) => {
    try {
      const secret = await generatePortalSessionSecretDb();
      res.json({ configured: true, secret });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
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

  app.get('/api/mikrotik/logs', requireAdminSession, async (req, res) => {
    const routerId = String(req.query.routerId || '');
    if (!routerId || routerId.length > 128) {
      return res.status(400).json({ error: 'Router wajib dipilih' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      const entries = await getRouterLogs(router, 50);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ routerId, entries, sampledAt: new Date().toISOString() });
    } catch (error) {
      return res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/mikrotik/interface-traffic', requireAdminSession, async (req, res) => {
    const routerId = String(req.query.routerId || '');
    const interfaceName = String(req.query.interface || '');
    if (
      !routerId ||
      !interfaceName.trim() ||
      interfaceName.length > 128 ||
      /[\u0000-\u001f\u007f]/.test(interfaceName)
    ) {
      return res.status(400).json({ error: 'Router dan nama interface yang valid wajib dipilih' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      const traffic = await getRouterInterfaceTraffic(router, interfaceName);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ routerId, interface: interfaceName, ...traffic, sampledAt: new Date().toISOString() });
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

  app.get('/api/mikrotik/pppoe/live', requireAdminSession, async (req, res) => {
    const routerId = String(req.query.routerId || '');
    if (!routerId) return res.status(400).json({ error: 'Router wajib dipilih' });
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      const [secrets, sessions] = await Promise.all([
        getPppoeSecrets(router),
        getPppoeActiveSessions(router),
      ]);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ routerId, secrets, sessions, sampledAt: new Date().toISOString() });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/mikrotik/pppoe/active/:routerId/:username', requireAdminSession, async (req, res) => {
    try {
      const router = await resolveRouterConnection(req.params.routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      const disconnected = await disconnectPppoeSessions(router, req.params.username);
      res.json({ status: 'success', disconnected });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/mikrotik/pppoe/profiles', requireAdminSession, async (req, res) => {
    const { routerId, profile } = req.body || {};
    if (
      typeof routerId !== 'string' || !routerId || !isRecord(profile) ||
      typeof profile.name !== 'string' || !/^[A-Za-z0-9_. -]{1,64}$/.test(profile.name) ||
      (profile.localAddress !== undefined && (typeof profile.localAddress !== 'string' || profile.localAddress.length > 128)) ||
      (profile.remoteAddress !== undefined && (typeof profile.remoteAddress !== 'string' || profile.remoteAddress.length > 128)) ||
      (profile.rateLimit !== undefined && (typeof profile.rateLimit !== 'string' || profile.rateLimit.length > 128)) ||
      (profile.dnsServers !== undefined && (typeof profile.dnsServers !== 'string' || profile.dnsServers.length > 128))
    ) return res.status(400).json({ error: 'Konfigurasi PPP Profile tidak valid' });
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      if (profile.remoteAddress) {
        const pools = await getRouterPools(router);
        if (!pools.includes(profile.remoteAddress as string)) return res.status(400).json({ error: 'Remote address harus menggunakan IP pool yang tersedia pada router' });
      }
      await addPppProfile(router, {
        name: profile.name,
        localAddress: typeof profile.localAddress === 'string' ? profile.localAddress : '',
        remoteAddress: typeof profile.remoteAddress === 'string' ? profile.remoteAddress : '',
        rateLimit: typeof profile.rateLimit === 'string' ? profile.rateLimit : '',
        dnsServers: typeof profile.dnsServers === 'string' ? profile.dnsServers : '',
      });
      res.status(201).json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.put('/api/mikrotik/pppoe/profiles', requireAdminSession, async (req, res) => {
    const { routerId, existingName, profile } = req.body || {};
    if (
      typeof routerId !== 'string' || !routerId ||
      typeof existingName !== 'string' || !existingName || existingName.length > 64 ||
      !isRecord(profile) ||
      typeof profile.name !== 'string' || !/^[A-Za-z0-9_. -]{1,64}$/.test(profile.name) ||
      typeof profile.localAddress !== 'string' || profile.localAddress.length > 128 ||
      typeof profile.remoteAddress !== 'string' || profile.remoteAddress.length > 128 ||
      typeof profile.rateLimit !== 'string' || profile.rateLimit.length > 128 ||
      typeof profile.dnsServers !== 'string' || profile.dnsServers.length > 128
    ) return res.status(400).json({ error: 'Data PPP profile tidak valid' });
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      if (profile.remoteAddress) {
        const pools = await getRouterPools(router);
        if (!pools.includes(profile.remoteAddress as string)) {
          return res.status(400).json({ error: 'Remote address harus menggunakan IP pool yang tersedia pada router' });
        }
      }
      if (profile.name !== existingName) {
        const secrets = await getPppoeSecrets(router);
        if (secrets.some(secret => secret.profile === existingName)) {
          return res.status(409).json({ error: 'Nama profile tidak dapat diubah selama masih digunakan secret MikroTik. Pindahkan secret ke profile lain terlebih dahulu.' });
        }
      }
      const updatedProfile = {
        name: profile.name,
        localAddress: profile.localAddress,
        remoteAddress: profile.remoteAddress,
        rateLimit: profile.rateLimit,
        dnsServers: profile.dnsServers,
      };
      await updatePppProfile(router, existingName, updatedProfile);
      const stored = await getAppDataDb();
      const packages = stored.data.pppoePackages || [];
      const updatedPackages = packages.map(item =>
        item.routerId === routerId && item.routerProfileName === existingName
          ? { ...item, routerProfileName: updatedProfile.name, speedLimit: updatedProfile.rateLimit }
          : item
      );
      const customers = stored.data.customers || [];
      const updatedCustomers = customers.map(customer =>
        customer.routerId === routerId && customer.profileName === existingName
          ? { ...customer, profileName: updatedProfile.name, bandwidthLimit: updatedProfile.rateLimit }
          : customer
      );
      await savePppoeProfileDataDb(updatedPackages, updatedCustomers);
      res.json({ status: 'success' });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/mikrotik/pppoe/profiles', requireAdminSession, async (req, res) => {
    const { routerId, name } = req.body || {};
    if (typeof routerId !== 'string' || !routerId || typeof name !== 'string' || !name || name.length > 64) {
      return res.status(400).json({ error: 'Router dan nama PPP profile wajib diisi' });
    }
    try {
      const router = await resolveRouterConnection(routerId);
      if (!router) return res.status(404).json({ error: 'Router tidak ditemukan atau kredensial tidak tersedia' });
      const secrets = await getPppoeSecrets(router);
      if (secrets.some(secret => secret.profile === name)) {
        return res.status(409).json({ error: 'PPP profile masih digunakan oleh secret pada router. Pindahkan secret terlebih dahulu.' });
      }
      const stored = await getAppDataDb();
      if ((stored.data.customers || []).some(customer =>
        customer.routerId === routerId && customer.profileName === name
      )) {
        return res.status(409).json({ error: 'PPP profile masih digunakan data pelanggan. Pindahkan pelanggan ke profile lain terlebih dahulu.' });
      }
      await deletePppProfile(router, name);
      const packages = stored.data.pppoePackages || [];
      await savePppoeProfileDataDb(
        packages.filter(item => item.routerId !== routerId || item.routerProfileName !== name),
        stored.data.customers || []
      );
      res.json({ status: 'success' });
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
      password.trim().toLowerCase() === 'undefined' ||
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
    const { password, profile, disabled, comment } = req.body || {};
    if (
      (password !== undefined && (
        typeof password !== 'string' ||
        !password ||
        password.length > 128 ||
        password.trim().toLowerCase() === 'undefined'
      )) ||
      (profile !== undefined && (typeof profile !== 'string' || !/^[A-Za-z0-9_. -]{1,64}$/.test(profile))) ||
      (comment !== undefined && (typeof comment !== 'string' || comment.length > 200)) ||
      (disabled !== undefined && typeof disabled !== 'boolean') ||
      (password === undefined && profile === undefined && disabled === undefined && comment === undefined)
    ) {
      return res.status(400).json({ error: 'Invalid PPPoE secret update' });
    }
    try {
      const router = await resolveRouterConnection(req.params.routerId);
      if (!router) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
      await updatePppoeSecret(router, req.params.username, { password, profile, disabled, comment });
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
    if (isRecord(req.body) && typeof req.body.routerId === 'string') {
      try {
        const connection = await resolveRouterConnection(req.body.routerId);
        if (!connection) return res.status(404).json({ error: 'Router not found or credential is unavailable' });
        const router = await testRouterConnection(connection);
        return res.json({ status: 'connected', router });
      } catch (error) {
        return res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
      }
    }
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

  app.patch('/api/mikrotik/routers/:routerId', requireAdminSession, async (req, res) => {
    const { routerId } = req.params;
    if (routerId === 'env-default') {
      return res.status(400).json({ error: 'Router utama dikelola melalui environment server' });
    }
    if (!validRouterInput(req.body) || !req.body.name.trim() || !req.body.host.trim() || !req.body.username.trim()) {
      return res.status(400).json({ error: 'Router name, host, port, username, and protocol are required' });
    }

    try {
      const appData = await getAppDataDb();
      const routers = appData.data.routers || [];
      const existingRouter = routers.find(router => router.id === routerId);
      if (!existingRouter) return res.status(404).json({ error: 'Router not found' });
      if (routers.some(router => router.id !== routerId && router.host === req.body.host && router.port === req.body.port)) {
        return res.status(409).json({ error: 'A router with this host and port is already registered' });
      }

      const password = req.body.password || await getRouterCredentialDb(routerId);
      if (!password) return res.status(400).json({ error: 'Router password is required' });
      const connection: RouterConnection = {
        ...req.body,
        id: routerId,
        password,
        timeoutSec: Number(process.env.MIKROTIK_TIMEOUT_SEC) || 10,
      };
      const liveRouter = await testRouterConnection(connection);
      const savedRouter: RouterConfig = { ...liveRouter, id: routerId };
      if (req.body.password) await saveRouterCredentialDb(routerId, req.body.password);
      await saveAppDataCollectionDb('routers', routers.map(router => router.id === routerId ? savedRouter : router));
      res.json({ router: savedRouter });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/mikrotik/routers/:routerId', requireAdminSession, async (req, res) => {
    const { routerId } = req.params;
    if (routerId === 'env-default') {
      return res.status(400).json({ error: 'Router utama dikelola melalui environment server' });
    }
    try {
      const appData = await getAppDataDb();
      const routers = appData.data.routers || [];
      if (!routers.some(router => router.id === routerId)) {
        return res.status(404).json({ error: 'Router not found' });
      }
      await saveAppDataCollectionDb('routers', routers.filter(router => router.id !== routerId));
      await deleteRouterCredentialDb(routerId);
      res.json({ status: 'success' });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
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

  app.get('/api/admin/revenue', requireAdminSession, async (_req, res) => {
    try {
      const stored = await getAppDataDb();
      const resetState = await getRevenueResetStateDb();
      const transactions = stored.data.transactions || [];
      const settledVoucherTransactions = transactions.filter(transaction =>
        transaction.orderType === 'voucher' &&
        transaction.status === 'settlement'
      );
      const voucherOrderIds = new Set(transactions
        .filter(transaction => transaction.orderType === 'voucher')
        .map(transaction => transaction.orderId));

      const records = [
        ...(stored.data.invoices || [])
          .filter(invoice => invoice.status === 'paid')
          .map(invoice => ({
            id: `invoice-${invoice.id}`,
            type: 'invoice' as const,
            date: invoice.paidAt || invoice.dueDate,
            reference: invoice.invoiceNumber,
            customerName: invoice.customerName,
            customerPhone: invoice.customerPhone,
            description: invoice.profileName,
            paymentMethod: invoice.paymentMethod || invoice.paymentChannel || '-',
            amount: invoice.totalAmount,
          })),
        ...settledVoucherTransactions.map(transaction => ({
          id: `voucher-${transaction.id}`,
          type: 'voucher' as const,
          date: transaction.paidAt || transaction.createdAt,
          reference: transaction.paymentCode || transaction.orderId,
          customerName: transaction.customerName,
          customerPhone: transaction.customerPhone,
          description: transaction.voucherCode
            ? `Voucher ${transaction.voucherCode}`
            : 'Voucher hotspot',
          paymentMethod: transaction.paymentMethod || transaction.paymentChannel || '-',
          amount: transaction.amount,
        })),
        ...(stored.data.vouchers || [])
          .filter(voucher =>
            (voucher.status === 'active' || voucher.status === 'expired') &&
            (!voucher.orderId || !voucherOrderIds.has(voucher.orderId))
          )
          .map(voucher => ({
            id: `voucher-record-${voucher.id}`,
            type: 'voucher' as const,
            date: voucher.activatedAt || voucher.createdAt,
            reference: voucher.code,
            customerName: '-',
            customerPhone: voucher.customerPhone || '-',
            description: `Voucher ${voucher.code}`,
            paymentMethod: voucher.paymentMethod || '-',
            amount: voucher.price,
          })),
      ].filter(record => Number.isFinite(record.amount) && record.amount > 0)
        .sort((left, right) => right.date.localeCompare(left.date));

      const historyRecords = resetState.historyResetAt
        ? records.filter(record => record.date >= resetState.historyResetAt!)
        : records;
      const statisticsRecords = resetState.statisticsResetAt
        ? records.filter(record => record.date >= resetState.statisticsResetAt!)
        : records;
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        records: historyRecords,
        summary: {
          totalRevenue: statisticsRecords.reduce((total, record) => total + record.amount, 0),
          invoiceRevenue: statisticsRecords
            .filter(record => record.type === 'invoice')
            .reduce((total, record) => total + record.amount, 0),
          voucherRevenue: statisticsRecords
            .filter(record => record.type === 'voucher')
            .reduce((total, record) => total + record.amount, 0),
          invoiceCount: statisticsRecords.filter(record => record.type === 'invoice').length,
          voucherCount: statisticsRecords.filter(record => record.type === 'voucher').length,
        },
        resetState,
      });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/admin/revenue/reset', requireAdminSession, async (req, res) => {
    const mode = req.body?.mode;
    if (mode !== 'statistics' && mode !== 'history') {
      return res.status(400).json({ error: 'Pilih reset statistik atau reset seluruh riwayat pendapatan' });
    }
    try {
      const result = await resetRevenueReportingDb(mode);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ status: 'success', ...result });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Download SQLite database backup file
  app.get('/api/db/backup', requireAdminSession, async (_req, res) => {
    try {
      const dbPath = path.resolve(__dirname, 'data/billing.sqlite');
      if (fs.existsSync(dbPath)) {
        saveDbToDisk();
        res.download(dbPath, `backup-billing-${new Date().toISOString().substring(0, 10)}.sqlite`);
      } else {
        res.status(404).json({ error: 'Database file not found on disk' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(
    '/api/db/restore',
    requireAdminSession,
    express.raw({ type: 'application/octet-stream', limit: '100mb' }),
    async (req: express.Request, res: express.Response) => {
      if (!Buffer.isBuffer(req.body)) {
        return res.status(400).json({ error: 'Pilih file backup SQLite untuk dipulihkan' });
      }
      try {
        const safetyBackup = await restoreDbFromBackup(req.body);
        res.setHeader('Cache-Control', 'no-store');
        return res.json({
          status: 'success',
          message: 'Database berhasil dipulihkan',
          safetyBackup,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const invalidBackup = message.startsWith('Backup tidak dapat dipulihkan') ||
          message.includes('Ukuran file backup tidak valid');
        return res.status(invalidBackup ? 400 : 500).json({ error: message });
      }
    },
    (error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (isRecord(error) && error.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Ukuran file backup melebihi batas 100 MB' });
      }
      return next(error);
    }
  );

  app.post('/api/db/reset-all', requireAdminSession, async (req, res) => {
    if (req.body?.confirmation !== 'RESET ALL') {
      return res.status(400).json({ error: 'Konfirmasi reset tidak cocok. Ketik RESET ALL untuk melanjutkan.' });
    }
    try {
      const safetyBackup = await resetAllBusinessDataDb();
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        status: 'success',
        message: 'Data operasional berhasil direset. Akun admin dan kunci enkripsi dipertahankan.',
        safetyBackup,
      });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
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
    let gateway: PaymentGatewayCredentials;
    try {
      gateway = await paymentGatewayCredentials();
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
    let order_id: string;
    let gross_amount: string;
    let transaction_status: string;
    let fraud_status: unknown;
    let payment_type: unknown;

    if (gateway.provider === 'midtrans') {
      if (!gateway.serverKey) return res.status(503).json({ error: 'Midtrans server key is not configured' });
      const body = req.body || {};
      const status_code = body.status_code;
      const signature_key = body.signature_key;
      order_id = body.order_id;
      gross_amount = body.gross_amount;
      transaction_status = body.transaction_status;
      fraud_status = body.fraud_status;
      payment_type = body.payment_type;
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
        .update(`${order_id}${status_code}${gross_amount}${gateway.serverKey}`)
        .digest('hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const receivedBuffer = Buffer.from(signature_key, 'hex');
      if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
        return res.status(403).json({ error: 'Invalid Midtrans notification signature' });
      }
    } else if (gateway.provider === 'doku') {
      if (!gateway.dokuClientId || !gateway.dokuSecretKey) {
        return res.status(503).json({ error: 'DOKU credentials are not configured' });
      }
      const clientId = req.get('Client-Id') || '';
      const requestId = req.get('Request-Id') || '';
      const requestTimestamp = req.get('Request-Timestamp') || '';
      const signatureHeader = req.get('Signature') || '';
      const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
      const timestampMs = Date.parse(requestTimestamp);
      if (
        clientId !== gateway.dokuClientId ||
        !requestId || requestId.length > 128 ||
        !Number.isFinite(timestampMs) ||
        Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000 ||
        !rawBody ||
        !isRecord(req.body) ||
        !isRecord(req.body.order) ||
        !isRecord(req.body.transaction)
      ) {
        return res.status(400).json({ error: 'Invalid DOKU notification headers or payload' });
      }
      const digest = createHash('sha256').update(rawBody).digest('base64');
      const signatureComponent = [
        `Client-Id:${clientId}`,
        `Request-Id:${requestId}`,
        `Request-Timestamp:${requestTimestamp}`,
        `Request-Target:${req.path}`,
        `Digest:${digest}`,
      ].join('\n');
      const expectedSignature = createHmac('sha256', gateway.dokuSecretKey)
        .update(signatureComponent)
        .digest();
      const receivedSignature = Buffer.from(signatureHeader.replace(/^HMACSHA256=/, ''), 'base64');
      if (
        !signatureHeader.startsWith('HMACSHA256=') ||
        receivedSignature.length !== expectedSignature.length ||
        !timingSafeEqual(receivedSignature, expectedSignature)
      ) {
        return res.status(403).json({ error: 'Invalid DOKU notification signature' });
      }
      const invoiceNumber = req.body.order.invoice_number;
      const amount = req.body.order.amount;
      const status = req.body.transaction.status;
      if (
        typeof invoiceNumber !== 'string' ||
        (typeof amount !== 'number' && typeof amount !== 'string') ||
        typeof status !== 'string'
      ) {
        return res.status(400).json({ error: 'Invalid DOKU notification data' });
      }
      order_id = invoiceNumber;
      gross_amount = String(amount);
      transaction_status = status === 'SUCCESS'
        ? 'settlement'
        : status === 'PENDING'
          ? 'pending'
          : status === 'EXPIRED'
            ? 'expire'
            : status === 'FAILED'
              ? 'deny'
              : status;
      payment_type = isRecord(req.body.channel) && typeof req.body.channel.id === 'string'
        ? req.body.channel.id
        : 'doku';
    } else if (gateway.provider === 'xendit') {
      if (!gateway.xenditCallbackToken) {
        return res.status(503).json({ error: 'Xendit callback token is not configured' });
      }
      const callbackToken = req.get('x-callback-token') || '';
      const expectedToken = Buffer.from(gateway.xenditCallbackToken);
      const receivedToken = Buffer.from(callbackToken);
      if (expectedToken.length !== receivedToken.length || !timingSafeEqual(expectedToken, receivedToken)) {
        return res.status(403).json({ error: 'Invalid Xendit callback token' });
      }
      const body = req.body || {};
      if (
        typeof body.external_id !== 'string' ||
        typeof body.status !== 'string' ||
        (typeof body.amount !== 'number' && typeof body.amount !== 'string')
      ) {
        return res.status(400).json({ error: 'Invalid Xendit notification payload' });
      }
      order_id = body.external_id;
      gross_amount = String(body.paid_amount ?? body.amount);
      transaction_status = body.status === 'PAID'
        ? 'settlement'
        : body.status === 'EXPIRED'
          ? 'expire'
          : body.status === 'PENDING'
            ? 'pending'
            : body.status === 'FAILED'
              ? 'deny'
              : body.status;
      payment_type = 'xendit';
    } else if (gateway.provider === 'tripay') {
      if (!gateway.tripayPrivateKey || !gateway.tripayMerchantCode) {
        return res.status(503).json({ error: 'Tripay credentials are not configured' });
      }
      const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
      const signatureHeader = req.get('X-Callback-Signature') || '';
      if (!rawBody || !signatureHeader) {
        return res.status(400).json({ error: 'Invalid Tripay notification headers or payload' });
      }
      const expectedSignature = createHmac('sha256', gateway.tripayPrivateKey).update(rawBody).digest();
      const receivedSignature = Buffer.from(signatureHeader, 'hex');
      if (
        receivedSignature.length !== expectedSignature.length ||
        !timingSafeEqual(receivedSignature, expectedSignature)
      ) {
        return res.status(403).json({ error: 'Invalid Tripay notification signature' });
      }
      const body = req.body || {};
      if (
        typeof body.merchant_ref !== 'string' ||
        typeof body.status !== 'string' ||
        (typeof body.amount !== 'number' && typeof body.amount !== 'string')
      ) {
        return res.status(400).json({ error: 'Invalid Tripay notification payload' });
      }
      order_id = body.merchant_ref;
      gross_amount = String(body.amount_received ?? body.amount);
      transaction_status = body.status === 'PAID'
        ? 'settlement'
        : body.status === 'EXPIRED'
          ? 'expire'
          : body.status === 'FAILED'
            ? 'deny'
            : body.status === 'UNPAID'
              ? 'pending'
              : body.status;
      payment_type = typeof body.payment_method === 'string' ? body.payment_method : 'tripay';
    } else {
      return res.status(503).json({ error: 'Tidak ada gateway pembayaran otomatis yang aktif' });
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
      if (transaction.paymentMethod !== gateway.provider) {
        return res.status(409).json({ error: 'Payment order does not belong to the active gateway' });
      }
      if (Number(gross_amount) !== transaction.amount) {
        return res.status(400).json({ error: 'Payment amount does not match the order' });
      }
      if (transaction.status === 'settlement') return res.json({ status: 'success' });

      if (transaction.orderType === 'voucher') {
        if (settled) {
          await activateAndSettleVoucher(order_id, typeof payment_type === 'string' ? payment_type : gateway.provider);
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
      if (
        settled &&
        (invoice.status === 'canceled' ||
          invoice.status === 'expired' ||
          customers.some(customer => customer.id === invoice.customerId && customer.cancelAtExpiry))
      ) {
        const reconciliationTransactions = transactions.map(item =>
          item.orderId === order_id
            ? {
              ...item,
              status: 'settlement' as const,
              paymentChannel: typeof payment_type === 'string' ? payment_type : gateway.provider,
              paidAt: updatedAt,
            }
            : item
        );
        const reconciliationInvoices = invoice.status === 'unpaid'
          ? invoices.map(item => item.id === invoice.id
            ? {
              ...item,
              status: 'canceled' as const,
              canceledAt: updatedAt,
              cancellationReason: 'late_payment' as const,
            }
            : item)
          : invoices;
        await savePublicPaymentUpdateDb(
          customers,
          reconciliationInvoices,
          reconciliationTransactions
        );
        console.error(
          `[Payment] Late payment ${order_id} was received for canceled or ending invoice ${invoice.invoiceNumber}; service was not activated and requires reconciliation.`
        );
        return res.json({ status: 'late_payment_reconciliation_required' });
      }
      let updatedCustomers = customers;
      if (settled && invoice.status !== 'paid') {
        const customer = customers.find(item => item.id === invoice.customerId);
        if (customer) {
          const now = new Date();
          const currentExpiry = new Date(`${customer.expiredDate}T00:00:00`);
          const newExpiry = new Date(currentExpiry > now ? currentExpiry : now);
          newExpiry.setDate(newExpiry.getDate() + 30);
          const scheduledPackage = (stored.data.pppoePackages || []).find(item =>
            item.id === customer.pendingPppoePackageId &&
            item.enabled &&
            item.routerId === customer.routerId &&
            invoice.profileName === item.name
          );
          let routerActivated = false;
          let activationNote = 'RouterOS belum diaktifkan otomatis.';
          try {
            const router = await resolveRouterConnection(customer.routerId);
            if (!router) throw new Error('Kredensial router tidak tersedia');
            await updatePppoeSecret(router, customer.pppoeUsername, {
              disabled: false,
              ...(scheduledPackage ? { profile: scheduledPackage.routerProfileName } : {}),
            });
            routerActivated = true;
            activationNote = scheduledPackage
              ? `Paket PPPoE diubah ke ${scheduledPackage.name} di RouterOS.`
              : 'Akses PPPoE diaktifkan melalui RouterOS.';
          } catch (activationError) {
            activationNote = `Akses router belum aktif: ${activationError instanceof Error ? activationError.message : String(activationError)}`;
            console.error(`[Payment] Verified invoice ${invoice.invoiceNumber}; RouterOS activation failed: ${activationNote}`);
          }
          const updatedCustomer: Customer = {
            ...customer,
            expiredDate: newExpiry.toISOString().slice(0, 10),
            status: routerActivated ? 'active' : customer.status,
            ...(scheduledPackage ? {
              pppoePackageId: scheduledPackage.id,
              servicePackageName: scheduledPackage.name,
              profileName: scheduledPackage.routerProfileName,
              bandwidthLimit: scheduledPackage.speedLimit,
              monthlyFee: scheduledPackage.monthlyFee,
              pendingPppoePackageId: undefined,
            } : {}),
            notes: `Pembayaran ${gateway.provider.toUpperCase()} terverifikasi pada ${updatedAt}. ${activationNote}`,
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
            paymentMethod: gateway.provider,
            paymentChannel: typeof payment_type === 'string' ? payment_type : gateway.provider,
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
  let hotspotVoucherExpiryTaskRunning = false;
  async function runHotspotVoucherExpiryTasks(): Promise<void> {
    if (hotspotVoucherExpiryTaskRunning) return;
    hotspotVoucherExpiryTaskRunning = true;
    try {
      const stored = await getAppDataDb();
      const trackedVouchers = (stored.data.vouchers || []).filter(voucher =>
        voucher.firstUseExpiryEnabled === true &&
        voucher.routerId &&
        voucher.status !== 'pending' &&
        Number.isFinite(voucher.validityHours) &&
        voucher.validityHours > 0
      );
      const routerIds = [...new Set(trackedVouchers.map(voucher => voucher.routerId!))];
      if (!routerIds.length) return;

      const updates = new Map<string, Partial<Voucher>>();
      const now = Date.now();
      const parseRouterUptimeMs = (uptime: string) => {
        const normalized = uptime.trim().toLowerCase();
        const clock = normalized.match(/^(?:(\d+)d)?\s*(\d+):(\d{2}):(\d{2})$/);
        if (clock) {
          return ((Number(clock[1] || 0) * 24 + Number(clock[2])) * 60 * 60 +
            Number(clock[3]) * 60 + Number(clock[4])) * 1000;
        }
        const units: Record<string, number> = { w: 7 * 24 * 60 * 60_000, d: 24 * 60 * 60_000, h: 60 * 60_000, m: 60_000, s: 1000 };
        const tokens = [...normalized.matchAll(/(\d+)\s*([wdhms])/g)];
        return tokens.reduce((total, token) => total + Number(token[1]) * units[token[2]], 0);
      };

      for (const routerId of routerIds) {
        const routerVouchers = trackedVouchers.filter(voucher => voucher.routerId === routerId);
        try {
          const router = await resolveRouterConnection(routerId);
          if (!router) throw new Error('Kredensial router tidak tersedia');
          const users = await getHotspotUsers(router);
          const vouchersByCode = new Map(routerVouchers.map(voucher => [voucher.code, voucher]));
          for (const user of users) {
            const voucher = vouchersByCode.get(user.name);
            if (!voucher) continue;

            let activatedAt = voucher.activatedAt;
            let expiredAt = voucher.expiredAt;
            let status = voucher.status;
            if (!activatedAt && !user.disabled && (user.active || parseRouterUptimeMs(user.uptime) > 0)) {
              const firstObservedSessionMs = user.active ? parseRouterUptimeMs(user.sessionUptime) : 0;
              activatedAt = new Date(now - firstObservedSessionMs).toISOString();
              expiredAt = new Date(now + voucher.validityHours * 60 * 60 * 1000).toISOString();
            }
            if (!activatedAt || !expiredAt) continue;

            if (Date.parse(expiredAt) <= now) {
              if (!user.disabled) {
                await updateHotspotUser(router, user.name, { disabled: true });
                if (user.active) await disconnectHotspotUser(router, user.name);
              }
              status = 'expired';
            } else {
              status = 'active';
            }
            if (
              activatedAt !== voucher.activatedAt ||
              expiredAt !== voucher.expiredAt ||
              status !== voucher.status
            ) {
              updates.set(voucher.id, { activatedAt, expiredAt, status });
            }
          }
        } catch (error) {
          console.error(`[Hotspot voucher expiry] Router ${routerId} check failed:`, error);
        }
      }

      if (updates.size) {
        const latest = await getAppDataDb();
        const vouchers = (latest.data.vouchers || []).map(voucher => {
          const update = updates.get(voucher.id);
          return update && voucher.firstUseExpiryEnabled
            ? { ...voucher, ...update }
            : voucher;
        });
        await saveAppDataCollectionDb('vouchers', vouchers);
      }
    } catch (error) {
      console.error('[Hotspot voucher expiry] Background task failed:', error);
    } finally {
      hotspotVoucherExpiryTaskRunning = false;
    }
  }

  const hotspotVoucherExpiryTimer = setInterval(() => void runHotspotVoucherExpiryTasks(), 60 * 1000);
  hotspotVoucherExpiryTimer.unref();
  void runHotspotVoucherExpiryTasks();

  async function runBillingBackgroundTasks(): Promise<void> {
    if (backgroundTasksRunning) return;
    backgroundTasksRunning = true;
    try {
      let stored = await getAppDataDb();
      const customersForUsage = stored.data.customers || [];
      const routerCustomers = new Map<string, Customer[]>();
      for (const customer of customersForUsage) {
        if (!customer.routerId || !customer.pppoeUsername) continue;
        const customers = routerCustomers.get(customer.routerId) || [];
        customers.push(customer);
        routerCustomers.set(customer.routerId, customers);
      }
      if (routerCustomers.size) {
        const usage = await getPppoeUsageDb();
        const now = new Date();
        const dateParts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(now);
        const datePart = (type: string) => dateParts.find(part => part.type === type)?.value || '';
        const year = Number(datePart('year'));
        const month = Number(datePart('month'));
        const day = Number(datePart('day'));
        const sampledAt = now.toISOString();
        let usageChanged = false;
        for (const [routerId, routerGroup] of routerCustomers) {
          try {
            const router = await resolveRouterConnection(routerId);
            if (!router) throw new Error('Kredensial router tidak tersedia');
            const activeSessions = await getPppoeActiveSessionStats(router);
            for (const customer of routerGroup) {
              const billingDay = Math.max(1, Math.min(31, Math.floor(customer.billingDate || 1)));
              const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
              const cutoverDay = Math.min(billingDay, daysInMonth);
              const cycleDate = day < cutoverDay
                ? new Date(Date.UTC(year, month - 2, 1))
                : new Date(Date.UTC(year, month - 1, 1));
              const cycle = `${cycleDate.getUTCFullYear()}-${String(cycleDate.getUTCMonth() + 1).padStart(2, '0')}`;
              const currentSession = activeSessions.find(session => session.name === customer.pppoeUsername);
              const sessionBytes = currentSession ? currentSession.bytesIn + currentSession.bytesOut : 0;
              const previous = usage[customer.id];
              let totalBytes = previous?.billingCycle === cycle ? previous.totalBytes : 0;
              if (previous?.billingCycle === cycle && currentSession) {
                totalBytes += sessionBytes >= previous.lastSessionBytes
                  ? sessionBytes - previous.lastSessionBytes
                  : sessionBytes;
              }
              usage[customer.id] = {
                billingCycle: cycle,
                totalBytes,
                lastSessionBytes: sessionBytes,
                sampledAt,
              };
              usageChanged = true;
            }
          } catch (error) {
            console.error(`[Portal usage] Failed to sample router ${routerId}:`, error);
          }
        }
        if (usageChanged) await savePppoeUsageDb(usage);
      }

      const settings = await getAppSettingsDb();
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
      const now = new Date();
      const endingCustomers = (stored.data.customers || []).filter(customer =>
        customer.cancelAtExpiry &&
        customer.status !== 'disabled' &&
        customer.expiredDate <= today
      );
      for (const customer of endingCustomers) {
        try {
          const router = await resolveRouterConnection(customer.routerId);
          if (!router) throw new Error('Kredensial router tidak tersedia');
          await updatePppoeSecret(router, customer.pppoeUsername, { disabled: true });
          const latest = await getAppDataDb();
          const updatedCustomers = (latest.data.customers || []).map(item =>
            item.id === customer.id
              ? { ...item, status: 'disabled' as const, notes: `Langganan dihentikan sesuai permintaan pada ${new Date().toISOString()}.` }
              : item
          );
          await savePublicPaymentUpdateDb(
            updatedCustomers,
            latest.data.invoices || [],
            latest.data.transactions || []
          );
        } catch (error) {
          console.error(
            `[Subscription] Failed to end service for customer ${customer.customerId}:`,
            error
          );
        }
      }
      stored = await getAppDataDb();
      const invoicesPastGracePeriod = (stored.data.invoices || []).filter(invoice => {
        if (invoice.status !== 'unpaid' || !/^\d{4}-\d{2}-\d{2}$/.test(invoice.dueDate)) return false;
        const graceEnd = new Date(`${invoice.dueDate}T12:00:00+07:00`);
        graceEnd.setDate(graceEnd.getDate() + 7);
        if (jakartaDate(graceEnd) > today) return false;
        const hasUnexpiredPayment = (stored.data.transactions || []).some(transaction =>
          transaction.orderType === 'invoice' &&
          transaction.invoiceId === invoice.id &&
          transaction.status === 'pending' &&
          transaction.expiresAt &&
          new Date(transaction.expiresAt).getTime() > now.getTime()
        );
        return !hasUnexpiredPayment;
      });
      if (invoicesPastGracePeriod.length) {
        const expiredInvoiceIds = new Set(invoicesPastGracePeriod.map(invoice => invoice.id));
        const updatedTransactions = (stored.data.transactions || []).map(transaction =>
          transaction.orderType === 'invoice' &&
          transaction.paymentMethod === 'manual' &&
          transaction.status === 'pending' &&
          transaction.invoiceId &&
          expiredInvoiceIds.has(transaction.invoiceId)
            ? { ...transaction, status: 'canceled' as const }
            : transaction
        );
        await savePublicPaymentUpdateDb(
          stored.data.customers || [],
          (stored.data.invoices || []).map(invoice =>
            expiredInvoiceIds.has(invoice.id)
              ? {
                ...invoice,
                status: 'canceled' as const,
                canceledAt: now.toISOString(),
                cancellationReason: 'grace_period' as const,
              }
              : invoice
          ),
          updatedTransactions
        );
        stored = await getAppDataDb();
      }
      const tomorrow = new Date(`${today}T12:00:00+07:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dueTomorrow = jakartaDate(tomorrow);
      await Promise.all((stored.data.customers || [])
        .filter(customer => !customer.cancelAtExpiry && (customer.status !== 'active' || customer.expiredDate <= dueTomorrow))
        .map(customer => ensureDueInvoice(customer.id, true)));
      stored = await getAppDataDb();
      if (!settings.autoSendReminderH1) return;
      const cancellationLogs = stored.data.whatsappLogs || [];
      const cancellationNoticeInvoices = (stored.data.invoices || []).filter(invoice =>
        invoice.status === 'canceled' &&
        invoice.cancellationReason === 'grace_period' &&
        invoice.canceledAt
      );
      for (const invoice of cancellationNoticeInvoices) {
        const marker = `invoice-canceled:${invoice.id}`;
        const attempts = cancellationLogs
          .filter(log => log.type === 'invoice_canceled' && log.responseInfo?.includes(marker))
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        if (attempts.some(log => log.status === 'sent') || attempts.length >= 3) continue;
        if (attempts[0] && Date.now() - new Date(attempts[0].timestamp).getTime() < 30 * 60 * 1000) continue;
        const customer = (stored.data.customers || []).find(item => item.id === invoice.customerId);
        if (!customer) continue;
        const businessName = settings.companyName.trim() || settings.brandName.trim() || settings.appName;
        const secret = await getOrCreatePortalLinkSecretDb();
        const token = createPortalLinkToken({ customerId: customer.id }, Date.now() + 30 * 24 * 60 * 60 * 1000, secret);
        const appUrl = await configuredPaymentAppUrl();
        const paymentUrl = appUrl
          ? `${appUrl.origin}/portal/billing?token=${encodeURIComponent(token)}`
          : '';
        const message = [
          `Yth. ${customer.name},`,
          '',
          `Invoice ${invoice.invoiceNumber} yang jatuh tempo pada ${invoice.dueDate} telah dibatalkan karena belum dibayar setelah masa tenggang 7 hari.`,
          'Akses PPPoE Anda tidak diubah otomatis. Silakan hubungi operator untuk informasi tagihan berikutnya.',
          paymentUrl ? `Periksa tagihan: ${paymentUrl}` : '',
          '',
          businessName,
        ].filter(Boolean).join('\n');
        try {
          if (!appUrl) throw new Error('APP_URL tidak dikonfigurasi; tautan portal tidak dapat dibuat');
          const sent = await sendWhatsAppMessage(customer.phone, message);
          await recordWhatsAppLog(customer.phone, customer.name, 'invoice_canceled', message, 'sent', `${marker}:${sent.provider}`);
          cancellationLogs.unshift({
            id: randomUUID(),
            recipientPhone: customer.phone,
            recipientName: customer.name,
            type: 'invoice_canceled',
            message,
            status: 'sent',
            timestamp: new Date().toISOString(),
            responseInfo: `${marker}:${sent.provider}`,
          });
        } catch (error) {
          const failure = error instanceof Error ? error.message : String(error);
          console.error(`[Invoice] Cancellation notice failed for ${invoice.invoiceNumber}: ${failure}`);
          await recordWhatsAppLog(customer.phone, customer.name, 'invoice_canceled', message, 'failed', `${marker}:${failure}`);
          cancellationLogs.unshift({
            id: randomUUID(),
            recipientPhone: customer.phone,
            recipientName: customer.name,
            type: 'invoice_canceled',
            message,
            status: 'failed',
            timestamp: new Date().toISOString(),
            responseInfo: `${marker}:${failure}`,
          });
        }
      }
      stored = await getAppDataDb();
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
        const token = createPortalLinkToken({ invoiceId: invoice.id }, Date.now() + 30 * 24 * 60 * 60 * 1000, secret);
        const appUrl = await configuredPaymentAppUrl();
        if (!appUrl) {
          console.error(`[Reminder] Skipping invoice ${invoice.invoiceNumber}: APP_URL is not configured.`);
          continue;
        }
        const paymentUrl = `${appUrl.origin}/portal/billing?token=${encodeURIComponent(token)}`;
        const message = buildInvoiceReminderMessage(
          customer,
          invoice,
          paymentUrl,
          settings,
          stored.data.paymentConfig,
          await paymentGatewayReady(await paymentGatewayCredentials())
        );
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
      const baseUrl = OPENWA_BASE_URL.replace(/\/+$/, '');
      const headers = { 'X-API-Key': OPENWA_API_KEY };
      const statusResponse = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(OPENWA_SESSION_ID)}/status`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      const statusText = await statusResponse.text();
      if (!statusResponse.ok) {
        return res.status(502).json({ error: `OpenWA returned ${statusResponse.status}: ${statusText.slice(0, 300)}` });
      }
      const statusData: unknown = statusText ? JSON.parse(statusText) : {};
      let normalized = normalizeOpenWaSessionStatus(statusData);

      if (!normalized.status) {
        const sessionResponse = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(OPENWA_SESSION_ID)}`, {
          headers,
          signal: AbortSignal.timeout(5000),
        });
        const sessionText = await sessionResponse.text();
        if (sessionResponse.ok) {
          normalized = normalizeOpenWaSessionStatus(sessionText ? JSON.parse(sessionText) : {});
        }
      }
      res.json({
        status: normalized.status || 'unknown',
        ...(normalized.phone ? { phone: normalized.phone } : {}),
        ...(normalized.status ? {} : { message: 'OpenWA merespons, tetapi status sesi tidak ditemukan pada respons API.' }),
      });
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

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 NetFlow MikroTik Billing Server running at http://0.0.0.0:${PORT}`);
    console.log(`📦 Persistent SQLite database loaded at data/billing.sqlite`);
    console.log('📱 WhatsApp notifications use the externally configured provider REST API');
  });
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    httpServer.close(() => {
      void closeRouterApiSessions()
        .then(() => process.exit(0))
        .catch(error => {
          console.error('[Server] Failed to close MikroTik API sessions during shutdown:', error);
          process.exit(1);
        });
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

// Only start when invoked directly
if (process.env.RUN_EXPRESS === 'true' || process.env.NODE_ENV === 'production') {
  startServer().catch(console.error);
}

export default startServer;
