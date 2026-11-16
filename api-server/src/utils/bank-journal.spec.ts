/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { expect } from 'chai';
import { BankIban } from '../models/bank.js';
import { User } from '../models/user-auth.js';
import { checkChain, suggest } from './bank-journal.js';

const e = (bookingDate: string, amount: number, balanceAfter: number) => ({ bookingDate, amount, balanceAfter });

describe('checkChain', () => {
  it('lückenlose Kette, auch bei unbekannter Reihenfolge innerhalb eines Tages', () => {
    const chain = checkChain([
      e('2026-11-04', 42.45, 1807),
      e('2026-11-04', 250, 1764.55),
      e('2026-11-03', 101.5, 1514.55)
    ]);
    expect(chain.ok).to.equal(true);
    expect(chain.lastBalanceCents).to.equal(180700);
    expect(chain.lastDate).to.equal('2026-11-04');
  });

  it('findet eine Lücke zwischen zwei Exporten', () => {
    const chain = checkChain([e('2026-05-13', -230.76, 1912.89), e('2026-08-10', 20, 1469.59)]);
    expect(chain.ok).to.equal(false);
    expect(chain.gaps[0]).to.deep.include({
      afterDate: '2026-05-13',
      beforeDate: '2026-08-10',
      expectedCents: 191289,
      foundCents: 144959
    });
  });

  it('ignoriert Buchungen ohne Saldo', () => {
    expect(checkChain([{ bookingDate: '2026-01-01', amount: 5, balanceAfter: null }]).checked).to.equal(0);
  });
});

describe('suggest', () => {
  const user = (id: string, firstName: string, lastName: string, nickname: string | null = null) =>
    ({ id, firstName, lastName, nickname, role: 'user', status: 'active' }) as User;
  const accounts = [
    user('bleck', 'Jan Frederic', 'Bleck', 'JFB'),
    user('ab', 'Benedict', 'Altenkamp', 'Altpapier'),
    user('al', 'Ludger', 'Altenkamp', 'Lulu'),
    user('koch', 'Julius', 'Koch')
  ];
  const balances = new Map([
    ['bleck', -250],
    ['ab', -32.05]
  ]);
  const tx = (amount: number, name: string, purpose = '', iban = '') => ({ amount, name, purpose, iban });

  it('Name und offener Betrag → sicher', () => {
    expect(suggest(tx(250, 'Jan Frederic Bleck', 'Bierschulden JFB'), accounts, [], balances)).to.include({
      userId: 'bleck',
      confidence: 'sicher'
    });
  });

  it('zwei Altenkamps: Vorname entscheidet, Betrag allein nicht', () => {
    expect(suggest(tx(32.05, 'Benedict Maria Altenkamp'), accounts, [], balances).userId).to.equal('ab');
    expect(suggest(tx(10, 'Familie Altenkamp'), accounts, [], balances)).to.include({
      userId: null,
      confidence: 'keine'
    });
  });

  it('bekannte IBAN, und IBANs für mehrere Konten werden nie automatisch zugeordnet', () => {
    const ibans = [
      { iban: 'DE1', userId: 'koch', askAlways: false },
      { iban: 'DE2', userId: null, askAlways: true }
    ] as BankIban[];
    expect(suggest(tx(50, 'Irgendwer', '', 'DE1'), accounts, ibans, balances)).to.include({
      userId: 'koch',
      confidence: 'sicher'
    });
    expect(suggest(tx(50, 'Julius Koch', '', 'DE2'), accounts, ibans, balances)).to.include({
      userId: null,
      askAlways: true
    });
  });

  it('Rechnungen, Roth und Aktivitas', () => {
    expect(suggest(tx(475.4, 'Christoph Backmann', 'Rechnung 112026-04'), accounts, [], balances).category).to.equal(
      'rechnung'
    );
    expect(suggest(tx(-528.41, 'Getraenke Roth GmbH', 'RechNr 066660'), accounts, [], balances).category).to.equal(
      'roth'
    );
    expect(
      suggest(tx(101.5, 'K.D.St.V. Sauerlandia Münster', 'Amel und Jan-Bernd'), accounts, [], balances)
    ).to.include({
      askAlways: true,
      userId: null
    });
  });
});
