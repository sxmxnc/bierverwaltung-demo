/* Autor: Julius Vollmer (FH Münster), angepasst für die K.D.St.V. Sauerlandia */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './admin-area.css?inline';
import '../../widgets/admin-vues/admin-sidebar.js';
import '../../widgets/admin-vues/user-management.js';
import '../../widgets/admin-vues/create-user.js';
import '../../widgets/admin-vues/admin-consumption.js';
import '../../widgets/admin-vues/admin-inventory.js';
import '../../widgets/admin-vues/admin-tally-import.js';
import '../../widgets/admin-vues/admin-backfill.js';
import '../../widgets/admin-vues/admin-member-import.js';
import '../../widgets/admin-vues/admin-stats.js';
import '../../widgets/admin-vues/admin-drink-management.js';
import '../../widgets/admin-vues/admin-finance.js';
import { requireAdmin } from '../../../utils/auth-guard.js';

@customElement('admin-area')
export class AdminArea extends LitElement {
  static styles = componentStyle;

  @state()
  private activePage = 'users';

  async connectedCallback() {
    super.connectedCallback();
    await requireAdmin();
  }

  render() {
    return html`
      <section>
        <h1>Bierwart</h1>
      </section>

      <div class="admin-container">
        <aside class="sidebar-wrapper">
          <admin-sidebar
            .activePage=${this.activePage}
            @page-changed=${(e: CustomEvent) => (this.activePage = e.detail)}
          ></admin-sidebar>
        </aside>

        <main class="content-wrapper">${this.renderActivePage()}</main>
      </div>
    `;
  }

  private renderActivePage() {
    switch (this.activePage) {
      case 'users':
        return html`<user-management></user-management>`;
      case 'create-user':
        return html`<create-user></create-user>`;
      case 'consumption':
        return html`<admin-consumption></admin-consumption>`;
      case 'inventory':
        return html`<admin-inventory></admin-inventory>`;
      case 'member-import':
        return html`<admin-member-import></admin-member-import>`;
      case 'tally-import':
        return html`<admin-tally-import></admin-tally-import>`;
      case 'backfill':
        return html`<admin-backfill></admin-backfill>`;
      case 'drinks':
        return html`<admin-drink-management></admin-drink-management>`;
      case 'finance':
        return html`<admin-finance></admin-finance>`;
      case 'stats':
        return html`<admin-stats></admin-stats>`;
      default:
        return html`<div class="placeholder-view"><p>Seite nicht gefunden.</p></div>`;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'admin-area': AdminArea;
  }
}
