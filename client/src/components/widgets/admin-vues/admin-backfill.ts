/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './admin-tally-import.css?inline';
import backfillStyle from './admin-backfill.css?inline';
import { DrinkItem } from '../../../models/drinks.js';
import { Member } from '../../../models/member.js';
import { BackfillEntry } from '../../../models/tally-import.js';
import { drinkService } from '../../../services/drinks.js';
import { tallyService } from '../../../services/tally-service.js';
import { tallyImportService } from '../../../services/tally-import-service.js';
import { today } from './admin-tally-import.js';

const euro = (value: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);

// Bierwart: einzelne Striche mit Datum nachtragen oder korrigieren (zählen nicht in die Rangliste)
@customElement('admin-backfill')
export class AdminBackfill extends LitElement {
  static styles = [componentStyle, backfillStyle];

  @state() private members: Member[] = [];
  @state() private drinks: DrinkItem[] = [];
  @state() private entries: BackfillEntry[] = [];
  @state() private userId = '';
  @state() private date = today();
  @state() private counts: Record<string, number> = {};
  @state() private note = '';
  @state() private busy = false;
  @state() private error = '';
  @state() private message = '';

  async firstUpdated() {
    try {
      const [members, groups] = await Promise.all([tallyService.getMembers(), drinkService.getDrinks()]);
      this.members = members;
      this.drinks = groups.flatMap(group => group.items);
      await this.loadEntries();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Daten konnten nicht geladen werden.';
    }
  }

  render() {
    const items = Object.entries(this.counts).filter(([, value]) => value !== 0);
    const total = items.reduce(
      (sum, [id, value]) => sum + value * (this.drinks.find(drink => drink.id === id)?.price ?? 0),
      0
    );
    const correction = items.some(([, value]) => value < 0);
    const canSave =
      !this.busy && !!this.userId && !!this.date && items.length > 0 && (!correction || !!this.note.trim());

    return html`
      <section>
        <h1>Striche nachtragen</h1>
        <p class="subtitle">
          Für Einzelfälle, z. B. von der Papierliste oder eine Korrektur. Eine negative Anzahl nimmt Striche zurück und
          braucht eine Begründung. Nachträge zählen nicht in die Rangliste. Ganze Backup-Listen bitte über „Strichliste
          importieren“.
        </p>

        <div class="card form">
          <label>
            Konto
            <select @change=${(e: Event) => (this.userId = (e.target as HTMLSelectElement).value)}>
              <option value="" ?selected=${!this.userId}>– auswählen –</option>
              ${this.members.map(
                member =>
                  html`<option value=${member.id} ?selected=${member.id === this.userId}>
                    ${member.name}${member.hint ? ` – ${member.hint}` : ''}
                  </option>`
              )}
            </select>
          </label>
          <label>
            Datum
            <input
              type="date"
              max=${today()}
              .value=${this.date}
              @change=${(e: Event) => (this.date = (e.target as HTMLInputElement).value)}
            />
          </label>

          <div class="drinks">
            ${this.drinks.map(
              drink =>
                html`<label class="drink">
                  <span>${drink.name} <small>${drink.unit} · ${euro(drink.price)}</small></span>
                  <input
                    type="number"
                    inputmode="numeric"
                    step="1"
                    min="-200"
                    max="200"
                    aria-label="Anzahl ${drink.name} ${drink.unit}"
                    .value=${this.counts[drink.id] ? String(this.counts[drink.id]) : ''}
                    @input=${(e: Event) => this.setCount(drink.id, (e.target as HTMLInputElement).value)}
                  />
                </label>`
            )}
          </div>

          <label>
            Begründung ${correction ? html`<strong class="warn">(Pflicht bei Korrektur)</strong>` : '(optional)'}
            <input
              type="text"
              maxlength="200"
              placeholder="z. B. Strichliste 14.11., Spalte vergessen"
              .value=${this.note}
              @input=${(e: Event) => (this.note = (e.target as HTMLInputElement).value)}
            />
          </label>

          <div class="summary">
            <span
              >${items.length ? html`Summe: <strong>${euro(total)}</strong>` : 'Noch keine Anzahl eingetragen'}</span
            >
            <button class="primary" ?disabled=${!canSave} @click=${this.save}>
              ${this.busy ? 'Speichert …' : 'Nachtragen'}
            </button>
          </div>
        </div>

        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
        ${this.message ? html`<p class="success" role="status">${this.message}</p>` : nothing} ${this.renderEntries()}
      </section>
    `;
  }

  private renderEntries() {
    if (!this.entries.length) return nothing;
    return html`
      <h2>Zuletzt nachgetragen</h2>
      <div class="table history">
        ${this.entries.map(
          entry =>
            html`<div class="row">
              <span class="name">
                <strong>${entry.target}</strong>
                <small
                  >${entry.quantity}× ${entry.title} · für ${new Date(entry.date).toLocaleDateString('de-DE')}</small
                >
                ${entry.note ? html`<small>${entry.note}</small>` : nothing}
              </span>
              <span class="muted">${entry.bookedBy}</span>
              <span class="num" data-label="Anzahl">${entry.quantity}</span>
              <span class="num" data-label="Betrag">${euro(entry.amount)}</span>
              <span class="action">
                <button class="secondary small" ?disabled=${this.busy} @click=${() => this.removeEntry(entry)}>
                  Löschen
                </button>
              </span>
            </div>`
        )}
      </div>
    `;
  }

  private setCount(drinkId: string, value: string) {
    const number = Number(value);
    this.counts = { ...this.counts, [drinkId]: Number.isInteger(number) ? number : 0 };
  }

  private async save() {
    this.busy = true;
    this.error = '';
    this.message = '';
    try {
      const items = Object.entries(this.counts)
        .filter(([, value]) => value !== 0)
        .map(([id, value]) => ({ id, value }));
      const result = await tallyImportService.backfill({
        userId: this.userId,
        date: this.date,
        items,
        note: this.note.trim()
      });
      this.message = `Für ${result.target.name} nachgetragen: ${euro(result.total)}.`;
      this.counts = {};
      this.note = '';
      await this.loadEntries();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Nachtragen fehlgeschlagen.';
    } finally {
      this.busy = false;
    }
  }

  private async removeEntry(entry: BackfillEntry) {
    if (!confirm(`${entry.quantity}× ${entry.title} bei ${entry.target} löschen?`)) return;
    this.busy = true;
    this.error = '';
    try {
      await tallyImportService.deleteOrder(entry.id);
      await this.loadEntries();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Löschen fehlgeschlagen.';
    } finally {
      this.busy = false;
    }
  }

  private async loadEntries() {
    this.entries = await tallyImportService.backfills();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'admin-backfill': AdminBackfill;
  }
}
