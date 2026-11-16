/* Autor: Julius Vollmer (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './create-user.css?inline';
import { userService } from '../../../services/user-service.js';
import { ROLE_LABELS, UserRole } from '../../../models/user.js';

const ROLE_HINTS: Record<UserRole, string> = {
  user: 'Normales Mitglied: strichelt für sich und andere, sieht das eigene Konto.',
  admin: 'Bierwart: voller Zugriff auf Mitglieder, Getränke, Bestand und Finanzen.',
  theke: 'Gemeinsames Gerät an der Theke (z. B. iPad): kann nur für andere stricheln.',
  kasse: 'Sammelkonto wie Aktivenkasse oder Fuxenkasse: man strichelt darauf, aber es meldet sich nie an.'
};

@customElement('create-user')
export class CreateUser extends LitElement {
  static styles = componentStyle;

  @state() private selectedRole: UserRole = 'user';
  @state() private firstName = '';
  @state() private lastName = '';
  @state() private nickname = '';
  @state() private email = '';
  @state() private residence = '';
  @state() private password = '';

  // UI-Zustände
  @state() private isLoading = false;
  @state() private errorMessage = '';
  @state() private successMessage = '';

  private get isKasse() {
    return this.selectedRole === 'kasse';
  }

  private get isFormValid(): boolean {
    if (this.isKasse) return this.firstName.trim().length > 0;
    return (
      this.firstName.trim().length > 0 &&
      this.lastName.trim().length > 0 &&
      this.email.trim().includes('@') &&
      (this.password.length === 0 || this.password.length >= 8)
    );
  }

  render() {
    return html`
      <section class="create-user-section">
        <div class="section-header">
          <h1>Konto anlegen</h1>
          <p class="subtitle">Mitglied, Theken-Gerät oder Kasse manuell anlegen</p>
        </div>

        ${this.successMessage ? html`<div class="alert alert-success" role="alert">${this.successMessage}</div>` : ''}
        ${this.errorMessage ? html`<div class="alert alert-error" role="alert">${this.errorMessage}</div>` : ''}

        <form class="create-form" @submit=${this.handleSubmit} novalidate>
          <div class="form-card">
            <h2 class="card-title">Kontoart</h2>
            <div class="form-grid">
              <div class="form-group">
                <label for="role">Kontoart <span class="required">*</span></label>
                <select
                  id="role"
                  @change=${(e: Event) => (this.selectedRole = (e.target as HTMLSelectElement).value as UserRole)}
                >
                  ${(Object.keys(ROLE_LABELS) as UserRole[]).map(
                    role =>
                      html`<option value=${role} ?selected=${this.selectedRole === role}>${ROLE_LABELS[role]}</option>`
                  )}
                </select>
              </div>
            </div>
            <p class="card-hint">${ROLE_HINTS[this.selectedRole]}</p>
          </div>

          ${this.isKasse ? this.renderKasseFields() : this.renderPersonFields()}

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click=${this.resetForm}>Zurücksetzen</button>
            <button type="submit" class="btn btn-primary" ?disabled=${!this.isFormValid || this.isLoading}>
              ${this.isLoading ? 'Wird angelegt...' : 'Konto anlegen'}
            </button>
          </div>
        </form>
      </section>
    `;
  }

  private renderKasseFields() {
    return html`
      <div class="form-card">
        <h2 class="card-title">Kasse</h2>
        <div class="form-grid">
          <div class="form-group">
            <label for="firstName">Name der Kasse <span class="required">*</span></label>
            <input
              id="firstName"
              type="text"
              placeholder="z. B. Aktivenkasse"
              .value=${this.firstName}
              @input=${(e: InputEvent) => (this.firstName = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="form-group">
            <label for="nickname">Verantwortlich</label>
            <input
              id="nickname"
              type="text"
              placeholder="z. B. Quaestor"
              .value=${this.nickname}
              @input=${(e: InputEvent) => (this.nickname = (e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
      </div>
    `;
  }

  private renderPersonFields() {
    return html`
      <div class="form-card">
        <h2 class="card-title">${this.selectedRole === 'theke' ? 'Theken-Gerät' : 'Persönliche Daten'}</h2>
        <div class="form-grid">
          <div class="form-group">
            <label for="firstName"
              >${this.selectedRole === 'theke' ? 'Name' : 'Vorname'} <span class="required">*</span></label
            >
            <input
              id="firstName"
              type="text"
              placeholder=${this.selectedRole === 'theke' ? 'z. B. Theke' : ''}
              .value=${this.firstName}
              @input=${(e: InputEvent) => (this.firstName = (e.target as HTMLInputElement).value)}
              autocomplete="off"
            />
          </div>
          <div class="form-group">
            <label for="lastName"
              >${this.selectedRole === 'theke' ? 'Zusatz' : 'Nachname'} <span class="required">*</span></label
            >
            <input
              id="lastName"
              type="text"
              placeholder=${this.selectedRole === 'theke' ? 'z. B. iPad' : ''}
              .value=${this.lastName}
              @input=${(e: InputEvent) => (this.lastName = (e.target as HTMLInputElement).value)}
              autocomplete="off"
            />
          </div>
          ${this.selectedRole !== 'theke'
            ? html`<div class="form-group">
                <label for="nickname">V/o bzw. Biername</label>
                <input
                  id="nickname"
                  type="text"
                  .value=${this.nickname}
                  @input=${(e: InputEvent) => (this.nickname = (e.target as HTMLInputElement).value)}
                />
              </div>`
            : ''}
          <div class="form-group">
            <label for="email">E-Mail-Adresse (Login) <span class="required">*</span></label>
            <input
              id="email"
              type="email"
              .value=${this.email}
              @input=${(e: InputEvent) => (this.email = (e.target as HTMLInputElement).value)}
              autocomplete="off"
            />
          </div>
          <div class="form-group">
            <label for="password">Startpasswort (mind. 8 Zeichen)</label>
            <input
              id="password"
              type="text"
              .value=${this.password}
              @input=${(e: InputEvent) => (this.password = (e.target as HTMLInputElement).value)}
              autocomplete="off"
            />
          </div>
          ${this.selectedRole !== 'theke'
            ? html`<div class="form-group">
                <label for="residence">Wohnort</label>
                <input
                  id="residence"
                  type="text"
                  .value=${this.residence}
                  @input=${(e: InputEvent) => (this.residence = (e.target as HTMLInputElement).value)}
                />
              </div>`
            : ''}
        </div>
        <p class="card-hint">
          Ohne Startpasswort kann sich das Konto erst anmelden, wenn du in der Mitgliederliste eines setzt.
        </p>
      </div>
    `;
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();
    if (!this.isFormValid) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      await userService.createUser({
        role: this.selectedRole,
        firstName: this.firstName.trim(),
        lastName: this.lastName.trim(),
        nickname: this.nickname.trim() || undefined,
        email: this.isKasse ? undefined : this.email.trim().toLowerCase(),
        residence: this.residence.trim(),
        password: this.isKasse || !this.password ? undefined : this.password,
        status: 'active'
      });

      this.successMessage = `${ROLE_LABELS[this.selectedRole]} „${this.nickname.trim() || this.firstName.trim()}" wurde angelegt.`;
      this.resetForm();
    } catch (error: unknown) {
      this.errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler beim Anlegen.';
    } finally {
      this.isLoading = false;
    }
  }

  private resetForm() {
    this.firstName = '';
    this.lastName = '';
    this.nickname = '';
    this.email = '';
    this.residence = '';
    this.password = '';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'create-user': CreateUser;
  }
}
