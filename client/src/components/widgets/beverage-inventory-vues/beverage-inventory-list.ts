/* Autor: Julius Vollmer (FH Münster) */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { DrinkGroup } from '../../../models/drinks.js';
import { until } from 'lit/directives/until.js';
import { drinkService } from '../../../services/drinks.js';
import componentStyle from './beverage-inventory-list.css?inline';

@customElement('beverage-inventory-list')
export class BeverageInventoryListWidget extends LitElement {
  static styles = componentStyle;

  @state()
  private _drinksPromise: Promise<DrinkGroup[]>;

  constructor() {
    super();
    this._drinksPromise = drinkService.getDrinks();
  }

  render() {
    return html`
      ${until(
        this._drinksPromise.then(groups => this._renderTable(groups)),
        html`<div class="loading">Getränke werden geladen...</div>`
      )}
    `;
  }

  // Hilfsmethode für das eigentliche Rendern der Tabelle
  private _renderTable(groups: DrinkGroup[]) {
    return html`
      <div class="inventory-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Typ</th>
              <th>Inhalt</th>
              <th>Preis</th>
              <th>Bestand</th>
            </tr>
          </thead>
          ${groups.map(
            group => html`
              <tbody class="group-section">
                <tr class="group-header">
                  <th colspan="5">${group.emoji} ${group.group}</th>
                </tr>
                ${group.items.map(
                  item => html`
                    <tr>
                      <td class="name" data-label="Name">${item.name}</td>
                      <td class="packaging" data-label="Typ">${item.packaging}</td>
                      <td class="unit" data-label="Inhalt">${item.unit}</td>
                      <td class="price" data-label="Preis">${this._formatPrice(item.price)}</td>
                      <td class="stock" data-label="Bestand">
                        <span class="stock-badge ${item.stock > 0 ? 'in-stock' : 'out-of-stock'}">
                          ${item.stock} ${item.packaging === 'Flasche' ? 'Stk.' : 'Fass'}
                        </span>
                      </td>
                    </tr>
                  `
                )}
              </tbody>
            `
          )}
        </table>
      </div>
    `;
  }

  private _formatPrice(x: number): string {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(x);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'beverage-inventory-list': BeverageInventoryListWidget;
  }
}
