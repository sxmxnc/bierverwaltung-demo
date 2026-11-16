/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { expect } from 'chai';
import { parseTallyFile, TallyFileError } from './tally-file.js';

const DRINKS = [
  { key: 'bit03', name: 'Bitburger 0,3', preis_eur: 1.25 },
  { key: 'bit02', name: 'Bitburger 0,2', preis_eur: 0.85 },
  { key: 'weizen', name: 'Weizen / Weizen alkoholfrei 0,5', preis_eur: 1.5 }
];

function toolFile(version = 2, overrides: Record<string, unknown> = {}) {
  const lists: Record<string, string>[] =
    version >= 2
      ? [
          { id: 'l1', uid: 'uid-1', name: 'Liste 1', monat: '2026-11', datum: '2026-11-20', notiz: '' },
          { id: 'l2', uid: 'uid-2', name: 'Liste 2', monat: '', datum: '', notiz: '' }
        ]
      : [
          { id: 'l1', name: 'Liste 1', monat: '', notiz: '' },
          { id: 'l2', name: 'Liste 2', monat: '', notiz: '' }
        ];
  return {
    format: 'strichlisten-erfassung',
    version,
    typ: 'export',
    getraenke: DRINKS,
    zwischenstand: {
      v: version,
      lists,
      persons: [
        {
          id: 'p1',
          gruppe: 'Bbr/Ak/FK',
          name: 'Altenkamp',
          vorname: 'Benedikt',
          nachname: 'Altenkamp',
          vo: 'Altpapier',
          konto_id: 'u1'
        },
        { id: 'p2', gruppe: 'Gäste', name: 'Sven Lange', vorname: 'Sven', nachname: 'Lange', vo: '' }
      ],
      entries: { l1: { p1: [2, 0, 1], p2: [0, 3] }, l2: {} }
    },
    ...overrides
  };
}

describe('parseTallyFile', () => {
  it('liest Version 2 mit uid, Datum und konto_id', () => {
    const file = parseTallyFile(toolFile());
    expect(file.version).to.equal(2);
    expect(file.lists).to.have.length(2);
    const [first, second] = file.lists;
    expect(first.key).to.equal('uid:uid-1');
    expect(first.datum).to.equal('2026-11-20');
    expect(first.strokeCount).to.equal(6);
    expect(first.totalCents).to.equal(2 * 125 + 150 + 3 * 85);
    expect(first.lines).to.deep.include({ personId: 'p2', drinkKey: 'bit02', count: 3, price: 0.85 });
    expect(second.lines).to.have.length(0);
    expect(file.persons[0].kontoId).to.equal('u1');
    expect(file.persons[1].kontoId).to.equal('');
  });

  it('Version 1: Kennung aus dem Inhalt, gleiche Prüfsumme wie in Version 2', () => {
    const v1 = parseTallyFile(toolFile(1));
    const v2 = parseTallyFile(toolFile(2));
    expect(v1.lists[0].key).to.match(/^v1:[a-f0-9]{64}$/);
    expect(v1.lists[0].contentHash).to.equal(v2.lists[0].contentHash);
    expect(v1.warnings.join(' ')).to.contain('Version 1');
  });

  it('Prüfsumme hängt nicht von der Reihenfolge ab, wohl aber vom Inhalt', () => {
    const a = toolFile();
    const b = toolFile();
    b.zwischenstand.entries.l1 = { p2: [0, 3], p1: [2, 0, 1] };
    expect(parseTallyFile(a).lists[0].contentHash).to.equal(parseTallyFile(b).lists[0].contentHash);
    b.zwischenstand.entries.l1 = { p2: [0, 4], p1: [2, 0, 1] };
    expect(parseTallyFile(a).lists[0].contentHash).not.to.equal(parseTallyFile(b).lists[0].contentHash);
  });

  it('lehnt fremde Dateien und unbekannte Versionen ab', () => {
    expect(() => parseTallyFile({ format: 'strichlisten-personen', version: 1 })).to.throw(TallyFileError);
    expect(() => parseTallyFile(toolFile(3))).to.throw(TallyFileError, /Version 3/);
    expect(() => parseTallyFile('kein objekt')).to.throw(TallyFileError);
  });

  it('lehnt Version 2 ohne uid und doppelte uids ab', () => {
    const missing = toolFile();
    delete (missing.zwischenstand.lists[0] as { uid?: string }).uid;
    expect(() => parseTallyFile(missing)).to.throw(TallyFileError, /uid/);
    const duplicate = toolFile();
    duplicate.zwischenstand.lists[1].uid = 'uid-1';
    expect(() => parseTallyFile(duplicate)).to.throw(TallyFileError, /doppelt/);
  });

  it('lehnt ungültige Zähler, unbekannte Personen und zu lange Zählerlisten ab', () => {
    const negative = toolFile();
    negative.zwischenstand.entries.l1 = { p1: [-1] } as never;
    expect(() => parseTallyFile(negative)).to.throw(TallyFileError, /ungültige Anzahl/);
    const unknown = toolFile();
    unknown.zwischenstand.entries.l1 = { p9: [1] } as never;
    expect(() => parseTallyFile(unknown)).to.throw(TallyFileError, /unbekannte Person/);
    const tooLong = toolFile();
    tooLong.zwischenstand.entries.l1 = { p1: [1, 1, 1, 1] } as never;
    expect(() => parseTallyFile(tooLong)).to.throw(TallyFileError, /Getränkeliste/);
  });

  it('prüft die Summen im Export gegen die Striche', () => {
    const ok = toolFile(2, {
      listen: [
        { uid: 'uid-1', name: 'Liste 1', summe: { betrag_eur: 6.55 } },
        { uid: 'uid-2', name: 'Liste 2', summe: { betrag_eur: 0 } }
      ]
    });
    expect(() => parseTallyFile(ok)).not.to.throw();
    const wrong = toolFile(2, {
      listen: [
        { uid: 'uid-1', name: 'Liste 1', summe: { betrag_eur: 7 } },
        { uid: 'uid-2', name: 'Liste 2', summe: { betrag_eur: 0 } }
      ]
    });
    expect(() => parseTallyFile(wrong)).to.throw(TallyFileError, /passt nicht/);
  });

  it('ignoriert ungültige Datumsangaben', () => {
    const file = toolFile();
    file.zwischenstand.lists[0].datum = '2026-02-30';
    expect(parseTallyFile(file).lists[0].datum).to.equal(null);
  });
});
