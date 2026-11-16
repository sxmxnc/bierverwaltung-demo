/* Autor: Julius Vollmer (FH Münster) mit Hilfe von Claude AI*/

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import componentStyle from './admin-stats.css?inline';
import { Statistics } from '../../../models/statistics.js';
import { statisticsService } from '../../../services/statistics-service.js';

interface BarItem {
  label: string;
  value: number;
}

type TabId = 'overview' | 'members' | 'drinks' | 'orders';

@customElement('admin-stats')
export class AdminStats extends LitElement {
  static styles = componentStyle;

  @state() private stats: Statistics | null = null;
  @state() private isLoading = true;
  @state() private errorMessage = '';
  @state() private activeTab: TabId = 'overview';
  @state() private topDrinkRange: '30d' | 'all' = '30d';

  private readonly tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Übersicht' },
    { id: 'members', label: 'Mitglieder' },
    { id: 'drinks', label: 'Getränke & Konsum' },
    { id: 'orders', label: 'Bestellungen' }
  ];

  async firstUpdated() {
    await this.loadData();
  }

  render() {
    return html`
      <section class="stats-section">
        <div class="section-header">
          <h1>Statistiken</h1>
          <p class="subtitle">Überblick über Mitglieder, Finanzen, Lager und Konsum</p>
        </div>

        ${this.isLoading
          ? html`<div class="loader-container">
              <div class="spinner"></div>
              <p>Lade Kennzahlen...</p>
            </div>`
          : ''}
        ${this.errorMessage
          ? html`<div class="error-container">
              <p>${this.errorMessage}</p>
              <button class="btn btn-secondary" @click=${this.loadData}>Erneut versuchen</button>
            </div>`
          : ''}
        ${!this.isLoading && !this.errorMessage && this.stats
          ? html`${this.renderTabBar()}
              <div class="tab-content">${this.renderActiveTab(this.stats)}</div>`
          : ''}
      </section>
    `;
  }

  private renderTabBar() {
    return html`
      <nav class="tab-bar">
        ${this.tabs.map(
          tab => html`
            <button class="tab ${this.activeTab === tab.id ? 'active' : ''}" @click=${() => (this.activeTab = tab.id)}>
              ${tab.label}
            </button>
          `
        )}
      </nav>
    `;
  }

  private renderActiveTab(stats: Statistics) {
    switch (this.activeTab) {
      case 'members':
        return this.renderMembersTab(stats);
      case 'drinks':
        return this.renderDrinksTab(stats);
      case 'orders':
        return this.renderOrdersTab(stats);
      default:
        return this.renderOverviewTab(stats);
    }
  }

  private renderOverviewTab(stats: Statistics) {
    return html`
      <div class="kpi-grid">
        ${this.renderKpi('Mitglieder', String(stats.members.total))}
        ${this.renderKpi('Offene Forderungen', this.formatCurrency(stats.finance.totalDebt), 'warn')}
        ${this.renderKpi('Lagerwert', this.formatCurrency(stats.inventory.totalStockValue))}
        ${this.renderKpi('Ausverkauft', String(stats.inventory.outOfStockCount))}
      </div>
      ${this.renderLowStock(stats)}
    `;
  }

  private renderMembersTab(stats: Statistics) {
    const { byStatus, byRole, newPerMonth } = stats.members;
    const statusItems: BarItem[] = [
      { label: 'Aktiv', value: byStatus.active },
      { label: 'Gesperrt', value: byStatus.suspended },
      { label: 'Inaktiv', value: byStatus.inactive }
    ];
    const roleItems: BarItem[] = [
      { label: 'Administrator', value: byRole.admin },
      { label: 'Mitglied', value: byRole.user }
    ];
    const trend: BarItem[] = newPerMonth.map(entry => ({ label: entry.month, value: entry.count }));

    return html`
      <div class="panel">
        <h2>Mitglieder gesamt: ${stats.members.total}</h2>
        <div class="two-column">
          <div>
            <h3>Nach Status</h3>
            ${this.renderBars(statusItems)}
          </div>
          <div>
            <h3>Nach Rolle</h3>
            ${this.renderBars(roleItems)}
          </div>
        </div>
      </div>
      <div class="panel">
        <h2>Neuzugänge pro Monat</h2>
        ${this.renderBars(trend)}
      </div>
    `;
  }

  private renderDrinksTab(stats: Statistics) {
    const { consumption, inventory } = stats;
    const source = this.topDrinkRange === '30d' ? consumption.topDrinksLast30Days : consumption.topDrinks;
    const topDrinkBars: BarItem[] = source.map(drink => ({
      label: drink.unit ? `${drink.name} (${drink.unit})` : drink.name,
      value: drink.totalValue
    }));

    return html`
      <div class="kpi-grid">
        ${this.renderKpi('Bestellungen gesamt', String(consumption.totalOrders))}
        ${this.renderKpi('Einheiten gesamt', String(consumption.totalRevenue))}
        ${this.renderKpi('Sorten im Sortiment', String(inventory.distinctDrinks))}
        ${this.renderKpi('Ausverkauft', String(inventory.outOfStockCount))}
      </div>
      <div class="panel">
        <div class="panel-header-row">
          <h2>
            Am meisten verkaufte Getränke
            <span class="info-icon" title="Gemessen anhand der verkauften Menge je Produkt." aria-label="Hinweis"
              >i</span
            >
          </h2>
          <div class="range-toggle">
            <button
              class="range-btn ${this.topDrinkRange === '30d' ? 'active' : ''}"
              @click=${() => (this.topDrinkRange = '30d')}
            >
              Letzte 30 Tage
            </button>
            <button
              class="range-btn ${this.topDrinkRange === 'all' ? 'active' : ''}"
              @click=${() => (this.topDrinkRange = 'all')}
            >
              Gesamt
            </button>
          </div>
        </div>
        ${source.length === 0
          ? html`<p class="empty">
              ${this.topDrinkRange === '30d'
                ? 'In den letzten 30 Tagen wurde nichts bestellt.'
                : 'Noch keine Bestellungen erfasst.'}
            </p>`
          : html`${this.renderBars(topDrinkBars)}`}
      </div>
      <div class="panel">
        <h2>Wareneingang pro Monat (Einheiten)</h2>
        ${this.renderBars(inventory.restockPerMonth.map(entry => ({ label: entry.month, value: entry.quantity })))}
      </div>
    `;
  }

  private renderOrdersTab(stats: Statistics) {
    const { recentPurchases } = stats.inventory;
    return html`
      <div class="panel">
        <h2>Letzte Bestellungen (Wareneingang)</h2>
        ${recentPurchases.length === 0
          ? html`<p class="empty">Noch keine Bestellungen erfasst.</p>`
          : html`
              <div class="purchase-orders">
                ${recentPurchases.map(
                  order => html`
                    <div class="purchase-order">
                      <div class="purchase-order-header">
                        <span class="po-date">${this.formatDateTime(order.timestamp)}</span>
                        <span class="po-buyer">${order.buyer}</span>
                        <span class="po-total">${this.formatCurrency(order.total)}</span>
                      </div>
                      <div class="po-items">
                        ${order.items.map(
                          item => html`
                            <div class="po-item">
                              <span class="po-item-name">${item.drinkName}</span>
                              <span class="po-item-qty">${item.quantity} Stk.</span>
                              <span class="po-item-amount">${this.formatCurrency(item.amount)}</span>
                            </div>
                          `
                        )}
                      </div>
                    </div>
                  `
                )}
              </div>
            `}
      </div>
    `;
  }

  private renderKpi(label: string, value: string, variant = '') {
    return html`
      <div class="kpi-card ${variant}">
        <span class="kpi-label">${label}</span>
        <span class="kpi-value">${value}</span>
      </div>
    `;
  }

  private renderLowStock(stats: Statistics) {
    const lowStock = stats.inventory.lowStock;
    return html`
      <div class="panel">
        <h2>Nachbestellen empfohlen</h2>
        ${lowStock.length === 0
          ? html`<p class="empty">Alle Getränke ausreichend bevorratet.</p>`
          : html`
              <table class="panel-table">
                <thead>
                  <tr>
                    <th>Getränk</th>
                    <th>Bestand</th>
                    <th>Schwelle</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${lowStock.map(
                    drink => html`
                      <tr>
                        <td class="name-cell" data-label="Getränk">
                          ${drink.name} <span class="muted">(${drink.packaging}, ${drink.unit})</span>
                        </td>
                        <td data-label="Bestand">
                          <span class="stock-badge ${drink.stock === 0 ? 'out' : 'low'}">${drink.stock}</span>
                        </td>
                        <td class="muted" data-label="Schwelle">&lt; ${drink.threshold}</td>
                        <td class="action-cell" data-label="Aktion">
                          <a class="btn btn-small" href="/beverage-order" title="${drink.name} nachbestellen"
                            >Nachbestellen →</a
                          >
                        </td>
                      </tr>
                    `
                  )}
                </tbody>
              </table>
            `}
      </div>
    `;
  }

  private renderBars(items: BarItem[]) {
    if (items.length === 0) {
      return html`<p class="empty">Keine Daten vorhanden.</p>`;
    }
    const max = Math.max(1, ...items.map(item => item.value));
    return html`
      <div class="bar-chart">
        ${items.map(
          item => html`
            <div class="bar-row">
              <span class="bar-label">${item.label}</span>
              <div class="bar-track">
                <div class="bar-fill" style=${styleMap({ width: `${(item.value / max) * 100}%` })}></div>
              </div>
              <span class="bar-value">${item.value}</span>
            </div>
          `
        )}
      </div>
    `;
  }

  private async loadData() {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.stats = await statisticsService.getStatistics();
    } catch (error) {
      console.error('Dashboard konnte nicht geladen werden:', error);
      this.errorMessage = 'Die Statistiken konnten nicht geladen werden.';
    } finally {
      this.isLoading = false;
    }
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
  }

  private formatDateTime(timestamp: number): string {
    // createdAt kommt aus der DB als String?! In Number umwandeln
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(Number(timestamp))
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'admin-stats': AdminStats;
  }
}
