/* Autor: Marius Middrup (FH Münster) */

import { LitElement, TemplateResult, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import componentStyle from './theme-switcher.css?inline';
import { sunMoonIcon, sunIcon, monitorIcon, moonIcon } from './theme-switcher.icons';

export type Theme = 'light' | 'dark' | 'system';

type ThemeOption = {
  value: Theme;
  label: string;
  icon: TemplateResult;
};

const themeOptions: ThemeOption[] = [
  { value: 'system', label: 'System', icon: monitorIcon },
  { value: 'light', label: 'Light', icon: sunIcon },
  { value: 'dark', label: 'Dark', icon: moonIcon }
];

@customElement('theme-switcher')
export class ThemeSwitcherWidget extends LitElement {
  static styles = componentStyle;

  @state() open: boolean = false;

  @property() theme: Theme = 'system';

  private menuTimeout?: ReturnType<typeof setTimeout>;
  private mouseOver: boolean = false;
  private _skipNextClose = false;

  connectedCallback(): void {
    super.connectedCallback();

    this.theme = (localStorage.getItem('theme') as Theme) || 'dark';
    localStorage.setItem('theme', this.theme);
    document.documentElement.setAttribute('data-theme', this.theme);

    document.addEventListener('click', this.handleOutsideClick);
    document.addEventListener('nav-dropdown-open', this.handleOtherDropdownOpen as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('click', this.handleOutsideClick);
    document.removeEventListener('nav-dropdown-open', this.handleOtherDropdownOpen as EventListener);
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    this.triggerTimeout();
  }

  render() {
    return html`<div class="wrapper" @mouseenter=${this.handleMouseEnter} @mouseleave=${this.handleMouseLeave}>
      <button class="trigger" @click=${this.triggerOpen}>${sunMoonIcon}</button>

      ${this.open
        ? html`
            <div class="menu">
              ${themeOptions.map(
                option => html`
                  <button
                    class="${this.theme === option.value ? 'active' : ''}"
                    @click=${() => {
                      this.setTheme(option.value);
                      this.triggerClose();
                    }}
                  >
                    ${option.icon}${option.label}
                  </button>
                `
              )}
            </div>
          `
        : ''}
    </div>`;
  }

  private handleOutsideClick = () => {
    if (this._skipNextClose) {
      this._skipNextClose = false;
      return;
    }
    this.open = false;
  };

  private handleOtherDropdownOpen = (event: CustomEvent) => {
    if (event.detail !== 'theme') {
      this.open = false;
    }
  };

  private triggerOpen() {
    this.open = !this.open;
    if (this.open) {
      this._skipNextClose = true;
      document.dispatchEvent(new CustomEvent('nav-dropdown-open', { detail: 'theme' }));
    }
    this.triggerTimeout();
  }

  private triggerClose() {
    this.open = false;
  }

  private triggerTimeout() {
    clearTimeout(this.menuTimeout);

    if (this.open) {
      this.menuTimeout = setTimeout(() => {
        if (!this.mouseOver === true) {
          this.open = false;
        }
      }, 5000);
    }
  }

  private handleMouseEnter() {
    this.mouseOver = true;
  }

  private handleMouseLeave() {
    this.mouseOver = false;
    this.triggerTimeout();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'theme-switcher': ThemeSwitcherWidget;
  }
}
