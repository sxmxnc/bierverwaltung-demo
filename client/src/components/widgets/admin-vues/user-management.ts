/* Autor: Julius Vollmer (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './user-management.css?inline';
import {
  CATEGORY_LABELS,
  displayName,
  isPlaceholderEmail,
  ROLE_LABELS,
  STATUS_LABELS,
  User,
  UserCategory,
  UserRole,
  UserStatus
} from '../../../models/user.js';
import { PaymentMethod, userService } from '../../../services/user-service.js';

// SVG Icons
const searchIcon = html`<svg
  xmlns="http://www.w3.org/2000/svg"
  width="18"
  height="18"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="lucide lucide-search"
>
  <circle cx="11" cy="11" r="8" />
  <path d="m21 21-4.3-4.3" />
</svg>`;
const closeIcon = html`<svg
  xmlns="http://www.w3.org/2000/svg"
  width="20"
  height="20"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="lucide lucide-x"
>
  <path d="M18 6 6 18" />
  <path d="m6 6 12 12" />
</svg>`;
const loadingIcon = html`<svg
  class="animate-spin"
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
</svg>`;

@customElement('user-management')
export class UserManagement extends LitElement {
  static styles = componentStyle;

  @state()
  private users: User[] = [];

  @state()
  private searchQuery = '';

  @state()
  private selectedUser: User | null = null;

  @state()
  private isLoading = true;

  @state()
  private errorMessage = '';

  @state()
  private toastMessage = '';

  @state()
  private toastType: 'success' | 'error' = 'success';

  @state()
  private balanceInput = 0;

  @state() private nicknameInput = '';
  @state() private mergeTargets: Record<string, string> = {};
  @state() private paymentAmount = '';
  @state() private paymentMethod: PaymentMethod = 'ueberweisung';
  @state() private paymentNote = '';

  // Konten ohne Login, mit denen eine Registrierung zusammengeführt werden kann
  private get accountsWithoutLogin(): User[] {
    return this.users
      .filter(user => user.role === 'user' && user.hasLogin === false && user.status !== 'pending')
      .sort((a, b) => a.lastName.localeCompare(b.lastName, 'de'));
  }

  private get loginRequests(): User[] {
    return this.users.filter(user => user.loginRequestedAt);
  }

  private get pendingUsers(): User[] {
    return this.users.filter(user => user.status === 'pending');
  }

  private get filteredUsers(): User[] {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      return this.users;
    }
    return this.users.filter(
      user =>
        user.firstName.toLowerCase().includes(query) ||
        user.lastName.toLowerCase().includes(query) ||
        (user.nickname ?? '').toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.residence.toLowerCase().includes(query)
    );
  }

  async firstUpdated() {
    await this.fetchUsers();
  }

  //Mit Hilfe von Chat GPT
  render() {
    return html`
      <section class="user-management-section">
        <div class="section-header">
          <h1>Mitglieder</h1>
          <p class="subtitle">Konten freischalten, Einzahlungen buchen, Kontoarten verwalten</p>
        </div>

        <!-- Suchleiste -->
        <div class="search-wrapper">
          <div class="search-container">
            <span class="search-icon-span">${searchIcon}</span>
            <input
              type="text"
              .value=${this.searchQuery}
              @input=${this.handleSearchInput}
              placeholder="Suchen nach Name, V/o oder E-Mail …"
              id="search-input"
            />
          </div>
        </div>

        <!-- Neue Registrierungen -->
        ${this.pendingUsers.length > 0
          ? html`<div class="pending-panel">
              <h2>
                ${this.pendingUsers.length === 1
                  ? '1 neue Registrierung wartet auf Freischaltung'
                  : `${this.pendingUsers.length} neue Registrierungen warten auf Freischaltung`}
              </h2>
              <ul>
                ${this.pendingUsers.map(
                  user =>
                    html`<li>
                      <span
                        ><strong>${displayName(user)}</strong> ${user.firstName} ${user.lastName} · ${user.email}</span
                      >
                      <span class="pending-actions">
                        ${this.accountsWithoutLogin.length
                          ? html`<select
                                class="admin-select"
                                aria-label="Bestehendes Konto für ${user.firstName} ${user.lastName}"
                                @change=${(e: Event) =>
                                  (this.mergeTargets = {
                                    ...this.mergeTargets,
                                    [user.id]: (e.target as HTMLSelectElement).value
                                  })}
                              >
                                <option value="">– oder mit bestehendem Konto verknüpfen –</option>
                                ${this.accountsWithoutLogin.map(
                                  account =>
                                    html`<option value=${account.id}>
                                      ${account.lastName},
                                      ${account.firstName}${account.nickname ? ` (${account.nickname})` : ''}
                                    </option>`
                                )}
                              </select>
                              <button
                                class="btn btn-secondary"
                                ?disabled=${!this.mergeTargets[user.id]}
                                @click=${() => this.merge(user)}
                              >
                                Verknüpfen
                              </button>`
                          : ''}
                        <button class="btn btn-success" @click=${() => this.approve(user)}>Freischalten</button>
                      </span>
                    </li>`
                )}
              </ul>
            </div>`
          : ''}
        ${this.loginRequests.length > 0
          ? html`<div class="pending-panel">
              <h2>Login-Wunsch für ein bestehendes Konto</h2>
              <ul>
                ${this.loginRequests.map(
                  user =>
                    html`<li>
                      <span
                        ><strong>${displayName(user)}</strong> ${user.firstName} ${user.lastName} · ${user.email}</span
                      >
                      <span class="pending-actions">
                        <button class="btn btn-secondary" @click=${() => this.decideLogin(user, false)}>
                          Ablehnen
                        </button>
                        <button class="btn btn-success" @click=${() => this.decideLogin(user, true)}>
                          Login freigeben
                        </button>
                      </span>
                    </li>`
                )}
              </ul>
            </div>`
          : ''}

        <!-- Feedback Toast -->
        ${this.toastMessage ? html` <div class="toast-notification ${this.toastType}">${this.toastMessage}</div> ` : ''}

        <!-- Status & Ladeanzeigen -->
        ${this.isLoading
          ? html`
              <div class="loader-container">
                <span class="loading-icon-span">${loadingIcon}</span>
                <p>Lade Benutzerdaten...</p>
              </div>
            `
          : ''}
        ${this.errorMessage
          ? html`
              <div class="error-container">
                <p>${this.errorMessage}</p>
                <button class="btn btn-secondary" @click=${this.fetchUsers}>Erneut versuchen</button>
              </div>
            `
          : ''}

        <!-- Haupttabelle der Benutzer -->
        ${!this.isLoading && !this.errorMessage
          ? html`
              <div class="table-container">
                <table class="user-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>E-Mail</th>
                      <th>Kategorie</th>
                      <th>Kontoart</th>
                      <th>Kontostand</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.filteredUsers.map(
                      user => html`
                        <tr @click=${() => this.openUserDetail(user)} class="user-row" id="user-row-${user.id}">
                          <td class="user-name-cell" data-label="Name">
                            <strong>${displayName(user)}</strong>
                            ${user.nickname && user.role !== 'kasse'
                              ? html`<span class="name-hint">${user.firstName} ${user.lastName}</span>`
                              : ''}
                          </td>
                          <td data-label="E-Mail">
                            ${user.role === 'kasse'
                              ? '—'
                              : isPlaceholderEmail(user.email)
                                ? html`<span class="name-hint">kein Login</span>`
                                : user.email}
                          </td>
                          <td data-label="Kategorie">${user.category ? CATEGORY_LABELS[user.category] : '—'}</td>
                          <td data-label="Rolle">
                            <span class="role-badge ${user.role}">${this.formatRole(user.role)}</span>
                          </td>
                          <td data-label="Kontostand">
                            <span class="balance-badge ${user.balance < 0 ? 'negative' : 'positive'}">
                              ${this.formatCurrency(user.balance)}
                            </span>
                          </td>
                          <td data-label="Status">
                            <span class="status-badge ${user.status}">${this.formatStatus(user.status)}</span>
                          </td>
                        </tr>
                      `
                    )}
                    ${this.filteredUsers.length === 0
                      ? html`
                          <tr>
                            <td colspan="6" class="no-results-cell">Keine passenden Benutzer gefunden.</td>
                          </tr>
                        `
                      : ''}
                  </tbody>
                </table>
              </div>
              <div class="table-footer">
                <span>Gesamt: ${this.filteredUsers.length} Konten angezeigt</span>
              </div>
            `
          : ''}

        <!-- Pop-up Detailansicht (Option B: Modal) -->
        ${this.selectedUser
          ? html`
              <div class="modal-overlay" @click=${this.closeUserDetail} id="detail-modal-overlay">
                <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
                  <!-- Modal Header -->
                  <div class="modal-header">
                    <div>
                      <h2>${displayName(this.selectedUser)}</h2>
                      <p class="modal-subtitle">
                        ${this.selectedUser.firstName} ${this.selectedUser.lastName} ·
                        ${this.formatRole(this.selectedUser.role)}
                      </p>
                    </div>
                    <button class="close-btn" @click=${this.closeUserDetail} aria-label="Schließen">
                      ${closeIcon}
                    </button>
                  </div>

                  <!-- Modal Body -->
                  <div class="modal-body">
                    <div class="details-grid">
                      <!-- Persönliche Infos Card -->
                      <div class="detail-card">
                        <h3>Persönliche Informationen</h3>
                        <div class="detail-row">
                          <span class="detail-label">Name:</span>
                          <span class="detail-value">${this.selectedUser.firstName} ${this.selectedUser.lastName}</span>
                        </div>
                        <div class="detail-row">
                          <span class="detail-label">V/o:</span>
                          <span class="detail-value">${this.selectedUser.nickname || '—'}</span>
                        </div>
                        <div class="detail-row">
                          <span class="detail-label">E-Mail-Adresse:</span>
                          <span class="detail-value"
                            ><a href="mailto:${this.selectedUser.email}">${this.selectedUser.email}</a></span
                          >
                        </div>
                        <div class="detail-row">
                          <span class="detail-label">Wohnort:</span>
                          <span class="detail-value">${this.selectedUser.residence}</span>
                        </div>
                        <div class="detail-row">
                          <span class="detail-label">Mitglied seit:</span>
                          <span class="detail-value">${this.formatDate(this.selectedUser.createdAt)}</span>
                        </div>
                      </div>

                      <!-- Kontodaten Card -->
                      <div class="detail-card">
                        <h3>Kontostatus</h3>
                        <div class="detail-row">
                          <span class="detail-label">Kontoart:</span>
                          <span class="role-badge ${this.selectedUser.role}"
                            >${this.formatRole(this.selectedUser.role)}</span
                          >
                        </div>
                        <div class="detail-row">
                          <span class="detail-label">Kontostand:</span>
                          <span class="balance-badge large ${this.selectedUser.balance < 0 ? 'negative' : 'positive'}">
                            ${this.formatCurrency(this.selectedUser.balance)}
                          </span>
                        </div>
                        <div class="detail-row">
                          <span class="detail-label">System-Status:</span>
                          <span class="status-badge ${this.selectedUser.status}"
                            >${this.formatStatus(this.selectedUser.status)}</span
                          >
                        </div>
                      </div>
                    </div>

                    <!-- Einzahlung buchen -->
                    ${this.selectedUser.role !== 'theke'
                      ? html`<div class="detail-card actions-card">
                          <h3>Einzahlung buchen</h3>
                          <div class="payment-row">
                            <input
                              id="payment-amount"
                              type="number"
                              inputmode="decimal"
                              step="0.01"
                              min="0"
                              placeholder="Betrag in €"
                              .value=${this.paymentAmount}
                              @input=${(e: InputEvent) => (this.paymentAmount = (e.target as HTMLInputElement).value)}
                              class="balance-input"
                            />
                            <select
                              class="admin-select"
                              @change=${(e: Event) =>
                                (this.paymentMethod = (e.target as HTMLSelectElement).value as PaymentMethod)}
                            >
                              <option value="ueberweisung" ?selected=${this.paymentMethod === 'ueberweisung'}>
                                Überweisung
                              </option>
                              <option value="bar" ?selected=${this.paymentMethod === 'bar'}>Bar</option>
                            </select>
                            <input
                              type="text"
                              placeholder="Notiz (optional)"
                              .value=${this.paymentNote}
                              @input=${(e: InputEvent) => (this.paymentNote = (e.target as HTMLInputElement).value)}
                              class="balance-input"
                            />
                            <button class="btn btn-success" @click=${this.handlePayment}>Buchen</button>
                          </div>
                        </div>`
                      : ''}

                    <!-- Administrative Schnellaktionen -->
                    <div class="detail-card actions-card">
                      <h3>Administrative Aktionen</h3>
                      <div class="actions-panel">
                        <!-- Rolle zuweisen -->
                        <div class="action-block">
                          <label for="role-update-select">Kontoart:</label>
                          <select id="role-update-select" @change=${this.handleRoleChange} class="admin-select">
                            ${(Object.keys(ROLE_LABELS) as UserRole[]).map(
                              role =>
                                html`<option value=${role} ?selected=${this.selectedUser!.role === role}>
                                  ${ROLE_LABELS[role]}
                                </option>`
                            )}
                          </select>
                        </div>

                        <!-- Kategorie -->
                        <div class="action-block">
                          <label for="category-select">Kategorie:</label>
                          <select id="category-select" @change=${this.handleCategoryChange} class="admin-select">
                            <option value="" ?selected=${!this.selectedUser.category}>– nicht gesetzt –</option>
                            ${(Object.keys(CATEGORY_LABELS) as UserCategory[]).map(
                              category =>
                                html`<option value=${category} ?selected=${this.selectedUser!.category === category}>
                                  ${CATEGORY_LABELS[category]}
                                </option>`
                            )}
                          </select>
                        </div>

                        <!-- V/o -->
                        <div class="action-block">
                          <label for="nickname-input">V/o bzw. Biername:</label>
                          <div class="balance-input-row">
                            <input
                              id="nickname-input"
                              type="text"
                              .value=${this.nicknameInput}
                              @input=${(e: InputEvent) => (this.nicknameInput = (e.target as HTMLInputElement).value)}
                              class="balance-input"
                            />
                            <button class="btn btn-secondary" @click=${this.handleNicknameUpdate}>Speichern</button>
                          </div>
                        </div>

                        <!-- Passwort zurücksetzen -->
                        <div class="action-block" ?hidden=${this.selectedUser.role === 'kasse'}>
                          <label>Sicherheit:</label>
                          <button class="btn btn-secondary full-width" @click=${this.triggerChangePassword}>
                            Passwort ändern
                          </button>
                        </div>

                        <!-- Kontostand manuell korrigieren -->
                        <div class="action-block">
                          <label for="balance-input">Kontostand korrigieren:</label>
                          <div class="balance-input-row">
                            <input
                              id="balance-input"
                              type="number"
                              step="0.01"
                              .value=${String(this.balanceInput)}
                              @input=${(e: InputEvent) =>
                                (this.balanceInput = parseFloat((e.target as HTMLInputElement).value) || 0)}
                              class="balance-input"
                            />
                            <button class="btn btn-secondary full-width" @click=${this.handleBalanceUpdate}>
                              Setzen
                            </button>
                          </div>
                        </div>

                        <!-- Konto sperren / entsperren -->
                        <div class="action-block">
                          <label>Status steuern:</label>
                          ${this.selectedUser.status === 'pending'
                            ? html`
                                <button
                                  class="btn btn-success full-width"
                                  @click=${() => this.updateUserStatus('active')}
                                >
                                  Konto freischalten
                                </button>
                              `
                            : this.selectedUser.status !== 'active'
                              ? html`
                                  <button
                                    class="btn btn-success full-width"
                                    @click=${() => this.updateUserStatus('active')}
                                  >
                                    Konto entsperren
                                  </button>
                                `
                              : html`
                                  <button
                                    class="btn btn-danger full-width"
                                    @click=${() => this.updateUserStatus('suspended')}
                                  >
                                    Konto sperren
                                  </button>
                                `}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `
          : ''}
      </section>
    `;
  }

  private async fetchUsers() {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.users = await userService.getUsers();
    } catch (error) {
      console.error('Fehler beim Laden der Benutzerdaten:', error);
      this.errorMessage = 'Fehler beim Laden der Benutzerdaten vom Server.';
    } finally {
      this.isLoading = false;
    }
  }

  private handleSearchInput(e: InputEvent) {
    const inputElement = e.target as HTMLInputElement;
    this.searchQuery = inputElement.value;
  }

  private openUserDetail(user: User) {
    this.selectedUser = user;
    this.balanceInput = user.balance;
    this.nicknameInput = user.nickname ?? '';
    this.paymentAmount = '';
    this.paymentNote = '';
    this.paymentMethod = 'ueberweisung';
  }

  private replaceUser(updatedUser: User) {
    this.users = this.users.map(u => (u.id === updatedUser.id ? updatedUser : u));
    if (this.selectedUser?.id === updatedUser.id) this.selectedUser = updatedUser;
  }

  private async approve(user: User) {
    try {
      this.replaceUser(await userService.updateUser(user.id, { status: 'active' }));
      this.showToast(`${displayName(user)} ist freigeschaltet und kann sich jetzt anmelden.`, 'success');
    } catch (error) {
      console.error(error);
      this.showToast('Fehler beim Freischalten.', 'error');
    }
  }

  private async merge(user: User) {
    const target = this.users.find(u => u.id === this.mergeTargets[user.id]);
    if (!target) return;
    if (
      !confirm(
        `Registrierung von ${user.firstName} ${user.lastName} mit dem Konto ${target.firstName} ${target.lastName} verknüpfen? Kontostand und Verlauf bleiben beim bestehenden Konto.`
      )
    )
      return;
    try {
      await userService.mergeInto(user.id, target.id);
      await this.fetchUsers();
      this.showToast(`${target.firstName} ${target.lastName} kann sich jetzt mit ${user.email} anmelden.`, 'success');
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Zusammenführen fehlgeschlagen.', 'error');
    }
  }

  private async decideLogin(user: User, approve: boolean) {
    try {
      this.replaceUser(await userService.decideLoginRequest(user.id, approve));
      this.showToast(approve ? `${displayName(user)} kann sich jetzt anmelden.` : 'Login-Wunsch abgelehnt.', 'success');
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Fehler beim Login-Wunsch.', 'error');
    }
  }

  private async handleCategoryChange(e: Event) {
    if (!this.selectedUser) return;
    const category = (e.target as HTMLSelectElement).value as UserCategory | '';
    try {
      this.replaceUser(await userService.updateUser(this.selectedUser.id, { category: category || null }));
      this.showToast('Kategorie gespeichert.', 'success');
    } catch (error) {
      console.error(error);
      this.showToast('Fehler beim Speichern der Kategorie.', 'error');
    }
  }

  private async handleNicknameUpdate() {
    if (!this.selectedUser) return;
    try {
      this.replaceUser(await userService.updateUser(this.selectedUser.id, { nickname: this.nicknameInput.trim() }));
      this.showToast('V/o gespeichert.', 'success');
    } catch (error) {
      console.error(error);
      this.showToast('Fehler beim Speichern des V/o.', 'error');
    }
  }

  private async handlePayment() {
    if (!this.selectedUser) return;
    const amount = Number(this.paymentAmount.replace(',', '.'));
    if (!amount || amount <= 0) {
      this.showToast('Bitte einen positiven Betrag eingeben.', 'error');
      return;
    }
    try {
      await userService.addPayment(this.selectedUser.id, amount, this.paymentMethod, this.paymentNote);
      const updated = await userService.getUserById(this.selectedUser.id);
      this.replaceUser(updated);
      this.balanceInput = updated.balance;
      this.paymentAmount = '';
      this.paymentNote = '';
      this.showToast(`${this.formatCurrency(amount)} für ${displayName(updated)} gebucht.`, 'success');
    } catch (error) {
      console.error(error);
      this.showToast('Fehler beim Buchen der Einzahlung.', 'error');
    }
  }

  private closeUserDetail() {
    this.selectedUser = null;
  }

  private async handleRoleChange(e: Event) {
    if (!this.selectedUser) return;
    const select = e.target as HTMLSelectElement;
    const newRole = select.value as UserRole;

    try {
      const updatedUser = await userService.updateUser(this.selectedUser.id, { role: newRole });

      // Zustand lokal aktualisieren
      this.users = this.users.map(u => (u.id === updatedUser.id ? updatedUser : u));
      this.selectedUser = updatedUser;

      this.showToast('Kontoart aktualisiert.', 'success');
    } catch (error) {
      console.error(error);
      this.showToast(error instanceof Error ? error.message : 'Fehler beim Ändern der Kontoart.', 'error');
    }
  }

  private async updateUserStatus(newStatus: UserStatus) {
    if (!this.selectedUser) return;

    try {
      const updatedUser = await userService.updateUser(this.selectedUser.id, { status: newStatus });

      // Zustand lokal aktualisieren
      this.users = this.users.map(u => (u.id === updatedUser.id ? updatedUser : u));
      this.selectedUser = updatedUser;

      const message = newStatus === 'suspended' ? 'Konto gesperrt.' : 'Konto aktiv.';
      this.showToast(message, 'success');
    } catch (error) {
      console.error(error);
      this.showToast(error instanceof Error ? error.message : 'Fehler beim Aktualisieren des Status.', 'error');
    }
  }

  private async handleBalanceUpdate() {
    if (!this.selectedUser) return;
    try {
      const updatedUser = await userService.updateUser(this.selectedUser.id, { balance: this.balanceInput });
      this.users = this.users.map(u => (u.id === updatedUser.id ? updatedUser : u));
      this.selectedUser = updatedUser;
      this.showToast(
        `Kontostand von ${updatedUser.firstName} auf ${this.formatCurrency(updatedUser.balance)} gesetzt.`,
        'success'
      );
    } catch (error) {
      console.error(error);
      this.showToast('Fehler beim Aktualisieren des Kontostands.', 'error');
    }
  }

  private async triggerChangePassword() {
    if (!this.selectedUser) return;
    const newPassword = prompt(
      `Geben Sie ein neues Passwort für ${this.selectedUser.firstName} ${this.selectedUser.lastName} ein:`
    );
    if (newPassword === null) return;
    if (newPassword.trim().length < 6) {
      this.showToast('Das Passwort muss mindestens 6 Zeichen lang sein.', 'error');
      return;
    }
    try {
      await userService.changePassword(this.selectedUser.id, newPassword.trim());
      this.showToast(`Passwort für ${this.selectedUser.firstName} erfolgreich geändert.`, 'success');
    } catch (error) {
      console.error(error);
      this.showToast('Fehler beim Ändern des Passworts.', 'error');
    }
  }

  private showToast(message: string, type: 'success' | 'error') {
    this.toastMessage = message;
    this.toastType = type;
    setTimeout(() => {
      this.toastMessage = '';
    }, 4000);
  }

  private formatRole(role: UserRole): string {
    return ROLE_LABELS[role] ?? role;
  }

  private formatStatus(status: UserStatus): string {
    return STATUS_LABELS[status] ?? status;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
  }

  private formatDate(timestamp: number | string): string {
    const ts = Number(timestamp);
    if (!ts || isNaN(ts)) return '—';
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(ts));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'user-management': UserManagement;
  }
}
