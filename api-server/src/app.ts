/* Autor: Prof. Dr. Norman Lahme-Hütig (FH Münster), erweitert für die K.D.St.V. Sauerlandia */

import express, { Express } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import startDB from './db.js';
import { drinksRoutes } from './routes/drinks.js';
import { accountRoutes } from './routes/account.js';
import { membersRoutes } from './routes/members.js';
import { orderRoutes } from './routes/order.js';
import { usersRoutes } from './routes/users.js';
import { rolesRoutes } from './routes/roles.js';
import { statisticsRoutes } from './routes/statistics.js';
import { stockAlertsRoutes } from './routes/stock-alerts.js';
import { paymentsRoutes } from './routes/payments.js';
import { authRoutes } from './routes/auth.js';
import { registerRoutes } from './routes/register.js';
import { profileRoutes } from './routes/profile.js';
import { resetPasswordRoutes } from './routes/reset-password.js';
import { corsConfig } from './middleware/cors-config.js';
import { serveClient } from './static-client.js';
import { demoRoutes } from './routes/demo.js';
import { scoreboardRoutes } from './routes/scoreboard.js';
import { reportRoutes } from './routes/reports.js';
import { tallyImportRoutes } from './routes/tally-import.js';
import { memberImportRoutes } from './routes/member-import.js';
import { bankRoutes } from './routes/bank.js';

import config from '../config.json' with { type: 'json' };

const isProduction = process.env.NODE_ENV === 'production';

// Ohne starkes Geheimnis könnte jeder gültige Login-Token fälschen – in Produktion nicht starten.
function checkSecrets() {
  const secret = process.env.JWT_SECRET ?? '';
  if (isProduction && (secret.length < 32 || secret === 'your_secret_key_here')) {
    throw new Error('JWT_SECRET fehlt oder ist zu kurz (mindestens 32 Zeichen). Bitte als Umgebungsvariable setzen.');
  }
}

function configureApp(app: Express) {
  if (isProduction) {
    // Hinter dem Proxy von Heroku & Co.: echte Client-IP/Protokoll übernehmen und http -> https umleiten
    app.set('trust proxy', 1);
    app.use((req, res, next) => {
      if (req.headers['x-forwarded-proto'] === 'http') {
        return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
      }
      next();
    });
  }
  app.use(
    helmet({
      // Gleiche Regeln wie im <meta>-CSP von client/index.html; Inline-Styles erlaubt,
      // weil Lit auf älteren iPads (ohne Constructable Stylesheets) <style>-Elemente nutzt.
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': [`'self'`],
          'connect-src': [`'self'`],
          'img-src': [`'self'`, 'data:'],
          'style-src': [`'self'`, `'unsafe-inline'`],
          'font-src': [`'self'`],
          'manifest-src': [`'self'`],
          'upgrade-insecure-requests': null
        }
      }
    })
  );
  app.use(express.urlencoded({ extended: true }));
  // Exporte des Erfassungs-Tools (Strichlisten-Import) sind gut 100 KB groß
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(corsConfig);
}

export async function start() {
  const app = express();

  configureApp(app);

  //Routes
  authRoutes(app);
  registerRoutes(app);
  resetPasswordRoutes(app);
  drinksRoutes(app);
  accountRoutes(app);
  membersRoutes(app);
  orderRoutes(app);
  profileRoutes(app);
  usersRoutes(app);
  rolesRoutes(app);
  statisticsRoutes(app);
  stockAlertsRoutes(app);
  paymentsRoutes(app);
  demoRoutes(app);
  scoreboardRoutes(app);
  reportRoutes(app);
  tallyImportRoutes(app);
  memberImportRoutes(app);
  bankRoutes(app);
  if (serveClient(app)) {
    console.log('Oberfläche wird aus client/dist mit ausgeliefert');
  }
  await startDB(app);
  checkSecrets();
  startHttpServer(app, Number(process.env.PORT ?? config.server.port));
  if (process.env.HTTPS_ENABLED !== 'false') {
    startHttpsServer(app, config.server.httpsPort);
  }
}

async function startHttpServer(app: Express, port: number) {
  const httpServer = http.createServer(app);
  httpServer.listen(port, () => {
    app.locals.port = port;
    console.log(`Server running at http://localhost:${port}`);
  });
}

async function startHttpsServer(app: Express, port: number) {
  const certDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'certs');
  // Auf Plattformen wie Heroku terminiert der Anbieter HTTPS; dort gibt es keinen privaten Schlüssel
  if (!fs.existsSync(path.join(certDir, 'server.key.pem'))) {
    console.log('Kein TLS-Schlüssel unter certs/ – HTTPS-Server wird nicht gestartet.');
    return;
  }
  const options = {
    key: fs.readFileSync(path.join(certDir, 'server.key.pem')),
    cert: fs.readFileSync(path.join(certDir, 'server.cert.pem')),
    ca: fs.readFileSync(path.join(certDir, 'intermediate-ca.cert.pem'))
  };
  https.createServer(options, app).listen(port, () => {
    console.log(`Server running at https://localhost:${port}`);
  });
}

start();
