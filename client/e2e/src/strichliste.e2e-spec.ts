/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

/**
 * End-to-End-Test der Kernabläufe: Registrierung + Freischaltung, für sich und für andere stricheln,
 * Rückgängig, Kontoansicht und Theken-Modus.
 *
 * Voraussetzung: App läuft mit den Demo-Daten (api-server/demo-data.sql).
 * Starten:  cd client && E2E_BASE_URL=http://localhost:8080 npm run e2e
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import assert from 'node:assert/strict';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
const PASSWORD = 'Test1234!';
const NEW_MEMBER = {
  firstName: 'E2E',
  lastName: `Test${Date.now()}`,
  nickname: `Testfux${Date.now() % 100000}`,
  email: `e2e.${Date.now()}@example.org`
};

let browser: Browser;

async function newPage(viewport = { width: 390, height: 844 }): Promise<[BrowserContext, Page]> {
  const context = await browser.newContext({ viewport, locale: 'de-DE' });
  const page = await context.newPage();
  return [context, page];
}

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
}

async function tap(page: Page, drink: RegExp, times = 1) {
  const tile = page.getByRole('button', { name: drink }).first();
  for (let i = 0; i < times; i++) await tile.click();
}

describe('Sauerlandia-Strichliste', function () {
  this.timeout(60000);

  before(async () => {
    browser = await chromium.launch();
  });

  after(async () => {
    await browser.close();
  });

  it('lehnt falsche Zugangsdaten mit einer Meldung im Formular ab', async () => {
    const [context, page] = await newPage();
    await login(page, 'max@example.org', 'falsch');
    await page.getByText('E-Mail oder Passwort falsch').waitFor();
    await context.close();
  });

  it('neue Registrierung muss erst vom Bierwart freigeschaltet werden', async () => {
    const [context, page] = await newPage();
    await page.goto(`${BASE_URL}/register`);
    await page.locator('#firstName').fill(NEW_MEMBER.firstName);
    await page.locator('#lastName').fill(NEW_MEMBER.lastName);
    await page.locator('#nickname').fill(NEW_MEMBER.nickname);
    await page.locator('#email').fill(NEW_MEMBER.email);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Registrieren', exact: true }).click();
    await page.getByText('Fast geschafft!').waitFor();

    await login(page, NEW_MEMBER.email);
    await page.getByText('muss noch vom Bierwart freigeschaltet werden').waitFor();
    await context.close();
  });

  it('Bierwart schaltet das neue Konto frei', async () => {
    const [context, page] = await newPage({ width: 1280, height: 900 });
    await login(page, 'bierwart@bierkasse.local');
    await page.waitForURL(`${BASE_URL}/`);
    await page.goto(`${BASE_URL}/admin`);
    const row = page.locator('.pending-panel li', { hasText: NEW_MEMBER.email });
    await row.getByRole('button', { name: 'Freischalten' }).click();
    await page.getByText(`${NEW_MEMBER.nickname} ist freigeschaltet`).waitFor();
    await context.close();

    const [memberContext, memberPage] = await newPage();
    await login(memberPage, NEW_MEMBER.email);
    await memberPage.waitForURL(`${BASE_URL}/`);
    await memberPage.getByText(`Mich (${NEW_MEMBER.nickname})`).waitFor();
    await memberContext.close();
  });

  it('Mitglied strichelt für sich und für einen Bundesbruder und macht es rückgängig', async () => {
    const [context, page] = await newPage();
    await login(page, 'max@example.org');
    await page.waitForURL(`${BASE_URL}/`);

    // für sich selbst
    await tap(page, /^Bitburger 0,3 l/, 2);
    await page.getByRole('button', { name: /2 Striche buchen/ }).click();
    await page.getByText('Gestrichelt!').waitFor();
    assert.ok(await page.getByRole('alertdialog').getByText('2× Bitburger 0,3 l').isVisible());
    await page.getByRole('button', { name: 'OK' }).click();

    // für Hopfen
    await page.getByRole('button', { name: 'Auswählen, für wen gestrichelt wird' }).click();
    await page.getByPlaceholder('Name oder Biername suchen …').fill('hop');
    await page.getByRole('button', { name: /Hopfen/ }).click();
    await tap(page, /^Helles 0,5 l/);
    const submit = page.getByRole('button', { name: /1 Strich buchen/ });
    assert.match((await submit.textContent()) ?? '', /für Hopfen/);
    await submit.click();
    await page.getByText('Gestrichelt!').waitFor();
    assert.match((await page.locator('.confirm-for').textContent()) ?? '', /Hopfen/);

    // vertippt -> rückgängig
    await page.getByRole('alertdialog').getByRole('button', { name: 'Rückgängig' }).click();
    await page.getByText('Buchung rückgängig gemacht.').waitFor();
    await context.close();
  });

  it('Kontoansicht zeigt, wer für einen gestrichelt hat', async () => {
    const [context, page] = await newPage();
    await login(page, 'moritz@example.org');
    await page.waitForURL(`${BASE_URL}/`);
    await page.goto(`${BASE_URL}/konto`);
    await page.getByText('Verlauf').waitFor();
    assert.ok((await page.getByText('gestrichelt von').count()) > 0);
    await context.close();
  });

  it('Theke: erst Person wählen, dann stricheln, danach zurück zur Auswahl', async () => {
    const [context, page] = await newPage({ width: 1024, height: 768 });
    await login(page, 'theke@bierkasse.local');
    await page.waitForURL(`${BASE_URL}/`);
    await page.getByText('Wer trinkt?').waitFor();

    await page.getByRole('button', { name: /Aktivenkasse/ }).click();
    await page.getByText('Striche für').waitFor();
    await tap(page, /^Softdrink 0,3 l/, 3);
    await page.getByRole('button', { name: /3 Striche buchen/ }).click();
    await page.getByText('Gestrichelt!').waitFor();
    await page.getByRole('button', { name: 'OK' }).click();
    await page.getByText('Wer trinkt?').waitFor();
    await context.close();
  });
});
