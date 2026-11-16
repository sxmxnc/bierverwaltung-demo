/* Autor: Marius Middrup (FH Münster), neu gestaltet für die K.D.St.V. Sauerlandia */
/* Icons by Lucide (MIT License) */

import { LitElement, html, nothing, svg } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { consume } from '@lit/context';
import componentStyle from './nav-bar.css?inline';
import { Club, clubContext } from '../../../context/clubContext.js';
import { getMe, logout, Me } from '../../../services/session.js';
import { displayName, ROLE_LABELS } from '../../../models/user.js';

const icon = (paths: ReturnType<typeof svg>) =>
  html`<svg
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${paths}
  </svg>`;

const beerIcon = icon(
  svg`<path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M9 12v6"/><path d="M13 12v6"/><path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z"/><path d="M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/>`
);
const walletIcon = icon(
  svg`<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>`
);
const shieldIcon = icon(
  svg`<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>`
);
const trophyIcon = icon(
  svg`<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>`
);
const userIcon = icon(svg`<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/>`);
const logoutIcon = icon(
  svg`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>`
);

@customElement('nav-bar')
export class NavBar extends LitElement {
  static styles = componentStyle;

  @consume({ context: clubContext, subscribe: true })
  club!: Club;

  @state() private me: Me | null = null;
  @state() private path = window.location.pathname;
  @state() private isUserMenuOpen = false;

  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener('popstate', this.syncPath);
    document.addEventListener('click', this.onDocumentClick);
    this.me = await getMe();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this.syncPath);
    document.removeEventListener('click', this.onDocumentClick);
  }

  render() {
    const me = this.me;
    const isTheke = me?.role === 'theke';
    return html`
      <nav>
        <a href="/" class="brand" @click=${this.syncPathSoon}>
          <img class="crest" src="images/${this.club.crest}" alt="" />
          <span class="brand-text">
            <span class="brand-name">${this.club.shortName}</span>
            <span class="brand-sub">${isTheke ? 'Theke' : 'Strichliste'}</span>
          </span>
        </a>

        ${me
          ? html`<ul class="links" @click=${this.syncPathSoon}>
              <li>${this.link('/', 'Stricheln', beerIcon)}</li>
              ${isTheke ? nothing : html`<li>${this.link('/konto', 'Konto', walletIcon)}</li>`}
              <li>${this.link('/rangliste', 'Rangliste', trophyIcon)}</li>
              ${me.role === 'admin' ? html`<li>${this.link('/admin', 'Bierwart', shieldIcon)}</li>` : nothing}
            </ul>`
          : html`<span class="spacer"></span>`}

        <div class="actions">
          <theme-switcher></theme-switcher>
          ${me ? this.renderUserMenu(me) : html`<a class="login" href="/login">Anmelden</a>`}
        </div>
      </nav>
    `;
  }

  private link(href: string, label: string, linkIcon: unknown) {
    const active = href === '/' ? this.path === '/' : this.path.startsWith(href);
    return html`<a href=${href} class=${active ? 'active' : ''} aria-current=${active ? 'page' : 'false'}
      >${linkIcon}<span>${label}</span></a
    >`;
  }

  private renderUserMenu(me: Me) {
    const isTheke = me.role === 'theke';
    return html`
      <div class="user-menu">
        <button
          class="user-btn"
          aria-label="Benutzermenü"
          aria-expanded=${this.isUserMenuOpen}
          @click=${this.toggleUserMenu}
        >
          ${userIcon}
        </button>
        ${this.isUserMenuOpen
          ? html`<div class="dropdown" @click=${(e: Event) => e.stopPropagation()}>
              <div class="dropdown-head">
                <strong>${displayName(me)}</strong>
                <span>${ROLE_LABELS[me.role]}</span>
              </div>
              ${isTheke
                ? nothing
                : html`<a href="/my-account" @click=${this.closeAndSync}>${userIcon}Profil & Bankdaten</a>`}
              <button class="logout" @click=${this.handleLogout}>${logoutIcon}Abmelden</button>
            </div>`
          : nothing}
      </div>
    `;
  }

  private toggleUserMenu(e: Event) {
    e.stopPropagation();
    this.isUserMenuOpen = !this.isUserMenuOpen;
    if (this.isUserMenuOpen) document.dispatchEvent(new CustomEvent('nav-dropdown-open', { detail: 'user' }));
  }

  private async handleLogout() {
    // Das Theken-Gerät soll nicht versehentlich abgemeldet werden – sonst kann niemand mehr stricheln
    if (
      this.me?.role === 'theke' &&
      !window.confirm('Theke wirklich abmelden? Danach kann hier niemand mehr stricheln.')
    ) {
      return;
    }
    await logout();
  }

  private readonly closeAndSync = () => {
    this.isUserMenuOpen = false;
    this.syncPathSoon();
  };

  private readonly onDocumentClick = () => {
    this.isUserMenuOpen = false;
  };

  private readonly syncPath = () => {
    this.path = window.location.pathname;
  };

  // Der Router aktualisiert die URL erst nach dem Klick
  private readonly syncPathSoon = () => {
    setTimeout(this.syncPath, 0);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'nav-bar': NavBar;
  }
}
