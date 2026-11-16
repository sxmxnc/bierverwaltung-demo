/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

import express, { Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Liefert die gebaute Oberfläche (client/dist) direkt aus dem API-Server aus. So laufen
 * Oberfläche und API in einem Prozess unter einer Adresse – nötig für Heroku, Railway, Render.
 * In der Entwicklung (Vite) bzw. mit nginx (Docker Compose) gibt es kein dist → nichts zu tun.
 */
export function serveClient(app: Express): boolean {
  const dist =
    process.env.CLIENT_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
  const index = path.join(dist, 'index.html');
  if (!fs.existsSync(index)) return false;

  app.use(
    express.static(dist, {
      index: false,
      setHeaders(res, filePath) {
        // Vite-Bundles tragen einen Hash im Namen und dürfen dauerhaft gecacht werden
        const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      }
    })
  );

  // Unbekannte API-Pfade bleiben ein JSON-404 ...
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Nicht gefunden' });
  });

  // ... alle anderen Pfade sind Seiten der Single-Page-App (/konto, /admin, ...)
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });

  return true;
}
