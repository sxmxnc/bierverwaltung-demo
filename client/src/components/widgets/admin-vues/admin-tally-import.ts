/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './admin-tally-import.css?inline';
import {
  ImportStatus,
  ListAction,
  ListStatus,
  PreviewList,
  PreviewPerson,
  TallyImportEntry,
  TallyImportPreview
} from '../../../models/tally-import.js';
import { tallyImportService } from '../../../services/tally-import-service.js';

const euro = (value: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('de-DE') : '–');
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) + ' Uhr';
export const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());

const STATUS_LABELS: Record<ListStatus, string> = {
  neu: 'Neu',
  geaendert: 'Geändert',
  importiert: 'Schon gebucht',
  bilanz: 'In der Bilanz',
  leer: 'Leer'
};

const ACTION_LABELS: Record<ListAction, string> = {
  buchen: 'Buchen',
  ersetzen: 'Alte Fassung ersetzen',
  bilanz: 'Schon in der Bilanz (nicht buchen)',
  ueberspringen: 'Überspringen'
};

const HISTORY_LABELS: Record<ImportStatus, string> = {
  gebucht: 'Gebucht',
  bilanz: 'In der Bilanz',
  ersetzt: 'Ersetzt',
  zurueckgenommen: 'Zurückgenommen'
};

const BOOKING_ACTIONS: ListAction[] = ['buchen', 'ersetzen'];

// Bierwart: Backup-Strichliste aus dem Erfassungs-Tool übernehmen (Vorschau → Zuordnung → Buchen)
@customElement('admin-tally-import')
export class AdminTallyImport extends LitElement {
  static styles = componentStyle;

  @state() private fileName = '';
  @state() private preview: TallyImportPreview | null = null;
  @state() private actions: Record<string, ListAction> = {};
  @state() private dates: Record<string, string> = {};
  @state() private choices: Record<string, string> = {};
  @state() private history: TallyImportEntry[] = [];
  @state() private busy = false;
  @state() private error = '';
  @state() private message = '';
  private file: unknown = null;

  async firstUpdated() {
    await this.loadHistory();
  }

  render() {
    return html`
      <section>
        <div class="section-header">
          <div>
            <h1>Strichliste importieren</h1>
            <p class="subtitle">
              Backup-Strichliste aus dem Erfassungs-Tool übernehmen. Diese Striche landen auf den Konten, zählen aber
              nicht in die Rangliste.
            </p>
          </div>
          <button class="secondary" @click=${this.downloadPersons}>Personenliste für das Erfassungs-Tool</button>
        </div>

        <label class="upload">
          <input type="file" accept=".json,application/json" @change=${this.onFile} ?disabled=${this.busy} />
          <span class="upload-button">Datei aus dem Tool wählen</span>
          <span class="upload-name">${this.fileName || 'Export oder Zwischenstand (.json)'}</span>
        </label>

        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
        ${this.message ? html`<p class="success" role="status">${this.message}</p>` : nothing}
        ${this.preview ? this.renderPreview(this.preview) : nothing} ${this.renderHistory()}
      </section>
    `;
  }

  private renderPreview(preview: TallyImportPreview) {
    const persons = this.involvedPersons();
    const open = persons.filter(person => !this.choices[person.toolId]);
    const booking = preview.lists.filter(list => BOOKING_ACTIONS.includes(this.actions[list.key]));
    const marking = preview.lists.filter(list => this.actions[list.key] === 'bilanz');
    const missingDate = booking.filter(list => !this.dates[list.key]);
    const canBook =
      !this.busy &&
      booking.length + marking.length > 0 &&
      open.length === 0 &&
      missingDate.length === 0 &&
      preview.missingDrinks.length === 0;

    return html`
      <div class="card">
        <p class="meta">
          Tool-Version ${preview.version} · ${preview.typ === 'zwischenstand' ? 'Zwischenstand' : 'Export'}
          ${preview.savedAt ? html` · gespeichert ${dateTime(preview.savedAt)}` : nothing}
        </p>
        ${preview.warnings.length
          ? html`<ul class="warnings">
              ${preview.warnings.map(w => html`<li>${w}</li>`)}
            </ul>`
          : nothing}
        ${preview.missingDrinks.length
          ? html`<p class="error">
              Diese Getränke aus dem Tool gibt es in der App nicht: ${preview.missingDrinks.join(', ')}. Bitte unter
              „Getränke &amp; Preise“ anlegen.
            </p>`
          : nothing}

        <div class="lists-header">
          <h2>Listen</h2>
          ${preview.lists.some(list => list.actions.includes('bilanz'))
            ? html`<button class="secondary small" @click=${this.markAllAsBilanz}>
                Alle neuen Listen: stehen schon in der Bilanz
              </button>`
            : nothing}
        </div>
        <div class="table lists">
          <div class="row head">
            <span>Liste</span>
            <span>Status</span>
            <span class="num">Personen</span>
            <span class="num">Striche</span>
            <span class="num">Betrag</span>
            <span>Was tun?</span>
          </div>
          ${preview.lists.map(list => this.renderList(list))}
        </div>

        ${persons.length ? this.renderPersons(persons, preview) : nothing}

        <div class="summary">
          <span>
            ${booking.length} ${booking.length === 1 ? 'Liste' : 'Listen'} buchen
            (${euro(booking.reduce((sum, list) => sum + list.total, 0))})${marking.length
              ? html`, ${marking.length} als „schon in der Bilanz“ merken`
              : nothing}
            ${open.length ? html`<strong class="warn"> · ${open.length} Personen noch zuordnen</strong>` : nothing}
            ${missingDate.length ? html`<strong class="warn"> · Buchungsdatum fehlt</strong>` : nothing}
          </span>
          <button class="primary" ?disabled=${!canBook} @click=${this.book}>
            ${this.busy ? 'Wird übernommen …' : 'Übernehmen'}
          </button>
        </div>
      </div>
    `;
  }

