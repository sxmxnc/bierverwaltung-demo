/* Autor: Julius Vollmer (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

export interface SepaMandate {
  creditorName: string;
  creditorId: string;
  debtorName: string;
  debtorBank: string;
  iban: string;
}

// admin = Bierwart, user = Mitglied, theke = Theken-Gerät, kasse = Sammelkonto (Aktivenkasse, Fuxenkasse)
export type UserRole = 'admin' | 'user' | 'theke' | 'kasse';
export type UserStatus = 'active' | 'pending' | 'suspended' | 'inactive';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Bierwart',
  user: 'Mitglied',
  theke: 'Theke',
  kasse: 'Kasse'
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Aktiv',
  pending: 'Wartet auf Freischaltung',
  suspended: 'Gesperrt',
  inactive: 'Inaktiv'
};

// Kategorie wie die Blätter der Excel-Bilanz
export type UserCategory = 'aktiv' | 'ah' | 'hausbewohner' | 'gast' | 'verein';

export const CATEGORY_LABELS: Record<UserCategory, string> = {
  aktiv: 'Aktiv / Fux',
  ah: 'Alter Herr',
  hausbewohner: 'Hausbewohner',
  gast: 'Gast',
  verein: 'Verein / Kasse'
};

export interface User {
  id: string;
  createdAt: number;
  firstName: string;
  lastName: string;
  nickname?: string | null;
  email: string;
  residence: string;
  role: UserRole;
  balance: number;
  status: UserStatus;
  sepaMandate: SepaMandate;
  category?: UserCategory | null;
  hasLogin?: boolean; // false = Konto ohne Login (z. B. aus der Excel übernommen)
  loginRequestedAt?: number | null; // jemand hat sich mit der E-Mail dieses Kontos registriert
}

// Platzhalter-Adressen (…@mitglied.invalid, …@kasse.invalid) sind keine echten E-Mails
export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith('.invalid');
}

// Anzeigename wie auf der Strichliste: V/o, sonst Vor- und Nachname
export function displayName(user: Pick<User, 'firstName' | 'lastName' | 'nickname' | 'role'>): string {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  if (user.role === 'kasse') return fullName;
  return user.nickname?.trim() || fullName;
}
