/* Autor: Marius Middrup (FH Münster) */

import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import componentStyle from './empty-state.css?inline';

@customElement('empty-state')
export class EmptyState extends LitElement {
  static styles = componentStyle;

  @property() icon: string = '';
  @property() title: string = '';
  @property() sub: string = '';

  render() {
    return html`
      <span class="icon">${this.icon}</span>
      <p class="title">${this.title}</p>
      <p class="sub">${this.sub}</p>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'empty-state': EmptyState;
  }
}
