import React, { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';

interface Props {
  registrationRequired: boolean;
  envLoginConfigured: boolean;
  envLoginIncomplete: boolean;
  onAuthenticated: (username: string) => void;
}

export const AdminAuthPage: React.FC<Props> = ({
  registrationRequired,
  envLoginConfigured,
  envLoginIncomplete,
  onAuthenticated,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const endpoint = registrationRequired ? '/api/auth/register' : '/api/auth/login';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      onAuthenticated(result.username);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <section className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center">
            {registrationRequired ? <ShieldCheck className="w-6 h-6" /> : <KeyRound className="w-6 h-6" />}
          </div>
          <div>
            <h1 className="text-xl font-black">{registrationRequired ? 'Buat Admin Pertama' : 'Login Admin'}</h1>
            <p className="text-xs text-slate-400">SmartBilling • akses panel administrasi</p>
          </div>
        </div>

        {registrationRequired && (
          <p className="mb-5 p-3 rounded-xl bg-amber-950/50 border border-amber-500/30 text-amber-200 text-xs">
            Belum ada akun admin. Pendaftaran ini hanya untuk admin pertama dan akan ditutup otomatis setelah akun dibuat.
          </p>
        )}
        {envLoginConfigured && (
          <p className="mb-5 p-3 rounded-xl bg-indigo-950/50 border border-indigo-500/30 text-indigo-200 text-xs">
            Login dikelola oleh ADMIN_USERNAME dan ADMIN_PASSWORD dari environment server.
          </p>
        )}
        {envLoginIncomplete && (
          <p className="mb-5 p-3 rounded-xl bg-amber-950/50 border border-amber-500/30 text-amber-200 text-xs">
            ADMIN_USERNAME/ADMIN_PASSWORD belum terisi berpasangan. Lengkapi keduanya di .env atau gunakan pendaftaran admin pertama.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-300">
            Username
            <input
              required
              minLength={3}
              maxLength={64}
              autoComplete="username"
              value={username}
              onChange={event => setUsername(event.target.value)}
              className="mt-1.5 w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-300">
            Password
            <input
              required
              minLength={registrationRequired ? 12 : 1}
              maxLength={256}
              type="password"
              autoComplete={registrationRequired ? 'new-password' : 'current-password'}
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="mt-1.5 w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
            {registrationRequired && <span className="mt-1 block text-[11px] text-slate-500">Minimal 12 karakter.</span>}
          </label>
          {error && <p role="alert" className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/30 text-rose-200 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm rounded-lg"
          >
            {isSubmitting ? 'Memproses...' : registrationRequired ? 'Buat akun admin' : 'Login'}
          </button>
        </form>
        <a href="/" className="mt-5 block text-center text-sm text-indigo-300 hover:text-indigo-200">
          Kembali ke halaman pelanggan
        </a>
      </section>
    </main>
  );
};
