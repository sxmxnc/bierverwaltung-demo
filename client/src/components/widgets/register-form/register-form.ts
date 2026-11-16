/* Autor: Jonas Bergjürgen (FH Münster), angepasst für die K.D.St.V. Sauerlandia */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './register-form.css?inline';
import { isValidEmail, isValidPassword } from '../../../utils/validate.js';

@customElement('register-form')
export class RegisterForm extends LitElement {
  static styles = componentStyle;

  @state() private error = '';
  @state() private busy = false;
  @state() private done = false;

  render() {
    if (this.done) {
      return html`
        <div class="done" role="status">
          <div class="check" aria-hidden="true">✓</div>
          <h3>Fast geschafft!</h3>
          <p>
            Deine Registrierung ist eingegangen. Sobald der Bierwart dein Konto freigeschaltet hat, kannst du dich
            anmelden und stricheln.
          </p>
          <a class="btn-primary btn-link" href="/login">Zur Anmeldung</a>
        </div>
      `;
    }

    return html`
      <form @submit=${this._handleRegister} novalidate>
        <div class="form-group">
          <label for="firstName">Vorname</label>
          <input type="text" id="firstName" autocomplete="given-name" required />
        </div>

        <div class="form-group">
          <label for="lastName">Nachname</label>
          <input type="text" id="lastName" autocomplete="family-name" required />
        </div>

        <div class="form-group">
          <label for="nickname">V/o bzw. Biername <span class="optional">(optional)</span></label>
          <input type="text" id="nickname" autocomplete="nickname" />
        </div>

        <div class="form-group">
          <label for="email">E-Mail</label>
          <input type="email" id="email" autocomplete="email" inputmode="email" required />
        </div>

        <div class="form-group">
          <label for="password">Passwort</label>
          <input type="password" id="password" autocomplete="new-password" required />
        </div>

        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}

        <button type="submit" class="btn-primary" ?disabled=${this.busy}>
          ${this.busy ? 'Registrieren …' : 'Registrieren'}
        </button>
        <p class="register-link">Schon ein Konto? <a href="/login">Anmelden</a></p>
      </form>
    `;
  }

  private async _handleRegister(e: Event) {
    e.preventDefault();
    const root = this.shadowRoot!;
    const value = (id: string) => (root.getElementById(id) as HTMLInputElement).value.trim();
    const firstName = value('firstName');
    const lastName = value('lastName');
    const nickname = value('nickname');
    const email = value('email');
    const password = (root.getElementById('password') as HTMLInputElement).value;

    if (!firstName || !lastName || !email || !password) {
      this.error = 'Bitte Vorname, Nachname, E-Mail und Passwort ausfüllen.';
      return;
    }
    if (!isValidEmail(email)) {
      this.error = 'Bitte eine gültige E-Mail eingeben.';
      return;
    }
    if (!isValidPassword(password, email)) {
      this.error = 'Passwort: mindestens 8 Zeichen, ein Großbuchstabe und eine Zahl.';
      return;
    }

    this.busy = true;
    this.error = '';
    try {
      const res = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ firstName, lastName, nickname, email, password })
      });
      if (res.status === 409) {
        this.error = 'Diese E-Mail ist bereits registriert.';
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        this.error = data.error ?? 'Registrierung fehlgeschlagen.';
        return;
      }
      this.done = true;
    } catch {
      this.error = 'Keine Verbindung zum Server – bitte später erneut versuchen.';
    } finally {
      this.busy = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'register-form': RegisterForm;
  }
}
