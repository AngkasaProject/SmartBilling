import { createHash } from 'node:crypto';
import { Channel, RosApiMenu } from 'routeros-client';
import { RouterOSAPI } from 'node-routeros';
import type { RouterConfig } from '../src/types';

// RouterOS uses !empty for a successful query with no rows; node-routeros otherwise throws on it.
const processRouterOsPacket = Object.getOwnPropertyDescriptor(Channel.prototype, 'processPacket')?.value;
if (typeof processRouterOsPacket !== 'function') {
  throw new Error('RouterOS client does not expose the expected packet handler');
}
Object.defineProperty(Channel.prototype, 'processPacket', {
  configurable: true,
  writable: true,
  value(this: unknown, packet: string[]) {
    if (packet[0] === '!empty') return;
    return Reflect.apply(processRouterOsPacket, this, [packet]);
  },
});

export interface RouterConnection {
  id?: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  apiType: RouterConfig['apiType'];
  timeoutSec: number;
}

export interface PppoeSetup {
  interface: string;
  serviceName: string;
  poolName: string;
  poolRange: string;
  localAddress: string;
  profileName: string;
  rateLimit: string;
  dnsServers: string;
}

type RouterRow = Record<string, string | number | boolean | undefined>;

export interface RouterServiceRecord {
  id: string;
  name: string;
  interface: string;
  disabled: boolean;
  profile?: string;
  addressPool?: string;
  serviceName?: string;
  defaultProfile?: string;
}

export interface PppoeActiveSessionStats {
  name: string;
  bytesIn: number;
  bytesOut: number;
}

export interface PppoeActiveSession {
  name: string;
  service: string;
  callerId: string;
  address: string;
  uptime: string;
  encoding: string;
  bytesIn: number;
  bytesOut: number;
}

export interface RouterLogEntry {
  id: string;
  time: string;
  topics: string;
  message: string;
}

export interface RouterFileEntry {
  id: string;
  name: string;
  type: string;
  size: string;
  isDirectory: boolean;
}

const ROUTER_API_IDLE_TIMEOUT_MS = 60 * 60 * 1000;

interface RouterRawSession {
  key: string;
  signature: string;
  api: RouterOSAPI;
  activeLeases: number;
  connectPromise?: Promise<RouterOSAPI>;
  idleTimer?: NodeJS.Timeout;
  invalidated: boolean;
}

interface RouterApiLease {
  connect(): Promise<RosApiMenu>;
  close(): Promise<void>;
}

const routerRawSessions = new Map<string, RouterRawSession>();

function routerSessionIdentity(router: RouterConnection): { key: string; signature: string } {
  const id = router.id || `${router.host}:${router.port}`;
  const signature = createHash('sha256')
    .update(JSON.stringify([
      router.host,
      router.port,
      router.username,
      router.password,
      router.apiType,
      router.timeoutSec,
    ]))
    .digest('hex');
  return { key: `${id}:${signature}`, signature };
}

function acquireRouterRawSession(router: RouterConnection): RouterRawSession {
  const { key, signature } = routerSessionIdentity(router);
  let session = routerRawSessions.get(key);
  if (!session || session.signature !== signature || session.invalidated) {
    const api = new RouterOSAPI({
      host: router.host,
      port: router.port,
      user: router.username,
      password: router.password,
      timeout: router.timeoutSec,
      ...(router.apiType === 'api-ssl' ? { tls: {} } : {}),
    });
    session = { key, signature, api, activeLeases: 0, invalidated: false };
    api.on('close', () => {
      session!.invalidated = true;
      if (routerRawSessions.get(key) === session) routerRawSessions.delete(key);
    });
    api.on('error', error => {
      session!.invalidated = true;
      if (routerRawSessions.get(key) === session) routerRawSessions.delete(key);
      console.error(`[MikroTik] RouterOS API connection error for ${router.name}:`, error);
    });
    routerRawSessions.set(key, session);
  }
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = undefined;
  }
  session.activeLeases += 1;
  return session;
}

async function connectRouterRawSession(session: RouterRawSession): Promise<RouterOSAPI> {
  if (session.api.connected) return session.api;
  if (!session.connectPromise) {
    session.connectPromise = session.api.connect().catch(error => {
      session.invalidated = true;
      if (routerRawSessions.get(session.key) === session) routerRawSessions.delete(session.key);
      throw error;
    }).finally(() => {
      session.connectPromise = undefined;
    });
  }
  return session.connectPromise;
}

function releaseRouterRawSession(session: RouterRawSession): void {
  session.activeLeases = Math.max(0, session.activeLeases - 1);
  if (session.activeLeases > 0 || session.idleTimer) return;
  session.idleTimer = setTimeout(() => {
    if (session.activeLeases > 0) return;
    if (routerRawSessions.get(session.key) === session) routerRawSessions.delete(session.key);
    session.invalidated = true;
    void session.api.close().catch(error => {
      console.error(`[MikroTik] Could not close idle traffic API connection for ${session.api.host}:`, error);
    });
  }, ROUTER_API_IDLE_TIMEOUT_MS);
  session.idleTimer.unref();
}

export async function closeRouterApiSessions(): Promise<void> {
  const rawSessions = [...routerRawSessions.values()];
  routerRawSessions.clear();
  await Promise.all(rawSessions.map(async session => {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.invalidated = true;
    if (session.api.connected) await session.api.close();
  }));
}

function toRouterServiceRecord(row: RouterRow, kind: 'pppoe' | 'hotspot'): RouterServiceRecord {
  return {
    id: String(row['.id'] || row.id || ''),
    name: String(row.name || row['service-name'] || row.serviceName || row.interface || ''),
    interface: String(row.interface || ''),
    disabled: row.disabled === true || row.disabled === 'true' || row.disabled === 'yes',
    ...(kind === 'hotspot'
      ? {
        profile: String(row.profile || ''),
        addressPool: String(row['address-pool'] || row.addressPool || ''),
      }
      : {
        serviceName: String(row['service-name'] || row.serviceName || ''),
        defaultProfile: String(row['default-profile'] || row.defaultProfile || ''),
      }),
  };
}

