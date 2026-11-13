import type { ElementType } from 'react';
import {
  Activity,
  Building,
  Database,
  Send,
  ShieldCheck,
  Sliders,
} from 'lucide-react';

export type SettingsSection = 'business' | 'billing' | 'reminders' | 'telegram' | 'database' | 'security';

export const settingsSections: Array<{
  id: SettingsSection;
  label: string;
  description: string;
  icon: ElementType;
}> = [
  { id: 'business', label: 'Profil bisnis', description: 'Nama dan kontak pada invoice', icon: Building },
  { id: 'billing', label: 'Billing & voucher', description: 'Format kode voucher', icon: Sliders },
  { id: 'reminders', label: 'Pengingat otomatis', description: 'Jadwal notifikasi WhatsApp', icon: Activity },
  { id: 'telegram', label: 'Bot Telegram', description: 'Notifikasi & tombol persetujuan', icon: Send },
  { id: 'database', label: 'Database & backup', description: 'Status dan pencadangan data', icon: Database },
  { id: 'security', label: 'Admin & keamanan', description: 'Akun dan kunci enkripsi', icon: ShieldCheck },
];
