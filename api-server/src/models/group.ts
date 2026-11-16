/* Autor: Marius Middrup (FH Münster) */

import { Entity } from './entity.js';

export interface Group extends Entity {
  group: string;
  emoji: string;
  sortOrder?: number; // Reihenfolge auf der Strichel-Seite
}
