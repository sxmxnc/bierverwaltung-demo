/* Autor: Julius Vollmer (FH Münster) */

import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

const backIcon = html`<svg
  xmlns="http://www.w3.org/2000/svg"
  width="20"
  height="20"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="m15 18-6-6 6-6" />
</svg>`;

@customElement('back-button')
export class BackButton extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
    }

    button {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: transparent;
      color: var(--color-text-muted);
      border: 1px solid var(--color-border);
      padding: 0.5rem 1rem;
      border-radius: var(--border-radius);
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
      transition: all 0.2s ease;
    }

    button:hover {
      background: var(--color-surface-alt);
      color: var(--color-primary);
      border-color: var(--color-primary);
    }

    @media (max-width: 600px) {
      span {
        display: none;
      }
    }
  `;

  render() {
    return html`
      <button @click=${this.goBack}>
        ${backIcon}
        <span>Zurück</span>
      </button>
    `;
  }

  private goBack() {
    window.history.back();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'back-button': BackButton;
  }
}
