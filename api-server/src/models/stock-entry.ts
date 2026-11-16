/* Autor: Julius Vollmer (FH Münster) */

import { Entity } from './entity.js';

export interface StockEntry extends Entity {
  drinkId: string;
  drinkName: string;
  userId: string;
  batchId: string;
  quantityAdded: number;
  price: number;
  timestamp: number;
}
