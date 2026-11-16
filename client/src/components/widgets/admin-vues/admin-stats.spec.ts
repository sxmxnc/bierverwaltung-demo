/* Autor: Julius Vollmer (FH Münster) mit Hilfe Claude Ai*/

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import sinon from 'sinon';
import { AdminStats } from './admin-stats';
import './admin-stats';
import { statisticsService } from '../../../services/statistics-service';
import { Statistics } from '../../../models/statistics';

const mockStats: Statistics = {
  members: {
    total: 5,
    byStatus: { active: 4, pending: 0, suspended: 1, inactive: 0 },
    byRole: { admin: 1, user: 4, theke: 0, kasse: 0 },
    newPerMonth: [{ month: '2026-05', count: 2 }]
  },
  finance: { totalDebt: -20, totalCredit: 30, netBalance: 10, debtorCount: 1, topDebtors: [] },
  inventory: {
    distinctDrinks: 3,
    totalStockValue: 120.5,
    outOfStockCount: 1,
    lowStock: [
      { drinkId: 'd1', name: 'Pils', packaging: 'Flasche', unit: '0.5l', stock: 5, threshold: 10, price: 1.2 }
    ],
    restockPerMonth: [{ month: '2026-05', quantity: 50 }],
    recentPurchases: []
  },
  consumption: {
    totalOrders: 12,
    totalRevenue: 40,
    topDrinks: [{ name: 'Pils', unit: '0.5l', count: 20, totalValue: 24 }],
    topDrinksLast30Days: [{ name: 'Pils', unit: '0.5l', count: 8, totalValue: 9.6 }]
  }
};

describe('admin-stats component', () => {
  let el: AdminStats;

  beforeEach(async () => {
    sinon.stub(statisticsService, 'getStatistics').resolves(mockStats);
    el = await fixture<AdminStats>(html`<admin-stats></admin-stats>`);
    // firstUpdated -> loadData (gestubbt) abwarten
    await new Promise(resolve => setTimeout(resolve, 0));
    await el.updateComplete;
  });

  afterEach(() => sinon.restore());

  it('rendert die Überschrift und eine Tab-Leiste mit vier Tabs', () => {
    expect(el.shadowRoot!.querySelector('h1')?.textContent?.trim()).to.equal('Statistiken');
    expect(el.shadowRoot!.querySelectorAll('.tab-bar .tab').length).to.equal(4);
  });

  it('zeigt standardmäßig die Übersichts-Kennzahlen (4 KPI-Karten)', () => {
    const cards = el.shadowRoot!.querySelectorAll('.kpi-grid .kpi-card');
    expect(cards.length).to.equal(4);
  });

  it('listet knappe Getränke in der Übersicht auf', () => {
    const rows = el.shadowRoot!.querySelectorAll('.panel-table tbody tr');
    expect(rows.length).to.equal(1);
    expect(rows[0].textContent).to.contain('Pils');
  });

  it('wechselt zum Mitglieder-Tab beim Klick auf dessen Button', async () => {
    const memberTab = Array.from(el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.tab-bar .tab')).find(
      b => b.textContent?.trim() === 'Mitglieder'
    )!;
    memberTab.click();
    await el.updateComplete;

    expect(el.shadowRoot!.querySelector('.panel h2')?.textContent).to.contain('Mitglieder gesamt');
  });
});
