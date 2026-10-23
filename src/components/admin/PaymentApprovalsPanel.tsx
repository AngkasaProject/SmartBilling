import React, { useCallback, useEffect, useState } from 'react';
import { PaymentTransaction } from '../../types';
import { StorageService } from '../../services/storage';
import { useToast } from '../ui/toast';

interface Request extends PaymentTransaction {
  expiresAtFormatted?: string;
  voucher: { profileName: string; code: string } | null;
  invoice: { invoiceNumber: string } | null;
}

interface Props {
  orderType: 'invoice' | 'voucher';
  onRefreshData: () => void;
}

export const PaymentApprovalsPanel: React.FC<Props> = ({ orderType, onRefreshData }) => {
  const { confirm: confirmAction } = useToast();
  const [requests, setRequests] = useState<Request[]>([]);
  const [error, setError] = useState('');
  const [workingOrder, setWorkingOrder] = useState('');

  const loadRequests = useCallback(async () => {
    const response = await fetch('/api/admin/payment-requests');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    setRequests(result.requests.filter((request: Request) => request.orderType === orderType));
  }, [orderType]);

  useEffect(() => {
    void loadRequests().catch(loadError => setError(loadError instanceof Error ? loadError.message : String(loadError)));
  }, [loadRequests]);

  const handleDecision = async (orderId: string, action: 'approve' | 'reject') => {
    if (action === 'reject') {
      const message = orderType === 'voucher'
        ? 'Tolak bukti pembayaran ini? Pesanan voucher akan dibatalkan.'
        : 'Tolak bukti pembayaran ini? Invoice akan tetap belum lunas.';
      if (!await confirmAction('Tolak pembayaran?', message, true)) return;
    }
    setWorkingOrder(orderId);
    setError('');
    try {
      const response = await fetch(`/api/admin/payment-requests/${encodeURIComponent(orderId)}/${action}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      await StorageService.syncDataFromSqlite();
      onRefreshData();
      await loadRequests();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : String(decisionError));
    } finally {
      setWorkingOrder('');
    }
  };

  return (
    <section className="rounded-2xl border border-amber-500/25 bg-slate-900/90 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-white">Persetujuan Pembayaran Manual</h2>
          <p className="mt-1 text-xs text-slate-400">
            {orderType === 'voucher'
              ? 'Voucher baru diaktifkan setelah bukti disetujui dan user berhasil dibuat di MikroTik.'
              : 'Invoice dan masa aktif pelanggan diperbarui setelah bukti pembayaran disetujui.'}
          </p>
        </div>
        <button type="button" onClick={() => void loadRequests().catch(loadError => setError(loadError instanceof Error ? loadError.message : String(loadError)))} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200">Muat ulang</button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</p>}
      {!requests.length && !error && <p className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400">Belum ada pembayaran manual yang menunggu persetujuan.</p>}
      <div className="space-y-3">
        {requests.map(request => (
          <article key={request.orderId} className="grid gap-4 rounded-xl border border-slate-800 bg-slate-950 p-4 lg:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-amber-500/10 px-2 py-1 font-bold text-amber-300">MENUNGGU</span>
                <span className="font-mono text-slate-300">{request.paymentCode || request.orderId}</span>
                <span className="text-slate-500">Berakhir: {request.expiresAtFormatted || request.expiresAt || '—'}</span>
              </div>
              <p className="text-sm font-bold text-white">{request.customerName} · {request.customerPhone}</p>
              <p className="text-xs text-slate-300">
                {request.orderType === 'voucher'
                  ? `Voucher ${request.voucher?.profileName || ''}`
                  : `Tagihan ${request.invoice?.invoiceNumber || ''}`}
                {' · '}Rp {request.amount.toLocaleString('id-ID')} · {request.paymentChannel}
              </p>
              {request.proofData
                ? <a href={request.proofData} target="_blank" rel="noreferrer"><img src={request.proofData} alt={`Bukti pembayaran ${request.orderId}`} className="max-h-56 rounded-lg border border-slate-700 object-contain" /></a>
                : <p className="text-[11px] text-amber-300">Tidak ada bukti unggahan. Verifikasi pembayaran berdasarkan mutasi/konfirmasi operator sebelum menyetujui.</p>}
            </div>
            <div className="flex items-start gap-2">
              <button type="button" disabled={Boolean(workingOrder)} onClick={() => void handleDecision(request.orderId, 'approve')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                {workingOrder === request.orderId ? 'Memproses...' : 'Setujui'}
              </button>
              <button type="button" disabled={Boolean(workingOrder)} onClick={() => void handleDecision(request.orderId, 'reject')} className="rounded-lg bg-rose-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Tolak</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
