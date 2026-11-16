/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { ConsumptionReport, InventoryReport, ReportPeriod, Scoreboard, ScoreboardPeriod } from '../models/reports.js';
import { fetchWithAuth } from '../utils/fetch.js';

async function getJson<T>(url: string, fallbackError: string): Promise<T> {
  const res = await fetchWithAuth(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallbackError);
  }
  return res.json();
}

class ReportsService {
  getScoreboard(period: ScoreboardPeriod): Promise<Scoreboard> {
    return getJson(`/api/scoreboard?period=${period}`, 'Rangliste konnte nicht geladen werden.');
  }

  getConsumption(period: ReportPeriod): Promise<ConsumptionReport> {
    return getJson(`/api/reports/consumption?period=${period}`, 'Verbrauch konnte nicht geladen werden.');
  }

  getInventory(): Promise<InventoryReport> {
    return getJson('/api/reports/inventory', 'Bestand konnte nicht geladen werden.');
  }
}

export const reportsService = new ReportsService();
