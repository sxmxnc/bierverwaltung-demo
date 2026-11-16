/* Autor: Julius Vollmer (FH Münster) mit Hilfe Claude AI */

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import sinon from 'sinon';
import { AdminDrinkManagement } from './admin-drink-management';
import './admin-drink-management';
import { drinkService } from '../../../services/drinks';
import { DrinkGroup } from '../../../models/drinks';

const mockGroups: DrinkGroup[] = [
  {
    id: 'g1',
    group: 'Bier',
    emoji: '🍺',
    items: [
      {
        id: 'd1',
        name: 'Pils',
        price: 1.2,
        packaging: 'Flasche',
        unit: '0.5l',
        stock: 24,
        groupId: 'g1',
        lowStockThreshold: 10
      }, // ist okay
      {
        id: 'd2',
        name: 'Alt',
        price: 1.3,
        packaging: 'Flasche',
        unit: '0.5l',
        stock: 5,
        groupId: 'g1',
        lowStockThreshold: 10
      }, // ist low
      {
        id: 'd3',
        name: 'Kölsch',
        price: 1.1,
        packaging: 'Flasche',
        unit: '0.33l',
        stock: 0,
        groupId: 'g1',
        lowStockThreshold: 10
      } // ist aus
    ]
  }
];

describe('admin-drink-management component', () => {
  let el: AdminDrinkManagement;

  beforeEach(async () => {
    sinon.stub(drinkService, 'getDrinks').resolves(mockGroups);
    el = await fixture<AdminDrinkManagement>(html`<admin-drink-management></admin-drink-management>`);
    await new Promise(resolve => setTimeout(resolve, 0));
    await el.updateComplete;
  });

  afterEach(() => sinon.restore());

  it('rendert die Überschrift und eine Kategorie-Karte', () => {
    expect(el.shadowRoot!.querySelector('h1')?.textContent?.trim()).to.equal('Getränke Verwaltung');
    expect(el.shadowRoot!.querySelectorAll('.category-card').length).to.equal(1);
  });

  it('rendert eine Tabellenzeile pro Getränk', () => {
    expect(el.shadowRoot!.querySelectorAll('.drink-table tbody tr').length).to.equal(3);
  });

  //Claude Ai
  it('vergibt Bestands-Badges (ok / low / out) je nach Bestand und Schwelle', () => {
    const badges = el.shadowRoot!.querySelectorAll('.stock-badge');
    expect(badges[0].classList.contains('ok')).to.be.true;
    expect(badges[1].classList.contains('low')).to.be.true;
    expect(badges[2].classList.contains('out')).to.be.true;
  });

  //Claude Ai
  it('öffnet die Lösch-Bestätigung beim Klick auf Löschen', async () => {
    const deleteBtn = el.shadowRoot!.querySelector<HTMLButtonElement>('.drink-table .btn-danger')!;
    deleteBtn.click();
    await el.updateComplete;

    const modal = el.shadowRoot!.querySelector('.modal-overlay');
    expect(modal).to.not.be.null;
    expect(modal?.textContent).to.contain('löschen');
  });
});
