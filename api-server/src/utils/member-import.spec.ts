/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { expect } from 'chai';
import { Payment } from '../models/payment.js';
import { User } from '../models/user-auth.js';
import { MemberImportError, parseEuro, parseImportCsv, planImport } from './member-import.js';

const HEADER = 'quelle;kategorie;status;nachname;vorname;vulgo;email;saldo_excel;importieren;konto_id';
const csv = (...rows: string[]) => ['\uFEFF# Quelle: Test', HEADER, ...rows].join('\r\n');

function user(
  id: string,
  firstName: string,
  lastName: string,
  email = `${id}@mitglied.invalid`,
  role: User['role'] = 'user'
) {
  return { id, firstName, lastName, email, role, status: 'active', password: '' } as User;
}

describe('parseImportCsv', () => {
  it('liest die Prüfdatei samt Kommentarzeile, Anführungszeichen und deutschen Beträgen', () => {
    const { rows, errors, meta } = parseImportCsv(
      csv(
        'Bbr_ Ak_ FK!30;aktiv;aktiv;Huesmann;Clemens;"PBW; Porno";;319,38;ja;',
        'AH!5;ah;aktiv;Altenkamp;Ludger;Lulu;LULU@EXAMPLE.ORG;-1.234,50;nein;'
      )
    );
    expect(errors).to.deep.equal([]);
    expect(meta).to.equal('Quelle: Test');
    expect(rows[0]).to.include({ nickname: 'PBW; Porno', balanceCents: 31938, include: true, line: 3 });
    expect(rows[1]).to.include({ email: 'lulu@example.org', balanceCents: -123450, include: false });
  });

  it('meldet Fehler je Zeile', () => {
    const { errors } = parseImportCsv(
      csv('X!1;mitglied;aktiv;A;B;;;1,00;ja;', 'X!2;ah;weg;A;B;;kaputt;abc;ja;', 'X!2;ah;aktiv;;;;;0;ja;')
    );
    expect(errors.join('\n'))
      .to.contain('unbekannte Kategorie')
      .and.to.contain('Status')
      .and.to.contain('keine Zahl')
      .and.to.contain('ungültig')
      .and.to.contain('Name fehlt')
      .and.to.contain('doppelt');
  });

  it('lehnt Dateien ohne passende Kopfzeile ab', () => {
    expect(() => parseImportCsv('a;b;c\n1;2;3')).to.throw(MemberImportError, /Kopfzeile/);
  });

  it('parseEuro', () => {
    expect(parseEuro('1.234,56')).to.equal(123456);
    expect(parseEuro('-7,15')).to.equal(-715);
    expect(parseEuro('12.5')).to.equal(1250);
    expect(parseEuro('')).to.equal(0);
    expect(parseEuro('12,345')).to.equal(null);
  });
});

describe('planImport', () => {
  const rows = parseImportCsv(
    csv(
      'Bbr_ Ak_ FK!4;kasse;aktiv;Aktivenkasse;;;;316,25;ja;kasse-aktivenkasse',
      'Bbr_ Ak_ FK!7;aktiv;aktiv;Altenkamp;Benedict;Altpapier;;0;ja;',
      'Bbr_ Ak_ FK!8;aktiv;aktiv;Neu;Nina;;nina@example.org;5,00;ja;',
      'AH!9;ah;aktiv;Alt;Herr;;;0;nein;'
    )
  ).rows;

  it('ordnet zu, legt neu an, überspringt', () => {
    const users = [
      user('kasse-aktivenkasse', 'Aktivenkasse', '', 'a@kasse.invalid', 'kasse'),
      user('u1', 'Benedict', 'Altenkamp')
    ];
    const plan = planImport(rows, users, []);
    expect(plan.map(r => r.action)).to.deep.equal(['zuordnen', 'zuordnen', 'anlegen', 'ueberspringen']);
    expect(plan[1].targetId).to.equal('u1');
  });

  it('erkennt schon übernommene Konten und mehrdeutige Namen', () => {
    const users = [
      user('kasse-aktivenkasse', 'Aktivenkasse', '', 'a@kasse.invalid', 'kasse'),
      user('u1', 'Benedict', 'Altenkamp'),
      user('u2', 'Benedict', 'Altenkamp')
    ];
    const payments = [{ userId: 'kasse-aktivenkasse', kind: 'uebertrag', amount: -316.25 }] as Payment[];
    const plan = planImport(rows, users, payments);
    expect(plan[0].action).to.equal('schon_uebernommen');
    expect(plan[1].action).to.equal('fehler');
  });

  it('unbekannte konto_id ist ein Fehler', () => {
    const plan = planImport(rows, [], []);
    expect(plan[0]).to.include({ action: 'fehler' });
  });
});

describe('planImport mit Sammelkonten', () => {
  it('erkennt AHV/HBV beim zweiten Durchlauf wieder', () => {
    const rows = parseImportCsv(csv('AH!84;verein;aktiv;HBV;;;;1,55;ja;')).rows;
    const hbv = {
      id: 'k1',
      firstName: 'HBV',
      lastName: '',
      email: 'x@mitglied.invalid',
      role: 'kasse',
      status: 'active'
    } as User;
    expect(planImport(rows, [hbv], [])[0]).to.include({ action: 'zuordnen', targetId: 'k1' });
    const done = planImport(rows, [hbv], [{ userId: 'k1', kind: 'uebertrag' } as Payment]);
    expect(done[0].action).to.equal('schon_uebernommen');
  });
});
