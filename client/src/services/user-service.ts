/* Autor: Julius Vollmer (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { User, UserRole, UserStatus } from '../models/user';

export type PaymentMethod = 'ueberweisung' | 'bar';

export interface CreateUserData {
  firstName: string;
  lastName: string;
  nickname?: string;
  email?: string;
  residence?: string;
  role: UserRole;
  status?: UserStatus;
  password?: string;
}
import { fetchWithAuth } from '../utils/fetch.js';

export class UserService {
  private readonly baseUrl = '/api';

  async getUsers(): Promise<User[]> {
    const res = await fetchWithAuth(this.baseUrl + '/users');
    if (!res.ok) throw new Error(`Fehler beim Laden der Benutzer: HTTP ${res.status}`);
    return res.json();
  }

  async getUserById(id: string): Promise<User> {
    const res = await fetchWithAuth(this.baseUrl + `/users/${id}`);
    if (!res.ok) throw new Error(`Fehler beim Laden des Benutzers: HTTP ${res.status}`);
    return res.json();
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const res = await fetchWithAuth(this.baseUrl + `/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Fehler beim Aktualisieren des Benutzers: HTTP ${res.status}`);
    }
    return res.json();
  }

  // Login-Wunsch für ein Konto ohne Login freigeben (approve) oder ablehnen
  async decideLoginRequest(id: string, approve: boolean): Promise<User> {
    const res = await fetchWithAuth(this.baseUrl + `/users/${id}/login-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve })
    });
    if (!res.ok)
      throw new Error((await res.json().catch(() => ({}))).error || 'Login-Wunsch konnte nicht bearbeitet werden');
    return res.json();
  }

  // Registrierung mit einem bestehenden Konto ohne Login zusammenführen
  async mergeInto(pendingId: string, targetId: string): Promise<User> {
    const res = await fetchWithAuth(this.baseUrl + `/users/${pendingId}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId })
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Zusammenführen fehlgeschlagen');
    return res.json();
  }

  async addPayment(userId: string, amount: number, method: PaymentMethod, note = ''): Promise<void> {
    const res = await fetchWithAuth(this.baseUrl + '/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount, method, note })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Fehler beim Buchen der Einzahlung: HTTP ${res.status}`);
    }
  }

  async createUser(data: CreateUserData): Promise<User> {
    const res = await fetchWithAuth(this.baseUrl + '/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Fehler beim Erstellen des Benutzers: HTTP ${res.status}`);
    }
    return res.json();
  }

  async changePassword(id: string, newPassword: string): Promise<void> {
    const res = await fetchWithAuth(this.baseUrl + `/users/${id}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Fehler beim Ändern des Passworts: HTTP ${res.status}`);
    }
  }
}

export const userService = new UserService();
