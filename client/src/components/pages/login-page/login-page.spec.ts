/* Autor: Jonas Bergjürgen (FH Münster) mit Hilfe Claude AI, angepasst für die K.D.St.V. Sauerlandia */

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import { LoginPage } from './login-page';
import './login-page';

describe('login-page', () => {
  let element: LoginPage;

  beforeEach(async () => {
    element = await fixture<LoginPage>(html`<login-page></login-page>`);
  });

  it('should render the heading and the club crest', async () => {
    const heading = element.shadowRoot!.querySelector('h2');
    expect(heading?.textContent?.trim()).to.equal('Strichliste');
    const header = element.shadowRoot!.querySelector('club-header')!;
    await (header as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    const crest = header.shadowRoot!.querySelector<HTMLImageElement>('img.crest');
    expect(crest?.getAttribute('src')).to.equal('images/sauerlandia-wappen.png');
    expect(header.shadowRoot!.textContent).to.contain('Sauerlandia');
  });

  it('should render the login-form widget', () => {
    const form = element.shadowRoot!.querySelector('login-form');
    expect(form).to.exist;
  });
});
