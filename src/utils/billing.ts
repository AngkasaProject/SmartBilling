import type { Customer } from '../types';

const EXPIRING_WINDOW_DAYS = 3;

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** H-1..H-3: customer still active but expiredDate falls within the next 3 days (today included). */
export function isExpiringSoon(customer: Customer, today = new Date()): boolean {
  if (customer.status !== 'active' || !/^\d{4}-\d{2}-\d{2}$/.test(customer.expiredDate)) return false;
  const todayKey = localDateKey(today);
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + EXPIRING_WINDOW_DAYS);
  return customer.expiredDate >= todayKey && customer.expiredDate <= localDateKey(limit);
}
