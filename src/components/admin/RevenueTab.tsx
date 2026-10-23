import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  RefreshCw,
  RotateCcw,
  Search,
  TrendingUp,
} from 'lucide-react';
import { useToast } from '../ui/toast';

interface RevenueRecord {
  id: string;
  type: 'invoice' | 'voucher';
  date: string;
  reference: string;
  customerName: string;
  customerPhone: string;
  description: string;
  paymentMethod: string;
  amount: number;
}

interface RevenueSummary {
  totalRevenue: number;
  invoiceRevenue: number;
  voucherRevenue: number;
  invoiceCount: number;
  voucherCount: number;
}

interface RevenueResponse {
  records: RevenueRecord[];
  summary: RevenueSummary;
  resetState: {
    statisticsResetAt?: string;
    historyResetAt?: string;
  };
}

type ResetMode = 'statistics' | 'history';

const currency = (amount: number) => `Rp ${amount.toLocaleString('id-ID')}`;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date) + ' WIB';
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const RevenueTab: React.FC = () => {
  const { confirm, toast } = useToast();
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'invoice' | 'voucher'>('all');

  const loadRevenue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/revenue', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      if (!Array.isArray(result.records) || !result.summary) {
        throw new Error('Format data pendapatan tidak valid');
      }
      setData(result as RevenueResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRevenue();
  }, [loadRevenue]);

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID');
    return (data?.records || []).filter(record => {
      if (typeFilter !== 'all' && record.type !== typeFilter) return false;
      if (!query) return true;
      return [
        record.reference,
        record.customerName,
        record.customerPhone,
        record.description,
        record.paymentMethod,
      ].some(value => value.toLocaleLowerCase('id-ID').includes(query));
    });
  }, [data?.records, search, typeFilter]);

  const exportExcel = () => {
    if (!visibleRecords.length) {
      toast('Tidak ada riwayat untuk diekspor', 'info');
      return;
    }
    const columns = ['Tanggal', 'Jenis', 'Referensi', 'Pelanggan', 'Nomor WhatsApp', 'Deskripsi', 'Metode pembayaran', 'Nominal'];
    const rows = visibleRecords.map(record => [
      formatDate(record.date),
      record.type === 'invoice' ? 'Invoice' : 'Voucher',
      record.reference,
      record.customerName,
      record.customerPhone,
      record.description,
      record.paymentMethod,
      record.amount,
    ]);
    const csv = [columns, ...rows]
      .map(row => row.map(csvCell).join(','))
      .join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `riwayat-pendapatan-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetRevenue = async (mode: ResetMode) => {
    const isHistoryReset = mode === 'history';
    const accepted = await confirm(
      isHistoryReset ? 'Reset seluruh catatan pendapatan?' : 'Reset statistik pendapatan?',
      isHistoryReset
        ? 'Riwayat akan disembunyikan dari laporan dan statistik mulai sekarang. Data invoice, voucher, dan transaksi operasional tidak dihapus sehingga tetap tersedia untuk kebutuhan penagihan dan audit.'
        : 'Angka statistik akan dihitung ulang mulai sekarang. Riwayat pendapatan tetap tersedia dan tidak ada data transaksi yang dihapus.',
      true,
    );
    if (!accepted) return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/revenue/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      await loadRevenue();
      toast(
        isHistoryReset ? 'Catatan pendapatan direset' : 'Statistik pendapatan direset',
        'success',
        isHistoryReset
          ? 'Data operasional invoice dan voucher tetap tersimpan.'
          : 'Riwayat pendapatan tetap tersedia.',
      );
    } catch (resetError) {
      toast(
        'Reset pendapatan gagal',
        'error',
        resetError instanceof Error ? resetError.message : String(resetError),
      );
    } finally {
      setBusy(false);
    }
  };

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <TrendingUp className="h-5 w-5" />
            <p className="text-xs font-bold uppercase tracking-[0.16em]">Laporan keuangan</p>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-foreground">Pendapatan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Riwayat pembayaran invoice lunas dan voucher berhasil dibayar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportExcel}
            disabled={!visibleRecords.length}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export Excel (.csv)
          </button>
          <button
            type="button"
            onClick={() => void loadRevenue()}
            disabled={loading || busy}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Perbarui
          </button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>Gagal memuat riwayat pendapatan: {error}</span>
          <button type="button" onClick={() => void loadRevenue()} className="font-semibold underline underline-offset-4">Coba lagi</button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Total pendapatan tercatat</p>
          <p className="mt-2 text-2xl font-black text-foreground">{currency(summary?.totalRevenue || 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary?.invoiceCount || 0} invoice · {summary?.voucherCount || 0} voucher
          </p>
        </article>
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Pendapatan invoice</p>
          <p className="mt-2 text-2xl font-black text-foreground">{currency(summary?.invoiceRevenue || 0)}</p>
        </article>
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Pendapatan voucher</p>
          <p className="mt-2 text-2xl font-black text-foreground">{currency(summary?.voucherRevenue || 0)}</p>
        </article>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Cari referensi, pelanggan, atau metode..."
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30"
          />
        </label>
        <select
          value={typeFilter}
          onChange={event => setTypeFilter(event.target.value as typeof typeFilter)}
          aria-label="Filter jenis pendapatan"
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
        >
          <option value="all">Semua jenis</option>
          <option value="invoice">Invoice</option>
          <option value="voucher">Voucher</option>
        </select>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void resetRevenue('statistics')}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset statistik saja
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resetRevenue('history')}
            className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset seluruh catatan
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {loading && !data ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Memuat riwayat pendapatan...</p>
        ) : visibleRecords.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Tanggal</th>
                  <th className="px-4 py-3 font-semibold">Jenis / Referensi</th>
                  <th className="px-4 py-3 font-semibold">Pelanggan</th>
                  <th className="px-4 py-3 font-semibold">Deskripsi</th>
                  <th className="px-4 py-3 font-semibold">Metode</th>
                  <th className="px-4 py-3 text-right font-semibold">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleRecords.map(record => (
                  <tr key={record.id} className="hover:bg-muted/20">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(record.date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${record.type === 'invoice' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-violet-500/10 text-violet-500'}`}>
                        {record.type === 'invoice' ? 'INVOICE' : 'VOUCHER'}
                      </span>
                      <p className="mt-1 font-mono text-xs text-foreground">{record.reference}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{record.customerName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{record.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{record.description}</td>
                    <td className="px-4 py-3 text-muted-foreground">{record.paymentMethod}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-foreground">{currency(record.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center">
            <p className="font-semibold text-foreground">Belum ada catatan pendapatan</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Pembayaran invoice dan voucher yang berhasil akan muncul di sini.
            </p>
          </div>
        )}
        {data ? (
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Menampilkan {visibleRecords.length} dari {data.records.length} catatan.
          </div>
        ) : null}
      </div>
    </div>
  );
};
