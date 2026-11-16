/* Autor: Marius Middrup (FH Münster) */
/* Icons by Lucide (MIT License) */

import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import componentStyle from './toast-notification.css?inline';

/* Icons by Lucide (MIT License) */
const xIcon = html`<svg
  xmlns="http://www.w3.org/2000/svg"
  width="16"
  height="16"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="lucide lucide-x"
>
  <path d="M18 6 6 18" />
  <path d="m6 6 12 12" />
</svg>`;

const checkIcon = html`<svg
  xmlns="http://www.w3.org/2000/svg"
  width="16"
  height="16"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="lucide lucide-check"
>
  <path d="M20 6 9 17l-5-5" />
</svg>`;

const alertIcon = html`<svg
  xmlns="http://www.w3.org/2000/svg"
  width="16"
  height="16"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="lucide lucide-circle-alert"
>
  <circle cx="12" cy="12" r="10" />
  <line x1="12" x2="12" y1="8" y2="12" />
  <line x1="12" x2="12.01" y1="16" y2="16" />
</svg>`;

@customElement('toast-notification')
export class ToastNotification extends LitElement {
  static styles = componentStyle;

  @property() message: string = '';
  @property() type: 'success' | 'error' = 'success';
  @state() private closing = false;

  render() {
    return html`
      <div class="toast ${this.type} ${this.closing ? 'closing' : ''}">
        <span class="icon ${this.type}">${this.type === 'success' ? checkIcon : alertIcon}</span>
        <span class="message">${this.message}</span>
        <button class="close" @click=${this.close} aria-label="Schließen">${xIcon}</button>
      </div>
    `;
  }

  close() {
    this.closing = true;
    setTimeout(() => this.dispatchEvent(new CustomEvent('close')), 220);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'toast-notification': ToastNotification;
  }
}
