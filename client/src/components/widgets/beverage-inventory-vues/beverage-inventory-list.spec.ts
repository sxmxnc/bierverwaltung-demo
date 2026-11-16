/* Autor: Julius Vollmer (FH Münster) mit Hilfe Claude AI*/

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import sinon from 'sinon';
import { BeverageInventoryListWidget } from './beverage-inventory-list';
import './beverage-inventory-list';
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
      },
      {
        id: 'd2',
        name: 'Weizen',
        price: 1.4,
        packaging: 'Flasche',
        unit: '0.5l',
        stock: 0,
        groupId: 'g1',
        lowStockThreshold: 10
      }
    ]
  }
];

describe('beverage-inventory-list component', () => {
  let el: BeverageInventoryListWidget;

  beforeEach(async () => {
    sinon.stub(drinkService, 'getDrinks').resolves(mockGroups);
    el = await fixture<BeverageInventoryListWidget>(html`<beverage-inventory-list></beverage-inventory-list>`);

    const internals = el as unknown as { _drinksPromise: Promise<DrinkGroup[]> };
    await internals._drinksPromise.catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 0));
    await el.updateComplete;
  });

  afterEach(() => sinon.restore());

  it('rendert pro Getränkegruppe', () => {
    const headers = el.shadowRoot!.querySelectorAll('.group-header');
    expect(headers.length).to.equal(1);
    expect(headers[0].textContent).to.contain('Bier');
  });

  it('rendert eine Zeile pro Getränk mit dem Namen', () => {
    const names = Array.from(el.shadowRoot!.querySelectorAll('td.name')).map(n => n.textContent?.trim());
    expect(names).to.deep.equal(['Pils', 'Weizen']);
  });

  it('kennzeichnet vorrätige und ausverkaufte Getränke', () => {
    const badges = el.shadowRoot!.querySelectorAll('.stock-badge');
    expect(badges[0].classList.contains('in-stock')).to.be.true; // Bestand 24
    expect(badges[1].classList.contains('out-of-stock')).to.be.true; // Bestand 0
  });
});
