/* Autor: Julius Vollmer (FH Münster) mit Hilfe von Claude Ai */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { drinkService } from '../../../services/drinks.js';
import { DrinkGroup, DrinkItem } from '../../../models/drinks.js';
import { RestockCartItem } from '../../../models/restock.js';
import componentStyle from './beverage-order-form.css?inline';

/**
 * Formular zum Zusammenstellen einer Nachbestellung.
 */
@customElement('beverage-order-form')
export class BeverageOrderForm extends LitElement {
  static styles = componentStyle;

  @state() private drinkGroups: DrinkGroup[] = [];
  @state() private selectedDrink: DrinkItem | null = null;
  @state() private selectedGroupId = '';
  @state() private purchasePrice = 0;
  @state() private quantity = 1;
  @state() private validationError = '';

  private get isValid(): boolean {
    return (
      this.selectedDrink !== null && Number.isInteger(this.quantity) && this.quantity >= 1 && this.purchasePrice >= 0
    );
  }

  async connectedCallback() {
    super.connectedCallback();
    try {
      this.drinkGroups = await drinkService.getDrinks();
    } catch (error) {
      console.error('Getränke konnten nicht geladen werden:', error);
      this.validationError = 'Die Getränkeliste konnte nicht geladen werden.';
    }
  }

  render() {
    return html`
      <div class="form-container">
        ${this.validationError ? html`<div class="form-error" role="alert">${this.validationError}</div>` : ''}

        <form @submit=${this.handleSubmit} novalidate>
          <div class="form-group full-width">
            <label for="drinkSelect">Getränk auswählen (Marke, Typ, Inhalt)</label>
            <select id="drinkSelect" .value=${this.selectedDrink?.id ?? ''} @change=${this.handleDrinkChange} required>
              <option value="">-- Bitte wählen --</option>
              ${this.drinkGroups.map(
                group => html`
                  <optgroup label="${group.emoji} ${group.group}">
                    ${group.items.map(
                      drink =>
                        html`<option value="${drink.id}">${drink.name} (${drink.packaging}, ${drink.unit})</option>`
                    )}
                  </optgroup>
                `
              )}
            </select>
          </div>

          ${this.selectedDrink
            ? html`
                <div class="info-box full-width">
                  <span>Aktueller Verkaufspreis: <strong>${this.formatPrice(this.selectedDrink.price)}</strong></span>
                  <span>Aktueller Bestand: <strong>${this.selectedDrink.stock}</strong></span>
                </div>
              `
            : ''}

          <div class="form-group">
            <label for="quantity">Menge (Einheiten)</label>
            <input
              id="quantity"
              type="number"
              min="1"
              step="1"
              .value=${this.quantity.toString()}
              @input=${this.handleQuantityInput}
              required
            />
          </div>

          <div class="form-group">
            <label for="purchasePrice">Einkaufspreis je Einheit (€)</label>
            <input
              id="purchasePrice"
              type="number"
              min="0"
              step="0.01"
              .value=${this.purchasePrice.toString()}
              @input=${this.handlePurchasePriceInput}
            />
          </div>

          ${this.selectedDrink
            ? html`
                <div class="line-preview full-width">
                  Bestellwert dieser Position:
                  <strong>${this.formatPrice(this.quantity * this.purchasePrice)}</strong>
                </div>
              `
            : ''}

          <button type="submit" class="add-btn" ?disabled=${!this.isValid}>Zum Warenkorb hinzufügen</button>
        </form>
      </div>
    `;
  }

  private handleDrinkChange(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    const group = this.drinkGroups.find(g => g.items.some(d => d.id === id));
    this.selectedDrink = group?.items.find(d => d.id === id) ?? null;
    this.selectedGroupId = group?.id ?? '';
    if (this.selectedDrink) {
      // Einkaufspreis als sinnvollen Startwert auf den Verkaufspreis setzen
      this.purchasePrice = this.selectedDrink.price;
    }
  }

  private handleQuantityInput(e: Event) {
    this.quantity = parseInt((e.target as HTMLInputElement).value, 10) || 0;
  }

  private handlePurchasePriceInput(e: Event) {
    this.purchasePrice = parseFloat((e.target as HTMLInputElement).value) || 0;
  }

  private handleSubmit(e: Event) {
    e.preventDefault();
    if (!this.selectedDrink || !this.isValid) {
      this.validationError = 'Bitte ein Getränk wählen und eine Menge von mindestens 1 angeben.';
      return;
    }
    this.validationError = '';

    const item: RestockCartItem = {
      drinkId: this.selectedDrink.id,
      name: this.selectedDrink.name,
      packaging: this.selectedDrink.packaging,
      unit: this.selectedDrink.unit,
      groupId: this.selectedGroupId,
      salePrice: this.selectedDrink.price,
      purchasePrice: this.purchasePrice,
      quantity: this.quantity
    };

    this.dispatchEvent(
      new CustomEvent<RestockCartItem>('add-to-cart', {
        detail: item,
        bubbles: true,
        composed: true
      })
    );

    this.resetSelection();
  }

  private resetSelection() {
    this.selectedDrink = null;
    this.selectedGroupId = '';
    this.purchasePrice = 0;
    this.quantity = 1;
  }

  private formatPrice(value: number): string {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'beverage-order-form': BeverageOrderForm;
  }
}
