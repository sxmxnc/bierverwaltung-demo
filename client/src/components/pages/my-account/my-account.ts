/* Autor: Marius Middrup (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './my-account.css?inline';
import { fetchWithAuth } from '../../../utils/fetch.js';
import { User } from '../../../models/user.js';

@customElement('my-account')
export class MyAccount extends LitElement {
  static styles = componentStyle;

  @state() private user: User | null = null;

  @state() private firstName = '';
  @state() private lastName = '';
  @state() private nickname = '';
  @state() private email = '';
  @state() private residence = '';
  @state() private currentPassword = '';

  @state() private newPassword = '';
  @state() private confirmPassword = '';

  @state() private profileMsg = '';
  @state() private profileError = '';
  @state() private profileLoading = false;

  @state() private passwordMsg = '';
  @state() private passwordError = '';
  @state() private passwordLoading = false;

  async connectedCallback() {
    super.connectedCallback();
    await this.loadUser();
  }

  render() {
    return html`
      <div class="page-wrapper">
        <h1>Profil</h1>

        <form class="section-card" @submit=${this.saveProfile}>
          <p class="section-title">Persönliche Daten</p>
          <div class="field-group">
            <div class="field-row">
              <label>
                Vorname
                <input
                  type="text"
                  .value=${this.firstName}
                  @input=${(e: InputEvent) => (this.firstName = (e.target as HTMLInputElement).value)}
                  required
                />
              </label>
              <label>
                Nachname
                <input
                  type="text"
                  .value=${this.lastName}
                  @input=${(e: InputEvent) => (this.lastName = (e.target as HTMLInputElement).value)}
                  required
                />
              </label>
            </div>
            <label>
              V/o bzw. Biername (so erscheinst du beim Stricheln)
              <input
                type="text"
                .value=${this.nickname}
                @input=${(e: InputEvent) => (this.nickname = (e.target as HTMLInputElement).value)}
              />
            </label>
            <label>
              E-Mail-Adresse (Änderung über den Bierwart)
              <input type="email" .value=${this.email} readonly />
            </label>
            <label>
              Wohnort
              <input
                type="text"
                .value=${this.residence}
                @input=${(e: InputEvent) => (this.residence = (e.target as HTMLInputElement).value)}
              />
            </label>
          </div>
          ${this.profileError ? html`<p class="field-error">${this.profileError}</p>` : ''}
          ${this.profileMsg ? html`<p class="success-msg">${this.profileMsg}</p>` : ''}
          <button class="save-btn" type="submit" ?disabled=${this.profileLoading}>
            ${this.profileLoading ? 'Wird gespeichert…' : 'Speichern'}
          </button>
        </form>

        <form class="section-card" @submit=${this.savePassword}>
          <p class="section-title">Passwort ändern</p>
          <div class="field-group">
            <label>
              Aktuelles Passwort
              <input
                type="password"
                .value=${this.currentPassword}
                @input=${(e: InputEvent) => (this.currentPassword = (e.target as HTMLInputElement).value)}
                autocomplete="current-password"
                required
              />
            </label>
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
          ${this.passwordError ? html`<p class="field-error">${this.passwordError}</p>` : ''}
          ${this.passwordMsg ? html`<p class="success-msg">${this.passwordMsg}</p>` : ''}
          <button class="save-btn" type="submit" ?disabled=${this.passwordLoading}>
            ${this.passwordLoading ? 'Wird gespeichert…' : 'Passwort ändern'}
          </button>
        </form>
      </div>
    `;
  }

  private async loadUser() {
    try {
      const res = await fetchWithAuth('/api/users/me');
      if (!res.ok) throw new Error();
      const u: User = await res.json();
      this.user = u;
      this.firstName = u.firstName;
      this.lastName = u.lastName;
      this.nickname = u.nickname ?? '';
      this.email = u.email;
      this.residence = u.residence;
    } catch {
      this.profileError = 'Profildaten konnten nicht geladen werden.';
    }
  }

  private async saveProfile(e: Event) {
    e.preventDefault();
    this.profileMsg = '';
    this.profileError = '';
    this.profileLoading = true;

    try {
      const res = await fetchWithAuth('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: this.firstName,
          lastName: this.lastName,
          nickname: this.nickname,
          residence: this.residence
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Unbekannter Fehler');
      }

      const updated: User = await res.json();
      this.user = updated;
      this.profileMsg = 'Profil erfolgreich gespeichert.';
    } catch (err: unknown) {
      this.profileError = err instanceof Error ? err.message : 'Fehler beim Speichern.';
    } finally {
      this.profileLoading = false;
    }
  }

  private async savePassword(e: Event) {
    e.preventDefault();
    this.passwordMsg = '';
    this.passwordError = '';

    if (this.newPassword.length < 8 || !/[A-Z]/.test(this.newPassword) || !/[0-9]/.test(this.newPassword)) {
      this.passwordError = 'Passwort muss mindestens 8 Zeichen, einen Großbuchstaben und eine Zahl enthalten.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError = 'Passwörter stimmen nicht überein.';
      return;
    }

    this.passwordLoading = true;
    try {
      const res = await fetchWithAuth('/api/users/me/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: this.currentPassword, newPassword: this.newPassword })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Unbekannter Fehler');
      }

      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      this.passwordMsg = 'Passwort erfolgreich geändert.';
    } catch (err: unknown) {
      this.passwordError = err instanceof Error ? err.message : 'Fehler beim Ändern.';
    } finally {
      this.passwordLoading = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'my-account': MyAccount;
  }
}
