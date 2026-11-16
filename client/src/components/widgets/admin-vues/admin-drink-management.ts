/* Autor: Julius Vollmer (FH Münster) mit Hilfe Claude AI*/

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyle from './admin-drink-management.css?inline';
import { DrinkGroup, DrinkItem } from '../../../models/drinks.js';
import { drinkService } from '../../../services/drinks.js';

@customElement('admin-drink-management')
export class AdminDrinkManagement extends LitElement {
  static styles = componentStyle;

  @state() private groups: DrinkGroup[] = [];
  @state() private isLoading = true;
  @state() private errorMessage = '';

  // Getränk bearbeiten
  @state() private editingItem: DrinkItem | null = null;
  @state() private editName = '';
  @state() private editPrice = 0;
  @state() private editUnit = '';
  @state() private editPackaging: 'Flasche' | 'Fass' = 'Flasche';
  @state() private editGroupId = '';
  @state() private editThreshold = 0;
  @state() private editIsBeer = false;
  @state() private isSaving = false;

  // Neues Getränk anlegen
  @state() private createOpen = false;
  @state() private createName = '';
  @state() private createPrice = 0;
  @state() private createUnit = '';
  @state() private createPackaging: 'Flasche' | 'Fass' = 'Flasche';
  @state() private createGroupId = '';
  @state() private createStock = 0;
  @state() private createThreshold = 0;
  @state() private createIsBeer = false;
  @state() private isCreating = false;

  // Bestand korrigieren
  @state() private stockItem: DrinkItem | null = null;
  @state() private newStock = 0;
  @state() private isUpdatingStock = false;

  // Getränk löschen
  @state() private deleteItem: DrinkItem | null = null;
  @state() private isDeleting = false;

  // Toast
  @state() private toastMessage = '';
  @state() private toastType: 'success' | 'error' = 'success';

  private get groupList() {
    return this.groups.map(g => ({ id: g.id, name: g.group, emoji: g.emoji }));
  }

  private get isEditValid() {
    return this.editName.trim().length > 0 && this.editPrice >= 0 && this.editUnit.trim().length > 0;
  }

  private get isCreateValid() {
    return (
      this.createName.trim().length > 0 &&
      this.createPrice >= 0 &&
      this.createUnit.trim().length > 0 &&
      this.createGroupId.length > 0
    );
  }

  async firstUpdated() {
    await this.loadDrinks();
  }

  render() {
    return html`
      <section class="drink-mgmt-section">
        <div class="section-header">
          <div class="header-text">
            <h1>Getränke Verwaltung</h1>
            <p class="subtitle">Sortiment und Bestand pflegen</p>
          </div>
          <div class="header-actions">
            <button class="btn btn-primary" ?disabled=${this.groups.length === 0} @click=${this.openCreateModal}>
              + Neues Getränk
            </button>
          </div>
        </div>

        ${this.toastMessage ? html`<div class="toast-notification ${this.toastType}">${this.toastMessage}</div>` : ''}
        ${this.isLoading
          ? html`<div class="loader-container">
              <div class="spinner"></div>
              <p>Lade Getränke...</p>
            </div>`
          : ''}
        ${this.errorMessage
          ? html`<div class="error-container">
              <p>${this.errorMessage}</p>
              <button class="btn btn-secondary" @click=${this.loadDrinks}>Erneut versuchen</button>
            </div>`
          : ''}
        ${!this.isLoading && !this.errorMessage ? this.renderCategories() : ''}
        ${this.editingItem ? this.renderEditModal() : ''} ${this.createOpen ? this.renderCreateModal() : ''}
        ${this.stockItem ? this.renderStockModal() : ''} ${this.deleteItem ? this.renderDeleteConfirm() : ''}
      </section>
    `;
  }

  private renderCategories() {
    if (this.groups.length === 0) {
      return html`<div class="empty-state"><p>Noch keine Getränke vorhanden.</p></div>`;
    }
    return html`
      <div class="categories">
        ${this.groups.map(
          group => html`
            <div class="category-card">
              <div class="category-card-header">
                <h2>${group.emoji} ${group.group}</h2>
                <span class="item-count"
                  >${group.items.length} ${group.items.length === 1 ? 'Getränk' : 'Getränke'}</span
                >
              </div>
              ${group.items.length === 0
                ? html`<p class="empty-category">Noch keine Getränke in dieser Kategorie.</p>`
                : html`
                    <table class="drink-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Verpackung</th>
                          <th>Einheit</th>
                          <th class="num">Preis</th>
                          <th>Bestand</th>
                          <th class="num">Knapp ab</th>
                          <th class="actions-head">Aktionen</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${group.items.map(item => this.renderDrinkRow(item))}
                      </tbody>
                    </table>
                  `}
            </div>
          `
        )}
      </div>
    `;
  }

