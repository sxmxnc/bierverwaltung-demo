/* Autor: Prof. Dr. Norman Lahme-Hütig (FH Münster), angepasst für die K.D.St.V. Sauerlandia */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import componentStyle from './app.css?inline';
import { provide } from '@lit/context';
import { Router, routerContext } from '../../router';

import { Club, clubContext, SAUERLANDIA } from '../../context/clubContext';
import { requireAuth, requireAdmin } from '../../utils/auth-guard';
import '../pages/strichel-page/strichel-page';
import '../pages/scoreboard-page/scoreboard-page';
import '../pages/my-account/my-account';
import '../pages/forgot-password/forgot-password';
import '../pages/reset-password/reset-password';

@customElement('app-root')
export class AppComponent extends LitElement {
  static styles = [componentStyle];

  // Bilddateien liegen unter client/public/images/
  @provide({ context: clubContext })
  club: Club = SAUERLANDIA;

  @provide({ context: routerContext })
  @state()
  router = new Router(
    this,
    [
      // Startseite = Stricheln. requireAuth/requireAdmin leiten bei Bedarf auf /login bzw. / um.
      // Hinweis: @lit-labs/router wartet async Guards nicht ab – die Seite rendert kurz, bevor umgeleitet wird.
      {
        path: '/',
        render: () => {
          requireAuth();
          return html`<strichel-page></strichel-page>`;
        }
      },
      {
        path: '/konto',
        render: () => {
          requireAuth();
          return html`<account-balance></account-balance>`;
        }
      },
      {
        path: '/rangliste',
        render: () => {
          requireAuth();
          return html`<scoreboard-page></scoreboard-page>`;
        }
      },
      // alte Adressen der Uni-Version weiterhin erreichbar
      { path: '/account-balance', render: () => this.redirect('/konto') },
      { path: '/order', render: () => this.redirect('/') },
      { path: '/menu', render: () => this.redirect('/') },
      {
        path: '/admin',
        render: () => {
          requireAdmin();
          return html`<admin-area></admin-area>`;
        }
      },
      {
        path: '/beverage-inventory',
        render: () => {
          requireAdmin();
          return html`<beverage-inventory-area></beverage-inventory-area>`;
        }
      },
      {
        path: '/beverage-order',
        render: () => {
          requireAdmin();
          return html`<beverage-order-area></beverage-order-area>`;
        }
      },
      {
        path: '/my-account',
        render: () => {
          requireAuth();
          return html`<my-account></my-account>`;
        }
      },
      { path: '/login', render: () => html`<login-page></login-page>` },
      { path: '/register', render: () => html`<register-page></register-page>` },
      { path: '/passwort-vergessen', render: () => html`<forgot-password></forgot-password>` },
      { path: '/passwort-neu-setzen', render: () => html`<reset-password></reset-password>` }
    ],
    {
      fallback: {
        render: () => html`<p class="not-found">Diese Seite gibt es nicht. <a href="/">Zum Stricheln</a></p>`
      }
    }
  );

  render() {
    return html` <nav-bar></nav-bar>
      <main>${this.router.outlet()}</main>`;
  }

  private redirect(path: string) {
    window.history.replaceState({}, '', path);
    queueMicrotask(() => this.router.goto(path));
    return html``;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-root': AppComponent;
  }
}
