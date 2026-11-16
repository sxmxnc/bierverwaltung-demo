/* Autor: Julius Vollmer (FH Münster) mit Hilfe von Claude AI, erweitert für die K.D.St.V. Sauerlandia */

import cors, { CorsOptions, CorsOptionsDelegate } from 'cors';
import { Request } from 'express';

/**
 * CORS regelt, von welchen Web-Adressen (Origins) aus ein Browser unsere API
 * ansprechen darf.
 */
const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  ...(process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : [])
];

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

// Wenn API und Oberfläche aus demselben Prozess kommen (Heroku & Co.), ist der Aufruf
// gleichen Ursprungs – dafür muss keine Adresse fest eingetragen werden.
const corsDelegate: CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.headers.origin;
  const sameHost = !!origin && hostOf(origin) === req.headers.host;
  if (!origin || sameHost || allowedOrigins.includes(origin)) {
    const options: CorsOptions = { origin: true, credentials: true };
    callback(null, options);
  } else {
    callback(new Error(`CORS: Origin ${origin} ist nicht erlaubt`));
  }
};

export const corsConfig = cors(corsDelegate);
