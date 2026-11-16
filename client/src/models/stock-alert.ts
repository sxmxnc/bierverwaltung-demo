/* Autor: Julius Vollmer (FH Münster) */

export interface StockAlert {
  id: string;
  createdAt: number;
  drinkId: string;
  drinkName: string;
  reportedByName: string;
  message: string;
  status: 'open' | 'resolved';
}
