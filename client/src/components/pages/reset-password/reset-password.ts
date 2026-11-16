/* Autor: Jonas Bergjürgen (FH Münster) */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './reset-password.css?inline';

@customElement('reset-password')
export class ResetPassword extends LitElement {
  static styles = componentStyle;

  @state() private newPassword = '';
  @state() private confirmPassword = '';
  @state() private error = '';
  @state() private success = '';
  @state() private loading = false;

  private get token(): string {
    return new URLSearchParams(window.location.search).get('token') ?? '';
  }

  render() {
    if (this.success) {
      return html`
        <div class="page-wrapper">
          <h1>Passwort geändert</h1>
          <p class="subtitle">${this.success}</p>
          <a class="btn-primary" href="/login">Zum Login</a>
        </div>
      `;
    }

    if (!this.token) {
      return html`
        <div class="page-wrapper">
          <h1>Ungültiger Link</h1>
          <p class="subtitle">Der Reset-Link enthält keinen gültigen Token.</p>
          <a class="btn-primary" href="/passwort-vergessen">Neuen Token anfordern</a>
        </div>
      `;
    }

    return html`
      <div class="page-wrapper">
        <h1>Neues Passwort setzen</h1>
        <p class="subtitle">Wähle ein neues Passwort für dein Konto.</p>

        <form class="section-card" @submit=${this._submit}>
          <div class="field-group">
            <label>
              Neues Passwort
              <input
                type="password"
                .value=${this.newPassword}
                @input=${(e: InputEvent) => (this.newPassword = (e.target as HTMLInputElement).value)}
                autocomplete="new-password"
                required
              />
            </label>
            <label>
              Passwort bestätigen
              <input
                type="password"
                .value=${this.confirmPassword}
                @input=${(e: InputEvent) => (this.confirmPassword = (e.target as HTMLInputElement).value)}
                autocomplete="new-password"
                required
              />
            </label>
          </div>

          ${this.error ? html`<p class="field-error">${this.error}</p>` : ''}

          <button class="save-btn" type="submit" ?disabled=${this.loading}>
            ${this.loading ? 'Wird gespeichert…' : 'Passwort speichern'}
          </button>
        </form>
      </div>
    `;
  }

  private async _submit(e: Event) {
    e.preventDefault();
    this.error = '';

    if (this.newPassword.length < 8 || !/[A-Z]/.test(this.newPassword) || !/[0-9]/.test(this.newPassword)) {
      this.error = 'Passwort muss mindestens 8 Zeichen, einen Großbuchstaben und eine Zahl enthalten.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Passwörter stimmen nicht überein.';
      return;
    }

    this.loading = true;
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.token, newPassword: this.newPassword })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unbekannter Fehler');

      this.success = 'Dein Passwort wurde erfolgreich geändert. Du kannst dich jetzt anmelden.';
    } catch (err: unknown) {
      this.error = err instanceof Error ? err.message : 'Fehler beim Speichern.';
    } finally {
      this.loading = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'reset-password': ResetPassword;
  }
}
