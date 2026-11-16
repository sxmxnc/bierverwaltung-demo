/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { expect } from 'chai';
import { BankCsvError, decodeBankCsv, parseAmount, parseBankCsv, parseDate } from './bank-csv.js';

// Aufbau wie der aktuelle CSV-Export im Online-Banking der Volksbanken (alle Daten erfunden)
const ATRUVIA_HEADER =
  'Bezeichnung Auftragskonto;IBAN Auftragskonto;BIC Auftragskonto;Bankname Auftragskonto;Buchungstag;Valutadatum;' +
  'Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;BIC (SWIFT-Code) Zahlungsbeteiligter;Buchungstext;' +
  'Verwendungszweck;Betrag;Waehrung;Saldo nach Buchung;Bemerkung;Kategorie;Steuerrelevant;Glaeubiger ID;Mandatsreferenz';
const OWN = 'Bierkasse;DE00000000000000000000;GENODEXXXXX;Volksbank Musterstadt eG';

function atruvia(...rows: string[]): string {
  return [ATRUVIA_HEADER, ...rows.map(row => `${OWN};${row}`)].join('\r\n') + '\r\n';
}

describe('Bank-CSV: parseBankCsv', () => {
  it('liest den Volksbank-Export (Atruvia) mit Eingängen und Ausgängen', () => {
    const csv = atruvia(
      '15.10.2026;15.10.2026;Max Mustermann;DE11111111111111111111;GENODEF1AAA;Gutschrift;Bierkasse BK-0005;20,00;EUR;1.520,00;;;;;',
      '16.10.2026;16.10.2026;Getränke Hoffmann GmbH;DE22222222222222222222;;Lastschrift;Rechnung 4711;-1.234,56;EUR;285,44;;;;DE98ZZZ09999999999;M-1'
    );
    const { transactions, skippedLines } = parseBankCsv(csv);

    expect(skippedLines).to.deep.equal([]);
    expect(transactions).to.have.length(2);
    expect(transactions[0]).to.include({
      line: 2,
      bookingDate: '2026-10-15',
      name: 'Max Mustermann',
      iban: 'DE11111111111111111111',
      purpose: 'Bierkasse BK-0005',
      amountCents: 2000,
      currency: 'EUR'
    });
    expect(transactions[1].amountCents).to.equal(-123456);
    expect(transactions[1].name).to.equal('Getränke Hoffmann GmbH');
    expect(transactions[0].fingerprint).to.match(/^[a-f0-9]{64}$/);
  });

  it('liest das ältere VR-Format mit Kopfblock, Soll/Haben-Spalte, Zeilenumbrüchen und Windows-1252', () => {
    const csv = [
      '"Volksbank Musterstadt eG"',
      '"Umsatzanzeige"',
      '"Kontonummer:";"1234567";"Bierkasse"',
      '"Zeitraum:";"01.10.2026";"bis";"31.10.2026"',
      '',
      '"Buchungstag";"Valuta";"Auftraggeber/Zahlungsempfänger";"Empfänger/Zahlungspflichtiger";"Konto-Nr.";"IBAN";"BLZ";"BIC";"Vorgang/Verwendungszweck";"Kundenreferenz";"Währung";"Umsatz";" "',
      '"02.10.2026";"02.10.2026";"Bierkasse";"Jörg Müller";"";"DE33333333333333333333";"";"";"Gutschrift',
      'Bierkasse BK-0012";"";"EUR";"15,50";"H"',
      '"05.10.2026";"05.10.2026";"Bierkasse";"Brauerei Beispiel";"";"DE44444444444444444444";"";"";"Lastschrift Fass";"";"EUR";"89,00";"S"',
      '"01.10.2026";;;;;;;;;"Anfangssaldo";"EUR";"100,00";"H"',
      '"31.10.2026";;;;;;;;;"Endsaldo";"EUR";"26,50";"H"'
    ].join('\r\n');
    const { transactions, skippedLines } = parseBankCsv(decodeBankCsv(Buffer.from(csv, 'latin1')));

    expect(skippedLines).to.deep.equal([]);
    expect(transactions).to.have.length(2);
    expect(transactions[0]).to.include({
      line: 7,
      bookingDate: '2026-10-02',
      name: 'Jörg Müller',
      iban: 'DE33333333333333333333',
      purpose: 'Gutschrift Bierkasse BK-0012',
      amountCents: 1550
    });
    expect(transactions[1]).to.include({ name: 'Brauerei Beispiel', amountCents: -8900 });
  });

  it('erkennt UTF-8 mit BOM', () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const csv = atruvia('01.10.2026;01.10.2026;Jörg Müller;;;Gutschrift;Bier;5,00;EUR;;;;;;');
    const { transactions } = parseBankCsv(decodeBankCsv(Buffer.concat([bom, Buffer.from(csv, 'utf8')])));
    expect(transactions[0].name).to.equal('Jörg Müller');
  });

  it('akzeptiert auch Tabulator als Trennzeichen und Spalten in anderer Reihenfolge', () => {
    const csv = 'Betrag\tVerwendungszweck\tDatum\tName\n7,50\tBK 3\t2026-10-03\tFuxmajor\n';
    const { transactions } = parseBankCsv(csv);
    expect(transactions[0]).to.include({
      bookingDate: '2026-10-03',
      name: 'Fuxmajor',
      purpose: 'BK 3',
      amountCents: 750
    });
  });

  it('meldet Datenzeilen, die nicht gelesen werden können, mit Zeilennummer', () => {
    const csv = atruvia(
      'kein Datum;;Max;;;Gutschrift;Bier;5,00;EUR;;;;;;',
      '03.10.2026;03.10.2026;Max;;;Gutschrift;Bier;fünf Euro;EUR;;;;;;',
      '04.10.2026;04.10.2026;Max;;;Gutschrift;Bier;5,00;EUR;;;;;;'
    );
    const { transactions, skippedLines } = parseBankCsv(csv);
    expect(skippedLines).to.deep.equal([2, 3]);
    expect(transactions).to.have.length(1);
  });

  it('wirft einen verständlichen Fehler, wenn keine Kopfzeile gefunden wird', () => {
    expect(() => parseBankCsv('Hallo;Welt\n1;2\n')).to.throw(BankCsvError, /Kopfzeile/);
  });

  describe('Fingerabdruck gegen Doppelimport', () => {
    const row =
      '15.10.2026;15.10.2026;Max Mustermann;DE11111111111111111111;;Gutschrift;Bierkasse BK-0005;10,00;EUR;;;;;;';

    it('unterscheidet zwei gleiche Überweisungen am selben Tag', () => {
      const { transactions } = parseBankCsv(atruvia(row, row));
      expect(transactions[0].fingerprint).to.not.equal(transactions[1].fingerprint);
    });

    it('ist in einem überlappenden Export gleich, auch bei anderem Zeilenumbruch und anderer Position', () => {
      const first = parseBankCsv(atruvia(row, row)).transactions;
      const wrapped = row.replace('Bierkasse BK-0005', '"Bierkasse\nBK-0005"');
      const later = parseBankCsv(
        atruvia('20.10.2026;20.10.2026;Paul;;;Gutschrift;Bier;3,00;EUR;;;;;;', wrapped, wrapped)
      ).transactions;
      expect(later.slice(1).map(t => t.fingerprint)).to.deep.equal(first.map(t => t.fingerprint));
    });

    it('ändert sich, wenn sich Betrag oder Buchungstag ändern', () => {
      const [a] = parseBankCsv(atruvia(row)).transactions;
      const [b] = parseBankCsv(atruvia(row.replace('10,00', '10,01'))).transactions;
      const [c] = parseBankCsv(atruvia(row.replace(/^15\.10/, '16.10'))).transactions;
      expect(new Set([a.fingerprint, b.fingerprint, c.fingerprint]).size).to.equal(3);
    });
  });
});

describe('Bank-CSV: parseAmount', () => {
  const cases: [string, number | null][] = [
    ['20,00', 2000],
    ['-12,50', -1250],
    ['1.234,56', 123456],
    ['-1.234.567,8', -123456780],
    ['12,5', 1250],
    ['+5', 500],
    ['12,50-', -1250],
    ['12,50 €', 1250],
    ['12.50', 1250],
    ['1.234', 123400],
    ['12,345', null],
    ['abc', null],
    ['', null]
  ];
  for (const [input, expected] of cases) {
    it(`"${input}" → ${expected}`, () => expect(parseAmount(input)).to.equal(expected));
  }
});

describe('Bank-CSV: parseDate', () => {
  it('liest deutsches und ISO-Datum', () => {
    expect(parseDate('15.10.2026')).to.equal('2026-10-15');
    expect(parseDate('5.1.26')).to.equal('2026-01-05');
    expect(parseDate('2026-10-15')).to.equal('2026-10-15');
  });

  it('lehnt ungültige Daten ab', () => {
    expect(parseDate('31.02.2026')).to.equal(null);
    expect(parseDate('Oktober')).to.equal(null);
  });
});
