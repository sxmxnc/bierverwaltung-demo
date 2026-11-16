/* Autor: Julius Vollmer (FH Münster) */

import { Entity } from './entity.js';

export interface InventoryItem extends Entity {
  drinkId: string;
  stock: number;
}
