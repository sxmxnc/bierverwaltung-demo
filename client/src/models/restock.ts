/* Autor: Julius Vollmer (FH Münster) */

export interface RestockCartItem {
  drinkId: string;
  name: string;
  packaging: 'Flasche' | 'Fass';
  unit: string;
  groupId: string;
  salePrice: number; // aktueller Verkaufspreis
  purchasePrice: number; // Einkaufspreis je Einheit (Basis für den Bestellwert)
  quantity: number; // Anzahl bestellter Einheiten
}
