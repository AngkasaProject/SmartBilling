import React, { useState } from 'react';
import { ArrowLeft, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  registrationRequired: boolean;
  envLoginIncomplete: boolean;
  onAuthenticated: (username: string) => void;
}

export const AdminAuthPage: React.FC<Props> = ({
  registrationRequired,
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
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <section className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-border bg-card shadow-sm">
            {registrationRequired ? <ShieldCheck className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
          </div>
          <p className="text-sm font-semibold tracking-tight">SmartBilling</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {registrationRequired ? 'Buat akun administrator' : 'Selamat datang kembali'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {registrationRequired
              ? 'Buat akun admin pertama untuk mengamankan workspace Anda.'
              : 'Masuk untuk melanjutkan ke dashboard billing.'}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-7">
          {registrationRequired && (
            <p className="mb-5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              Pendaftaran ini hanya untuk admin pertama dan akan ditutup otomatis setelah akun dibuat.
            </p>
          )}
          {envLoginIncomplete && (
            <p className="mb-5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              ADMIN_USERNAME dan ADMIN_PASSWORD harus diisi berpasangan di .env, atau gunakan pendaftaran admin pertama.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-2 text-sm font-medium">
              Username
              <input
                required
                minLength={3}
                maxLength={64}
                autoComplete="username"
                value={username}
                onChange={event => setUsername(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Password
              <input
                required
                minLength={registrationRequired ? 12 : 1}
                maxLength={256}
                type="password"
                autoComplete={registrationRequired ? 'new-password' : 'current-password'}
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              {registrationRequired && <span className="block text-xs font-normal text-muted-foreground">Minimal 12 karakter.</span>}
            </label>
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                'Memproses...'
              ) : (
                <>
                  <LockKeyhole className="h-4 w-4" />
                  {registrationRequired ? 'Buat akun admin' : 'Masuk'}
                </>
              )}
            </Button>
          </form>

          <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Akses aman ke panel administrasi
          </div>
        </div>

        <a href="/" className="mx-auto mt-6 inline-flex items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Portal
        </a>
      </section>
    </main>
  );
};
