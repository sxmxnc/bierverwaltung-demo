/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

// Umwandlung der Excel-Bilanz in die Prüfdatei für den Mitglieder-Import.
//   npm run bilanz-export -- "<Pfad>/Bilanz November 2026.xlsm" [<Ausgabe.csv>]
// Rechnet alle Kontostände aus den Formeln nach (gespeicherte Excel-Werte sind oft veraltet) und
// schreibt nur dann eine Datei, wenn die Summen mit dem Blatt "Bilanz" übereinstimmen.

import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { readBilanz, toImportCsv } from '../src/utils/bilanz.js';
import { CellSource, RawCell } from '../src/utils/formula.js';

const [input, outputArg] = process.argv.slice(2);
if (!input) {
  console.error('Aufruf: npm run bilanz-export -- "<Bilanz.xlsm>" [<Ausgabe.csv>]');
  process.exit(2);
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(input);

const source: CellSource = {
  cell(sheet: string, address: string): RawCell {
    const ws = workbook.getWorksheet(sheet);
    if (!ws) throw new Error(`Blatt „${sheet}“ fehlt.`);
    const cell = ws.getCell(address);
    const value = cell.value as unknown;
    if (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
      return { value: null, formula: cell.formula || null };
    }
    if (value && typeof value === 'object' && 'richText' in value) {
      return { value: (value as { richText: { text: string }[] }).richText.map(t => t.text).join(''), formula: null };
    }
    if (value instanceof Date) return { value: null, formula: null };
    return { value: (value as RawCell['value']) ?? null, formula: null };
  }
};

const sheets = workbook.worksheets.map(ws => ({ name: ws.name, rowCount: ws.rowCount, columnCount: ws.columnCount }));
const result = readBilanz(source, sheets);
const euro = (c: number) => (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €';

const byCategory = new Map<string, { count: number; debt: number; credit: number }>();
for (const a of result.accounts) {
  const entry = byCategory.get(a.category) ?? { count: 0, debt: 0, credit: 0 };
  entry.count++;
  if (a.balanceCents > 0) entry.debt += a.balanceCents;
  else entry.credit += a.balanceCents;
  byCategory.set(a.category, entry);
}
console.log(`\n${path.basename(input)}: ${result.accounts.length} Konten`);
for (const [category, e] of byCategory) {
  console.log(
    `  ${category.padEnd(13)} ${String(e.count).padStart(3)} Konten  Schulden ${euro(e.debt).padStart(12)}  Guthaben ${euro(e.credit).padStart(12)}`
  );
}
console.log('\nGegenprobe mit dem Blatt „Bilanz“:');
for (const c of result.checks) {
  const ok = c.expectedCents === c.actualCents;
  console.log(`  ${ok ? '✔' : '✘'} ${c.label}: Bilanz ${euro(c.expectedCents)}, Konten ${euro(c.actualCents)}`);
}
if (result.warnings.length) {
  console.log('\nHinweise:');
  for (const w of result.warnings) console.log(`  - ${w}`);
}

if (!result.ok) {
  console.error('\nDie Summen stimmen nicht mit der Bilanz überein. Es wurde keine Datei geschrieben.');
  process.exit(1);
}

const output =
  outputArg ?? path.join(path.dirname(input), `Mitglieder-Import_${path.basename(input, path.extname(input))}.csv`);
const meta = `Quelle: ${path.basename(input)} · erstellt ${new Date().toLocaleString('de-DE')} · ${result.accounts.length} Konten`;
fs.writeFileSync(output, toImportCsv(result, meta));
console.log(`\nPrüfdatei geschrieben: ${output}`);
console.log('Bitte in Excel prüfen (Kategorie, Status, importieren ja/nein), speichern und in der App hochladen.');
