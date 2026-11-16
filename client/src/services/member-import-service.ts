/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { MemberImportPreview, MemberImportResult } from '../models/member-import.js';
import { fetchWithAuth } from '../utils/fetch.js';

async function post<T>(url: string, body: unknown, fallbackError: string): Promise<T> {
  const res = await fetchWithAuth(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? fallbackError);
  return res.json();
}

class MemberImportService {
  preview(csv: string): Promise<MemberImportPreview> {
    return post('/api/member-import/preview', { csv }, 'Die Prüfdatei konnte nicht gelesen werden.');
  }

  book(csv: string, stichtag: string, fileName: string): Promise<MemberImportResult> {
    return post(
      '/api/member-import/book',
      { csv, stichtag, fileName },
      'Übernehmen fehlgeschlagen – es wurde nichts übernommen.'
    );
  }
}

export const memberImportService = new MemberImportService();
