/* Autor: Julius Vollmer (FH Münster) */

import { Drink } from '../models/drink.js';

// Ab welcher Stückzahl ein Getränk je Verpackung als knapp gilt,
// wenn am Getränk kein eigener Schwellwert (lowStockThreshold) gesetzt ist.
export const LOW_STOCK_THRESHOLDS: Record<Drink['packaging'], number> = {
  Flasche: 10,
  Fass: 2
};

// Wenn Mindestbestand nicht gesetzt,  sonst der Default je Verpackung.
export function effectiveThreshold(drink: Drink): number {
  return drink.lowStockThreshold != null ? Number(drink.lowStockThreshold) : LOW_STOCK_THRESHOLDS[drink.packaging];
}
