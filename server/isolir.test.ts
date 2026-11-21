import { planIsolation, resolveRestoreProfile, nextProfileState } from './isolir.js';

function eq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const customer = { pppoeUsername: 'budi', profileName: 'HOME-20', originalProfileName: undefined };

// 1. Mode disable: tidak menyentuh profil.
const disablePlan = planIsolation({ customer, isolirMethod: 'disable', isolirProfile: 'ISOLIR' });
eq(disablePlan.useProfile, false, 'disable mode useProfile');

// 2. Mode profile: profil asli disimpan dari DB.
const profilePlan = planIsolation({ customer, isolirMethod: 'profile', isolirProfile: 'ISOLIR' });
eq(profilePlan.useProfile, true, 'profile mode useProfile');
eq(profilePlan.originalProfileName, 'HOME-20', 'profile mode original');

// 3. Mode profile tanpa profil isolir terpilih: fallback disable.
const noIsolir = planIsolation({ customer, isolirMethod: 'profile', isolirProfile: '  ' });
eq(noIsolir.useProfile, false, 'profile mode without isolir profile');

// 4. Profil asli tidak diketahui (sudah tertimpa profil isolir) harus menolak.
let threw = false;
try {
  planIsolation({ customer: { ...customer, profileName: 'ISOLIR' }, isolirMethod: 'profile', isolirProfile: 'ISOLIR' });
} catch { threw = true; }
eq(threw, true, 'isolation refuses unknown original profile');

// 5. Restore memakai profil asli tersimpan, bukan profil isolir.
eq(resolveRestoreProfile({ customer: { ...customer, profileName: 'ISOLIR', originalProfileName: 'HOME-20' }, isolirProfile: 'ISOLIR' }), 'HOME-20', 'restore uses stored original');

// 6. Restore menolak bila profil asli tidak diketahui.
threw = false;
try {
  resolveRestoreProfile({ customer: { ...customer, profileName: 'ISOLIR' }, isolirProfile: 'ISOLIR' });
} catch { threw = true; }
eq(threw, true, 'restore refuses unknown original profile');

// 7. Restore menolak profil isolir sebagai target.
threw = false;
try {
  resolveRestoreProfile({ customer, isolirProfile: 'ISOLIR', targetProfile: 'ISOLIR' });
} catch { threw = true; }
eq(threw, true, 'restore refuses isolir profile target');

// 8. Sync tidak menimpa profil asli saat secret memakai profil isolir.
const sync = nextProfileState({ currentProfileName: 'HOME-20', liveProfile: 'ISOLIR', isolirProfile: 'ISOLIR' });
eq(sync.profileName, 'HOME-20', 'sync keeps original profile');
eq(sync.originalProfileName, 'HOME-20', 'sync stores original');

// 9. Sync memakai profil live saat bukan profil isolir, dan membersihkan penanda.
const sync2 = nextProfileState({ currentProfileName: 'HOME-20', currentOriginalProfileName: 'HOME-20', liveProfile: 'HOME-30', isolirProfile: 'ISOLIR' });
eq(sync2.profileName, 'HOME-30', 'sync adopts live profile');
eq(sync2.originalProfileName, undefined, 'sync clears stale original');

// 10. Sync setelah isolir dipulihkan: profil asli kembali, penanda hilang.
const sync3 = nextProfileState({ currentProfileName: 'HOME-20', currentOriginalProfileName: 'HOME-20', liveProfile: 'HOME-20', isolirProfile: 'ISOLIR' });
eq(sync3.profileName, 'HOME-20', 'sync keeps restored profile');
eq(sync3.originalProfileName, undefined, 'sync clears marker after restore');

console.log('isolir self-check: OK');
