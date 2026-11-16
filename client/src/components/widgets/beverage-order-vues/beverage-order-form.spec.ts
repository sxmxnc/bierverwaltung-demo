/* Autor: Julius Vollmer (FH Münster) mit Hilfe Claude AI*/

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import sinon from 'sinon';
import { BeverageOrderForm } from './beverage-order-form';
import './beverage-order-form';
import { drinkService } from '../../../services/drinks';
import { DrinkItem } from '../../../models/drinks';
import { RestockCartItem } from '../../../models/restock';

const mockDrink: DrinkItem = {
  id: 'd1',
  name: 'Cola',
  price: 1.5,
  packaging: 'Flasche',
  unit: '0.33l',
  stock: 10,
  groupId: 'g1',
  lowStockThreshold: 10
};

// Schreibender Zugriff auf die internen @state-Felder im Test (ohne echte Auswahl-Interaktion)
type FormInternals = {
  selectedDrink: DrinkItem | null;
  selectedGroupId: string;
  quantity: number;
  purchasePrice: number;
};

describe('beverage-order-form component', () => {
  let el: BeverageOrderForm;

  beforeEach(async () => {
    // Getränkeliste stubben, damit kein echter Netzwerkaufruf erfolgt
    sinon.stub(drinkService, 'getDrinks').resolves([]);
    el = await fixture<BeverageOrderForm>(html`<beverage-order-form></beverage-order-form>`);
    await el.updateComplete;
  });

  afterEach(() => sinon.restore());

  it('rendert das Getränke-Auswahlfeld und den Absenden-Button', () => {
    expect(el.shadowRoot!.querySelector('#drinkSelect')).to.not.be.null;
    const btn = el.shadowRoot!.querySelector('.add-btn');
    expect(btn?.textContent?.trim()).to.equal('Zum Warenkorb hinzufügen');
  });

  it('deaktiviert den Absenden-Button, solange kein Getränk gewählt ist', () => {
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('.add-btn')!;
    expect(btn.disabled).to.be.true;
  });

  it('aktiviert den Button, sobald Getränk, Menge und Preis gültig sind', async () => {
    Object.assign(el as unknown as FormInternals, {
      selectedDrink: mockDrink,
      selectedGroupId: 'g1',
      quantity: 6,
      purchasePrice: 1
    });
    await el.updateComplete;

    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('.add-btn')!;
    expect(btn.disabled).to.be.false;
  });

  it('feuert "add-to-cart" mit der zusammengestellten Position beim Absenden', async () => {
    Object.assign(el as unknown as FormInternals, {
      selectedDrink: mockDrink,
      selectedGroupId: 'g1',
      quantity: 6,
      purchasePrice: 1.2
    });
    await el.updateComplete;

    let detail: RestockCartItem | null = null;
    el.addEventListener('add-to-cart', e => (detail = (e as CustomEvent<RestockCartItem>).detail));
    el.shadowRoot!.querySelector<HTMLButtonElement>('.add-btn')!.click();

    expect(detail).to.deep.equal({
      drinkId: 'd1',
      name: 'Cola',
      packaging: 'Flasche',
      unit: '0.33l',
      groupId: 'g1',
      salePrice: 1.5,
      purchasePrice: 1.2,
      quantity: 6
    });
  });
});
