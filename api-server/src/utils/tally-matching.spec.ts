/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { expect } from 'chai';
import { Drink } from '../models/drink.js';
import { TallyImport } from '../models/tally-import.js';
import { User } from '../models/user-auth.js';
import { ToolList, ToolPerson } from './tally-file.js';
import { aliasKey, listState, mapDrinks, matchPerson } from './tally-matching.js';

function user(
  id: string,
  firstName: string,
  lastName: string,
  nickname: string | null = null,
  role: User['role'] = 'user'
) {
  return {
    id,
    createdAt: 0,
    firstName,
    lastName,
    nickname,
    email: `${id}@x`,
    password: '',
    residence: '',
    role,
    status: 'active'
  } as User;
}

function person(overrides: Partial<ToolPerson>): ToolPerson {
  return { id: 'p1', gruppe: '', name: '', vorname: '', nachname: '', vo: '', kontoId: '', ...overrides };
}

const accounts = [
  user('kasse-aktivenkasse', 'Aktivenkasse', '', 'Quaestor', 'kasse'),
  user('u-altenkamp-b', 'Benedict', 'Altenkamp', 'Altpapier'),
  user('u-altenkamp-l', 'Ludger', 'Altenkamp', 'Lulu'),
  user('u-bleck', 'Jan Frederic', 'Bleck', 'JFB'),
  user('u-drewes', 'Maximilian', 'Drewes', 'Asta')
];

describe('matchPerson', () => {
  it('nimmt die konto_id aus dem Tool', () => {
    const match = matchPerson(person({ kontoId: 'u-bleck', vorname: 'X' }), accounts, new Map());
    expect(match).to.include({ userId: 'u-bleck', confidence: 'sicher' });
  });

  it('nimmt eine gemerkte Zuordnung', () => {
    const p = person({ vorname: 'Stöcki', vo: 'Stöcki' });
    const match = matchPerson(p, accounts, new Map([[aliasKey(p), 'u-drewes']]));
    expect(match).to.include({ userId: 'u-drewes', confidence: 'sicher' });
  });

  it('erkennt Kassen wie auf der Papierliste', () => {
    const match = matchPerson(person({ vorname: 'Quaestor', nachname: 'Aktivenkasse' }), accounts, new Map());
    expect(match.userId).to.equal('kasse-aktivenkasse');
  });

  it('abgekürzter Vorname passt, mehrdeutiger Nachname nicht', () => {
    expect(matchPerson(person({ vorname: 'Jan-Freder.', nachname: 'Bleck' }), accounts, new Map())).to.include({
      userId: 'u-bleck',
      confidence: 'vorschlag'
    });
    // "Benedikt" ≠ "Benedict", aber die V/o ist eindeutig
    expect(
      matchPerson(person({ vorname: 'Benedikt', nachname: 'Altenkamp', vo: 'Altpapier' }), accounts, new Map()).userId
    ).to.equal('u-altenkamp-b');
    // ohne V/o: zwei Altenkamps → offen
    expect(matchPerson(person({ vorname: 'Benedikt', nachname: 'Altenkamp' }), accounts, new Map())).to.include({
      userId: null,
      confidence: 'offen'
    });
  });

  it('"Max" passt nicht als Vorname zu "Maximilian", der eindeutige Nachname ergibt nur einen Vorschlag', () => {
    const match = matchPerson(person({ vorname: 'Max', nachname: 'Drewes' }), accounts, new Map());
    expect(match).to.include({ userId: 'u-drewes', confidence: 'vorschlag', reason: 'nur Nachname' });
  });

  it('unbekannte konto_id führt nicht zu einem falschen Konto', () => {
    const match = matchPerson(person({ kontoId: 'geloescht', vorname: 'Foo', nachname: 'Bar' }), accounts, new Map());
    expect(match).to.include({ userId: null, confidence: 'offen' });
  });
});

describe('listState', () => {
  const list = (key: string, contentHash: string, lines = 1) =>
    ({ key, contentHash, lines: new Array(lines).fill({}) }) as unknown as ToolList;
  const imported = (listKey: string, contentHash: string, status: TallyImport['status'] = 'gebucht') =>
    ({ id: 'i1', listKey, contentHash, status }) as TallyImport;

  it('neu, unverändert, geändert, leer', () => {
    expect(listState(list('uid:a', 'h1'), []).status).to.equal('neu');
    expect(listState(list('uid:a', 'h1'), [imported('uid:a', 'h1')]).status).to.equal('importiert');
    const changed = listState(list('uid:a', 'h2'), [imported('uid:a', 'h1')]);
    expect(changed.status).to.equal('geaendert');
    expect(changed.defaultAction).to.equal('ersetzen');
    expect(listState(list('uid:b', 'h0', 0), []).status).to.equal('leer');
  });

  it('erkennt eine als Version 1 markierte Liste nach dem Wechsel auf Version 2 am Inhalt', () => {
    const state = listState(list('uid:neu', 'h1'), [imported('v1:h1', 'h1', 'bilanz')]);
    expect(state.status).to.equal('bilanz');
    expect(state.actions).to.deep.equal(['ueberspringen']);
  });
});

describe('mapDrinks', () => {
  it('ordnet über die ID, sonst über Name und Einheit zu', () => {
    const drinks = [
      { id: 'drink-bitburger-03', name: 'Bitburger', unit: '0,3 l' },
      { id: 'zufall-123', name: 'Weizen', unit: '0,5 l' }
    ] as Drink[];
    const { map, missing } = mapDrinks(['bit03', 'weizen', 'wasser', 'unbekannt'], drinks);
    expect(map.get('bit03')!.id).to.equal('drink-bitburger-03');
    expect(map.get('weizen')!.id).to.equal('zufall-123');
    expect(missing).to.deep.equal(['wasser', 'unbekannt']);
  });
});