function routerBaseUrl(router: RouterConnection): string {
  const scheme = router.port === 8729 ? 'https' : 'http';
  return `${scheme}://${router.host}:${router.port}`;
}

async function restRequest<T>(
  router: RouterConnection,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: Record<string, string>
): Promise<T> {
  const response = await fetch(`${routerBaseUrl(router)}/rest${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${router.username}:${router.password}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(router.timeoutSec * 1000),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`RouterOS REST ${method} ${path} returned ${response.status}: ${responseText.slice(0, 300)}`);
  }
  return responseText ? JSON.parse(responseText) as T : {} as T;
}

function apiClient(router: RouterConnection): RouterApiLease {
  const session = acquireRouterRawSession(router);
  const lease: RouterApiLease = {
    connect: async () => new RosApiMenu(await connectRouterRawSession(session)),
    // Release this operation's lease; the shared socket remains open while active.
    close: async () => releaseRouterRawSession(session),
  };
  return lease;
}

export async function testRouterConnection(router: RouterConnection): Promise<RouterConfig> {
  if (router.apiType === 'rest') {
    const [identity, resource, pppoe, hotspot] = await Promise.all([
      restRequest<RouterRow>(router, '/system/identity', 'GET'),
      restRequest<RouterRow>(router, '/system/resource', 'GET'),
      restRequest<RouterRow[]>(router, '/ppp/active', 'GET'),
      restRequest<RouterRow[]>(router, '/ip/hotspot/active', 'GET'),
    ]);
    return toRouterConfig(router, identity.name, resource, pppoe.length, hotspot.length);
  }

  const client = apiClient(router);
  try {
    const api = await client.connect();
    const [identityRows, resourceRows, pppoeRows, hotspotRows] = await Promise.all([
      api.menu('/system identity').get(),
      api.menu('/system resource').get(),
      api.menu('/ppp active').get(),
      api.menu('/ip hotspot active').get(),
    ]) as [RouterRow[], RouterRow[], RouterRow[], RouterRow[]];

    return toRouterConfig(
      router,
      identityRows[0]?.name,
      resourceRows[0] ?? {},
      pppoeRows.length,
      hotspotRows.length
    );
  } finally {
    await client.close();
  }
}

export async function getPppoeActiveSessionStats(router: RouterConnection): Promise<PppoeActiveSessionStats[]> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ppp/active', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ppp active').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  const parseBytes = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  };
  return rows
    .map(row => ({
      name: String(row.name || '').trim(),
      bytesIn: parseBytes(row['bytes-in'] ?? row.bytesIn),
      bytesOut: parseBytes(row['bytes-out'] ?? row.bytesOut),
    }))
    .filter(session => session.name);
}

export async function getPppoeActiveSessions(router: RouterConnection): Promise<PppoeActiveSession[]> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ppp/active', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ppp active').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  const parseBytes = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  };
  return rows
    .map(row => ({
      name: String(row.name || '').trim(),
      service: String(row.service || ''),
      callerId: String(row['caller-id'] || row.callerId || ''),
      address: String(row.address || ''),
      uptime: String(row.uptime || ''),
      encoding: String(row.encoding || ''),
      bytesIn: parseBytes(row['bytes-in'] ?? row.bytesIn),
      bytesOut: parseBytes(row['bytes-out'] ?? row.bytesOut),
    }))
    .filter(session => session.name);
}

async function removePppoeSessions(router: RouterConnection, name: string): Promise<number> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ppp/active', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ppp active').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  const sessions = rows.filter(row => String(row.name || '').trim() === name.trim());
  for (const session of sessions) {
    const id = String(session['.id'] || session.id || '');
    if (!id) throw new Error(`Router tidak mengembalikan ID untuk sesi PPPoE "${name}"`);
    if (router.apiType === 'rest') {
      await restRequest(router, `/ppp/active/${encodeURIComponent(id)}`, 'DELETE');
    } else {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        await api.menu('/ppp active').where('id', id).delete();
      } finally {
        await client.close();
      }
    }
  }
  return sessions.length;
}

export async function disconnectPppoeSessions(router: RouterConnection, name: string): Promise<number> {
  const disconnected = await removePppoeSessions(router, name);
  if (!disconnected) throw new Error(`Sesi PPPoE aktif untuk "${name}" tidak ditemukan pada router`);
  return disconnected;
}

function toRouterConfig(
  router: RouterConnection,
  identity: unknown,
  resource: RouterRow,
  activePppoe: number,
  activeHotspot: number
): RouterConfig {
  const model = String(resource['board-name'] || resource.boardName || 'RouterOS');
  return {
    id: router.id || `${router.host}:${router.port}`,
    name: router.name || String(identity || router.host),
    host: router.host,
    port: router.port,
    username: router.username,
    apiType: router.apiType,
    status: 'connected',
    model,
    rosVersion: String(resource.version || 'Unknown'),
    cpuLoad: Number(resource['cpu-load'] || resource.cpuLoad || 0),
    memoryFreeMb: Math.round(Number(resource['free-memory'] || resource.freeMemory || 0) / (1024 * 1024)),
    uptime: String(resource.uptime || 'Unknown'),
    activePppoe,
    activeHotspot,
  };
}

export async function getRouterLogs(router: RouterConnection, limit = 50): Promise<RouterLogEntry[]> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/log', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/log').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  return rows.slice(-limit).reverse().map((row, index) => ({
    id: String(row['.id'] || row.id || `${row.time || 'log'}-${index}`),
    time: String(row.time || ''),
    topics: String(row.topics || ''),
    message: String(row.message || ''),
  }));
}

export async function getRouterInterfaces(router: RouterConnection): Promise<string[]> {
  if (router.apiType === 'rest') {
    const interfaces = await restRequest<RouterRow[]>(router, '/interface', 'GET');
    return interfaces.map(item => String(item.name)).filter(Boolean);
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    const interfaces = await api.menu('/interface').get() as RouterRow[];
    return interfaces.map(item => String(item.name)).filter(Boolean);
  } finally {
    await client.close();
  }
}

export async function getRouterInterfaceTraffic(
  router: RouterConnection,
  interfaceName: string
): Promise<{ rxBitsPerSecond: number; txBitsPerSecond: number }> {
  const readTraffic = (row: RouterRow) => {
    const rx = Number(row['rx-bits-per-second'] ?? row.rxBitsPerSecond ?? 0);
    const tx = Number(row['tx-bits-per-second'] ?? row.txBitsPerSecond ?? 0);
    if (!Number.isFinite(rx) || !Number.isFinite(tx) || rx < 0 || tx < 0) {
      throw new Error('RouterOS returned invalid interface traffic counters');
    }
    return { rxBitsPerSecond: rx, txBitsPerSecond: tx };
  };

  if (router.apiType === 'rest') {
    const rows = await restRequest<RouterRow[]>(router, '/interface/monitor-traffic', 'POST', {
      interface: interfaceName,
      once: '',
    });
    const row = rows[0];
    if (!row) throw new Error(`RouterOS returned no traffic data for interface ${interfaceName}`);
    return readTraffic(row);
  }

  const session = acquireRouterRawSession(router);
  try {
    const api = await connectRouterRawSession(session);
    const rows = await api.write([
      '/interface/monitor-traffic',
      `=interface=${interfaceName}`,
      '=once=',
    ]) as RouterRow[];
    const row = rows[0];
    if (!row) throw new Error(`RouterOS returned no traffic data for interface ${interfaceName}`);
    return readTraffic(row);
  } finally {
    releaseRouterRawSession(session);
  }
}

export async function getRouterPools(router: RouterConnection): Promise<string[]> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ip/pool', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ip pool').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  return rows.map(row => String(row.name || '')).filter(Boolean);
}

export async function getPppProfiles(router: RouterConnection): Promise<Array<{
  name: string;
  rateLimit: string;
  localAddress: string;
  remoteAddress: string;
  dnsServers: string;
}>> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ppp/profile', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ppp profile').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  return rows.map(row => ({
    name: String(row.name || ''),
    rateLimit: String(row.rateLimit || row['rate-limit'] || ''),
    localAddress: String(row['local-address'] || row.localAddress || ''),
    remoteAddress: String(row['remote-address'] || row.remoteAddress || ''),
    dnsServers: String(row['dns-server'] || row.dnsServer || ''),
  })).filter(profile => profile.name);
}

export async function addPppProfile(
  router: RouterConnection,
  profile: { name: string; localAddress?: string; remoteAddress?: string; rateLimit?: string; dnsServers?: string }
): Promise<void> {
  const fields: Record<string, string> = { name: profile.name };
  if (profile.localAddress) fields['local-address'] = profile.localAddress;
  if (profile.remoteAddress) fields['remote-address'] = profile.remoteAddress;
  if (profile.rateLimit) fields['rate-limit'] = profile.rateLimit;
  if (profile.dnsServers) fields['dns-server'] = profile.dnsServers;
  if (router.apiType === 'rest') {
    await restRequest(router, '/ppp/profile', 'POST', fields);
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ppp profile').add(fields);
  } finally {
    await client.close();
  }
}

export async function updatePppProfile(
  router: RouterConnection,
  existingName: string,
  profile: { name: string; localAddress: string; remoteAddress: string; rateLimit: string; dnsServers: string }
): Promise<void> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ppp/profile', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ppp profile').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  const existing = rows.find(row => row.name === existingName);
  if (!existing) throw new Error(`PPP profile "${existingName}" was not found on the router`);
  if (profile.name !== existingName && rows.some(row => row.name === profile.name)) {
    throw new Error(`PPP profile "${profile.name}" already exists on the router`);
  }
  const id = String(existing['.id'] || existing.id || '');
  if (!id) throw new Error(`Router did not return an ID for PPP profile "${existingName}"`);
  const fields: Record<string, string> = {
    name: profile.name,
    'local-address': profile.localAddress,
    'remote-address': profile.remoteAddress,
    'rate-limit': profile.rateLimit,
    'dns-server': profile.dnsServers,
  };
  if (router.apiType === 'rest') {
    await restRequest(router, `/ppp/profile/${encodeURIComponent(id)}`, 'PUT', fields);
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ppp profile').where('.id', id).update(fields);
  } finally {
    await client.close();
  }
}

export async function deletePppProfile(router: RouterConnection, name: string): Promise<void> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ppp/profile', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ppp profile').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  const existing = rows.find(row => row.name === name);
  if (!existing) throw new Error(`PPP profile "${name}" was not found on the router`);
  const id = String(existing['.id'] || existing.id || '');
  if (!id) throw new Error(`Router did not return an ID for PPP profile "${name}"`);
  if (router.apiType === 'rest') {
    await restRequest(router, `/ppp/profile/${encodeURIComponent(id)}`, 'DELETE');
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ppp profile').where('.id', id).delete();
  } finally {
    await client.close();
  }
}

export async function getHotspotUserProfiles(router: RouterConnection): Promise<Array<{
  name: string;
  rateLimit: string;
  sharedUsers: number;
  addressPool: string;
  sessionTimeout: string;
  idleTimeout: string;
}>> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ip/hotspot/user/profile', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ip hotspot user profile').get() as RouterRow[];
      } finally {
        await client.close();
      }

    })();
  return rows.map(row => ({
    name: String(row.name || ''),
    rateLimit: String(row['rate-limit'] || row.rateLimit || ''),
    sharedUsers: Number(row['shared-users'] || row.sharedUsers || 1),
    addressPool: String(row['address-pool'] || row.addressPool || '').replace(/^none$/i, ''),
    sessionTimeout: String(row['session-timeout'] || row.sessionTimeout || ''),
    idleTimeout: String(row['idle-timeout'] || row.idleTimeout || ''),
  })).filter(profile => profile.name);
}

export async function addHotspotUserProfile(
  router: RouterConnection,
  profile: { name: string; rateLimit?: string; sharedUsers?: number; addressPool?: string; sessionTimeout?: string; idleTimeout?: string }
): Promise<void> {
  const fields: Record<string, string> = { name: profile.name };
  if (profile.rateLimit) fields['rate-limit'] = profile.rateLimit;
  if (profile.sharedUsers) fields['shared-users'] = String(profile.sharedUsers);
  if (profile.addressPool) fields['address-pool'] = profile.addressPool;
  if (profile.sessionTimeout) fields['session-timeout'] = profile.sessionTimeout;
  if (profile.idleTimeout) fields['idle-timeout'] = profile.idleTimeout;
  if (router.apiType === 'rest') {
    await restRequest(router, '/ip/hotspot/user/profile', 'POST', fields);
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ip hotspot user profile').add(fields);
  } finally {
    await client.close();
  }
}

export async function updateHotspotUserProfile(
  router: RouterConnection,
  existingName: string,
  profile: { name: string; rateLimit: string; sharedUsers: number; addressPool: string; sessionTimeout: string; idleTimeout: string }
): Promise<void> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ip/hotspot/user/profile', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ip hotspot user profile').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  const existing = rows.find(row => row.name === existingName);
  if (!existing) throw new Error(`Hotspot user profile "${existingName}" was not found on the router`);
  if (profile.name !== existingName && rows.some(row => row.name === profile.name)) {
    throw new Error(`Hotspot user profile "${profile.name}" already exists on the router`);
  }
  const id = String(existing['.id'] || existing.id || '');
  if (!id) throw new Error(`Router did not return an ID for hotspot user profile "${existingName}"`);
  const fields: Record<string, string> = {
    name: profile.name,
    'rate-limit': profile.rateLimit,
    'shared-users': String(profile.sharedUsers),
    'address-pool': profile.addressPool || 'none',
    'session-timeout': profile.sessionTimeout,
    'idle-timeout': profile.idleTimeout,
  };
  if (router.apiType === 'rest') {
    await restRequest(router, `/ip/hotspot/user/profile/${encodeURIComponent(id)}`, 'PUT', fields);
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ip hotspot user profile').where('.id', id).update(fields);
  } finally {
    await client.close();
  }
}

export async function deleteHotspotUserProfile(router: RouterConnection, name: string): Promise<void> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ip/hotspot/user/profile', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ip hotspot user profile').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  const existing = rows.find(row => row.name === name);
  if (!existing) throw new Error(`Hotspot user profile "${name}" was not found on the router`);
  const id = String(existing['.id'] || existing.id || '');
  if (!id) throw new Error(`Router did not return an ID for hotspot user profile "${name}"`);
  if (router.apiType === 'rest') {
    await restRequest(router, `/ip/hotspot/user/profile/${encodeURIComponent(id)}`, 'DELETE');
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ip hotspot user profile').where('.id', id).delete();
  } finally {
    await client.close();
  }
}

export async function getHotspotServerProfiles(router: RouterConnection): Promise<Array<{
  name: string;
  hotspotAddress: string;
  dnsName: string;
  htmlDirectory: string;
  loginBy: string;
  useRadius: boolean;
}>> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ip/hotspot/profile', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ip hotspot profile').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  return rows.map(row => ({
    name: String(row.name || ''),
    hotspotAddress: String(row['hotspot-address'] || row.hotspotAddress || ''),
    dnsName: String(row['dns-name'] || row.dnsName || ''),
    htmlDirectory: String(row['html-directory'] || row.htmlDirectory || ''),
    loginBy: String(row['login-by'] || row.loginBy || ''),
    useRadius: row['use-radius'] === true || row['use-radius'] === 'true' || row['use-radius'] === 'yes',
  })).filter(profile => profile.name);
}

async function getRouterFileEntries(router: RouterConnection): Promise<RouterFileEntry[]> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/file', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/file').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  return rows.map(row => {
    const name = String(row.name || '');
    const type = String(row.type || '');
    return {
      id: String(row['.id'] || row.id || ''),
      name,
      type,
      size: String(row.size || ''),
      isDirectory: type.toLowerCase() === 'directory' || name.endsWith('/'),
    };
  }).filter(file => file.id && file.name);
}

function normalizeRouterDirectory(directory: string): string {
  const normalized = directory.trim().replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.split('/').some(part => !part || part === '.' || part === '..') || normalized.includes('\\')) {
    throw new Error('Direktori Hotspot tidak valid');
  }
  return normalized;
}

function normalizeRouterEntryName(name: string): string {
  return name.replace(/^\/+|\/+$/g, '');
}

export async function getHotspotFileListing(
  router: RouterConnection,
  directory?: string
): Promise<{ directories: string[]; files: RouterFileEntry[] }> {
  const entries = await getRouterFileEntries(router);
  const directories = entries
    .filter(file => file.isDirectory)
    .map(file => normalizeRouterEntryName(file.name))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  if (!directory) return { directories, files: [] };
  const normalizedDirectory = normalizeRouterDirectory(directory);
  const prefix = `${normalizedDirectory}/`;
  const files = entries
    .filter(file => !file.isDirectory && normalizeRouterEntryName(file.name).startsWith(prefix))
    .map(file => ({ ...file, name: normalizeRouterEntryName(file.name) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { directories, files };
}

export async function deleteHotspotFile(
  router: RouterConnection,
  directory: string,
  name: string
): Promise<void> {
  const normalizedDirectory = normalizeRouterDirectory(directory);
  const entries = await getRouterFileEntries(router);
  const normalizedName = normalizeRouterEntryName(name);
  const file = entries.find(entry => normalizeRouterEntryName(entry.name) === normalizedName && !entry.isDirectory);
  if (!file || !normalizeRouterEntryName(file.name).startsWith(`${normalizedDirectory}/`)) {
    throw new Error('File tidak ditemukan di direktori Hotspot yang dipilih');
  }
  if (router.apiType === 'rest') {
    await restRequest(router, `/file/${encodeURIComponent(file.id)}`, 'DELETE');
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/file').where('.id', file.id).delete();
  } finally {
    await client.close();
  }
}

export async function addHotspotServerProfile(
  router: RouterConnection,
  profile: { name: string; hotspotAddress?: string; dnsName?: string; htmlDirectory?: string; loginBy?: string; useRadius?: boolean }
): Promise<void> {
  const fields: Record<string, string> = { name: profile.name };
  if (profile.hotspotAddress) fields['hotspot-address'] = profile.hotspotAddress;
  if (profile.dnsName) fields['dns-name'] = profile.dnsName;
  if (profile.htmlDirectory) fields['html-directory'] = profile.htmlDirectory;
  if (profile.loginBy) fields['login-by'] = profile.loginBy;
  if (profile.useRadius !== undefined) fields['use-radius'] = profile.useRadius ? 'yes' : 'no';
  if (router.apiType === 'rest') {
    await restRequest(router, '/ip/hotspot/profile', 'POST', fields);
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ip hotspot profile').add(fields);
  } finally {
    await client.close();
  }
}

export async function updateHotspotServerProfile(
  router: RouterConnection,
  existingName: string,
  profile: { name: string; hotspotAddress: string; dnsName: string; htmlDirectory: string; loginBy: string; useRadius: boolean }
): Promise<void> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ip/hotspot/profile', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ip hotspot profile').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  const existing = rows.find(row => row.name === existingName);
  if (!existing) throw new Error(`Hotspot server profile "${existingName}" was not found on the router`);
  if (profile.name !== existingName && rows.some(row => row.name === profile.name)) {
    throw new Error(`Hotspot server profile "${profile.name}" already exists on the router`);
  }
  const id = String(existing['.id'] || existing.id || '');
  if (!id) throw new Error(`Router did not return an ID for Hotspot server profile "${existingName}"`);
  const fields: Record<string, string> = {
    name: profile.name,
    'hotspot-address': profile.hotspotAddress,
    'dns-name': profile.dnsName,
    'html-directory': profile.htmlDirectory,
    'login-by': profile.loginBy,
    'use-radius': profile.useRadius ? 'yes' : 'no',
  };
  if (router.apiType === 'rest') {
    await restRequest(router, `/ip/hotspot/profile/${encodeURIComponent(id)}`, 'PUT', fields);
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ip hotspot profile').where('.id', id).update(fields);
  } finally {
    await client.close();
  }
}

export async function deleteHotspotServerProfile(router: RouterConnection, name: string): Promise<void> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ip/hotspot/profile', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ip hotspot profile').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  const existing = rows.find(row => row.name === name);
  if (!existing) throw new Error(`Hotspot server profile "${name}" was not found on the router`);
  const id = String(existing['.id'] || existing.id || '');
  if (!id) throw new Error(`Router did not return an ID for Hotspot server profile "${name}"`);
  if (router.apiType === 'rest') {
    await restRequest(router, `/ip/hotspot/profile/${encodeURIComponent(id)}`, 'DELETE');
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ip hotspot profile').where('.id', id).delete();
  } finally {
    await client.close();
  }
}

export async function addHotspotServer(
  router: RouterConnection,
  server: { name: string; interface: string; addressPool?: string; profile: string }
): Promise<void> {
  const fields: Record<string, string> = {
    name: server.name,
    interface: server.interface,
    profile: server.profile,
    disabled: 'no',
  };
  if (server.addressPool) fields['address-pool'] = server.addressPool;
  if (router.apiType === 'rest') {
    await restRequest(router, '/ip/hotspot', 'POST', fields);
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ip hotspot').add(fields);
  } finally {
    await client.close();
  }
}

export async function getRouterServiceRecords(
  router: RouterConnection,
  kind: 'pppoe' | 'hotspot'
): Promise<RouterServiceRecord[]> {
  const path = kind === 'pppoe' ? '/interface/pppoe-server/server' : '/ip/hotspot';
  const menuPath = kind === 'pppoe' ? '/interface pppoe-server server' : '/ip hotspot';
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, path, 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu(menuPath).get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  return rows.map(row => toRouterServiceRecord(row, kind)).filter(row => row.id);
}

export async function updateRouterServiceRecord(
  router: RouterConnection,
  kind: 'pppoe' | 'hotspot',
  id: string,
  fields: Record<string, string | boolean>
): Promise<void> {
  const path = kind === 'pppoe' ? '/interface/pppoe-server/server' : '/ip/hotspot';
  const menuPath = kind === 'pppoe' ? '/interface pppoe-server server' : '/ip hotspot';
  const body = Object.fromEntries(Object.entries(fields).map(([key, value]) => [
    key,
    key === 'disabled'
      ? (value === true || value === 'yes' || value === 'true' ? 'yes' : 'no')
      : String(value),
  ]));
  if (router.apiType === 'rest') {
    await restRequest(router, `${path}/${encodeURIComponent(id)}`, 'PUT', body);
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu(menuPath).where('.id', id).update(body);
  } finally {
    await client.close();
  }
}

export async function deleteRouterServiceRecord(
  router: RouterConnection,
  kind: 'pppoe' | 'hotspot',
  id: string
): Promise<void> {
  const path = kind === 'pppoe' ? '/interface/pppoe-server/server' : '/ip/hotspot';
  const menuPath = kind === 'pppoe' ? '/interface pppoe-server server' : '/ip hotspot';
  if (router.apiType === 'rest') {
    await restRequest(router, `${path}/${encodeURIComponent(id)}`, 'DELETE');
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu(menuPath).where('.id', id).delete();
  } finally {
    await client.close();
  }
}

export async function ensureHotspotUserProfile(
  router: RouterConnection,
  profile: { name: string; rateLimit: string; sharedUsers: number; addressPool?: string }
): Promise<void> {
  const profiles = await getHotspotUserProfiles(router);
  const existing = profiles.find(item => item.name === profile.name);
  if (existing) {
    if (
      existing.rateLimit !== profile.rateLimit ||
      existing.sharedUsers !== profile.sharedUsers ||
      (profile.addressPool !== undefined && existing.addressPool !== profile.addressPool)
    ) {
      throw new Error(`Hotspot profile "${profile.name}" already exists with different settings`);
    }
    return;
  }
  if (router.apiType === 'rest') {
    await restRequest(router, '/ip/hotspot/user/profile', 'POST', {
      name: profile.name,
      'rate-limit': profile.rateLimit,
      'shared-users': String(profile.sharedUsers),
      ...(profile.addressPool ? { 'address-pool': profile.addressPool } : {}),
    });
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ip hotspot user profile').add({
      name: profile.name,
      'rate-limit': profile.rateLimit,
      'shared-users': profile.sharedUsers,
      ...(profile.addressPool ? { 'address-pool': profile.addressPool } : {}),
    });
  } finally {
    await client.close();
  }
}

export async function addHotspotUser(
  router: RouterConnection,
  user: {
    name: string;
    password: string;
    profile: string;
    limitUptime: string;
    limitBytesTotal?: number;
    comment: string;
  }
): Promise<void> {
  const existingUsers = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ip/hotspot/user', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ip hotspot user').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  const existing = existingUsers.find(item => item.name === user.name);
  if (existing) {
    if (existing.profile === user.profile && existing['limit-uptime'] === user.limitUptime) return;
    throw new Error(`Hotspot username "${user.name}" already exists with different settings`);
  }

  const fields: Record<string, string> = {
    name: user.name,
    password: user.password,
    profile: user.profile,
    'limit-uptime': user.limitUptime,
    comment: user.comment,
  };
  if (user.limitBytesTotal) fields['limit-bytes-total'] = String(user.limitBytesTotal);
  if (router.apiType === 'rest') {
    await restRequest(router, '/ip/hotspot/user', 'POST', fields);
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ip hotspot user').add(fields);
  } finally {
    await client.close();
  }
}

export async function updateHotspotUser(
  router: RouterConnection,
  name: string,
  update: {
    password?: string;
    profile?: string;
    limitUptime?: string;
    limitBytesTotal?: number;
    comment?: string;
    disabled?: boolean;
  }
): Promise<void> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ip/hotspot/user', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ip hotspot user').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  const existing = rows.find(row => String(row.name || '') === name);
  if (!existing) throw new Error(`Hotspot user "${name}" was not found on the router`);
  const id = String(existing['.id'] || existing.id || '');
  if (!id) throw new Error(`Router did not return an ID for Hotspot user "${name}"`);

  const fields: Record<string, string> = {};
  if (update.password !== undefined) fields.password = update.password;
  if (update.profile !== undefined) fields.profile = update.profile;
  if (update.limitUptime !== undefined) fields['limit-uptime'] = update.limitUptime || '0s';
  if (update.limitBytesTotal !== undefined) fields['limit-bytes-total'] = String(update.limitBytesTotal);
  if (update.comment !== undefined) fields.comment = update.comment;
  if (update.disabled !== undefined) fields.disabled = update.disabled ? 'yes' : 'no';
  if (!Object.keys(fields).length) throw new Error('No Hotspot user fields were provided for update');

  if (router.apiType === 'rest') {
    await restRequest(router, `/ip/hotspot/user/${encodeURIComponent(id)}`, 'PUT', fields);
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ip hotspot user').where('.id', id).update(fields);
  } finally {
    await client.close();
  }
}

export interface HotspotUserRecord {
  id: string;
  name: string;
  password: string;
  profile: string;
  comment: string;
  disabled: boolean;
  limitUptime: string;
  limitBytesTotal: number;
  bytesIn: number;
  bytesOut: number;
  active: boolean;
  sessionUptime: string;
  address: string;
  macAddress: string;
}

export async function getHotspotUsers(router: RouterConnection): Promise<HotspotUserRecord[]> {
  const [users, activeSessions] = await Promise.all([
    router.apiType === 'rest'
      ? restRequest<RouterRow[]>(router, '/ip/hotspot/user', 'GET')
      : (async () => {
        const client = apiClient(router);
        try {
          const api = await client.connect();
          return await api.menu('/ip hotspot user').get() as RouterRow[];
        } finally {
          await client.close();
        }
      })(),
    router.apiType === 'rest'
      ? restRequest<RouterRow[]>(router, '/ip/hotspot/active', 'GET')
      : (async () => {
        const client = apiClient(router);
        try {
          const api = await client.connect();
          return await api.menu('/ip hotspot active').get() as RouterRow[];
        } finally {
          await client.close();
        }
      })(),
  ]);
  const activeByName = new Map(activeSessions.map(session => [
    String(session.user || session.name || ''),
    session,
  ]));
  const readNumber = (value: unknown): number => {
    const number = Number(value || 0);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  };
  return users
    .map(row => {
      const name = String(row.name || '');
      const active = activeByName.get(name);
      const id = String(row['.id'] || row.id || '');
      return {
        id: id || name,
        name,
        password: row.password && row.password !== '*' ? String(row.password) : '',
        profile: String(row.profile || ''),
        comment: String(row.comment || ''),
        disabled: row.disabled === true || row.disabled === 'true' || row.disabled === 'yes',
        limitUptime: String(row['limit-uptime'] || row.limitUptime || ''),
        limitBytesTotal: readNumber(row['limit-bytes-total'] || row.limitBytesTotal),
        bytesIn: readNumber(row['bytes-in'] || row.bytesIn),
        bytesOut: readNumber(row['bytes-out'] || row.bytesOut),
        active: Boolean(active),
        sessionUptime: String(active?.uptime || ''),
        address: String(active?.address || ''),
        macAddress: String(active?.['mac-address'] || active?.macAddress || ''),
      };
    })
    .filter(user => user.name);
}

export async function deleteHotspotUser(router: RouterConnection, name: string): Promise<void> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ip/hotspot/user', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ip hotspot user').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  const existing = rows.find(row => row.name === name);
  if (!existing) throw new Error(`Hotspot user "${name}" was not found on the router`);
  const id = String(existing['.id'] || existing.id || '');
  if (!id) throw new Error(`Router did not return an ID for hotspot user "${name}"`);
  if (router.apiType === 'rest') {
    await restRequest(router, `/ip/hotspot/user/${encodeURIComponent(id)}`, 'DELETE');
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ip hotspot user').where('.id', id).delete();
  } finally {
    await client.close();
  }
}

export async function disconnectHotspotUser(router: RouterConnection, name: string): Promise<void> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ip/hotspot/active', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ip hotspot active').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  const session = rows.find(row => String(row.user || row.name || '') === name);
  if (!session) throw new Error(`Active Hotspot session for "${name}" was not found on the router`);
  const id = String(session['.id'] || session.id || '');
  if (!id) throw new Error(`Router did not return an ID for active Hotspot session "${name}"`);
  if (router.apiType === 'rest') {
    await restRequest(router, `/ip/hotspot/active/${encodeURIComponent(id)}`, 'DELETE');
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    await api.menu('/ip hotspot active').where('.id', id).delete();
  } finally {
    await client.close();
  }
}

export async function addPppoeSecret(
  router: RouterConnection,
  secret: { name: string; password: string; profile: string; comment?: string; disabled?: boolean }
): Promise<void> {
  if (
    typeof secret.password !== 'string' ||
    !secret.password.trim() ||
    secret.password.trim().toLowerCase() === 'undefined'
  ) {
    throw new Error('PPPoE password must be a defined, non-empty string');
  }
  const fields: { name: string; password: string; profile: string; comment?: string; disabled?: boolean } = {
    name: secret.name,
    password: secret.password,
    profile: secret.profile,
  };
  if (secret.comment !== undefined) fields.comment = secret.comment;
  if (secret.disabled !== undefined) fields.disabled = secret.disabled;

  if (router.apiType === 'rest') {
    const existing = await restRequest<RouterRow[]>(router, '/ppp/secret', 'GET');
    if (existing.some(item => item.name === secret.name)) throw new Error('PPPoE username already exists on router');
    const restFields: Record<string, string> = {
      name: fields.name,
      password: fields.password,
      profile: fields.profile,
    };
    if (fields.comment !== undefined) restFields.comment = fields.comment;
    if (fields.disabled !== undefined) restFields.disabled = String(fields.disabled);
    await restRequest(router, '/ppp/secret', 'POST', restFields);
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    const existing = await api.menu('/ppp secret').get() as RouterRow[];
    if (findPppoeSecret(existing, secret.name)) throw new Error('PPPoE username already exists on router');
    await api.menu('/ppp secret').add(fields);
  } finally {
    await client.close();
  }
}

export interface PppoeSecretRecord {
  name: string;
  profile: string;
  disabled: boolean;
  remoteAddress: string;
  localAddress: string;
  callerId: string;
  service: string;
  comment: string;
}

function missingPppoeSecret(name: string, router: RouterConnection, secrets: RouterRow[]): Error {
  return new Error(
    `User PPPoE "${name}" tidak ditemukan pada ${router.name} (${router.host}). MikroTik mengembalikan ${secrets.length} secret; pastikan Router dan username pelanggan sesuai.`
  );
}

function findPppoeSecret(secrets: RouterRow[], name: string): RouterRow | undefined {
  const username = name.trim();
  return secrets.find(secret => typeof secret.name === 'string' && secret.name.trim() === username);
}

function getPppoeSecretId(secret: RouterRow, router: RouterConnection): string | undefined {
  const id = router.apiType === 'rest' ? secret['.id'] : secret.id;
  return id === undefined ? undefined : String(id);
}

function preservePppoeSecretProfile(
  secret: RouterRow,
  update: { password?: string; profile?: string; disabled?: boolean; comment?: string }
): { password?: string; profile?: string; disabled?: boolean; comment?: string } {
  const definedUpdate: { password?: string; profile?: string; disabled?: boolean; comment?: string } = {};
  if (update.password !== undefined) {
    if (!update.password.trim() || update.password.trim().toLowerCase() === 'undefined') {
      throw new Error('PPPoE password must be a defined, non-empty string');
    }
    definedUpdate.password = update.password;
  }
  if (update.profile !== undefined) definedUpdate.profile = update.profile;
  if (update.disabled !== undefined) definedUpdate.disabled = update.disabled;
  if (update.comment !== undefined) definedUpdate.comment = update.comment;

  if (definedUpdate.profile !== undefined || definedUpdate.disabled === undefined) return definedUpdate;
  const profile = String(secret.profile || '').trim();
  if (!profile) throw new Error('MikroTik tidak mengembalikan profile PPPoE Secret; perubahan status dibatalkan.');
  return { ...definedUpdate, profile };
}

export async function getPppoeSecrets(router: RouterConnection): Promise<PppoeSecretRecord[]> {
  const rows = router.apiType === 'rest'
    ? await restRequest<RouterRow[]>(router, '/ppp/secret', 'GET')
    : await (async () => {
      const client = apiClient(router);
      try {
        const api = await client.connect();
        return await api.menu('/ppp secret').get() as RouterRow[];
      } finally {
        await client.close();
      }
    })();
  return rows.map(row => ({
    name: String(row.name || '').trim(),
    profile: String(row.profile || ''),
    disabled: row.disabled === true || row.disabled === 'true' || row.disabled === 'yes',
    remoteAddress: String(row['remote-address'] || row.remoteAddress || ''),
    localAddress: String(row['local-address'] || row.localAddress || ''),
    callerId: String(row['caller-id'] || row.callerId || ''),
    service: String(row.service || ''),
    comment: String(row.comment || ''),
  })).filter(secret => secret.name);
}

export async function updatePppoeSecret(
  router: RouterConnection,
  name: string,
  update: { password?: string; profile?: string; disabled?: boolean; comment?: string }
): Promise<void> {
  if (router.apiType === 'rest') {
    const secrets = await restRequest<RouterRow[]>(router, '/ppp/secret', 'GET');
    const secret = findPppoeSecret(secrets, name);
    if (!secret) throw missingPppoeSecret(name, router, secrets);
    const id = encodeURIComponent(String(secret['.id']));
    const effectiveUpdate = preservePppoeSecretProfile(secret, update);
    const body = Object.fromEntries(Object.entries(effectiveUpdate).map(([key, value]) => [
      key,
      typeof value === 'boolean' ? String(value) : value,
    ])) as Record<string, string>;
    await restRequest(router, `/ppp/secret/${id}`, 'PUT', body);
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    const secrets = await api.menu('/ppp secret').get() as RouterRow[];
    const secret = findPppoeSecret(secrets, name);
    const id = secret && getPppoeSecretId(secret, router);
    if (!id) throw missingPppoeSecret(name, router, secrets);
    await api.menu('/ppp secret').where('id', id).update(preservePppoeSecretProfile(secret, update));
  } finally {
    await client.close();
  }
}

export async function deletePppoeSecret(router: RouterConnection, name: string): Promise<void> {
  if (router.apiType === 'rest') {
    const secrets = await restRequest<RouterRow[]>(router, '/ppp/secret', 'GET');
    const secret = findPppoeSecret(secrets, name);
    if (!secret) throw missingPppoeSecret(name, router, secrets);
    await removePppoeSessions(router, name);
    await restRequest(router, `/ppp/secret/${encodeURIComponent(String(secret['.id']))}`, 'DELETE');
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    const secrets = await api.menu('/ppp secret').get() as RouterRow[];
    const secret = findPppoeSecret(secrets, name);
    const id = secret && getPppoeSecretId(secret, router);
    if (!id) throw missingPppoeSecret(name, router, secrets);
    await removePppoeSessions(router, name);
    await api.menu('/ppp secret').where('id', id).delete();
  } finally {
    await client.close();
  }
}

export async function configurePppoeServer(
  router: RouterConnection,
  config: PppoeSetup
): Promise<{ created: string[]; unchanged: string[] }> {
  const created: string[] = [];
  const unchanged: string[] = [];

  if (router.apiType === 'rest') {
    const interfaces = await restRequest<RouterRow[]>(router, '/interface', 'GET');
    if (!interfaces.some(item => item.name === config.interface)) {
      throw new Error(`Interface "${config.interface}" tidak ditemukan di router`);
    }
    const [pools, profiles, servers] = await Promise.all([
      restRequest<RouterRow[]>(router, '/ip/pool', 'GET'),
      restRequest<RouterRow[]>(router, '/ppp/profile', 'GET'),
      restRequest<RouterRow[]>(router, '/interface/pppoe-server/server', 'GET'),
    ]);
    if (servers.some(item => item.interface === config.interface)) {
      throw new Error(`PPPoE server sudah menggunakan interface "${config.interface}". Periksa konfigurasi yang ada secara manual.`);
    }
    const existingPool = pools.find(item => item.name === config.poolName);
    if (existingPool && existingPool.ranges !== config.poolRange) {
      throw new Error(`Pool "${config.poolName}" sudah ada dengan rentang alamat berbeda.`);
    }
    if (existingPool) unchanged.push(`pool ${config.poolName}`);
    else {
      await restRequest(router, '/ip/pool', 'POST', { name: config.poolName, ranges: config.poolRange });
      created.push(`pool ${config.poolName}`);
    }
    const existingProfile = profiles.find(item => item.name === config.profileName);
    if (existingProfile && (
      existingProfile['local-address'] !== config.localAddress ||
      existingProfile['remote-address'] !== config.poolName ||
      existingProfile['rate-limit'] !== config.rateLimit
    )) {
      throw new Error(`Profile "${config.profileName}" sudah ada dengan pengaturan berbeda.`);
    }
    if (existingProfile) unchanged.push(`profile ${config.profileName}`);
    else {
      await restRequest(router, '/ppp/profile', 'POST', {
        name: config.profileName,
        'local-address': config.localAddress,
        'remote-address': config.poolName,
        'rate-limit': config.rateLimit,
        'dns-server': config.dnsServers,
      });
      created.push(`profile ${config.profileName}`);
    }
    await restRequest(router, '/interface/pppoe-server/server', 'POST', {
      'service-name': config.serviceName,
      interface: config.interface,
      'default-profile': config.profileName,
      authentication: 'pap,chap,mschap2',
      disabled: 'no',
    });
    created.push(`server ${config.interface}`);
    return { created, unchanged };
  }

  const client = apiClient(router);
  try {
    const api = await client.connect();
    const [interfaces, pools, profiles, servers] = await Promise.all([
      api.menu('/interface').get(),
      api.menu('/ip pool').get(),
      api.menu('/ppp profile').get(),
      api.menu('/interface pppoe-server server').get(),
    ]) as [RouterRow[], RouterRow[], RouterRow[], RouterRow[]];

    if (!interfaces.some(item => item.name === config.interface)) {
      throw new Error(`Interface "${config.interface}" tidak ditemukan di router`);
    }
    if (servers.some(item => item.interface === config.interface)) {
      throw new Error(`PPPoE server sudah menggunakan interface "${config.interface}". Periksa konfigurasi yang ada secara manual.`);
    }
    const existingPool = pools.find(item => item.name === config.poolName);
    if (existingPool && existingPool.ranges !== config.poolRange) {
      throw new Error(`Pool "${config.poolName}" sudah ada dengan rentang alamat berbeda.`);
    }
    if (existingPool) unchanged.push(`pool ${config.poolName}`);
    else {
      await api.menu('/ip pool').add({ name: config.poolName, ranges: config.poolRange });
      created.push(`pool ${config.poolName}`);
    }
    const existingProfile = profiles.find(item => item.name === config.profileName);
    if (existingProfile && (
      (existingProfile['local-address'] || existingProfile.localAddress) !== config.localAddress ||
      (existingProfile['remote-address'] || existingProfile.remoteAddress) !== config.poolName ||
      (existingProfile['rate-limit'] || existingProfile.rateLimit) !== config.rateLimit
    )) {
      throw new Error(`Profile "${config.profileName}" sudah ada dengan pengaturan berbeda.`);
    }
    if (existingProfile) unchanged.push(`profile ${config.profileName}`);
    else {
      await api.menu('/ppp profile').add({
        name: config.profileName,
        'local-address': config.localAddress,
        'remote-address': config.poolName,
        'rate-limit': config.rateLimit,
        'dns-server': config.dnsServers,
      });
      created.push(`profile ${config.profileName}`);
    }
    await api.menu('/interface pppoe-server server').add({
      'service-name': config.serviceName,
      interface: config.interface,
      'default-profile': config.profileName,
      authentication: 'pap,chap,mschap2',
      disabled: 'no',
    });
    created.push(`server ${config.interface}`);
    return { created, unchanged };
  } finally {
    await client.close();
  }
}
