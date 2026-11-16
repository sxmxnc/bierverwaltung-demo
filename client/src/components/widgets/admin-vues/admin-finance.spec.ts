/* Autor: Julius Vollmer (FH Münster) Hilfe von Claude, angepasst für die K.D.St.V. Sauerlandia */

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import sinon from 'sinon';
import { AdminFinance } from './admin-finance';
import './admin-finance';
import { statisticsService } from '../../../services/statistics-service';
import { Statistics } from '../../../models/statistics';

const mockStats = {
  finance: {
    totalDebt: 20.5,
    totalCredit: 18,
    netBalance: -2.5,
    debtorCount: 2,
    topDebtors: [
      { name: 'Hopfen', balance: -12.5 },
      { name: 'Maxe', balance: -8 }
    ]
  }
} as unknown as Statistics;

describe('admin-finance component', () => {
  let el: AdminFinance;

  beforeEach(async () => {
    sinon.stub(statisticsService, 'getStatistics').resolves(mockStats);
    el = await fixture<AdminFinance>(html`<admin-finance></admin-finance>`);
    await new Promise(resolve => setTimeout(resolve, 0));
    await el.updateComplete;
  });

  afterEach(() => sinon.restore());

  it('rendert die drei Finanz-Kennzahlen', () => {
    expect(el.shadowRoot!.querySelectorAll('.kpi-row .kpi-card').length).to.equal(3);
  });

  it('listet die offenen Beträge', () => {
    const names = Array.from(el.shadowRoot!.querySelectorAll('.member-name')).map(n => n.textContent?.trim());
    expect(names).to.deep.equal(['Hopfen', 'Maxe']);
  });

  it('enthält keine Lastschrift mehr', () => {
    expect(el.shadowRoot!.textContent).to.not.contain('Lastschrift');
  });
});
