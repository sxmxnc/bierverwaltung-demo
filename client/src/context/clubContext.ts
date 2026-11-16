/* Autor: Marius Middrup (FH Münster), erweitert für die K.D.St.V. Sauerlandia */
import { createContext } from '@lit/context';

export type Club = {
  name: string;
  shortName: string;
  crest?: string; // Wappen (images/)
  languageCode: string;
  currency: string;
};

export const clubContext = createContext<Club>('club-context');

export const SAUERLANDIA: Club = {
  name: 'K.D.St.V. Sauerlandia',
  shortName: 'Sauerlandia',
  crest: 'sauerlandia-wappen.png',
  languageCode: 'de-DE',
  currency: 'EUR'
};
