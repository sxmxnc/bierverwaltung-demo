/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './admin-tally-import.css?inline';
import memberStyle from './admin-member-import.css?inline';
import { MemberImportPreview, MemberImportResult, MemberImportRow } from '../../../models/member-import.js';
import { memberImportService } from '../../../services/member-import-service.js';
import { today } from './admin-tally-import.js';

const euro = (value: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);

const ACTION_LABELS: Record<MemberImportRow['action'], string> = {
  anlegen: 'Neu anlegen',
  zuordnen: 'Vorhandenes Konto',
  ueberspringen: 'Übersprungen',
  schon_uebernommen: 'Schon übernommen',
  fehler: 'Fehler'
};

const CATEGORY_LABELS: Record<string, string> = {
  aktiv: 'Aktiv',
  ah: 'AH',
  hausbewohner: 'Hausbewohner',
  gast: 'Gast',
  verein: 'Verein',
  kasse: 'Kasse'
};

// Excel speichert CSV je nach Variante als UTF-8 oder Windows-1252
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// Bierwart: Konten und Salden aus der Excel-Bilanz übernehmen (Prüfdatei von "npm run bilanz-export")
@customElement('admin-member-import')
export class AdminMemberImport extends LitElement {
  static styles = [componentStyle, memberStyle];

  @state() private fileName = '';
  @state() private preview: MemberImportPreview | null = null;
  @state() private result: MemberImportResult | null = null;
  @state() private cutoff = today();
  @state() private filter: MemberImportRow['action'] | 'alle' = 'alle';
  @state() private busy = false;
  @state() private error = '';
  private csv = '';

  render() {
    return html`
      <section>
        <h1>Mitglieder importieren</h1>
        <p class="subtitle">
          Konten und Kontostände aus der Excel-Bilanz übernehmen. Die Prüfdatei entsteht mit
          <code>npm run bilanz-export -- "Bilanz ….xlsm"</code> und wird vorher in Excel kontrolliert. Jedes Konto
          bekommt genau einen Übertrag zum Stichtag – ein zweiter Durchlauf bucht nichts doppelt.
        </p>

        <label class="upload">
          <input type="file" accept=".csv,text/csv" @change=${this.onFile} ?disabled=${this.busy} />
          <span class="upload-button">Prüfdatei wählen</span>
          <span class="upload-name">${this.fileName || 'Mitglieder-Import_….csv'}</span>
        </label>

        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
        ${this.result ? this.renderResult(this.result) : nothing}
        ${this.preview ? this.renderPreview(this.preview) : nothing}
      </section>
    `;
  }

