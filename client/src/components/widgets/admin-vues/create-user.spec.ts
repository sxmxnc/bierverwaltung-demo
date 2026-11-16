/* Autor: Julius Vollmer (FH Münster) mit Hilfe Claude AI, angepasst für die K.D.St.V. Sauerlandia */

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import sinon from 'sinon';
import { CreateUser } from './create-user';
import './create-user';
import { CreateUserData, userService } from '../../../services/user-service';
import { User } from '../../../models/user';

type CreateUserInternals = {
  firstName: string;
  lastName: string;
  email: string;
  residence: string;
  selectedRole: 'user' | 'admin' | 'theke' | 'kasse';
};

function fillValid(el: CreateUser) {
  Object.assign(el as unknown as CreateUserInternals, {
    firstName: 'Max',
    lastName: 'Mustermann',
    email: 'MAX@Example.COM',
    residence: 'Berlin',
    selectedRole: 'user'
  });
}

describe('create-user component', () => {
  let el: CreateUser;
  let createStub: sinon.SinonStub;

  beforeEach(async () => {
    createStub = sinon.stub(userService, 'createUser').resolves(undefined as unknown as User);
    el = await fixture<CreateUser>(html`<create-user></create-user>`);
    await el.updateComplete;
  });

  afterEach(() => sinon.restore());

  it('rendert die Überschrift und die Pflichtfelder', () => {
    expect(el.shadowRoot!.querySelector('h1')?.textContent?.trim()).to.equal('Konto anlegen');
    expect(el.shadowRoot!.querySelector('#firstName')).to.not.be.null;
    expect(el.shadowRoot!.querySelector('#email')).to.not.be.null;
  });

  it('deaktiviert den Absenden-Button bei unvollständigem Formular', () => {
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(btn.disabled).to.be.true;
  });

  it('aktiviert den Absenden-Button bei gültigem Formular', async () => {
    fillValid(el);
    await el.updateComplete;
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(btn.disabled).to.be.false;
  });

  it('ruft createUser mit normalisierter E-Mail auf und zeigt eine Erfolgsmeldung', async () => {
    fillValid(el);
    await el.updateComplete;
    el.shadowRoot!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    await el.updateComplete;

    expect(createStub.calledOnce).to.be.true;
    const payload = createStub.firstCall.args[0] as CreateUserData;
    expect(payload.email).to.equal('max@example.com');
    expect(payload.role).to.equal('user');

    expect(el.shadowRoot!.querySelector('.alert-success')?.textContent).to.contain('wurde angelegt');
  });

  it('braucht für eine Kasse nur den Namen', async () => {
    Object.assign(el as unknown as CreateUserInternals, { selectedRole: 'kasse', firstName: 'Fuxenkasse' });
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('#email')).to.be.null;
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(btn.disabled).to.be.false;
  });
});
