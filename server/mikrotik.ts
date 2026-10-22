import { Channel, RouterOSClient } from 'routeros-client';
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

function apiClient(router: RouterConnection): RouterOSClient {
  return new RouterOSClient({
    host: router.host,
    port: router.port,
    user: router.username,
    password: router.password,
    timeout: router.timeoutSec,
    ...(router.apiType === 'api-ssl' ? { tls: {} } : {}),
  });
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

export async function getHotspotUserProfiles(router: RouterConnection): Promise<Array<{
  name: string;
  rateLimit: string;
  sharedUsers: number;
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
    sessionTimeout: String(row['session-timeout'] || row.sessionTimeout || ''),
    idleTimeout: String(row['idle-timeout'] || row.idleTimeout || ''),
  })).filter(profile => profile.name);
}

export async function addHotspotUserProfile(
  router: RouterConnection,
  profile: { name: string; rateLimit?: string; sharedUsers?: number; sessionTimeout?: string; idleTimeout?: string }
): Promise<void> {
  const fields: Record<string, string> = { name: profile.name };
  if (profile.rateLimit) fields['rate-limit'] = profile.rateLimit;
  if (profile.sharedUsers) fields['shared-users'] = String(profile.sharedUsers);
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
  profile: { name: string; rateLimit: string; sharedUsers: number }
): Promise<void> {
  const profiles = await getHotspotUserProfiles(router);
  const existing = profiles.find(item => item.name === profile.name);
  if (existing) {
    if (existing.rateLimit !== profile.rateLimit || existing.sharedUsers !== profile.sharedUsers) {
      throw new Error(`Hotspot profile "${profile.name}" already exists with different settings`);
    }
    return;
  }
  if (router.apiType === 'rest') {
    await restRequest(router, '/ip/hotspot/user/profile', 'POST', {
      name: profile.name,
      'rate-limit': profile.rateLimit,
      'shared-users': String(profile.sharedUsers),
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

export async function addPppoeSecret(
  router: RouterConnection,
  secret: { name: string; password: string; profile: string; comment?: string; disabled?: boolean }
): Promise<void> {
  if (router.apiType === 'rest') {
    const existing = await restRequest<RouterRow[]>(router, '/ppp/secret', 'GET');
    if (existing.some(item => item.name === secret.name)) throw new Error('PPPoE username already exists on router');
    const body = Object.fromEntries(Object.entries(secret).map(([key, value]) => [
      key,
      typeof value === 'boolean' ? String(value) : value,
    ])) as Record<string, string>;
    await restRequest(router, '/ppp/secret', 'POST', body);
    return;
  }
  const client = apiClient(router);
  try {
    const api = await client.connect();
    const existing = await api.menu('/ppp secret').get() as RouterRow[];
    if (findPppoeSecret(existing, secret.name)) throw new Error('PPPoE username already exists on router');
    await api.menu('/ppp secret').add(secret);
  } finally {
    await client.close();
  }
}

export interface PppoeSecretRecord {
  name: string;
  profile: string;
  disabled: boolean;
  remoteAddress: string;
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
  update: { password?: string; profile?: string; disabled?: boolean }
): { password?: string; profile?: string; disabled?: boolean } {
  if (update.profile !== undefined || update.disabled === undefined) return update;
  const profile = String(secret.profile || '').trim();
  if (!profile) throw new Error('MikroTik tidak mengembalikan profile PPPoE Secret; perubahan status dibatalkan.');
  return { ...update, profile };
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
  })).filter(secret => secret.name);
}

export async function updatePppoeSecret(
  router: RouterConnection,
  name: string,
  update: { password?: string; profile?: string; disabled?: boolean }
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
