/* Autor: Marius Middrup (FH Münster) */

import { expect } from 'chai';
import { fixture } from '@open-wc/testing-helpers';
import { html } from 'lit';
import { ThemeSwitcherWidget, Theme } from './theme-switcher';
import './theme-switcher';
import sinon from 'sinon';

describe('theme-switcher', () => {
  let element: ThemeSwitcherWidget;
  // Standard ist das dunkle Design (Bar-Betrieb)
  const defaultTheme = 'dark';

  beforeEach(async () => {
    localStorage.clear();
    element = await fixture<ThemeSwitcherWidget>(html`<theme-switcher></theme-switcher>`);
  });
  it('opens the menu on trigger click', async () => {
    const trigger = element.shadowRoot!.querySelector<HTMLButtonElement>('.trigger');
    trigger!.click();
    await element.updateComplete;

    expect(element.shadowRoot!.querySelector('.menu')).to.not.be.null;
  });
  it('changes the theme', async () => {
    const theme: Theme = 'dark';

    const trigger = element.shadowRoot!.querySelector<HTMLButtonElement>('.trigger');
    trigger!.click();
    await element.updateComplete;

    const menuButtons = element.shadowRoot!.querySelectorAll<HTMLButtonElement>('.menu button');
    const themeButton = Array.from(menuButtons).find(btn => btn.textContent?.toLowerCase().includes(theme));
    themeButton!.click();
    await element.updateComplete;

    expect(element.theme).to.equal(theme);
    expect(document.documentElement.getAttribute('data-theme')).to.equal(theme);
    expect(localStorage.getItem('theme')).to.equal(theme);
  });
  it('disappears after time of inactivity', async () => {
    const time: number = 5000;
    const clock = sinon.useFakeTimers();

    const trigger = element.shadowRoot!.querySelector<HTMLButtonElement>('.trigger');
    trigger!.click();
    await element.updateComplete;

    const menu = element.shadowRoot!.querySelector<HTMLElement>('.menu');
    expect(menu).to.not.be.null;

    menu!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await element.updateComplete;

    clock.tick(time);
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector('.menu')).to.not.be.null;

    menu!.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    await element.updateComplete;
    clock.tick(time);
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector('.menu')).to.be.null;

    clock.restore();
  });
  it('should set default when storage is empty', async () => {
    expect(localStorage.getItem('theme')).to.equal(defaultTheme);
  });
});