  private renderPreview(preview: MemberImportPreview) {
    const t = preview.totals;
    const rows = preview.rows.filter(row => this.filter === 'alle' || row.action === this.filter);
    const canBook = !this.busy && preview.errors.length === 0 && t.create + t.link > 0 && !!this.cutoff;
    return html`
      <div class="card">
        ${preview.meta ? html`<p class="meta">${preview.meta}</p>` : nothing}
        ${preview.demoLogins
          ? html`<p class="error">
              Die Demo-Zugänge ohne Passwort sind eingeschaltet. Auf dem Server lässt die App den Import deshalb nicht
              zu – bitte vorher DEMO_LOGINS abschalten.
            </p>`
          : nothing}
        ${preview.errors.length
          ? html`<div class="error">
              <strong>Bitte in der Prüfdatei korrigieren:</strong>
              <ul>
                ${preview.errors.map(e => html`<li>${e}</li>`)}
              </ul>
            </div>`
          : nothing}

        <div class="kpis">
          <button class="kpi ${this.filter === 'anlegen' ? 'on' : ''}" @click=${() => this.toggle('anlegen')}>
            <span>Neu anlegen</span><strong>${t.create}</strong>
          </button>
          <button class="kpi ${this.filter === 'zuordnen' ? 'on' : ''}" @click=${() => this.toggle('zuordnen')}>
            <span>Vorhandene Konten</span><strong>${t.link}</strong>
          </button>
          <button
            class="kpi ${this.filter === 'ueberspringen' ? 'on' : ''}"
            @click=${() => this.toggle('ueberspringen')}
          >
            <span>Übersprungen</span><strong>${t.skip}</strong>
          </button>
          <button
            class="kpi ${this.filter === 'schon_uebernommen' ? 'on' : ''}"
            @click=${() => this.toggle('schon_uebernommen')}
          >
            <span>Schon übernommen</span><strong>${t.done}</strong>
          </button>
          <div class="kpi"><span>Schulden</span><strong>${euro(t.debt)}</strong></div>
          <div class="kpi"><span>Guthaben</span><strong>${euro(Math.abs(t.credit))}</strong></div>
        </div>

        <div class="table members">
          <div class="row head">
            <span>Person</span>
            <span>Kategorie</span>
            <span>Herkunft</span>
            <span class="num">Excel-Saldo</span>
            <span>Was passiert?</span>
          </div>
          ${rows.map(
            row =>
              html`<div class="row ${row.action === 'fehler' ? 'missing' : ''}">
                <span class="name">
                  <strong>${`${row.firstName} ${row.lastName}`.trim()}</strong>
                  <small>${[row.nickname, row.email].filter(Boolean).join(' · ') || 'ohne E-Mail (kein Login)'}</small>
                </span>
                <span
                  >${CATEGORY_LABELS[row.category] ?? row.category}${row.status === 'inaktiv' ? ' · inaktiv' : ''}</span
                >
                <span class="muted">${row.source}</span>
                <span class="num ${row.balanceCents > 0 ? 'debt' : row.balanceCents < 0 ? 'credit' : ''}"
                  >${euro(row.balanceCents / 100)}</span
                >
                <span>
                  <span class="status ${row.action}">${ACTION_LABELS[row.action]}</span>
                  <small class="muted">${row.targetName ? `→ ${row.targetName}` : row.reason}</small>
                </span>
              </div>`
          )}
        </div>
        <p class="hint">Excel-Saldo: positiv = Schulden, negativ = Guthaben (in der App umgekehrt dargestellt).</p>

        <div class="summary">
          <label class="date"
            >Stichtag (bis hier ist alles in der Excel gebucht)
            <input
              type="date"
              max=${today()}
              .value=${this.cutoff}
              @change=${(e: Event) => (this.cutoff = (e.target as HTMLInputElement).value)}
          /></label>
          <button class="primary" ?disabled=${!canBook} @click=${this.book}>
            ${this.busy ? 'Wird übernommen …' : `${t.create + t.link} Konten übernehmen`}
          </button>
        </div>
      </div>
    `;
  }

  private renderResult(result: MemberImportResult) {
    const c = result.check;
    const ok = Math.abs(c.fileDebt - c.appDebt) < 0.005 && Math.abs(c.fileCredit + c.appCredit) < 0.005;
    return html`<div class="${ok ? 'success' : 'error'}" role="status">
      <strong>${result.created} Konten angelegt, ${result.linked} vorhandenen Konten zugeordnet.</strong><br />
      Abgleich: Schulden laut Datei ${euro(c.fileDebt)}, in der App ${euro(c.appDebt)} · Guthaben laut Datei
      ${euro(-c.fileCredit)}, in der App ${euro(c.appCredit)} ${ok ? '✓' : '– bitte prüfen!'}
    </div>`;
  }

  private toggle(filter: MemberImportRow['action']) {
    this.filter = this.filter === filter ? 'alle' : filter;
  }

  private async onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.fileName = file.name;
    this.error = '';
    this.result = null;
    this.preview = null;
    this.csv = decodeCsv(await file.arrayBuffer());
    await this.loadPreview();
  }

  private async loadPreview() {
    this.busy = true;
    try {
      this.preview = await memberImportService.preview(this.csv);
      this.filter = this.preview.errors.length ? 'fehler' : 'alle';
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Die Datei konnte nicht gelesen werden.';
    } finally {
      this.busy = false;
    }
  }

  private async book() {
    if (!this.preview) return;
    const t = this.preview.totals;
    if (
      !confirm(
        `${t.create + t.link} Konten mit Übertrag zum ${new Date(this.cutoff).toLocaleDateString('de-DE')} übernehmen?`
      )
    )
      return;
    this.busy = true;
    this.error = '';
    try {
      this.result = await memberImportService.book(this.csv, this.cutoff, this.fileName);
      await this.loadPreview();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Übernehmen fehlgeschlagen – es wurde nichts übernommen.';
    } finally {
      this.busy = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'admin-member-import': AdminMemberImport;
  }
}
