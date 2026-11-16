/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

// Eintrag in der Personenauswahl beim Stricheln
export interface Member {
  id: string;
  name: string; // V/o bzw. Name
  hint: string | null; // zweite Zeile: bürgerlicher Name oder Verantwortlicher der Kasse
  kind: 'member' | 'kasse';
}
