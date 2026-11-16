/* Autor: Jonas Bergjürgen (FH Münster) mit Hilfe Claude AI */

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import { RegisterPage } from './register';
import './register';

describe('register-page', () => {
  let element: RegisterPage;

  beforeEach(async () => {
    element = await fixture<RegisterPage>(html`<register-page></register-page>`);
  });

  it('should render the register heading', () => {
    const heading = element.shadowRoot!.querySelector('h2');
    expect(heading?.textContent?.trim()).to.equal('Konto erstellen');
  });

  it('should render the register-form widget', () => {
    const form = element.shadowRoot!.querySelector('register-form');
    expect(form).to.exist;
  });
});
