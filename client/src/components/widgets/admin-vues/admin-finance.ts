/* Autor: Julius Vollmer (FH Münster), vereinfacht für die K.D.St.V. Sauerlandia (ohne SEPA-Lastschrift) */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './admin-finance.css?inline';
import { FinanceStats } from '../../../models/statistics.js';
import { statisticsService } from '../../../services/statistics-service.js';

// Die SEPA-Lastschrift liegt auf dem Branch feature/sepa-lastschrift und kann bei Bedarf zurückkommen.
@customElement('admin-finance')
export class AdminFinance extends LitElement {
  static styles = componentStyle;

  @state() private financeStats: FinanceStats | null = null;
  @state() private isLoading = true;
  @state() private errorMessage = '';

  async firstUpdated() {
    await this.load();
  }

  render() {
    return html`
      <section class="finance-section">
        <div class="section-header">
          <h1>Finanzen</h1>
          <p class="subtitle">Guthaben, offene Beträge und wer noch zahlen muss</p>
        </div>

        ${this.isLoading
          ? html`<div class="loader-container">
              <div class="spinner"></div>
              <p>Lade Finanzdaten...</p>
            </div>`
          : ''}
        ${this.errorMessage
          ? html`<div class="error-container">
              <p>${this.errorMessage}</p>
              <button class="btn btn-secondary" @click=${this.load}>Erneut versuchen</button>
            </div>`
          : ''}
        ${!this.isLoading && !this.errorMessage && this.financeStats ? this.renderOverview(this.financeStats) : ''}
      </section>
    `;
  }

  private renderOverview(finance: FinanceStats) {
    return html`
      <div class="kpi-row">
        <div class="kpi-card">
          <span class="kpi-label">Guthaben gesamt</span>
          <span class="kpi-value">${this.formatCurrency(finance.totalCredit)}</span>
        </div>
        <div class="kpi-card warn">
          <span class="kpi-label">Offene Beträge</span>
          <span class="kpi-value negative">${this.formatCurrency(finance.totalDebt)}</span>
        </div>
        <div class="kpi-card neutral">
          <span class="kpi-label">Saldo</span>
          <span class="kpi-value">${this.formatCurrency(finance.netBalance)}</span>
        </div>
      </div>

      <div class="panel">
        <h2>Größte offene Beträge (${finance.debtorCount} insgesamt)</h2>
        <p class="hint">Einzahlungen bucht ihr unter „Mitglieder" beim jeweiligen Konto.</p>
        ${finance.topDebtors.length === 0
          ? html`<p class="empty">Niemand ist im Minus. Prost!</p>`
          : html`<div class="member-list">
              ${finance.topDebtors.map(
                debtor =>
                  html`<div class="member-card">
                    <div class="member-card-header">
                      <span class="member-name">${debtor.name}</span>
                      <span class="member-amount negative">${this.formatCurrency(debtor.balance)}</span>
                    </div>
                  </div>`
              )}
            </div>`}
      </div>
    `;
  }

  private async load() {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.financeStats = (await statisticsService.getStatistics()).finance;
    } catch (error) {
      console.error('Fehler beim Laden der Finanzdaten:', error);
      this.errorMessage = 'Finanzdaten konnten nicht geladen werden.';
    } finally {
      this.isLoading = false;
    }
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'admin-finance': AdminFinance;
  }
}
