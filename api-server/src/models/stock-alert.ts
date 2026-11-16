/* Autor: Julius Vollmer (FH Münster) */

import { Entity } from './entity.js';

export interface StockAlert extends Entity {
  drinkId: string;
  drinkName: string;
  reportedByName: string;
  message: string;
  status: 'open' | 'resolved';
}
