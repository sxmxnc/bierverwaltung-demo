/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './scoreboard-page.css?inline';
import { Scoreboard, ScoreboardPeriod, ScoreEntry } from '../../../models/reports.js';
import { reportsService } from '../../../services/reports-service.js';

const PERIODS: { id: ScoreboardPeriod; label: string; title: string }[] = [
  { id: 'week', label: 'Woche', title: 'Bier der Woche' },
  { id: 'month', label: 'Monat', title: 'Bier des Monats' },
  { id: 'all', label: 'All-Time', title: 'Ewige Tabelle' }
];

const MEDALS = ['🥇', '🥈', '🥉'];

function liters(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} l`;
}

// Rangliste: wer hat am meisten Bier getrunken – nur gezapftes Bier und Bierflaschen, nichts Alkoholfreies
@customElement('scoreboard-page')
export class ScoreboardPage extends LitElement {
  static styles = componentStyle;

  @state() private period: ScoreboardPeriod = 'month';
  @state() private board: Scoreboard | null = null;
  @state() private error = '';
  @state() private loading = true;

  async firstUpdated() {
    await this.load();
  }

  render() {
    const current = PERIODS.find(p => p.id === this.period)!;
    return html`
      <section class="page">
        <h1>🏆 Rangliste</h1>
        <p class="subtitle">
          Wer hat am meisten Bier getrunken? Gezählt wird in Litern – nur Bier, nichts Alkoholfreies.
        </p>

        <div class="tabs" role="tablist">
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

        <h2>${current.title}</h2>
        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
        ${this.loading && !this.board ? html`<p class="empty">Lade Rangliste …</p>` : nothing}
        ${this.board ? this.renderBoard(this.board) : nothing}
      </section>
    `;
  }

  private renderBoard(board: Scoreboard) {
    if (board.entries.length === 0) {
      return html`<p class="empty">Noch kein Bier gestrichelt in diesem Zeitraum. Das lässt sich ändern! 🍺</p>`;
    }
    const podium = board.entries.filter(entry => entry.rank <= 3).slice(0, 3);
    const rest = board.entries.slice(podium.length);
    const meVisible = board.me && board.entries.some(entry => entry.id === board.me!.id);
    return html`
      <ol class="podium">
        ${podium.map(
          entry =>
            html`<li class="place place-${entry.rank} ${entry.id === board.me?.id ? 'me' : ''}">
              <span class="medal" aria-hidden="true">${MEDALS[entry.rank - 1]}</span>
              <span class="name">${entry.name}</span>
              <span class="liters">${liters(entry.liters)}</span>
              <span class="count">${entry.count} ${entry.count === 1 ? 'Bier' : 'Biere'}</span>
            </li>`
        )}
      </ol>

      ${rest.length
        ? html`<ol class="list">
            ${rest.map(entry => this.renderRow(entry, entry.id === board.me?.id))}
          </ol>`
        : nothing}
      ${board.me && !meVisible
        ? html`<p class="gap" aria-hidden="true">…</p>
            <ol class="list">
              ${this.renderRow(board.me, true)}
            </ol>`
        : nothing}

      <p class="total">Zusammen: <strong>${liters(board.totalLiters)}</strong> Bier</p>
    `;
  }

  private renderRow(entry: ScoreEntry, me: boolean) {
    return html`<li class="row ${me ? 'me' : ''}">
      <span class="rank">${entry.rank}.</span>
      <span class="name">${entry.name}${me ? html` <em>(du)</em>` : nothing}</span>
      <span class="count">${entry.count}×</span>
      <span class="liters">${liters(entry.liters)}</span>
    </li>`;
  }

  private async select(period: ScoreboardPeriod) {
    if (period === this.period) return;
    this.period = period;
    await this.load();
  }

  private async load() {
    this.loading = true;
    this.error = '';
    try {
      this.board = await reportsService.getScoreboard(this.period);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Rangliste konnte nicht geladen werden.';
    } finally {
      this.loading = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'scoreboard-page': ScoreboardPage;
  }
}
