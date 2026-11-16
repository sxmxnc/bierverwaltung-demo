/* Autor: Julius Vollmer (FH Münster) */

import { Entity } from './entity.js';

/**
 * Repräsentiert eine Benutzerrolle im System.
 * Rollen können vom Admin erstellt, benannt und beschrieben werden.
 */
export interface Role extends Entity {
  name: string;
  label: string;
  description: string;
  color: string;
  permissions: string[];
  isSystem: boolean;
}
