/* Autor: Jonas Bergjürgen (FH Münster) */

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPassword(password: string, email: string): boolean {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;

  const emailName = email.split('@')[0].toLowerCase();
  if (password.toLowerCase().includes(emailName)) return false;

  return true;
}
