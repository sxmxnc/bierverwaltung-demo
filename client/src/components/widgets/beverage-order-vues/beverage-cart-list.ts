/* Autor: Julius Vollmer (FH Münster) */

import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { restockService } from '../../../services/drinks.js';
import { RestockCartItem } from '../../../models/restock.js';
import componentStyle from './beverage-cart-list.css?inline';

@customElement('beverage-cart-list')
export class BeverageCartList extends LitElement {
  static styles = componentStyle;

  @property({ type: Array }) cartItems: RestockCartItem[] = [];

  @state() private isSubmitting = false;
  @state() private statusMessage = '';
  @state() private statusType: 'success' | 'error' = 'success';

  // Summe aller Zwischensummen (Menge x Einkaufspreis) über alle Positionen.
  private get totalValue(): number {
    return this.cartItems.reduce((sum, item) => sum + item.purchasePrice * item.quantity, 0);
  }

  // Mit Hilfe von CLaude AI
  render() {
    if (this.cartItems.length === 0) {
      return html`<div class="empty-msg">Der Warenkorb ist noch leer.</div>`;
    }

    return html`
      <h3>Aktueller Warenkorb</h3>

      ${this.statusMessage
        ? html`<div class="status-banner ${this.statusType}" role="status">${this.statusMessage}</div>`
        : ''}

      <table class="cart-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Typ</th>
            <th>Inhalt</th>
            <th>Menge</th>
            <th>Einkaufspreis</th>
            <th>Zwischensumme</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${this.cartItems.map(
            (item, index) => html`
              <tr>
                <td class="name-cell" data-label="Name">${item.name}</td>
                <td data-label="Typ">${item.packaging}</td>
                <td data-label="Inhalt">${item.unit}</td>
                <td data-label="Menge">
                  <div class="qty-stepper">
                    <button
                      type="button"
                      class="qty-btn"
                      @click=${() => this.changeQuantity(index, item.quantity - 1)}
                      aria-label="Menge verringern"
                    >
                      −
                    </button>
                    <span class="qty-value">${item.quantity}</span>
                    <button
                      type="button"
                      class="qty-btn"
                      @click=${() => this.changeQuantity(index, item.quantity + 1)}
                      aria-label="Menge erhöhen"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td data-label="Einkaufspreis">${this.formatPrice(item.purchasePrice)}</td>
                <td data-label="Zwischensumme">${this.formatPrice(item.purchasePrice * item.quantity)}</td>
                <td class="action-cell" data-label="Aktion">
                  <button class="remove-btn" @click=${() => this.removeItem(index)}>Löschen</button>
                </td>
              </tr>
            `
          )}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="5">Gesamter Bestellwert</td>
            <td colspan="2"><strong>${this.formatPrice(this.totalValue)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <div class="actions">
        <button class="buy-btn" ?disabled=${this.isSubmitting} @click=${this.handleConfirm}>
          ${this.isSubmitting ? 'Wird verbucht...' : 'Bestellung absenden'}
        </button>
      </div>
    `;
  }

  private changeQuantity(index: number, quantity: number) {
    this.dispatchEvent(
      new CustomEvent<{ index: number; quantity: number }>('update-quantity', {
        detail: { index, quantity },
        bubbles: true,
        composed: true
      })
    );
  }

  private removeItem(index: number) {
    this.dispatchEvent(
      new CustomEvent<number>('remove-from-cart', {
        detail: index,
        bubbles: true,
        composed: true
      })
    );
  }

  private async handleConfirm() {
    this.isSubmitting = true;
    this.statusMessage = '';
    try {
      await restockService.restock(this.cartItems);
      this.statusType = 'success';
      this.statusMessage = 'Bestellung erfolgreich verbucht. Der Lagerbestand wurde aktualisiert.';
      this.dispatchEvent(new CustomEvent('cart-cleared', { bubbles: true, composed: true }));
    } catch (error) {
      console.error('Bestellung fehlgeschlagen:', error);
      this.statusType = 'error';
      this.statusMessage = 'Die Bestellung konnte nicht verbucht werden. Bitte erneut versuchen.';
    } finally {
      this.isSubmitting = false;
    }
  }

  private formatPrice(value: number): string {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'beverage-cart-list': BeverageCartList;
  }
}
