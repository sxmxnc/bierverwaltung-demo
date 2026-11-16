/* Autor: Jonas Bergjürgen (FH Münster), angepasst für die K.D.St.V. Sauerlandia */

import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import componentStyle from './forgot-password.css?inline';

// Solange die App keine E-Mails verschickt, gibt es keinen Selbstbedienungs-Reset:
// Der Bierwart setzt vergessene Passwörter in der Mitgliederverwaltung neu.
@customElement('forgot-password')
export class ForgotPassword extends LitElement {
  static styles = componentStyle;

  render() {
    return html`
      <div class="page-wrapper">
        <h1>Passwort vergessen?</h1>
        <p class="subtitle">
          Kein Problem: Sprich den Bierwart an oder schreib ihm kurz. Er setzt dir ein neues Passwort, das du danach
          unter „Profil & Bankdaten" selbst ändern kannst.
        </p>
        <p class="back-link"><a href="/login">Zurück zur Anmeldung</a></p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'forgot-password': ForgotPassword;
  }
}
