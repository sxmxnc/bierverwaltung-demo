/* Autor: Julius Vollmer (FH Münster) mit Hilfe Claude AI, angepasst für die K.D.St.V. Sauerlandia */

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import { AdminSidebar } from './admin-sidebar';
import './admin-sidebar';

describe('admin-sidebar component', () => {
  it('rendert alle zehn Navigationspunkte (ohne "Passwort ändern")', async () => {
    const el = await fixture<AdminSidebar>(html`<admin-sidebar></admin-sidebar>`);
    await el.updateComplete;

    const labels = Array.from(el.shadowRoot!.querySelectorAll('.menu-item .label')).map(l => l.textContent?.trim());
    expect(labels).to.deep.equal([
      'Mitglieder',
      'Konto anlegen',
      'Mitglieder importieren',
      'Getränke & Preise',
      'Verbrauch',
      'Bestand',
      'Strichliste importieren',
      'Striche nachtragen',
      'Finanzen',
      'Statistik'
    ]);
    expect(labels).to.not.include('Passwort ändern');
  });

  it('markiert den aktiven Eintrag anhand von activePage', async () => {
    const el = await fixture<AdminSidebar>(html`<admin-sidebar .activePage=${'finance'}></admin-sidebar>`);
    await el.updateComplete;

    const active = el.shadowRoot!.querySelector('.menu-item.active .label');
    expect(active?.textContent?.trim()).to.equal('Finanzen');
  });

  it('feuert "page-changed" mit der Seiten-ID beim Klick auf einen Eintrag', async () => {
    const el = await fixture<AdminSidebar>(html`<admin-sidebar></admin-sidebar>`);
    await el.updateComplete;

    let page: string | null = null;
    el.addEventListener('page-changed', e => (page = (e as CustomEvent<string>).detail));

    const statItem = Array.from(el.shadowRoot!.querySelectorAll<HTMLElement>('.menu-item')).find(i =>
      i.textContent?.trim().endsWith('Statistik')
    )!;
    statItem.click();

    expect(page).to.equal('stats');
  });
});
