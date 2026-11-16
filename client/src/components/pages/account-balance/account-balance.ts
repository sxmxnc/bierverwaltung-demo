/* Autor: Marius Middrup (FH Münster), neu gestaltet für die K.D.St.V. Sauerlandia */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { consume } from '@lit/context';
import componentStyle from './account-balance.css?inline';
import { Club, clubContext } from '../../../context/clubContext.js';
import { Account, AccountEntry } from '../../../models/account.js';
import { tallyService } from '../../../services/tally-service.js';
import { formatDay, formatPrice, formatTime } from '../../../utils/format.js';

interface DayGroup {
  day: string;
  entries: AccountEntry[];
}

@customElement('account-balance')
export class AccountBalancePage extends LitElement {
  static styles = componentStyle;

  @consume({ context: clubContext, subscribe: true })
  club!: Club;

  @state() private account: Account | null = null;
  @state() private error = '';

  async firstUpdated() {
    await this.load();
  }

  render() {
    if (this.error) {
      return html`<section class="page"><p class="error">${this.error}</p></section>`;
    }
    if (!this.account) {
      return html`<section class="page"><p class="loading">Lade Konto …</p></section>`;
    }

    const { balance, entries } = this.account;
    const negative = balance < -0.004;
    return html`
      <section class="page">
        <div class="balance-card ${negative ? 'negative' : 'positive'}">
          <span class="balance-label">${negative ? 'Offen' : 'Guthaben'}</span>
          <span class="balance-amount">${formatPrice(Math.abs(balance), this.club)}</span>
          <span class="balance-hint">
            ${negative
              ? 'Bitte per Überweisung an die Bierkasse ausgleichen – oder bar beim Bierwart.'
              : 'Alles im grünen Bereich. Prost!'}
          </span>
        </div>

        <h2>Verlauf</h2>
        ${entries.length === 0
          ? html`<p class="empty">Noch keine Buchungen. Ab an die Theke! 🍺</p>`
          : this.groupByDay(entries).map(
              group => html`
                <h3>${group.day}</h3>
                <ul class="entries">
                  ${group.entries.map(entry => this.renderEntry(entry))}
                </ul>
              `
            )}
      </section>
    `;
  }

  private renderEntry(entry: AccountEntry) {
    const isOrder = entry.kind === 'order';
    return html`
      <li class="entry ${entry.kind}">
        <span class="entry-icon" aria-hidden="true"
          >${isOrder ? `${entry.quantity}×` : entry.kind === 'sepa' ? '🏦' : '€'}</span
        >
        <span class="entry-text">
          <span class="entry-title">${entry.title}</span>
          <span class="entry-meta">
            ${formatTime(entry.date)} Uhr
            ${entry.bookedBy ? html` · gestrichelt von <strong>${entry.bookedBy}</strong>` : nothing}
            ${entry.origin ? html` · ${entry.origin}` : nothing}
          </span>
        </span>
        <span class="entry-amount ${entry.amount < 0 ? 'minus' : 'plus'}">
          ${entry.amount > 0 ? '+' : ''}${formatPrice(entry.amount, this.club)}
        </span>
      </li>
    `;
  }

  private groupByDay(entries: AccountEntry[]): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const entry of entries) {
      const day = formatDay(entry.date);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.entries.push(entry);
      else groups.push({ day, entries: [entry] });
    }
    return groups;
  }

  private async load() {
    try {
      this.account = await tallyService.getAccount();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Konto konnte nicht geladen werden.';
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'account-balance': AccountBalancePage;
  }
}