  private renderList(list: PreviewList) {
    const action = this.actions[list.key];
    const needsDate = BOOKING_ACTIONS.includes(action);
    return html`<div class="row">
      <span class="name">
        <strong>${list.name}</strong>
        <small>${list.datum ? day(list.datum) : list.monat ? `Monat ${list.monat}` : 'ohne Datum'}</small>
        ${list.notiz ? html`<small>${list.notiz}</small>` : nothing}
        ${list.previous
          ? html`<small class="previous"
              >${list.previous.status === 'bilanz' ? 'markiert' : 'gebucht'} am ${dateTime(list.previous.importedAt)}
              (${euro(list.previous.total)})</small
            >`
          : nothing}
      </span>
      <span data-label="Status"><span class="status ${list.status}">${STATUS_LABELS[list.status]}</span></span>
      <span class="num" data-label="Personen">${list.personCount}</span>
      <span class="num" data-label="Striche">${list.strokeCount}</span>
      <span class="num" data-label="Betrag">${euro(list.total)}</span>
      <span class="action">
        ${list.actions.length > 1
          ? html`<select
              aria-label="Aktion für ${list.name}"
              .value=${action}
              @change=${(e: Event) => this.setAction(list.key, (e.target as HTMLSelectElement).value as ListAction)}
            >
              ${list.actions.map(a => html`<option value=${a} ?selected=${a === action}>${ACTION_LABELS[a]}</option>`)}
            </select>`
          : html`<span class="muted">${list.status === 'leer' ? 'keine Striche' : 'nichts zu tun'}</span>`}
        ${needsDate
          ? html`<label class="date"
              >Buchungsdatum
              <input
                type="date"
                max=${today()}
                .value=${this.dates[list.key] ?? ''}
                @change=${(e: Event) =>
                  (this.dates = { ...this.dates, [list.key]: (e.target as HTMLInputElement).value })}
            /></label>`
          : nothing}
      </span>
    </div>`;
  }

  private renderPersons(persons: PreviewPerson[], preview: TallyImportPreview) {
    const sorted = [...persons].sort(
      (a, b) => Number(!!this.choices[a.toolId]) - Number(!!this.choices[b.toolId]) || a.label.localeCompare(b.label)
    );
    return html`
      <h2>Personen zuordnen</h2>
      <p class="hint">Vorschläge bitte kurz prüfen. Zuordnungen von Hand merkt sich die App für den nächsten Import.</p>
      <div class="table persons">
        ${sorted.map(
          person =>
            html`<div class="row ${this.choices[person.toolId] ? '' : 'missing'}">
              <span class="name">
                <strong>${person.label}</strong>
                <small>${person.gruppe || 'ohne Gruppe'} · ${person.strokes} Striche</small>
              </span>
              <span class="confidence ${person.match.confidence}">${person.match.reason}</span>
              <select
                aria-label="Konto für ${person.label}"
                @change=${(e: Event) =>
                  (this.choices = { ...this.choices, [person.toolId]: (e.target as HTMLSelectElement).value })}
              >
                <option value="" ?selected=${!this.choices[person.toolId]}>– Konto wählen –</option>
                ${preview.accounts.map(
                  account =>
                    html`<option value=${account.id} ?selected=${this.choices[person.toolId] === account.id}>
                      ${account.fullName}${account.name !== account.fullName ? ` (${account.name})` : ''}
                    </option>`
                )}
              </select>
            </div>`
        )}
      </div>
    `;
  }

