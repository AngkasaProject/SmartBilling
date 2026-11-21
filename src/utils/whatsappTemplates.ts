import { AppSettings, WhatsAppTemplateKey, WhatsAppTemplates } from '../types';

export interface WhatsAppToken {
  /** Placeholder tanpa kurung kurawal, mis. `brand_name`. */
  token: string;
  /** Label yang ditampilkan di UI pengaturan template. */
  label: string;
}

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplates = {
  reminder: [
    'Yth. Bapak/Ibu {{customer_name}},',
    '',
    'Berikut informasi tagihan layanan internet Anda:',
    '• Invoice: {{invoice_number}}',
    '• Paket: {{package_name}}',
    '• Periode: {{period}}',
    '• Total: {{amount}}',
    '• Jatuh tempo: {{due_date}}',
    '',
    '{{payment_options}}',
    '',
    'Terima kasih.',
    '{{brand_name}}',
  ].join('\n'),
  isolir: [
    'Yth. Bapak/Ibu {{customer_name}},',
    '',
    'Layanan internet Anda diisolir sementara karena tagihan belum diselesaikan.',
    'Saat ini hanya halaman portal pembayaran yang bisa dibuka. Klik tautan berikut untuk membuka portal dan menyelesaikan pembayaran:',
    '{{payment_url}}',
    '',
    'Setelah pembayaran dikonfirmasi, layanan akan diproses untuk diaktifkan kembali.',
    'Hormat kami,',
    '{{brand_name}}',
  ].join('\n'),
  paymentSuccess: [
    'Yth. Bapak/Ibu {{customer_name}},',
    '',
    'Pembayaran Anda telah berhasil diverifikasi.',
    '• Invoice: {{invoice_number}}',
    '• Nominal: {{amount}}',
    '• Masa aktif hingga: {{service_until}}',
    '',
    'Terima kasih atas pembayaran Anda.',
    '{{brand_name}}',
  ].join('\n'),
  manualInvoice: [
    'Yth. Bapak/Ibu {{customer_name}},',
    '',
    'Permintaan pembayaran tagihan Anda telah dibuat.',
    '• Invoice: {{invoice_number}}',
    '• Kode pembayaran: {{payment_code}}',
    '• Nominal: {{amount}}',
    '• Metode: {{method}}',
    '• Atas nama: {{account_holder}}',
    '• Nomor rekening/akun: {{account_number}}',
    '',
    'Catatan pembayaran:',
    '{{notes}}',
    '',
    'Setelah membayar, silakan konfirmasi kepada operator:',
    '{{operator_url}}',
    '',
    'Simpan kode pembayaran di atas sebagai referensi.',
    'Terima kasih,',
    '{{brand_name}}',
  ].join('\n'),
  manualVoucher: [
    'Yth. Bapak/Ibu {{customer_name}},',
    '',
    'Pesanan voucher Anda telah dibuat.',
    '• Paket: {{package_name}}',
    '• Kode pembayaran: {{payment_code}}',
    '• Nominal: {{amount}}',
    '• Metode: {{method}}',
    '• Atas nama: {{account_holder}}',
    '• Nomor rekening/akun: {{account_number}}',
    '',
    'Catatan pembayaran:',
    '{{notes}}',
    '',
    'Voucher akan aktif setelah pembayaran diverifikasi.',
    '',
    'Konfirmasi pembayaran kepada operator:',
    '{{operator_url}}',
    '',
    'Terima kasih,',
    '{{brand_name}}',
  ].join('\n'),
  voucherDelivery: [
    'Yth. Bapak/Ibu {{customer_name}},',
    '',
    'Pembayaran Anda telah berhasil diverifikasi.',
    'KODE = {{voucher_code}}',
    '• Paket: {{package_name}}',
    '• Masa penggunaan: {{validity}}',
    '',
    'Gunakan kode tersebut untuk login ke hotspot.',
    'Terima kasih,',
    '{{brand_name}}',
  ].join('\n'),
};

