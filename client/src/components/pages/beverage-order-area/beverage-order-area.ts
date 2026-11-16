/* Autor: Julius Vollmer (FH Münster) */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './beverage-order-area.css?inline';
import { RestockCartItem } from '../../../models/restock.js';
import '../../widgets/beverage-order-vues/beverage-order-form.js';
import '../../widgets/beverage-order-vues/beverage-cart-list.js';
import '../../widgets/back-button/back-button.js';
import '../../widgets/toast-notification/toast-notification.js';

/**
 * Seite "Neue Getränke bestellen".
 */
@customElement('beverage-order-area')
export class BeverageOrderArea extends LitElement {
  static styles = componentStyle;

  @state() private cart: RestockCartItem[] = [];
  @state() private toastMessage: string | null = null;

  render() {
    return html`
      ${this.toastMessage
        ? html`<toast-notification
            message=${this.toastMessage}
            type="success"
            @close=${() => (this.toastMessage = null)}
          ></toast-notification>`
        : ''}
      <section class="order-area-container">
        <back-button></back-button>
        <h2>Neue Getränke bestellen</h2>

        <beverage-order-form @add-to-cart=${this.handleAddToCart}></beverage-order-form>

        <beverage-cart-list
          .cartItems=${this.cart}
          @update-quantity=${this.handleUpdateQuantity}
          @remove-from-cart=${this.handleRemoveFromCart}
          @cart-cleared=${this.handleCartCleared}
        ></beverage-cart-list>
      </section>
    `;
  }

  //Mit Hilfe CHAT GPT
  private handleAddToCart(e: CustomEvent<RestockCartItem>) {
    const incoming = e.detail;
    const existingIndex = this.cart.findIndex(item => item.drinkId === incoming.drinkId);

    if (existingIndex >= 0) {
      // Gleiches Getränk ist bereits im Warenkorb -> Mengen zusammenführen
      this.cart = this.cart.map((item, i) =>
        i === existingIndex
          ? { ...item, quantity: item.quantity + incoming.quantity, purchasePrice: incoming.purchasePrice }
          : item
      );
    } else {
      this.cart = [...this.cart, incoming];
    }
  }

  private handleUpdateQuantity(e: CustomEvent<{ index: number; quantity: number }>) {
    const { index, quantity } = e.detail;
    if (quantity < 1) {
      // Menge unter 1 -> Position aus dem Warenkorb entfernen
      this.cart = this.cart.filter((_, i) => i !== index);
      return;
    }
    this.cart = this.cart.map((item, i) => (i === index ? { ...item, quantity } : item));
  }

  private handleRemoveFromCart(e: CustomEvent<number>) {
    const index = e.detail;
    this.cart = this.cart.filter((_, i) => i !== index);
  }

  private handleCartCleared() {
    this.cart = [];
    this.showOrderToast();
  }

  private showOrderToast() {
    this.toastMessage = 'Bestellung erfolgreich aufgegeben';
    setTimeout(() => this.shadowRoot?.querySelector('toast-notification')?.close(), 3500);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'beverage-order-area': BeverageOrderArea;
  }
}
