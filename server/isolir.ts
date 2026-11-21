import type { Customer } from '../src/types';

export interface IsolationPlanInput {
  customer: Pick<Customer, 'pppoeUsername' | 'profileName' | 'originalProfileName'>;
  isolirMethod: 'disable' | 'profile';
  isolirProfile: string;
}

export interface IsolationPlan {
  /** true = ganti profil ke profil isolir; false = nonaktifkan secret. */
  useProfile: boolean;
  /** Profil asli yang harus disimpan di DB server agar bisa dipulihkan. */
  originalProfileName?: string;
}

/**
 * Tentukan rencana isolir tanpa menyentuh RouterOS.
 * Profil asli hanya diambil dari DB server (originalProfileName / profileName),
 * tidak pernah dari profil live yang mungkin sudah berupa profil isolir.
 */
export function planIsolation(input: IsolationPlanInput): IsolationPlan {
  const isolirProfile = String(input.isolirProfile || '').trim();
  if (input.isolirMethod !== 'profile' || !isolirProfile) return { useProfile: false };

  const original = String(input.customer.originalProfileName || input.customer.profileName || '').trim();
  if (!original || original === isolirProfile) {
    throw new Error(
      `Profil PPP asli pelanggan "${input.customer.pppoeUsername}" tidak diketahui; isolir profil dibatalkan agar profil asli tidak hilang.`
    );
  }
  return { useProfile: true, originalProfileName: original };
}

/**
 * Profil tujuan saat pelanggan dipulihkan dari isolir.
 * Melempar error bila profil asli tidak diketahui agar RouterOS tidak diubah.
 */
export function resolveRestoreProfile(input: {
  customer: Pick<Customer, 'pppoeUsername' | 'profileName' | 'originalProfileName'>;
  isolirProfile: string;
  targetProfile?: string;
}): string {
  const isolirProfile = String(input.isolirProfile || '').trim();
  const candidate = String(
    input.targetProfile || input.customer.originalProfileName || input.customer.profileName || ''
  ).trim();
  if (!candidate || (isolirProfile && candidate === isolirProfile)) {
    throw new Error(
      `Profil PPP asli pelanggan "${input.customer.pppoeUsername}" tidak diketahui; aktivasi dibatalkan tanpa mengubah RouterOS.`
    );
  }
  return candidate;
}

/**
 * Profil yang disimpan sebagai profilName pelanggan setelah sinkronisasi RouterOS.
 * Profil isolir tidak boleh menimpa profil asli.
 */
export function nextProfileState(input: {
  currentProfileName: string;
  currentOriginalProfileName?: string;
  liveProfile: string;
  isolirProfile: string;
}): { profileName: string; originalProfileName?: string } {
  const liveProfile = String(input.liveProfile || '').trim();
  const isolirProfile = String(input.isolirProfile || '').trim();
  const liveIsIsolir = Boolean(isolirProfile) && liveProfile === isolirProfile;
  if (liveIsIsolir) {
    const original = String(input.currentOriginalProfileName || input.currentProfileName || '').trim();
    return {
      profileName: input.currentProfileName,
      originalProfileName: original || undefined,
    };
  }
  return {
    profileName: liveProfile || input.currentProfileName,
    originalProfileName: undefined,
  };
}
