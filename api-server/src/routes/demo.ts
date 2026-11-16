/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import { Express } from 'express';
import { User } from '../models/user-auth.js';
import { startSession } from '../utils/session.js';

// Prototyp-Zugänge ohne Passwort – nur aktiv, wenn DEMO_LOGINS=true gesetzt ist.
// Wer den Link öffnet, ist sofort als Muster-Bundesbruder bzw. als Theke angemeldet.
const DEMO_ACCOUNTS: Record<string, { id: string; label: string }> = {
  mitglied: { id: 'demo-max', label: 'Als Bundesbruder testen (Maxe)' },
  theke: { id: 'user-theke', label: 'Theke testen (iPad)' }
};

const enabled = () => process.env.DEMO_LOGINS === 'true';

export function demoRoutes(app: Express) {
  app.get('/api/demo', (_req, res) => {
    res.json({
      enabled: enabled(),
      accounts: enabled()
        ? Object.entries(DEMO_ACCOUNTS).map(([kind, account]) => ({
            kind,
            label: account.label,
            href: `/api/demo/${kind}`
          }))
        : []
    });
  });

  app.get('/api/demo/:kind', async (req, res) => {
    const account = DEMO_ACCOUNTS[String(req.params.kind)];
    if (!enabled() || !account) return res.redirect('/login');

    const user: User | null = await req.app.locals.userDao.findOne({ id: account.id });
    if (!user || user.status !== 'active') return res.redirect('/login');

    startSession(res, user);
    res.redirect('/');
  });
}
