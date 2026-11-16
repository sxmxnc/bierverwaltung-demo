/* Autor: Julius Vollmer (FH Münster) */

import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import componentStyle from './beverage-inventory-area.css?inline';
import '../../widgets/beverage-inventory-vues/beverage-inventory-list.js';
import { requireAdmin } from '../../../utils/auth-guard.js';

@customElement('beverage-inventory-area')
export class BeverageInventoryArea extends LitElement {
  static styles = componentStyle;

  async connectedCallback() {
    super.connectedCallback();
    await requireAdmin();
  }

  render() {
    return html`
      <section>
        <div class="inventory-header">
          <h2>Getränke Inventar</h2>
          <a href="/beverage-order" class="order-link">Neue Getränke bestellen</a>
        </div>
        <beverage-inventory-list></beverage-inventory-list>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'beverage-inventory-area': BeverageInventoryArea;
  }
}
