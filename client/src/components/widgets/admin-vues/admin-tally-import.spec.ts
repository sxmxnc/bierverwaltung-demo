/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import sinon from 'sinon';
import { AdminTallyImport } from './admin-tally-import';
import './admin-tally-import';
import { tallyImportService } from '../../../services/tally-import-service';
import { TallyImportPreview } from '../../../models/tally-import';

const preview: TallyImportPreview = {
  version: 2,
  typ: 'export',
  savedAt: null,
  warnings: [],
  missingDrinks: [],
  lists: [
    {
      key: 'uid:a',
      name: 'Liste 8',
      datum: '2026-11-20',
      monat: '2026-11',
      notiz: '',
      status: 'neu',
      actions: ['buchen', 'bilanz', 'ueberspringen'],
      defaultAction: 'buchen',
      personCount: 2,
      strokeCount: 5,
      total: 6.25,
      previous: null
    },
    {
      key: 'uid:b',
      name: 'Liste 1',
      datum: null,
      monat: null,
      notiz: '',
      status: 'bilanz',
      actions: ['ueberspringen'],
      defaultAction: 'ueberspringen',
      personCount: 3,
      strokeCount: 9,
      total: 11,
      previous: { id: 'i1', listName: 'Liste 1', status: 'bilanz', importedAt: '2026-11-12T10:00:00Z', total: 11 }
    }
  ],
  persons: [
    {
      toolId: 'p1',
      label: 'Benedikt Altenkamp (Altpapier)',
      gruppe: 'Bbr/Ak/FK',
      strokes: 3,
      lists: ['uid:a'],
      match: { userId: 'u1', confidence: 'sicher', reason: 'Konto aus dem Tool' }
    },
    {
      toolId: 'p2',
      label: 'Stöcki',
      gruppe: 'Zuordnung offen',
      strokes: 2,
      lists: ['uid:a'],
      match: { userId: null, confidence: 'offen', reason: 'kein passendes Konto' }
    }
  ],
  accounts: [
    { id: 'u1', name: 'Altpapier', fullName: 'Benedict Altenkamp', role: 'user' },
    { id: 'u2', name: 'Stöcki', fullName: 'Andreas Stöcklein', role: 'user' }
  ]
};

async function selectFile(el: AdminTallyImport) {
  const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([JSON.stringify({ format: 'strichlisten-erfassung' })], 'export.json', {
    type: 'application/json'
  });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  // Datei lesen und Vorschau laden laufen asynchron – warten, bis die Vorschau da ist
  for (let i = 0; i < 50 && !el.shadowRoot!.querySelector('.summary'); i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
    await el.updateComplete;
  }
}

describe('admin-tally-import component', () => {
  let el: AdminTallyImport;

  beforeEach(async () => {
    sinon.stub(tallyImportService, 'history').resolves([]);
    sinon.stub(tallyImportService, 'preview').resolves(preview);
    el = await fixture<AdminTallyImport>(html`<admin-tally-import></admin-tally-import>`);
    await el.updateComplete;
  });

  afterEach(() => sinon.restore());

  it('zeigt nach dem Hochladen die Listen mit Status', async () => {
    await selectFile(el);
    const statuses = Array.from(el.shadowRoot!.querySelectorAll('.lists .status')).map(s => s.textContent?.trim());
    expect(statuses).to.deep.equal(['Neu', 'In der Bilanz']);
  });

  it('Buchen bleibt gesperrt, bis jede Person einem Konto zugeordnet ist', async () => {
    await selectFile(el);
    const button = () => el.shadowRoot!.querySelector<HTMLButtonElement>('.summary button')!;
    expect(button().disabled).to.equal(true);

    const select = el.shadowRoot!.querySelector<HTMLSelectElement>('.persons .row.missing select')!;
    select.value = 'u2';
    select.dispatchEvent(new Event('change'));
    await el.updateComplete;
    expect(button().disabled).to.equal(false);
  });

  it('schickt Aktionen, Datum und Zuordnungen zum Buchen', async () => {
    const book = sinon.stub(tallyImportService, 'book').resolves({ booked: 1, marked: 0, orders: 2, total: 6.25 });
    await selectFile(el);
    const select = el.shadowRoot!.querySelector<HTMLSelectElement>('.persons .row.missing select')!;
    select.value = 'u2';
    select.dispatchEvent(new Event('change'));
    await el.updateComplete;

    el.shadowRoot!.querySelector<HTMLButtonElement>('.summary button')!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    await el.updateComplete;

    const body = book.firstCall.args[0];
    expect(body.lists['uid:a']).to.deep.equal({ action: 'buchen', bookingDate: '2026-11-20' });
    expect(body.lists['uid:b'].action).to.equal('ueberspringen');
    expect(body.persons).to.deep.equal({ p1: 'u1', p2: 'u2' });
    expect(el.shadowRoot!.querySelector('.success')?.textContent).to.contain('1 Listen gebucht');
  });
});
