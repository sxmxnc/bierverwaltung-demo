/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

// "0,3 l", "0.33l", "500 ml", "50L" -> Liter
export function litersOf(unit: string): number {
  const match = String(unit ?? '')
    .replace(',', '.')
    .match(/(\d+(?:\.\d+)?)\s*(ml|cl|l)?/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const scale = (match[2] ?? 'l').toLowerCase();
  return scale === 'ml' ? value / 1000 : scale === 'cl' ? value / 100 : value;
}
