/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { expect } from 'chai';
import { readBilanz, toImportCsv } from './bilanz.js';
import { CellSource, FormulaError, FormulaEvaluator, RawCell } from './formula.js';

type Sheets = Record<string, Record<string, number | string>>;

function source(sheets: Sheets): CellSource {
  return {
    cell(sheet: string, address: string): RawCell {
      const v = sheets[sheet]?.[address];
      if (typeof v === 'string' && v.startsWith('=')) return { value: null, formula: v.slice(1) };
      return { value: v ?? null, formula: null };
    }
  };
}

describe('FormulaEvaluator', () => {
  const evaluator = (sheets: Sheets) => new FormulaEvaluator(source(sheets));

  it('rechnet Grundrechenarten, Klammern und Vorzeichen', () => {
    const e = evaluator({ S: { A1: '=-101.5+20+243.2', A2: '=134.7/2', A3: '=(1+2)*-3' } });
    expect(e.number('S', 'A1')).to.be.closeTo(161.7, 1e-9);
    expect(e.number('S', 'A2')).to.be.closeTo(67.35, 1e-9);
    expect(e.number('S', 'A3')).to.equal(-9);
  });

  it('SUM über Bereiche, ROUND kaufmännisch, Text zählt als 0', () => {
    const e = evaluator({ S: { A1: 1.005, B1: 'Text', C1: 2, D1: '=ROUND(SUM(A1:C1),2)-E1', E1: 0.5 } });
    expect(e.number('S', 'D1')).to.be.closeTo(2.51, 1e-9);
  });

  it('SUMIF mit Vergleich und Bezüge auf andere Blätter', () => {
    const e = evaluator({
      'Bbr_ Ak_ FK': { A1: 5, A2: -3, A3: 0, A4: '=SUMIF(A1:A3,">=0")', A5: '=SUMIF(A1:A3,"<=0")' },
      'Bilanz': { B1: `='Bbr_ Ak_ FK'!A4`, B2: `='Bbr_ Ak_ FK'!A5*(-1)` }
    });
    expect(e.number('Bilanz', 'B1')).to.equal(5);
    expect(e.number('Bilanz', 'B2')).to.equal(3);
  });

  it('bricht bei unbekannten Funktionen und Zirkelbezügen ab', () => {
    expect(() => evaluator({ S: { A1: '=VLOOKUP(1,B1:C2,2)' } }).number('S', 'A1')).to.throw(FormulaError, /VLOOKUP/);
    expect(() => evaluator({ S: { A1: '=A2', A2: '=A1' } }).number('S', 'A1')).to.throw(FormulaError, /Zirkelbezug/);
  });
});

// Verkleinerte Bilanz mit allen Besonderheiten der echten Datei
function miniBilanz(): Sheets {
  return {
    'Bbr_ Ak_ FK': {
      A3: 'E-Mail',
      B3: 'Name',
      D3: 'Vulgo',
      E3: 'Übertrag',
      F3: '01.',
      G3: '02.',
      H3: 'Sonstiges',
      I3: 'Kontostand',
      A4: 'xxxx@sauerlandia.de',
      B4: 'Aktivenkasse',
      C4: 'XXXX',
      E4: 10,
      F4: '=-5+20',
      I4: '=ROUND(SUM(E4:G4),2)-H4',
      A5: 'a@b.de',
      B5: 'Altenkamp',
      C5: 'Benedict',
      D5: 'Altpapier',
      E5: -15.85,
      F5: 47.9,
      G5: -32.05,
      I5: '=ROUND(SUM(E5:G5),2)-H5',
      B6: 'Huesmann',
      C6: 'Clemens',
      F6: '=134.7/2',
      I6: '=ROUND(SUM(E6:G6),2)-H6',
      B7: 'Koch',
      C7: 'Julius',
      E7: -43.32,
      I7: '=ROUND(SUM(E7:G7),2)-H7',
      I9: '=SUMIF(I5:I7,">=0")',
      I10: '=SUMIF(I5:I7,"<=0")'
    },
    'AH': {
      A2: 'E-Mail',
      B2: 'Name',
      C2: 'Vorname',
      D2: 'Vulgo',
      E2: 'Übertrag',
      F2: '1.',
      I2: 'Kontostand',
      B3: 'AHV',
      E3: 0,
      I3: '=SUM(E3:F3)',
      B4: 'Slobbe',
      C4: 'Simon',
      F4: 0,
      B5: 'HBV',
      E5: 117.6,
      F5: -116.05,
      I5: '=SUM(E5:F5)',
      I8: '=SUMIF(I3:I5,">=0")',
      I9: '=SUMIF(I3:I5,"<=0")'
    },
    'Hb_ Gäste_ Damen': {
      A2: 'E-Mail',
      B2: 'Name',
      C2: 'Übertr.',
      D2: '1.',
      F2: 'Kontostand',
      B3: 'Hausbewohner',
      C3: 0,
      F3: 0,
      B4: 'Clara Schäfer',
      C4: -3.95,
      D4: 15.05,
      F4: '=SUM(C4:D4)',
      B5: 'Ehemalige Hausbewohner',
      F5: 0,
      B6: 'Titus Hille',
      C6: 11.55,
      F6: '=SUM(C6:D6)',
      F7: '=SUM(C7:D7)',
      B8: 'Gäste',
      F8: 0,
      B9: 'Sven Lange Palatia',
      C9: -76.25,
      D9: 51.45,
      F9: '=SUM(C9:D9)',
      F10: '=SUMIF(F3:F9,"<=0")',
      B11: 'Gesamt',
      C11: '=SUM(F3:F9)',
      F11: '=SUMIF(F3:F9,">=0")'
    },
    'Bilanz': {
      B9: `='Bbr_ Ak_ FK'!I9`,
      B10: `='Bbr_ Ak_ FK'!I4`,
      B11: 0,
      B12: '=AH!I8',
      B13: 0,
      B14: 0,
      B15: `='Hb_ Gäste_ Damen'!F11`,
      E9: `='Bbr_ Ak_ FK'!I10*(-1)`,
      E10: 0,
      E11: 0,
      E12: '=AH!I9*(-1)',
      E13: 0,
      E14: 0,
      E15: `='Hb_ Gäste_ Damen'!F10*(-1)`
    }
  };
}

