/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Member } from '../models/member.js';
import { Account, RecentBooking, TallyResult } from '../models/account.js';
import { fetchWithAuth } from '../utils/fetch.js';

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return body.error ?? fallback;
}

class TallyService {
  async getMembers(): Promise<Member[]> {
    const res = await fetchWithAuth('/api/members');
    if (!res.ok) throw new Error(await errorMessage(res, 'Mitglieder konnten nicht geladen werden.'));
    return (await res.json()).members;
  }

  // userId leer = auf das eigene Konto
  async tally(items: Map<string, number>, userId?: string): Promise<TallyResult> {
    const res = await fetchWithAuth('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, items: Array.from(items, ([id, value]) => ({ id, value })) })
    });
    if (!res.ok) throw new Error(await errorMessage(res, 'Stricheln fehlgeschlagen.'));
    return res.json();
  }

  async getRecent(): Promise<RecentBooking[]> {
    const res = await fetchWithAuth('/api/order/recent');
    if (!res.ok) throw new Error(await errorMessage(res, 'Letzte Buchungen konnten nicht geladen werden.'));
    return (await res.json()).recent;
  }

  async undo(orderId: string): Promise<void> {
    const res = await fetchWithAuth(`/api/order/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await errorMessage(res, 'Rückgängig machen fehlgeschlagen.'));
  }

  async getAccount(): Promise<Account> {
    const res = await fetchWithAuth('/api/account');
    if (!res.ok) throw new Error(await errorMessage(res, 'Konto konnte nicht geladen werden.'));
    return res.json();
  }
}

export const tallyService = new TallyService();
