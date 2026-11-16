/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import {
  BackfillEntry,
  BookRequest,
  BookResult,
  TallyImportEntry,
  TallyImportPreview
} from '../models/tally-import.js';
import { fetchWithAuth } from '../utils/fetch.js';

async function request<T>(url: string, fallbackError: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallbackError);
  }
  return res.json();
}

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

class TallyImportService {
  preview(file: unknown): Promise<TallyImportPreview> {
    return request('/api/tally-import/preview', 'Die Datei konnte nicht gelesen werden.', postJson({ file }));
  }

  book(body: BookRequest): Promise<BookResult> {
    return request('/api/tally-import/book', 'Buchen fehlgeschlagen – es wurde nichts gebucht.', postJson(body));
  }

  async history(): Promise<TallyImportEntry[]> {
    const data = await request<{ imports: TallyImportEntry[] }>(
      '/api/tally-import',
      'Bisherige Importe konnten nicht geladen werden.'
    );
    return data.imports;
  }

  undo(id: string): Promise<{ removed: number }> {
    return request(`/api/tally-import/${encodeURIComponent(id)}/undo`, 'Zurücknehmen fehlgeschlagen.', postJson({}));
  }

  // Personenliste für das Erfassungs-Tool als Datei herunterladen
  async downloadPersons(): Promise<void> {
    const res = await fetchWithAuth('/api/tally-import/persons-file');
    if (!res.ok) throw new Error('Personenliste konnte nicht erstellt werden.');
    const name =
      /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'Strichlisten-Personen.json';
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(await res.json(), null, 1)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  backfill(body: { userId: string; date: string; items: { id: string; value: number }[]; note: string }) {
    return request<{ target: { name: string }; total: number }>(
      '/api/order/nachtrag',
      'Nachtragen fehlgeschlagen.',
      postJson(body)
    );
  }

  async backfills(): Promise<BackfillEntry[]> {
    const data = await request<{ entries: BackfillEntry[] }>(
      '/api/order/nachtrag',
      'Nachträge konnten nicht geladen werden.'
    );
    return data.entries;
  }

  async deleteOrder(id: string): Promise<void> {
    const res = await fetchWithAuth(`/api/order/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Löschen fehlgeschlagen.');
    }
  }
}

export const tallyImportService = new TallyImportService();
