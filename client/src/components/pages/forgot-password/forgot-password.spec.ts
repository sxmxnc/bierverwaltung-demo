/* Autor: Jonas Bergjürgen (FH Münster) mit Hilfe Claude AI, angepasst für die K.D.St.V. Sauerlandia */

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import { ForgotPassword } from './forgot-password';
import './forgot-password';

describe('forgot-password', () => {
  let element: ForgotPassword;

  beforeEach(async () => {
    element = await fixture<ForgotPassword>(html`<forgot-password></forgot-password>`);
  });

  it('should point to the Bierwart instead of showing a reset token', () => {
    const text = element.shadowRoot!.textContent ?? '';
    expect(text).to.contain('Bierwart');
    expect(element.shadowRoot!.querySelector('input')).to.not.exist;
  });

  it('should link back to the login', () => {
    const link = element.shadowRoot!.querySelector<HTMLAnchorElement>('a[href="/login"]');
    expect(link).to.exist;
  });
});
