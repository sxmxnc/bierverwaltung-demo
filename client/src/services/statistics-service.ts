/* Autor: Julius Vollmer (FH Münster) */

import { Statistics } from '../models/statistics.js';
import { fetchWithAuth } from '../utils/fetch.js';

export class StatisticsService {
  private readonly baseUrl = '/api/statistics';

  async getStatistics(): Promise<Statistics> {
    try {
      const res = await fetchWithAuth(this.baseUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      console.error('Fehler beim Laden der Statistiken:', error);
      throw error;
    }
  }
}

export const statisticsService = new StatisticsService();
