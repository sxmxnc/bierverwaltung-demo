/* Autor: Marius Middrup (FH Münster) Julius Vollmer (FH Münster)*/

export interface DrinkItem {
  id: string;
  name: string;
  price: number;
  packaging: 'Flasche' | 'Fass';
  unit: string;
  stock: number;
  groupId: string;
  lowStockThreshold: number; // Mindestvorrat Meldung
  isBeer?: boolean; // zählt für die Rangliste
  sortOrder?: number;
}

export interface DrinkGroup {
  id: string;
  group: string;
  emoji: string;
  sortOrder?: number;
  items: DrinkItem[];
}
