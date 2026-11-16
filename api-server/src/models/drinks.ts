/* Autor: Marius Middrup (FH Münster) */

export interface DrinkItem {
  id: string;
  name: string;
  price: number;
  packaging: 'Flasche' | 'Fass';
  unit: string;
  stock: number;
  groupId: string;
  lowStockThreshold: number; // Mindestbestand setzen oder default Wert wird gesetzt
  sortOrder: number;
  isBeer: boolean;
}

export interface DrinkGroup {
  id: string;
  group: string;
  emoji: string;
  sortOrder: number;
  items: DrinkItem[];
}
