/* Autor: Jonas Bergjürgen (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import { Entity } from './entity.js';

export interface SepaMandate {
  creditorName: string;
  creditorId: string;
  debtorName: string;
  debtorBank: string;
  iban: string;
}

// Kontoarten:
// - admin: Bierwart, darf alles
// - user:  normales Mitglied
// - theke: gemeinsames Theken-Gerät (z. B. iPad), darf nur für andere stricheln
// - kasse: Sammelkonto wie Aktivenkasse/Fuxenkasse, kann sich nicht anmelden
export type UserRole = 'admin' | 'user' | 'theke' | 'kasse';
export const USER_ROLES: UserRole[] = ['admin', 'user', 'theke', 'kasse'];

// pending = registriert, wartet auf Freischaltung durch den Bierwart
export type UserStatus = 'active' | 'pending' | 'suspended' | 'inactive';
export const USER_STATUSES: UserStatus[] = ['active', 'pending', 'suspended', 'inactive'];

// Kategorie wie die Blätter der Excel-Bilanz (Aktive inkl. Füxe, Alte Herren, Hausbewohner, Gäste, Vereine wie AHV/HBV)
export type UserCategory = 'aktiv' | 'ah' | 'hausbewohner' | 'gast' | 'verein';
export const USER_CATEGORIES: UserCategory[] = ['aktiv', 'ah', 'hausbewohner', 'gast', 'verein'];

export interface User extends Entity {
  firstName: string;
  lastName: string;
  nickname?: string | null; // V/o bzw. Biername
  email: string;
  password: string;
  residence: string;
  role: UserRole;
  status: UserStatus;
  sepaMandate: SepaMandate;
  resetToken?: string;
  resetTokenExpiry?: number;
  category?: UserCategory | null;
  pendingPassword?: string | null; // Login-Wunsch für ein Konto ohne Login, wartet auf Freigabe
  loginRequestedAt?: number | null;
}

// Konto ohne Login (z. B. aus der Excel importiert): kein Passwort, meldet sich nie selbst an
export function hasLogin(user: Pick<User, 'password'>): boolean {
  return !!user.password;
}

// Nutzer in API-Antworten: ohne Passwort-Hash, mit dem berechneten Saldo
// (aus orders + payments, siehe utils/account.ts). Der Saldo wird nicht
// persistiert, sondern bei jeder Anfrage frisch berechnet.
export type SafeUser = Omit<User, 'password' | 'pendingPassword'> & { balance: number; hasLogin: boolean };
