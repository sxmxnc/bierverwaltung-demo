/* Autor: Marius Middrup (FH Münster) */

import { Entity } from './entity.js';

export interface Drink extends Entity {
  name: string; // z.B. "Bitburger"
  packaging: 'Flasche' | 'Fass';
  unit: string; // z.B. "0,3 l"
  price: number; // Verkaufspreis
  groupId: string;
  lowStockThreshold?: number; // Mindestbestandsgrenze, ab wann die Knappheit angezeigt wird
  sortOrder?: number; // Reihenfolge auf der Strichel-Seite
  isBeer?: boolean; // zählt für die Rangliste (Bier vom Fass und Bierflaschen, nichts Alkoholfreies)
}
