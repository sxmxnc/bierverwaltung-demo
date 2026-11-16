/* Autor: Julius Vollmer (FH Münster) */

import { Order } from '../models/order.js';
import { Payment } from '../models/payment.js';

export const SEPA_DRINK_ID = 'sepa-lastschrift';

// Vermerk an Zahlungen, die eine manuelle Saldo-Korrektur durch den Bierwart sind.
export const CORRECTION_NOTE = 'Manuelle Saldo-Korrektur durch Admin';

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Nur echte Getränke-Bestellungen
export function onlyDrinkOrders(orders: Order[]): Order[] {
  return orders.filter(order => order.drinkId !== SEPA_DRINK_ID);
}

export function computeBalance(orders: Order[], payments: Payment[] = []): number {
  const fromOrders = orders.reduce((sum, order) => sum - Number(order.value) * Number(order.price), 0);
  const fromPayments = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  return fromOrders + fromPayments;
}

export function balancesByUser(orders: Order[], payments: Payment[] = []): Map<string, number> {
  const balances = new Map<string, number>();
  for (const order of orders) {
    const amount = Number(order.value) * Number(order.price);
    balances.set(order.userId, (balances.get(order.userId) ?? 0) - amount);
  }
  for (const payment of payments) {
    balances.set(payment.userId, (balances.get(payment.userId) ?? 0) + Number(payment.amount));
  }
  return balances;
}
