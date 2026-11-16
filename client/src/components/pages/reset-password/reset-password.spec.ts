/* Autor: Jonas Bergjürgen (FH Münster) mit Hilfe Claude AI */

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import { ResetPassword } from './reset-password';
import './reset-password';

describe('reset-password', () => {
  let element: ResetPassword;

  beforeEach(async () => {
    element = await fixture<ResetPassword>(html`<reset-password></reset-password>`);
  });

  it('should render the invalid-link view when no token in URL', () => {
    const heading = element.shadowRoot!.querySelector('h1');
    expect(heading?.textContent?.trim()).to.equal('Ungültiger Link');
  });
});
