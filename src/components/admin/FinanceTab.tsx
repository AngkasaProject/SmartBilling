import React from 'react';
import { Customer, Invoice } from '../../types';
import { InvoicesTab } from './InvoicesTab';
import { RevenueTab } from './RevenueTab';

interface Props {
  section: 'invoices' | 'revenue';
  onSelectSection: (section: 'invoices' | 'revenue') => void;
  invoices: Invoice[];
  customers: Customer[];
  onRefreshData: () => void;
  onViewInvoice: (invoice: Invoice, customer?: Customer) => void;
  onSendWa: (customer: Customer, type: 'reminder' | 'isolir') => void;
}

export const FinanceTab: React.FC<Props> = ({
  section,
  onSelectSection,
  invoices,
  customers,
  onRefreshData,
  onViewInvoice,
  onSendWa,
}) => (
  <div className="space-y-5">
    <div className="flex gap-2 border-b border-border">
      <button
        type="button"
        onClick={() => onSelectSection('invoices')}
        aria-current={section === 'invoices' ? 'page' : undefined}
        className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
          section === 'invoices'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        Tagihan
      </button>
      <button
        type="button"
        onClick={() => onSelectSection('revenue')}
        aria-current={section === 'revenue' ? 'page' : undefined}
        className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
          section === 'revenue'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        Pendapatan
      </button>
    </div>
    {section === 'invoices' ? (
      <InvoicesTab
        invoices={invoices}
        customers={customers}
        onRefreshData={onRefreshData}
        onViewInvoice={onViewInvoice}
        onSendWa={onSendWa}
      />
    ) : (
      <RevenueTab />
    )}
  </div>
);
