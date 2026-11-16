/* Autor: Jonas Bergjürgen (FH Münster), angepasst für die K.D.St.V. Sauerlandia */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './login-form.css?inline';

@customElement('login-form')
export class LoginForm extends LitElement {
  static styles = componentStyle;

  @state() private error = '';
  @state() private busy = false;

  render() {
    return html`
      <form @submit=${this._handleLogin} novalidate>
        <div class="form-group">
          <label for="email">E-Mail</label>
          <input type="email" id="email" name="email" autocomplete="username" inputmode="email" required />
        </div>

        <div class="form-group">
          <div class="label-row">
            <label for="password">Passwort</label>
            <a class="forgot-link" href="/passwort-vergessen">Passwort vergessen?</a>
          </div>
          <input type="password" id="password" name="password" autocomplete="current-password" required />
        </div>

        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}

        <button type="submit" class="btn-primary" ?disabled=${this.busy}>
          ${this.busy ? 'Anmelden …' : 'Anmelden'}
        </button>
        <p class="register-link">Noch kein Konto? <a href="/register">Registrieren</a></p>
      </form>
    `;
  }

  private async _handleLogin(e: Event) {
    e.preventDefault();
    const email = (this.shadowRoot!.getElementById('email') as HTMLInputElement).value.trim();
    const password = (this.shadowRoot!.getElementById('password') as HTMLInputElement).value;
    if (!email || !password) {
      this.error = 'Bitte E-Mail und Passwort eingeben.';
      return;
    }

    this.busy = true;
    this.error = '';
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        window.location.href = '/';
        return;
      }
      const body = await res.json().catch(() => ({}));
      this.error = body.error ?? 'Anmeldung fehlgeschlagen.';
    } catch {
      this.error = 'Keine Verbindung zum Server.';
    } finally {
      this.busy = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'login-form': LoginForm;
  }
}