const SHEETS = ['Bbr_ Ak_ FK', 'AH', 'Hb_ Gäste_ Damen', 'Bilanz'].map(name => ({
  name,
  rowCount: 12,
  columnCount: 9
}));

describe('readBilanz', () => {
  it('liest alle Konten, rechnet nach und stimmt mit dem Blatt Bilanz überein', () => {
    const result = readBilanz(source(miniBilanz()), SHEETS);
    expect(result.ok).to.equal(true);
    const byName = Object.fromEntries(result.accounts.map(a => [a.lastName, a]));
    expect(Object.keys(byName)).to.have.members([
      'Aktivenkasse',
      'Altenkamp',
      'Huesmann',
      'Koch',
      'AHV',
      'Slobbe',
      'HBV',
      'Schäfer',
      'Hille',
      'Palatia'
    ]);
    expect(byName.Aktivenkasse).to.include({
      category: 'kasse',
      kontoId: 'kasse-aktivenkasse',
      email: '',
      firstName: ''
    });
    expect(byName.Altenkamp).to.include({
      balanceCents: 0,
      firstName: 'Benedict',
      nickname: 'Altpapier',
      email: 'a@b.de'
    });
    expect(byName.Huesmann.balanceCents).to.equal(6735);
    expect(byName.HBV).to.include({ category: 'verein', balanceCents: 155 });
    expect(byName.Slobbe.balanceCents).to.equal(0);
    expect(byName.Schäfer).to.include({
      category: 'hausbewohner',
      status: 'aktiv',
      firstName: 'Clara',
      balanceCents: 1110
    });
    expect(byName.Hille).to.include({ status: 'inaktiv' });
    expect(byName.Palatia).to.include({ category: 'gast', balanceCents: -2480 });
    expect(result.warnings.join('\n')).to.contain('Slobbe').and.to.contain('Sven Lange Palatia');
  });

  it('meldet abweichende Summen', () => {
    const sheets = miniBilanz();
    sheets.Bilanz.B11 = 1;
    const result = readBilanz(source(sheets), SHEETS);
    expect(result.ok).to.equal(false);
  });

  it('schreibt die Prüfdatei mit deutschen Beträgen', () => {
    const csv = toImportCsv(readBilanz(source(miniBilanz()), SHEETS), 'Test');
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    expect(lines[0]).to.equal('# Test');
    expect(lines[1]).to.equal('quelle;kategorie;status;nachname;vorname;vulgo;email;saldo_excel;importieren;konto_id');
    expect(lines).to.include('Bbr_ Ak_ FK!6;aktiv;aktiv;Huesmann;Clemens;;;67,35;ja;');
  });
});
