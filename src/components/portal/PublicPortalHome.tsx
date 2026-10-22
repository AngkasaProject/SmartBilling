import React, { useEffect, useState } from 'react';
import { HotspotProfile } from '../../types';
import { CustomerBillPortal } from './CustomerBillPortal';
import { VoucherStorePortal } from './VoucherStorePortal';

export const PublicPortalHome: React.FC = () => {
  const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
  const [error, setError] = useState('');
  const [view, setView] = useState<'packages' | 'billing'>('packages');

  useEffect(() => {
    let mounted = true;
    fetch('/api/portal/vouchers')
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        if (mounted) setProfiles(result.profiles);
      })
      .catch(fetchError => {
        if (mounted) setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between border-b border-slate-900">
        <a href="/" className="font-extrabold text-white">SmartBilling</a>
        <a href="/admin" className="text-xs text-slate-400 hover:text-white">Login Admin</a>
      </nav>
      {view === 'packages' ? (
        <>
          <section className="max-w-5xl mx-auto px-4 pt-10 pb-2 text-center">
            <h1 className="text-3xl sm:text-4xl font-black text-white">Paket Internet Tersedia</h1>
            <p className="mt-3 text-sm text-slate-400">Pilih paket yang sesuai atau cek status langganan dan tagihan Anda.</p>
            <button
              type="button"
              onClick={() => setView('billing')}
              className="inline-block mt-5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-bold text-white"
            >
              Cek Status Langganan
            </button>
          </section>
          {error && <p role="alert" className="max-w-5xl mx-auto mt-5 px-4 text-sm text-rose-300">{error}</p>}
          <VoucherStorePortal profiles={profiles} onCheckBilling={() => setView('billing')} />
        </>
      ) : (
        <CustomerBillPortal
          showNavigation={false}
          onBack={() => setView('packages')}
        />
      )}
      <footer className="border-t border-slate-900 px-4 py-5 text-center text-xs text-slate-500">
        Pembayaran online, jika tersedia, diproses dengan aman melalui provider pembayaran.
      </footer>
    </div>
  );
};
