/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './admin-consumption.css?inline';
import { ConsumptionMember, ConsumptionReport, ReportPeriod } from '../../../models/reports.js';
import { reportsService } from '../../../services/reports-service.js';

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: 'week', label: 'Diese Woche' },
  { id: 'month', label: 'Dieser Monat' },
  { id: 'lastMonth', label: 'Vormonat' },
  { id: 'all', label: 'Gesamt' }
];

const euro = (value: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
const liters = (value: number) =>
  `${value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} l`;

// Bierwart: Was hat jeder Bundesbruder (und jede Kasse) im Zeitraum getrunken?
@customElement('admin-consumption')
export class AdminConsumption extends LitElement {
  static styles = componentStyle;

  @state() private period: ReportPeriod = 'month';
  @state() private report: ConsumptionReport | null = null;
  @state() private error = '';
  @state() private query = '';
  @state() private onlyActive = true;
  @state() private expanded = new Set<string>();

  private get visibleMembers(): ConsumptionMember[] {
    const query = this.query.trim().toLowerCase();
    return (this.report?.members ?? []).filter(
      member =>
        (!this.onlyActive || member.count > 0) &&
        (!query || member.name.toLowerCase().includes(query) || member.fullName.toLowerCase().includes(query))
    );
  }

  async firstUpdated() {
    await this.load();
  }

  render() {
    const report = this.report;
    return html`
      <section>
        <div class="section-header">
          <h1>Verbrauch</h1>
          <p class="subtitle">Was jeder Bundesbruder und jede Kasse getrunken hat – zum Antippen aufgeschlüsselt</p>
        </div>

        <div class="toolbar">
          <div class="periods" role="tablist">
            ${PERIODS.map(
              p =>
                html`<button
                  role="tab"
                  aria-selected=${this.period === p.id}
                  class=${this.period === p.id ? 'active' : ''}
                  @click=${() => this.select(p.id)}
                >
                  ${p.label}
                </button>`
            )}
          </div>
          <input
            type="search"
            placeholder="Name oder V/o suchen …"
            .value=${this.query}
            @input=${(e: InputEvent) => (this.query = (e.target as HTMLInputElement).value)}
          />
          <label class="toggle">
            <input
              type="checkbox"
              .checked=${this.onlyActive}
              @change=${(e: Event) => (this.onlyActive = (e.target as HTMLInputElement).checked)}
            />
            Nur wer etwas getrunken hat
          </label>
        </div>

        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
        ${report
          ? html`
              <div class="kpis">
                <div class="kpi"><span>Getränke</span><strong>${report.totals.count}</strong></div>
                <div class="kpi"><span>Umsatz</span><strong>${euro(report.totals.amount)}</strong></div>
                <div class="kpi"><span>Bier</span><strong>${liters(report.totals.beerLiters)}</strong></div>
              </div>

              <div class="table">
                <div class="row head">
                  <span>Name</span>
                  <span class="num">Getränke</span>
                  <span class="num">Bier</span>
                  <span class="num">Betrag</span>
                  <span class="num">Saldo</span>
                </div>
                ${this.visibleMembers.length === 0
                  ? html`<p class="empty">Keine Buchungen in diesem Zeitraum.</p>`
                  : this.visibleMembers.map(member => this.renderMember(member))}
              </div>
            `
          : !this.error
            ? html`<p class="empty">Lade Verbrauch …</p>`
            : nothing}
      </section>
    `;
  }

  private renderMember(member: ConsumptionMember) {
    const open = this.expanded.has(member.id);
    return html`
      <button class="row member ${open ? 'open' : ''}" aria-expanded=${open} @click=${() => this.toggle(member.id)}>
        <span class="name">
          ${member.kind === 'kasse' ? html`<span class="badge">Kasse</span>` : nothing}
          <strong>${member.name}</strong>
          ${member.fullName !== member.name ? html`<small>${member.fullName}</small>` : nothing}
        </span>
        <span class="num" data-label="Getränke">${member.count}</span>
        <span class="num" data-label="Bier">${liters(member.beerLiters)}</span>
        <span class="num" data-label="Betrag">${euro(member.amount)}</span>
        <span class="num ${member.balance < 0 ? 'negative' : 'positive'}" data-label="Saldo"
          >${euro(member.balance)}</span
        >
      </button>
      ${open
        ? html`<div class="details">
            ${member.drinks.length === 0
              ? html`<p class="empty">Nichts gestrichelt in diesem Zeitraum.</p>`
              : html`<ul>
                  ${member.drinks.map(
                    drink =>
                      html`<li>
                        <span>${drink.count}× ${drink.name} ${drink.unit}</span><span>${euro(drink.amount)}</span>
                      </li>`
                  )}
                </ul>`}
          </div>`
        : nothing}
    `;
  }

  private toggle(id: string) {
    const expanded = new Set(this.expanded);
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    this.expanded = expanded;
  }

  private async select(period: ReportPeriod) {
    if (period === this.period) return;
    this.period = period;
    await this.load();
  }

  private async load() {
    this.error = '';
    try {
      this.report = await reportsService.getConsumption(this.period);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Verbrauch konnte nicht geladen werden.';
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'admin-consumption': AdminConsumption;
  }
}
