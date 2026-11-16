/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './admin-inventory.css?inline';
import { InventoryItemReport, InventoryReport } from '../../../models/reports.js';
import { reportsService } from '../../../services/reports-service.js';

const euro = (value: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
const liters = (value: number) =>
  `${value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} l`;

const STATUS_LABELS: Record<InventoryItemReport['status'], string> = {
  ok: 'Ausreichend',
  low: 'Knapp',
  empty: 'Leer',
  untracked: 'Nicht gezählt'
};

// Bierwart: Bestandsübersicht mit Verbrauch und Reichweite
@customElement('admin-inventory')
export class AdminInventory extends LitElement {
  static styles = componentStyle;

  @state() private report: InventoryReport | null = null;
  @state() private error = '';

  async firstUpdated() {
    try {
      this.report = await reportsService.getInventory();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Bestand konnte nicht geladen werden.';
    }
  }

  render() {
    const report = this.report;
    return html`
      <section>
        <div class="section-header">
          <div>
            <h1>Bestand</h1>
            <p class="subtitle">Was noch da ist, was weggeht und wann nachgekauft werden muss</p>
          </div>
          <a class="order-link" href="/beverage-order">Einkauf erfassen</a>
        </div>

        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
        ${report ? this.renderReport(report) : !this.error ? html`<p class="empty">Lade Bestand …</p>` : nothing}
      </section>
    `;
  }

  private renderReport(report: InventoryReport) {
    const attention = report.items.filter(item => item.status === 'low' || item.status === 'empty');
    return html`
      <div class="kpis">
        <div class="kpi"><span>Warenwert (Verkaufspreis)</span><strong>${euro(report.totals.stockValue)}</strong></div>
        <div class="kpi ${report.totals.low ? 'warn' : ''}">
          <span>Knapp</span><strong>${report.totals.low}</strong>
        </div>
        <div class="kpi ${report.totals.empty ? 'alert' : ''}">
          <span>Leer</span><strong>${report.totals.empty}</strong>
        </div>
        <div class="kpi"><span>Fassbier (30 Tage)</span><strong>${liters(report.totals.draftLiters30)}</strong></div>
      </div>

      ${attention.length
        ? html`<div class="attention">
            <strong>Nachkaufen:</strong>
            ${attention.map(
              item => html`<span class="chip ${item.status}">${item.name} ${item.unit} (${item.stock})</span>`
            )}
          </div>`
        : nothing}

      <div class="table">
        <div class="row head">
          <span>Getränk</span>
          <span class="num">Bestand</span>
          <span class="num">7 Tage</span>
          <span class="num">30 Tage</span>
          <span class="num">Reicht noch</span>
          <span>Status</span>
        </div>
        ${report.items.map(item => this.renderItem(item))}
      </div>
      <p class="hint">
        Bestand ändern oder „knapp ab"-Grenzen setzen: unter „Getränke & Preise". Fassbier wird pro Glas gestrichelt –
        dafür zeigt die Übersicht die ausgeschenkten Liter statt eines Bestands.
      </p>
    `;
  }

  private renderItem(item: InventoryItemReport) {
    const draft = item.packaging === 'Fass';
    return html`<div class="row">
      <span class="name"><strong>${item.name}</strong> <small>${item.unit}</small></span>
      <span class="num" data-label="Bestand">${item.tracked ? `${item.stock} Stk.` : '–'}</span>
      <span class="num" data-label="7 Tage">${draft ? liters(item.liters7) : `${item.sold7}×`}</span>
      <span class="num" data-label="30 Tage">${draft ? liters(item.liters30) : `${item.sold30}×`}</span>
      <span class="num" data-label="Reicht noch">${item.daysLeft === null ? '–' : `${item.daysLeft} Tage`}</span>
      <span data-label="Status"><span class="status ${item.status}">${STATUS_LABELS[item.status]}</span></span>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'admin-inventory': AdminInventory;
  }
}