  private renderHistory() {
    if (!this.history.length) return nothing;
    return html`
      <h2>Bisherige Importe</h2>
      <div class="table history">
        ${this.history.map(
          entry =>
            html`<div class="row">
              <span class="name">
                <strong>${entry.listName}</strong>
                <small>${entry.bookingDate ? `gebucht auf ${day(entry.bookingDate)}` : 'nicht gebucht'}</small>
                <small>${dateTime(entry.importedAt)} · ${entry.importedBy}</small>
              </span>
              <span><span class="status ${entry.status}">${HISTORY_LABELS[entry.status]}</span></span>
              <span class="num" data-label="Striche">${entry.strokeCount}</span>
              <span class="num" data-label="Betrag">${euro(entry.total)}</span>
              <span class="action">
                ${entry.status === 'gebucht' || entry.status === 'bilanz'
                  ? html`<button class="secondary small" ?disabled=${this.busy} @click=${() => this.undo(entry)}>
                      Zurücknehmen
                    </button>`
                  : nothing}
              </span>
            </div>`
        )}
      </div>
    `;
  }

  // Personen in Listen, die gebucht werden sollen
  private involvedPersons(): PreviewPerson[] {
    if (!this.preview) return [];
    const booking = new Set(
      this.preview.lists.filter(list => BOOKING_ACTIONS.includes(this.actions[list.key])).map(list => list.key)
    );
    return this.preview.persons.filter(person => person.lists.some(key => booking.has(key)));
  }

  // z. B. beim ersten Import: alte Listen, die schon in der Excel-Bilanz stehen, nur merken
  private markAllAsBilanz() {
    if (!this.preview) return;
    this.actions = Object.fromEntries(
      this.preview.lists.map(list => [list.key, list.actions.includes('bilanz') ? 'bilanz' : this.actions[list.key]])
    );
  }

  private setAction(key: string, action: ListAction) {
    this.actions = { ...this.actions, [key]: action };
  }

  private async onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const selected = input.files?.[0];
    input.value = '';
    if (!selected) return;
    this.error = '';
    this.message = '';
    this.preview = null;
    this.fileName = selected.name;
    try {
      this.file = JSON.parse(await selected.text());
    } catch {
      this.error = 'Die Datei ist kein gültiges JSON. Bitte den Export aus dem Erfassungs-Tool verwenden.';
      return;
    }
    await this.loadPreview();
  }

  private async loadPreview() {
    this.busy = true;
    try {
      const preview = await tallyImportService.preview(this.file);
      this.actions = Object.fromEntries(preview.lists.map(list => [list.key, list.defaultAction]));
      this.dates = Object.fromEntries(preview.lists.map(list => [list.key, list.datum ?? today()]));
      this.choices = Object.fromEntries(
        preview.persons.filter(person => person.match.userId).map(person => [person.toolId, person.match.userId!])
      );
      this.preview = preview;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Die Datei konnte nicht gelesen werden.';
    } finally {
      this.busy = false;
    }
  }

  private async book() {
    if (!this.preview) return;
    const persons = new Set(this.involvedPersons().map(person => person.toolId));
    this.busy = true;
    this.error = '';
    try {
      const result = await tallyImportService.book({
        fileName: this.fileName,
        file: this.file,
        lists: Object.fromEntries(
          this.preview.lists.map(list => [
            list.key,
            { action: this.actions[list.key], bookingDate: this.dates[list.key] || undefined }
          ])
        ),
        persons: Object.fromEntries(Object.entries(this.choices).filter(([toolId]) => persons.has(toolId)))
      });
      this.message = [
        result.booked ? `${result.booked} Listen gebucht (${euro(result.total)})` : '',
        result.marked ? `${result.marked} als „schon in der Bilanz“ gemerkt` : ''
      ]
        .filter(Boolean)
        .join(', ')
        .concat('.');
      this.preview = null;
      this.file = null;
      this.fileName = '';
      await this.loadHistory();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Buchen fehlgeschlagen – es wurde nichts gebucht.';
    } finally {
      this.busy = false;
    }
  }

  private async undo(entry: TallyImportEntry) {
    const what =
      entry.status === 'bilanz'
        ? `Die Markierung „schon in der Bilanz“ für „${entry.listName}“ aufheben?`
        : `Alle ${entry.strokeCount} Striche aus „${entry.listName}“ (${euro(entry.total)}) wieder von den Konten nehmen?`;
    if (!confirm(what)) return;
    this.busy = true;
    this.error = '';
    try {
      await tallyImportService.undo(entry.id);
      this.message = `„${entry.listName}“ zurückgenommen.`;
      await this.loadHistory();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Zurücknehmen fehlgeschlagen.';
    } finally {
      this.busy = false;
    }
  }

  private async loadHistory() {
    try {
      this.history = await tallyImportService.history();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Bisherige Importe konnten nicht geladen werden.';
    }
  }

  private async downloadPersons() {
    try {
      await tallyImportService.downloadPersons();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Personenliste konnte nicht erstellt werden.';
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'admin-tally-import': AdminTallyImport;
  }
}
