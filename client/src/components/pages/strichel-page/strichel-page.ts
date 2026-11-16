/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { consume } from '@lit/context';
import componentStyle from './strichel-page.css?inline';
import { Club, clubContext } from '../../../context/clubContext.js';
import { DrinkGroup, DrinkItem } from '../../../models/drinks.js';
import { Member } from '../../../models/member.js';
import { RecentBooking, TallyResult } from '../../../models/account.js';
import { displayName } from '../../../models/user.js';
import { drinkService } from '../../../services/drinks.js';
import { tallyService } from '../../../services/tally-service.js';
import { getMe, Me } from '../../../services/session.js';
import { formatPrice, formatTime } from '../../../utils/format.js';
import '../../widgets/person-picker/person-picker.js';

const MAX_PER_DRINK = 30;
// Muss zur Animationsdauer von .countdown in strichel-page.css passen
// (Inline-Styles blockiert die Content-Security-Policy)
const CONFIRM_MS = 5000;
// Theke: nach einer Minute ohne Eingabe zurück zur Personenauswahl.
// Handy: nach 5 Minuten wird eine halbfertige Auswahl verworfen.
const IDLE_MS_THEKE = 60 * 1000;
const IDLE_MS_MEMBER = 5 * 60 * 1000;
const RECENT_TARGETS_KEY = 'strichliste.recentTargets';

interface Confirmation {
  result: TallyResult;
  lines: string[];
  forSelf: boolean;
}

@customElement('strichel-page')
export class StrichelPage extends LitElement {
  static styles = componentStyle;

  @consume({ context: clubContext, subscribe: true })
  club!: Club;

  @state() private me: Me | null = null;
  @state() private groups: DrinkGroup[] = [];
  @state() private members: Member[] = [];
  @state() private target: Member | null = null; // null = eigenes Konto (bei der Theke: noch niemand gewählt)
  @state() private pickerOpen = false;
  @state() private counts = new Map<string, number>();
  @state() private busy = false;
  @state() private confirmation: Confirmation | null = null;
  @state() private recent: RecentBooking[] = [];
  @state() private recentTargetIds: string[] = [];
  @state() private message: { text: string; type: 'success' | 'error' } | null = null;
  @state() private loadError = '';

  private idleTimer?: ReturnType<typeof setTimeout>;
  private confirmTimer?: ReturnType<typeof setTimeout>;
  private messageTimer?: ReturnType<typeof setTimeout>;
  private recentTimer?: ReturnType<typeof setInterval>;

  private get isTheke() {
    return this.me?.role === 'theke';
  }

  private get drinksById(): Map<string, DrinkItem> {
    return new Map(this.groups.flatMap(group => group.items).map(item => [item.id, item]));
  }

  private get totalCount() {
    return [...this.counts.values()].reduce((sum, count) => sum + count, 0);
  }

  private get totalPrice() {
    const drinks = this.drinksById;
    return [...this.counts].reduce((sum, [id, count]) => sum + count * (drinks.get(id)?.price ?? 0), 0);
  }

