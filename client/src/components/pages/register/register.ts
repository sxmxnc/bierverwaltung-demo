/* Autor: Jonas Bergjürgen (FH Münster), angepasst für die K.D.St.V. Sauerlandia */

import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import componentStyle from './register.css?inline';
import '../../widgets/register-form/register-form';
import '../../widgets/club-header/club-header';

@customElement('register-page')
export class RegisterPage extends LitElement {
  static styles = componentStyle;

  render() {
    return html`
      <div class="layout">
        <div class="register-container">
          <club-header></club-header>
          <h2>Konto erstellen</h2>
          <h3>Der Bierwart schaltet dein Konto anschließend frei.</h3>
          <register-form></register-form>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'register-page': RegisterPage;
  }
}
