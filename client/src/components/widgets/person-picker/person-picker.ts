/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import componentStyle from './person-picker.css?inline';
import { Member } from '../../../models/member.js';

// Kleinschreibung und ohne Akzente, damit "jürgen" auch "jurgen" findet
function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/**
 * Auswahl, auf wessen Konto gestrichelt wird. Feuert "pick" mit { member } –
 * member ist null, wenn "Ich" gewählt wurde.
 */
@customElement('person-picker')
export class PersonPicker extends LitElement {
  static styles = componentStyle;

  @property({ attribute: false }) members: Member[] = [];
  @property({ attribute: false }) recentIds: string[] = [];
  @property({ attribute: false }) selectedId: string | null = null;
  @property({ type: Boolean, attribute: 'include-self' }) includeSelf = false;
  @property({ attribute: 'self-name' }) selfName = '';
  @property() heading = 'Für wen strichelst du?';
  @property({ type: Boolean }) closable = false;

  @state() private query = '';

  render() {
    const query = normalize(this.query.trim());
    const matches = (member: Member) =>
      !query || normalize(member.name).includes(query) || normalize(member.hint ?? '').includes(query);

    const filtered = this.members.filter(matches);
    const kassen = filtered.filter(member => member.kind === 'kasse');
    const people = filtered.filter(member => member.kind === 'member');
    const recent = query
      ? []
      : this.recentIds
          .map(id => this.members.find(member => member.id === id))
          .filter((member): member is Member => !!member);

    return html`
      <div class="picker">
        <div class="picker-header">
          <h2>${this.heading}</h2>
          ${this.closable
            ? html`<button class="close" aria-label="Schließen" @click=${this.close}>✕</button>`
            : nothing}
        </div>

        <div class="search">
          <input
            type="search"
            inputmode="search"
            autocomplete="off"
            placeholder="Name oder Biername suchen …"
            .value=${this.query}
            @input=${(e: InputEvent) => (this.query = (e.target as HTMLInputElement).value)}
          />
          ${this.query
            ? html`<button class="clear" aria-label="Suche leeren" @click=${this.clearQuery}>✕</button>`
            : nothing}
        </div>

        <div class="lists">
          ${this.includeSelf && !query
            ? html`<div class="grid">
                <button
                  class="person self ${this.selectedId === null ? 'selected' : ''}"
                  @click=${() => this.pick(null)}
                >
                  <span class="avatar">★</span>
                  <span class="text"><span class="name">Ich</span><span class="hint">${this.selfName}</span></span>
                </button>
              </div>`
            : nothing}
          ${this.renderSection('Zuletzt', recent)} ${this.renderSection('Kassen', kassen)}
          ${this.renderSection(query ? 'Treffer' : 'Bundesbrüder', people)}
          ${filtered.length === 0 ? html`<p class="empty">Niemand gefunden.</p>` : nothing}
        </div>
      </div>
    `;
  }

  private renderSection(title: string, members: Member[]) {
    if (members.length === 0) return nothing;
    return html`
      <h3>${title}</h3>
      <div class="grid">
        ${members.map(
          member => html`
            <button
              class="person ${member.kind} ${this.selectedId === member.id ? 'selected' : ''}"
              @click=${() => this.pick(member)}
            >
              <span class="avatar">${member.kind === 'kasse' ? '€' : initials(member.name)}</span>
              <span class="text">
                <span class="name">${member.name}</span>
                ${member.hint ? html`<span class="hint">${member.hint}</span>` : nothing}
              </span>
            </button>
          `
        )}
      </div>
    `;
  }

  private clearQuery() {
    this.query = '';
    this.shadowRoot?.querySelector('input')?.focus();
  }

  private pick(member: Member | null) {
    this.query = '';
    this.dispatchEvent(new CustomEvent('pick', { detail: { member }, bubbles: true, composed: true }));
  }

  private close() {
    this.query = '';
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'person-picker': PersonPicker;
  }
}
