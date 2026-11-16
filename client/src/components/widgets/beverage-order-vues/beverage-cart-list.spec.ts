/* Autor: Julius Vollmer (FH Münster) mit Hilfe Claude AI */

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import { BeverageCartList } from './beverage-cart-list';
import './beverage-cart-list';
import { RestockCartItem } from '../../../models/restock';

const mockCart: RestockCartItem[] = [
  {
    drinkId: 'd1',
    name: 'Cola',
    packaging: 'Flasche',
    unit: '0.33l',
    groupId: 'g1',
    salePrice: 1.5,
    purchasePrice: 1,
    quantity: 6
  },
  {
    drinkId: 'd2',
    name: 'Pils',
    packaging: 'Fass',
    unit: '50l',
    groupId: 'g2',
    salePrice: 2,
    purchasePrice: 80,
    quantity: 2
  }
];

describe('beverage-cart-list component', () => {
  it('zeigt eine Leer-Meldung, wenn der Warenkorb leer ist', async () => {
    const el = await fixture<BeverageCartList>(html`<beverage-cart-list></beverage-cart-list>`);
    await el.updateComplete;

    const empty = el.shadowRoot!.querySelector('.empty-msg');
    expect(empty).to.not.be.null;
    expect(empty?.textContent).to.contain('leer');
  });

  it('rendert eine Zeile pro Warenkorb-Position mit dem Getränkenamen', async () => {
    const el = await fixture<BeverageCartList>(html`<beverage-cart-list .cartItems=${mockCart}></beverage-cart-list>`);
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.cart-table tbody tr');
    expect(rows.length).to.equal(2);
    expect(rows[0].querySelector('.name-cell')?.textContent?.trim()).to.equal('Cola');
  });

  it('berechnet den Gesamt-Bestellwert (Einkaufspreis * Menge)', async () => {
    const el = await fixture<BeverageCartList>(html`<beverage-cart-list .cartItems=${mockCart}></beverage-cart-list>`);
    await el.updateComplete;

    // 1 * 6 + 80 * 2 = 166
    const total = el.shadowRoot!.querySelector('.total-row strong');
    expect(total?.textContent).to.contain('166');
  });

  it('feuert "remove-from-cart" mit dem Zeilenindex beim Klick auf Löschen', async () => {
    const el = await fixture<BeverageCartList>(html`<beverage-cart-list .cartItems=${mockCart}></beverage-cart-list>`);
    await el.updateComplete;

    let received: number | null = null;
    el.addEventListener('remove-from-cart', e => (received = (e as CustomEvent<number>).detail));
    el.shadowRoot!.querySelector<HTMLButtonElement>('.remove-btn')!.click();

    expect(received).to.equal(0);
  });

  it('feuert "update-quantity" beim Klick auf den Plus-Schalter', async () => {
    const el = await fixture<BeverageCartList>(html`<beverage-cart-list .cartItems=${mockCart}></beverage-cart-list>`);
    await el.updateComplete;

    let detail: { index: number; quantity: number } | null = null;
    el.addEventListener(
      'update-quantity',
      e => (detail = (e as CustomEvent<{ index: number; quantity: number }>).detail)
    );

    // Erste Zeile: [0] = Minus, [1] = Plus
    const stepperButtons = el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.cart-table tbody tr .qty-btn');
    stepperButtons[1].click(); // Plus auf erster Zeile: Menge 6 -> 7

    expect(detail).to.deep.equal({ index: 0, quantity: 7 });
  });
});
