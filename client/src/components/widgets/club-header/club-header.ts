/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { consume } from '@lit/context';
import componentStyle from './club-header.css?inline';
import { Club, clubContext, SAUERLANDIA } from '../../../context/clubContext.js';

// Wappen mit Schriftzug wie im Logo – als Text, damit es in hellem und dunklem Design passt
@customElement('club-header')
export class ClubHeader extends LitElement {
  static styles = componentStyle;

  @consume({ context: clubContext, subscribe: true })
  club: Club = SAUERLANDIA;

  render() {
    return html`
      <div class="club-header">
        <img class="crest" src="images/${this.club.crest}" alt="Wappen der ${this.club.name}" />
        <div class="lettering">
          <span class="kdstv">K.D.St.V.</span>
          <span class="name">${this.club.shortName}</span>
          <span class="cv">im CV</span>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'club-header': ClubHeader;
  }
}
