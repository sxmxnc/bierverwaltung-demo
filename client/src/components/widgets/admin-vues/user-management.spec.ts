/* Autor: Julius Vollmer (FH Münster) mit Hilfe Claude AI*/

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import { UserManagement } from './user-management';
import './user-management';
import { User } from '../../../models/user';

const mockUsers: User[] = [
  {
    id: 'user-1',
    createdAt: 1622034000000,
    firstName: 'Max',
    lastName: 'Mustermann',
    email: 'max@mustermann.de',
    residence: 'Berlin',
    role: 'user',
    balance: -10.5,
    status: 'active',
    sepaMandate: {
      creditorName: 'Test GmbH',
      creditorId: 'DE98ZZZ00000000001',
      debtorName: 'Max Mustermann',
      debtorBank: 'Bank Berlin',
      iban: 'DE1234567890'
    }
  },
  {
    id: 'user-2',
    createdAt: 1622034100000,
    firstName: 'Erika',
    lastName: 'Musterfrau',
    email: 'erika@musterfrau.de',
    residence: 'Köln',
    role: 'admin',
    balance: 25.0,
    status: 'active',
    sepaMandate: {
      creditorName: 'Test GmbH',
      creditorId: 'DE98ZZZ00000000001',
      debtorName: 'Erika Musterfrau',
      debtorBank: 'Bank Köln',
      iban: 'DE9876543210'
    }
  }
];

describe('user-management component', () => {
  let element: UserManagement;

  beforeEach(async () => {
    element = await fixture<UserManagement>(html`<user-management></user-management>`);
    // Set mocks directly to bypass real service call (Zugriff auf interne @state-Felder)
    const internals = element as unknown as Record<string, unknown>;
    internals.users = mockUsers;
    internals.isLoading = false;
    await element.updateComplete;
  });

  it('should render the search input and title', () => {
    const title = element.shadowRoot!.querySelector('h1');
    expect(title?.textContent?.trim()).to.equal('Mitglieder');

    const searchInput = element.shadowRoot!.querySelector('#search-input');
    expect(searchInput).to.not.be.null;
  });

  it('should render all users in the table', () => {
    const rows = element.shadowRoot!.querySelectorAll('.user-row');
    expect(rows.length).to.equal(2);

    const firstRowName = rows[0].querySelector('.user-name-cell strong');
    expect(firstRowName?.textContent?.trim()).to.equal('Max Mustermann');
  });

  it('should filter users based on search input', async () => {
    // Set query to 'Erika'
    (element as unknown as Record<string, unknown>).searchQuery = 'Erika';
    await element.updateComplete;

    const rows = element.shadowRoot!.querySelectorAll('.user-row');
    expect(rows.length).to.equal(1);

    const nameCell = rows[0].querySelector('.user-name-cell strong');
    expect(nameCell?.textContent?.trim()).to.equal('Erika Musterfrau');
  });

  it('should open the modal when a user row is clicked', async () => {
    const firstRow = element.shadowRoot!.querySelector<HTMLElement>('.user-row')!;
    firstRow.click();
    await element.updateComplete;

    const modal = element.shadowRoot!.querySelector('#detail-modal-overlay');
    expect(modal).to.not.be.null;

    const modalTitle = element.shadowRoot!.querySelector('.modal-subtitle');
    expect(modalTitle?.textContent).to.contain('Max Mustermann');
  });
});