  private renderDrinkRow(item: DrinkItem) {
    const isLow = item.stock > 0 && item.stock < item.lowStockThreshold;
    const badge = item.stock === 0 ? 'out' : isLow ? 'low' : 'ok';
    return html`
      <tr>
        <td class="name-cell" data-label="Name"><strong>${item.name}</strong></td>
        <td data-label="Verpackung">${item.packaging}</td>
        <td data-label="Einheit">${item.unit}</td>
        <td class="num" data-label="Preis">${this.formatCurrency(item.price)}</td>
        <td data-label="Bestand">
          <span class="stock-badge ${badge}">${item.stock} ${item.packaging === 'Flasche' ? 'Stk.' : 'Fass'}</span>
        </td>
        <td class="num" data-label="Knapp ab">${item.lowStockThreshold}</td>
        <td class="actions-cell" data-label="Aktionen">
          <button class="btn btn-sm btn-secondary" @click=${() => this.openEditModal(item)}>Bearbeiten</button>
          <button class="btn btn-sm btn-outline" @click=${() => this.openStockModal(item)}>Bestand</button>
          <button class="btn btn-sm btn-danger" @click=${() => (this.deleteItem = item)}>Löschen</button>
        </td>
      </tr>
    `;
  }

  private renderEditModal() {
    const item = this.editingItem!;
    return html`
      <div class="modal-overlay" @click=${this.closeEditModal}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h2>Getränk bearbeiten</h2>
            <button class="close-btn" @click=${this.closeEditModal} aria-label="Schließen">✕</button>
          </div>
          <div class="modal-body">
            <p class="modal-subtitle">ID: ${item.id}</p>

            <label
              >Name
              <input
                type="text"
                .value=${this.editName}
                @input=${(e: InputEvent) => (this.editName = (e.target as HTMLInputElement).value)}
                placeholder="z.B. Krombacher"
              />
            </label>

            <div class="field-row">
              <label
                >Preis (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  .value=${String(this.editPrice)}
                  @input=${(e: InputEvent) => (this.editPrice = parseFloat((e.target as HTMLInputElement).value) || 0)}
                />
              </label>
              <label
                >Einheit
                <input
                  type="text"
                  .value=${this.editUnit}
                  @input=${(e: InputEvent) => (this.editUnit = (e.target as HTMLInputElement).value)}
                  placeholder="z.B. 0.33l"
                />
              </label>
            </div>

            <div class="field-row">
              <label
                >Verpackung
                <select
                  @change=${(e: Event) =>
                    (this.editPackaging = (e.target as HTMLSelectElement).value as 'Flasche' | 'Fass')}
                >
                  <option value="Flasche" ?selected=${this.editPackaging === 'Flasche'}>Flasche</option>
                  <option value="Fass" ?selected=${this.editPackaging === 'Fass'}>Fass</option>
                </select>
              </label>
              <label
                >Knapp ab (Bestand)
                <input
                  type="number"
                  min="0"
                  step="1"
                  .value=${String(this.editThreshold)}
                  @input=${(e: InputEvent) =>
                    (this.editThreshold = parseInt((e.target as HTMLInputElement).value) || 0)}
                />
              </label>
            </div>

            <label
              >Kategorie
              <select @change=${(e: Event) => (this.editGroupId = (e.target as HTMLSelectElement).value)}>
                ${this.groupList.map(
                  g =>
                    html`<option value="${g.id}" ?selected=${this.editGroupId === g.id}>${g.emoji} ${g.name}</option>`
                )}
              </select>
            </label>
            <label class="checkbox-row">
              <input
                type="checkbox"
                .checked=${this.editIsBeer}
                @change=${(e: Event) => (this.editIsBeer = (e.target as HTMLInputElement).checked)}
              />
              Zählt als Bier (Rangliste) – nicht für Alkoholfreies
            </label>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click=${this.closeEditModal}>Abbrechen</button>
            <button class="btn btn-primary" ?disabled=${!this.isEditValid || this.isSaving} @click=${this.saveEdit}>
              ${this.isSaving ? 'Speichert...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderCreateModal() {
    return html`
      <div class="modal-overlay" @click=${this.closeCreateModal}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h2>Neues Getränk anlegen</h2>
            <button class="close-btn" @click=${this.closeCreateModal} aria-label="Schließen">✕</button>
          </div>
          <div class="modal-body">
            <label
              >Name
              <input
                type="text"
                .value=${this.createName}
                @input=${(e: InputEvent) => (this.createName = (e.target as HTMLInputElement).value)}
                placeholder="z.B. Krombacher"
              />
            </label>

            <div class="field-row">
              <label
                >Preis (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  .value=${String(this.createPrice)}
                  @input=${(e: InputEvent) =>
                    (this.createPrice = parseFloat((e.target as HTMLInputElement).value) || 0)}
                />
              </label>
              <label
                >Einheit
                <input
                  type="text"
                  .value=${this.createUnit}
                  @input=${(e: InputEvent) => (this.createUnit = (e.target as HTMLInputElement).value)}
                  placeholder="z.B. 0.33l"
                />
              </label>
            </div>

            <div class="field-row">
              <label
                >Verpackung
                <select
                  @change=${(e: Event) =>
                    (this.createPackaging = (e.target as HTMLSelectElement).value as 'Flasche' | 'Fass')}
                >
                  <option value="Flasche" ?selected=${this.createPackaging === 'Flasche'}>Flasche</option>
                  <option value="Fass" ?selected=${this.createPackaging === 'Fass'}>Fass</option>
                </select>
              </label>
              <label
                >Kategorie
                <select @change=${(e: Event) => (this.createGroupId = (e.target as HTMLSelectElement).value)}>
                  ${this.groupList.map(
                    g =>
                      html`<option value="${g.id}" ?selected=${this.createGroupId === g.id}>
                        ${g.emoji} ${g.name}
                      </option>`
                  )}
                </select>
              </label>
            </div>

            <div class="field-row">
              <label
                >Anfangsbestand
                <input
                  type="number"
                  min="0"
                  step="1"
                  .value=${String(this.createStock)}
                  @input=${(e: InputEvent) => (this.createStock = parseInt((e.target as HTMLInputElement).value) || 0)}
                />
              </label>
              <label
                >Knapp ab (optional)
                <input
                  type="number"
                  min="0"
                  step="1"
                  .value=${String(this.createThreshold)}
                  @input=${(e: InputEvent) =>
                    (this.createThreshold = parseInt((e.target as HTMLInputElement).value) || 0)}
                  placeholder="leer = Standard"
                />
              </label>
            </div>
            <label class="checkbox-row">
              <input
                type="checkbox"
                .checked=${this.createIsBeer}
                @change=${(e: Event) => (this.createIsBeer = (e.target as HTMLInputElement).checked)}
              />
              Zählt als Bier (Rangliste) – nicht für Alkoholfreies
            </label>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click=${this.closeCreateModal}>Abbrechen</button>
            <button
              class="btn btn-primary"
              ?disabled=${!this.isCreateValid || this.isCreating}
              @click=${this.saveCreate}
            >
              ${this.isCreating ? 'Wird angelegt...' : 'Getränk anlegen'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderStockModal() {
    const item = this.stockItem!;
    return html`
      <div class="modal-overlay" @click=${this.closeStockModal}>
        <div class="modal-content modal-small" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h2>Bestand korrigieren</h2>
            <button class="close-btn" @click=${this.closeStockModal} aria-label="Schließen">✕</button>
          </div>
          <div class="modal-body">
            <p>
              <strong>${item.name}</strong> (${item.unit} · ${item.packaging})<br />
              Aktuell:
              <span class="current-stock">${item.stock} ${item.packaging === 'Flasche' ? 'Stk.' : 'Fass'}</span>
            </p>
            <label
              >Neuer Bestand
              <input
                type="number"
                min="0"
                step="1"
                .value=${String(this.newStock)}
                @input=${(e: InputEvent) => (this.newStock = parseInt((e.target as HTMLInputElement).value) || 0)}
              />
            </label>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click=${this.closeStockModal}>Abbrechen</button>
            <button class="btn btn-primary" ?disabled=${this.isUpdatingStock} @click=${this.saveStock}>
              ${this.isUpdatingStock ? 'Speichert...' : 'Bestand setzen'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderDeleteConfirm() {
    const item = this.deleteItem!;
    return html`
      <div class="modal-overlay" @click=${() => (this.deleteItem = null)}>
        <div class="modal-content modal-small" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h2>Getränk löschen</h2>
            <button class="close-btn" @click=${() => (this.deleteItem = null)} aria-label="Schließen">✕</button>
          </div>
          <div class="modal-body">
            <p class="warning-text">
              Möchtest du <strong>${item.name}</strong> (${item.unit} · ${item.packaging}) wirklich dauerhaft aus dem
              Sortiment entfernen?
            </p>
            <p class="hint">Bestehende Bestellungen behalten den gespeicherten Namen.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click=${() => (this.deleteItem = null)}>Abbrechen</button>
            <button class="btn btn-danger" ?disabled=${this.isDeleting} @click=${this.confirmDelete}>
              ${this.isDeleting ? 'Wird gelöscht...' : 'Endgültig löschen'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private async loadDrinks() {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.groups = await drinkService.getDrinks();
    } catch {
      this.errorMessage = 'Getränke konnten nicht geladen werden.';
    } finally {
      this.isLoading = false;
    }
  }

  private openEditModal(item: DrinkItem) {
    this.editingItem = item;
    this.editName = item.name;
    this.editPrice = item.price;
    this.editUnit = item.unit;
    this.editPackaging = item.packaging;
    this.editGroupId = item.groupId;
    this.editThreshold = item.lowStockThreshold;
    this.editIsBeer = item.isBeer === true;
  }

  private closeEditModal() {
    this.editingItem = null;
    this.isSaving = false;
  }

  private async saveEdit() {
    if (!this.editingItem || !this.isEditValid) return;
    this.isSaving = true;
    try {
      await drinkService.updateDrink(this.editingItem.id, {
        name: this.editName.trim(),
        price: this.editPrice,
        unit: this.editUnit.trim(),
        packaging: this.editPackaging,
        groupId: this.editGroupId,
        lowStockThreshold: this.editThreshold,
        isBeer: this.editIsBeer
      });
      await this.loadDrinks();
      this.closeEditModal();
      this.showToast(`„${this.editName}" wurde aktualisiert.`, 'success');
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Fehler beim Speichern.', 'error');
    } finally {
      this.isSaving = false;
    }
  }

  private openCreateModal() {
    this.createName = '';
    this.createPrice = 0;
    this.createUnit = '';
    this.createPackaging = 'Flasche';
    this.createGroupId = this.groups[0]?.id ?? '';
    this.createStock = 0;
    this.createThreshold = 0;
    this.createIsBeer = false;
    this.createOpen = true;
  }

  private closeCreateModal() {
    this.createOpen = false;
    this.isCreating = false;
  }

  private async saveCreate() {
    if (!this.isCreateValid) return;
    this.isCreating = true;
    try {
      await drinkService.addDrink({
        name: this.createName.trim(),
        price: this.createPrice,
        packaging: this.createPackaging,
        unit: this.createUnit.trim(),
        groupId: this.createGroupId,
        quantityAdded: this.createStock,
        lowStockThreshold: this.createThreshold > 0 ? this.createThreshold : undefined,
        isBeer: this.createIsBeer
      });
      await this.loadDrinks();
      this.closeCreateModal();
      this.showToast(`„${this.createName}" wurde angelegt.`, 'success');
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Fehler beim Anlegen.', 'error');
    } finally {
      this.isCreating = false;
    }
  }

  private openStockModal(item: DrinkItem) {
    this.stockItem = item;
    this.newStock = item.stock;
  }

  private closeStockModal() {
    this.stockItem = null;
    this.isUpdatingStock = false;
  }

  private async saveStock() {
    if (!this.stockItem) return;
    this.isUpdatingStock = true;
    try {
      await drinkService.updateStock(this.stockItem.id, this.newStock);
      await this.loadDrinks();
      this.showToast(`Bestand für „${this.stockItem.name}" auf ${this.newStock} gesetzt.`, 'success');
      this.closeStockModal();
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Fehler beim Aktualisieren.', 'error');
    } finally {
      this.isUpdatingStock = false;
    }
  }

  private async confirmDelete() {
    if (!this.deleteItem) return;
    this.isDeleting = true;
    const name = this.deleteItem.name;
    const id = this.deleteItem.id;
    try {
      await drinkService.deleteDrink(id);
      await this.loadDrinks();
      this.deleteItem = null;
      this.showToast(`„${name}" wurde aus dem Sortiment entfernt.`, 'success');
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Fehler beim Löschen.', 'error');
    } finally {
      this.isDeleting = false;
    }
  }

  private showToast(message: string, type: 'success' | 'error') {
    this.toastMessage = message;
    this.toastType = type;
    setTimeout(() => {
      this.toastMessage = '';
    }, 4000);
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'admin-drink-management': AdminDrinkManagement;
  }
}
