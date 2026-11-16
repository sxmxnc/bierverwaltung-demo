/* Autor: Jonas Bergjürgen (FH Münster), angepasst für die K.D.St.V. Sauerlandia */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './login-page.css?inline';
import '../../widgets/login-form/login-form';
import '../../widgets/club-header/club-header';

@customElement('login-page')
export class LoginPage extends LitElement {
  static styles = componentStyle;

  // Prototyp: Demo-Zugänge ohne Passwort (nur wenn der Server DEMO_LOGINS=true hat)
  @state() private demoAccounts: { kind: string; label: string; href: string }[] = [];

  async firstUpdated() {
    try {
      const res = await fetch('/api/demo');
      if (res.ok) this.demoAccounts = (await res.json()).accounts ?? [];
    } catch {
      // ohne Demo-Zugänge bleibt nur der normale Login
    }
  }

  render() {
    return html`
      <div class="layout">
        <figure class="woodcut">
          <img src="images/bullenkopp.jpg" alt="Holzschnitt: Bundesbrüder vor dem Bullenkopp, 105 Jahre Sauerlandia" />
        </figure>
        <div class="login-container">
          <club-header></club-header>
          <h2>Strichliste</h2>
          <h3>Melde dich an, um zu stricheln</h3>
          ${this.demoAccounts.length
            ? html`<div class="demo">
                <p class="demo-title">Prototyp ausprobieren – ohne Anmeldung</p>
                ${this.demoAccounts.map(
                  (
                    account // rel="external": der Link muss zum Server, nicht in den Router der App
                  ) =>
                    html`<a class="demo-link ${account.kind}" href=${account.href} rel="external">${account.label}</a>`
                )}
                <p class="demo-or">oder mit eigenem Konto anmelden</p>
              </div>`
            : nothing}
          <login-form></login-form>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'login-page': LoginPage;
  }
}