  private get targetLabel() {
    return this.target ? this.target.name : 'dich';
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('pointerdown', this.resetIdleTimer);
    this.addEventListener('keydown', this.resetIdleTimer);
    this.recentTargetIds = this.loadRecentTargets();
    this.recentTimer = setInterval(() => this.loadRecent(), 30 * 1000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('pointerdown', this.resetIdleTimer);
    this.removeEventListener('keydown', this.resetIdleTimer);
    clearTimeout(this.idleTimer);
    clearTimeout(this.confirmTimer);
    clearTimeout(this.messageTimer);
    clearInterval(this.recentTimer);
  }

  async firstUpdated() {
    this.me = await getMe();
    if (!this.me) return;
    try {
      const [groups, members] = await Promise.all([drinkService.getDrinks(), tallyService.getMembers()]);
      this.groups = groups.filter(group => group.items.length > 0);
      this.members = members;
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : 'Getränke konnten nicht geladen werden.';
    }
    await this.loadRecent();
  }

  render() {
    if (!this.me) return nothing;
    if (this.loadError) {
      return html`<div class="load-error">
        <p>${this.loadError}</p>
        <button class="btn-secondary" @click=${() => window.location.reload()}>Neu laden</button>
      </div>`;
    }

    // Theke: Erst Person wählen, dann Getränke
    if (this.isTheke && !this.target) {
      return html`
        <img class="theke-crest" src="images/${this.club.crest}" alt="" aria-hidden="true" />
        <section class="page theke-picker">
          <person-picker
            heading="Wer trinkt?"
            .members=${this.members}
            .recentIds=${this.recentTargetIds}
            @pick=${this.onPick}
          ></person-picker>
          ${this.renderRecent()}
        </section>
        ${this.renderMessage()}
      `;
    }

    return html`
      <section class="page ${this.totalCount > 0 ? 'has-bar' : ''} ${this.isTheke ? 'theke' : ''}">
        ${this.renderTargetBar()}
        ${this.groups.map(
          group => html`
            <h2 class="group-title"><span aria-hidden="true">${group.emoji}</span> ${group.group}</h2>
            <div class="tiles">${group.items.map(item => this.renderTile(item))}</div>
          `
        )}
        ${this.renderRecent()}
      </section>
      ${this.totalCount > 0 ? this.renderTallyBar() : nothing} ${this.renderPickerOverlay()}
      ${this.renderConfirmation()} ${this.renderMessage()}
    `;
  }

  private renderTargetBar() {
    if (this.isTheke) {
      return html`
        <div class="target-bar theke">
          <div class="target-info">
            <span class="target-label">Striche für</span>
            <span class="target-name">${this.target!.name}</span>
          </div>
          <button class="switch-person" @click=${this.resetToPicker}>Andere Person</button>
        </div>
      `;
    }
    const forOther = this.target !== null;
    return html`
      <div class="target-bar ${forOther ? 'other' : ''}">
        <button class="target-chip" @click=${this.openPicker} aria-label="Auswählen, für wen gestrichelt wird">
          <span class="target-label">Für</span>
          <span class="target-name">${forOther ? this.target!.name : `Mich (${displayName(this.me!)})`}</span>
          <span class="chevron" aria-hidden="true">▾</span>
        </button>
        ${forOther
          ? html`<button class="back-to-me" @click=${() => (this.target = null)}>Für mich</button>`
          : html`<span class="target-tip">Tippen, um für einen Bundesbruder zu stricheln</span>`}
      </div>
    `;
  }

  private renderTile(item: DrinkItem) {
    const count = this.counts.get(item.id) ?? 0;
    const price = formatPrice(item.price, this.club);
    return html`
      <div class="tile-wrap">
        <button
          class="tile ${count > 0 ? 'active' : ''}"
          aria-label="${item.name} ${item.unit}, ${price}${count > 0 ? `, ${count} ausgewählt` : ''}"
          @click=${() => this.change(item.id, 1)}
        >
          <span class="tile-name">${item.name}</span>
          <span class="tile-unit">${item.unit}</span>
          <span class="tile-bottom">
            ${count > 0
              ? html`<span class="tile-count" aria-hidden="true">${count}</span>`
              : html`<span class="tile-price">${price}</span>`}
          </span>
        </button>
        ${count > 0
          ? html`<button class="tile-minus" aria-label="Einen Strich weniger" @click=${() => this.change(item.id, -1)}>
              −
            </button>`
          : nothing}
      </div>
    `;
  }

  private renderTallyBar() {
    const count = this.totalCount;
    return html`
      <div class="tally-bar ${this.target ? 'other' : ''} ${this.isTheke ? 'theke' : ''}">
        <button class="clear" aria-label="Auswahl leeren" @click=${this.clearCounts}>✕</button>
        <button class="submit" ?disabled=${this.busy} @click=${this.submit}>
          <span class="submit-main"
            >${this.busy ? 'Wird gebucht …' : `${count} ${count === 1 ? 'Strich' : 'Striche'} buchen`}</span
          >
          <span class="submit-sub">für ${this.targetLabel} · ${formatPrice(this.totalPrice, this.club)}</span>
        </button>
      </div>
    `;
  }

  private renderPickerOverlay() {
    if (!this.pickerOpen) return nothing;
    return html`
      <div class="overlay" @click=${(e: Event) => e.target === e.currentTarget && (this.pickerOpen = false)}>
        <div class="sheet">
          <person-picker
            closable
            include-self
            self-name=${displayName(this.me!)}
            .selectedId=${this.target?.id ?? null}
            .members=${this.members.filter(member => member.id !== this.me!.id)}
            .recentIds=${this.recentTargetIds}
            @pick=${this.onPick}
            @close=${() => (this.pickerOpen = false)}
          ></person-picker>
        </div>
      </div>
    `;
  }

  private renderConfirmation() {
    const confirmation = this.confirmation;
    if (!confirmation) return nothing;
    return html`
      <div class="confirm" role="alertdialog" aria-live="assertive">
        <div class="confirm-box">
          <div class="check" aria-hidden="true">✓</div>
          <h2>Gestrichelt!</h2>
          <p class="confirm-for">
            für <strong>${confirmation.forSelf ? 'dich' : confirmation.result.target.name}</strong>
          </p>
          <ul>
            ${confirmation.lines.map(line => html`<li>${line}</li>`)}
          </ul>
          <p class="confirm-total">${formatPrice(confirmation.result.total, this.club)}</p>
          <div class="confirm-actions">
            <button class="undo" @click=${this.undoConfirmation}>Rückgängig</button>
            <button class="ok" @click=${this.closeConfirmation}>OK</button>
          </div>
          <div class="countdown"></div>
        </div>
      </div>
    `;
  }

  private renderRecent() {
    if (this.recent.length === 0) return nothing;
    return html`
      <section class="recent">
        <h2 class="group-title">${this.isTheke ? 'Letzte Buchungen an der Theke' : 'Deine letzten Buchungen'}</h2>
        <p class="recent-hint">Vertippt? Innerhalb von 10 Minuten kannst du es selbst rückgängig machen.</p>
        <ul>
          ${this.recent.map(
            booking => html`
              <li>
                <span class="recent-text">
                  <strong>${booking.quantity}× ${booking.name} ${booking.unit}</strong>
                  <span>für ${booking.targetName} · ${formatTime(booking.undoUntil - 10 * 60 * 1000)} Uhr</span>
                </span>
                <button class="recent-undo" @click=${() => this.undoBooking(booking)}>Rückgängig</button>
              </li>
            `
          )}
        </ul>
      </section>
    `;
  }

  private renderMessage() {
    if (!this.message) return nothing;
    return html`<div class="message ${this.message.type}" role="status">${this.message.text}</div>`;
  }

  // ---------------------------------------------------------------------------

  private change(id: string, delta: number) {
    const counts = new Map(this.counts);
    const next = Math.min(MAX_PER_DRINK, Math.max(0, (counts.get(id) ?? 0) + delta));
    if (next === 0) counts.delete(id);
    else counts.set(id, next);
    this.counts = counts;
    if (delta > 0) navigator.vibrate?.(15);
  }

  private clearCounts() {
    this.counts = new Map();
  }

  private openPicker() {
    this.pickerOpen = true;
  }

  private onPick(e: CustomEvent<{ member: Member | null }>) {
    this.target = e.detail.member;
    this.pickerOpen = false;
    if (e.detail.member) this.rememberTarget(e.detail.member.id);
    window.scrollTo({ top: 0 });
  }

  private resetToPicker() {
    this.counts = new Map();
    this.target = null;
    this.pickerOpen = false;
    window.scrollTo({ top: 0 });
  }

  private async submit() {
    if (this.busy || this.totalCount === 0) return;
    this.busy = true;
    const counts = this.counts;
    const drinks = this.drinksById;
    try {
      const result = await tallyService.tally(counts, this.target?.id);
      const lines = [...counts].map(([id, count]) => {
        const drink = drinks.get(id);
        return `${count}× ${drink?.name ?? ''} ${drink?.unit ?? ''}`.trim();
      });
      this.confirmation = { result, lines, forSelf: !this.target };
      this.counts = new Map();
      clearTimeout(this.confirmTimer);
      this.confirmTimer = setTimeout(() => this.closeConfirmation(), CONFIRM_MS);
      navigator.vibrate?.([30, 40, 30]);
      this.loadRecent();
    } catch (err) {
      this.showMessage(err instanceof Error ? err.message : 'Stricheln fehlgeschlagen.', 'error');
    } finally {
      this.busy = false;
    }
  }

  private closeConfirmation() {
    clearTimeout(this.confirmTimer);
    this.confirmation = null;
    // Nach dem Buchen wieder auf das eigene Konto bzw. bei der Theke zur Personenauswahl
    if (this.isTheke) this.resetToPicker();
    else this.target = null;
  }

  private async undoConfirmation() {
    const confirmation = this.confirmation;
    if (!confirmation) return;
    clearTimeout(this.confirmTimer);
    try {
      await Promise.all(confirmation.result.orders.map(order => tallyService.undo(order.id)));
      this.confirmation = null;
      if (this.isTheke) this.resetToPicker();
      this.showMessage('Buchung rückgängig gemacht.', 'success');
    } catch (err) {
      this.confirmation = null;
      this.showMessage(err instanceof Error ? err.message : 'Rückgängig machen fehlgeschlagen.', 'error');
    }
    this.loadRecent();
  }

  private async undoBooking(booking: RecentBooking) {
    try {
      await tallyService.undo(booking.id);
      this.showMessage(`${booking.quantity}× ${booking.name} ${booking.unit} rückgängig gemacht.`, 'success');
    } catch (err) {
      this.showMessage(err instanceof Error ? err.message : 'Rückgängig machen fehlgeschlagen.', 'error');
    }
    this.loadRecent();
  }

  private async loadRecent() {
    try {
      this.recent = (await tallyService.getRecent()).filter(booking => booking.undoUntil > Date.now());
    } catch {
      // Liste der letzten Buchungen ist nur eine Hilfe – ohne sie kann trotzdem gestrichelt werden
    }
  }

  private showMessage(text: string, type: 'success' | 'error') {
    this.message = { text, type };
    clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => (this.message = null), 4000);
  }

  private readonly resetIdleTimer = () => {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(
      () => {
        if (this.confirmation || this.busy) return;
        if (this.isTheke) {
          if (this.target || this.totalCount > 0) this.resetToPicker();
        } else if (this.totalCount > 0 || this.target) {
          this.counts = new Map();
          this.target = null;
          this.pickerOpen = false;
        }
      },
      this.isTheke ? IDLE_MS_THEKE : IDLE_MS_MEMBER
    );
  };

  private loadRecentTargets(): string[] {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_TARGETS_KEY) ?? '[]');
      return Array.isArray(stored) ? stored.filter(id => typeof id === 'string').slice(0, 6) : [];
    } catch {
      return [];
    }
  }

  private rememberTarget(id: string) {
    this.recentTargetIds = [id, ...this.recentTargetIds.filter(other => other !== id)].slice(0, 6);
    try {
      localStorage.setItem(RECENT_TARGETS_KEY, JSON.stringify(this.recentTargetIds));
    } catch {
      // ohne localStorage (privater Modus) gibt es eben keine "Zuletzt"-Liste
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'strichel-page': StrichelPage;
  }
}
