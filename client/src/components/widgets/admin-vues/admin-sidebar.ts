/* Autor: Julius Vollmer (FH Münster), angepasst für die K.D.St.V. Sauerlandia */

import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import componentStyle from './admin-sidebar.css?inline';
import { addUser, drinkManagementIcon, financeIcon, manageRoles, statsIcon, userIcon } from './icons.js';

@customElement('admin-sidebar')
export class AdminSidebar extends LitElement {
  static styles = componentStyle;

  @property({ type: String })
  activePage: string = 'users';

  render() {
    const menuItems = [
      { id: 'users', label: 'Mitglieder', icon: userIcon },
      { id: 'create-user', label: 'Konto anlegen', icon: addUser },
      { id: 'member-import', label: 'Mitglieder importieren', icon: userIcon },
      { id: 'drinks', label: 'Getränke & Preise', icon: drinkManagementIcon },
      { id: 'consumption', label: 'Verbrauch', icon: statsIcon },
      { id: 'inventory', label: 'Bestand', icon: manageRoles },
      { id: 'tally-import', label: 'Strichliste importieren', icon: drinkManagementIcon },
      { id: 'backfill', label: 'Striche nachtragen', icon: addUser },
      { id: 'finance', label: 'Finanzen', icon: financeIcon },
      { id: 'stats', label: 'Statistik', icon: statsIcon }
    ];

    return html`
      <aside class="sidebar">
        <nav>
          <ul>
            ${menuItems.map(
              item => html`
                <li
                  class="menu-item ${this.activePage === item.id ? 'active' : ''}"
                  @click=${() => this.selectPage(item.id)}
                >
                  <span class="icon">${item.icon}</span>
                  <span class="label">${item.label}</span>
                </li>
              `
            )}
          </ul>
        </nav>
      </aside>
    `;
  }

  private selectPage(page: string) {
    this.dispatchEvent(
      new CustomEvent('page-changed', {
        detail: page,
        bubbles: true,
        composed: true
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'admin-sidebar': AdminSidebar;
  }
}