const IDENTITY_TOKENS: WhatsAppToken[] = [
  { token: 'customer_name', label: 'Nama pelanggan' },
  { token: 'brand_name', label: 'Nama brand' },
  { token: 'business_name', label: 'Nama perusahaan' },
];

const BILLING_TOKENS: Record<string, WhatsAppToken> = {
  invoice_number: { token: 'invoice_number', label: 'Nomor invoice' },
  package_name: { token: 'package_name', label: 'Nama paket' },
  period: { token: 'period', label: 'Periode tagihan' },
  amount: { token: 'amount', label: 'Nominal' },
  due_date: { token: 'due_date', label: 'Jatuh tempo' },
  payment_url: { token: 'payment_url', label: 'Tautan portal' },
  payment_options: { token: 'payment_options', label: 'Rincian opsi pembayaran' },
  payment_code: { token: 'payment_code', label: 'Kode pembayaran' },
  method: { token: 'method', label: 'Metode pembayaran' },
  account_holder: { token: 'account_holder', label: 'Atas nama rekening' },
  account_number: { token: 'account_number', label: 'Nomor rekening/akun' },
  notes: { token: 'notes', label: 'Catatan instruksi' },
  operator_url: { token: 'operator_url', label: 'Tombol konfirmasi ke operator' },
  service_until: { token: 'service_until', label: 'Masa aktif layanan' },
  voucher_code: { token: 'voucher_code', label: 'Kode voucher' },
  voucher_password: { token: 'voucher_password', label: 'Password voucher' },
  validity: { token: 'validity', label: 'Masa penggunaan' },
};

function tokens(...extra: string[]): WhatsAppToken[] {
  return [...IDENTITY_TOKENS, ...extra.map(key => BILLING_TOKENS[key])];
}

export const WHATSAPP_TEMPLATE_TOKENS: Record<WhatsAppTemplateKey, WhatsAppToken[]> = {
  reminder: tokens('invoice_number', 'package_name', 'period', 'amount', 'due_date', 'payment_url', 'payment_options'),
  isolir: tokens('invoice_number', 'due_date', 'payment_url'),
  paymentSuccess: tokens('invoice_number', 'amount', 'service_until'),
  manualInvoice: tokens('invoice_number', 'payment_code', 'amount', 'method', 'account_holder', 'account_number', 'due_date', 'notes', 'operator_url'),
  manualVoucher: tokens('package_name', 'payment_code', 'amount', 'method', 'account_holder', 'account_number', 'validity', 'notes', 'operator_url'),
  voucherDelivery: tokens('package_name', 'voucher_code', 'voucher_password', 'validity'),
};

type IdentitySettings = Pick<AppSettings, 'companyName' | 'brandName' | 'appName'>;

function text(value: string | undefined): string {
  return (value || '').trim();
}

/** Teks pengganti untuk nama brand; dipakai template `business_name` agar konsisten. */
export function brandDisplayName(settings: IdentitySettings | null | undefined): string {
  return text(settings?.brandName) || text(settings?.companyName) || text(settings?.appName);
}

export function businessDisplayName(settings: IdentitySettings | null | undefined): string {
  return text(settings?.companyName) || text(settings?.brandName) || text(settings?.appName);
}

export function whatsappTemplateValues(
  settings: IdentitySettings | null | undefined,
  values: Record<string, string>,
): Record<string, string> {
  return { brand_name: brandDisplayName(settings), business_name: businessDisplayName(settings), ...values };
}

export function renderWhatsAppTemplate(
  templateKey: WhatsAppTemplateKey,
  templates: Partial<WhatsAppTemplates> | undefined,
  values: Record<string, string>,
): string {
  const template = templates?.[templateKey]?.trim() || DEFAULT_WHATSAPP_TEMPLATES[templateKey];
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : token
  );
}
