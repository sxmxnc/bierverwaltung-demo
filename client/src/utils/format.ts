/* Autor: Marius Middrup (FH Münster) */

import { Club } from '../context/clubContext';

export function formatPrice(x: number, club: Club): string {
  return new Intl.NumberFormat(club.languageCode, { style: 'currency', currency: club.currency }).format(x);
}

export function formatTime(date: string | number | Date): string {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

export function formatDay(date: string | number | Date): string {
  const day = new Date(date);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return 'Heute';
  if (day.toDateString() === yesterday.toDateString()) return 'Gestern';
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    day
  );
}
