# Schnittstelle Erfassungs-Tool ↔ App

Das Erfassungs-Tool (`TBW WiSe 26:27/05 Tools/Strichlisten-Erfassung.html`) erfasst die Backup-Strichlisten auf Papier. Die App übernimmt diese Striche unter Bierwart → „Strichliste importieren“. Hier steht, welche Dateien zwischen beiden ausgetauscht werden. Beide Seiten müssen sich daran halten.

Grundsätze:
- Importierte Striche zählen **nicht** in die Rangliste, weil die Papierliste nur ein Backup ist. Konto, Kontoauszug, Verbrauchsübersicht und Bestand berücksichtigen sie.
- Die Getränke bleiben wie auf der Papierliste (`Strichliste WiSe 2026.pdf`): 11 Spalten, „Weizen / Weizen alkoholfrei“ ist eine Spalte.
- Version-1-Dateien (vor diesem Stand) importiert die App weiterhin.

---

## 1. Tool → App: Export und Zwischenstand

Gemeint sind die Dateien, die das Tool heute schon schreibt: „Export für die Bilanz (JSON)“ und „Zwischenstand herunterladen“ bzw. die verbundene Sicherungsdatei. Die App liest nur den Teil `zwischenstand` und die Liste `getraenke`. Alles andere (`gesamt`, `nach_monat`, `listen`) dient ihr als Gegenprobe.

```jsonc
{
  "format": "strichlisten-erfassung",   // Pflicht, genau dieser Wert
  "version": 2,                          // 1 = alte Dateien, 2 = mit uid/datum/konto_id
  "typ": "export",                       // oder "zwischenstand"
  "gespeichert": "2026-11-20T21:14:03.000Z",
  "getraenke": [                         // Pflicht. Die Reihenfolge = Reihenfolge der Zähler in entries
    { "key": "bit03", "name": "Bitburger 0,3", "preis_eur": 1.25 }
    // …
  ],
  "listen": [                            // nur im Export; Gegenprobe der Summen
    { "uid": "…", "name": "Liste 8", "datum": "2026-11-20", "bilanz_monat": "2026-11", "notiz": "",
      "personen": [ /* … */ ], "summe": { "striche": { "bit03": 12 }, "betrag_eur": 15.0 } }
  ],
  "zwischenstand": {
    "v": 2,
    "savedAt": "2026-11-20T21:14:02.000Z",
    "lists": [
      { "id": "l8", "uid": "3f1c2a9e-…", "name": "Liste 8", "monat": "2026-11", "datum": "2026-11-20", "notiz": "" }
    ],
    "persons": [
      { "id": "p3", "gruppe": "Bbr/Ak/FK", "name": "Altenkamp", "vorname": "Benedikt", "nachname": "Altenkamp",
        "vo": "Altpapier", "konto_id": "8b0f…" }
    ],
    "entries": { "l8": { "p3": [2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] } },
    "ui": { "active": "l8", "view": "list" },
    "seq": { "p": 52, "l": 8 }
  }
}
```

Neu in Version 2:
| Feld | Regel |
|---|---|
| `lists[].uid` | Wird beim Anlegen der Liste einmal erzeugt (`crypto.randomUUID()`) und **nie** geändert, auch nicht beim Umbenennen. Listen aus Version 1 bekommen beim ersten Laden eine. Daran erkennt die App eine Liste wieder: schon importiert, geändert oder neu. |
| `lists[].datum` | `""` oder `"JJJJ-MM-TT"`: Tag der Papierliste. Optional; fehlt es, fragt die App beim Import nach dem Buchungsdatum. |
| `persons[].konto_id` | `""` oder die ID des Kontos in der App (aus der Personenliste, siehe 2). Damit ordnet die App die Person ohne Rückfrage zu. |

Unverändert:
- `entries[listId][personId]` ist eine Liste ganzer Zahlen ≥ 0 in der Reihenfolge von `getraenke`. Fehlende Einträge zählen als 0.
- Die Getränke-Schlüssel bleiben `bit03, bit02, bit05, weizen, bitfl_af, helles, sd02, sd03, sd05, sd_fl, wasser`. Neue Schlüssel lehnt die App ab, bis sie eine Zuordnung dafür hat.
- `preis_eur` ist der Preis auf der Papierliste. Die App bucht genau diesen Preis und weist auf Abweichungen zu ihrer Preisliste hin.

### So ordnet die App die Getränke zu
| Tool | App-Getränk |
|---|---|
| `bit02` / `bit03` / `bit05` | Bitburger 0,2 l / 0,3 l / 0,5 l (Fass) |
| `weizen` | Weizen 0,5 l |
| `bitfl_af` | Bitburger alkoholfrei 0,33 l |
| `helles` | Helles 0,5 l |
| `sd02` / `sd03` / `sd05` | Softdrink 0,2 l / 0,3 l / 0,5 l |
| `sd_fl` | Softdrink Flasche 1,0 l |
| `wasser` | Wasser Flasche 1,0 l |

---

## 2. App → Tool: Personenliste

Download in der App unter Bierwart → „Strichliste importieren“ → „Personenliste für das Erfassungs-Tool“. Dateiname: `Strichlisten-Personen_JJJJ-MM-TT.json`.

```jsonc
{
  "format": "strichlisten-personen",
  "version": 1,
  "erstellt": "2026-11-20T18:00:00.000Z",
  "personen": [
    { "konto_id": "kasse-aktivenkasse", "gruppe": "Bbr/Ak/FK", "name": "Aktivenkasse",
      "vorname": "Quaestor", "nachname": "Aktivenkasse", "vo": "" },
    { "konto_id": "8b0f…", "gruppe": "", "name": "Altenkamp",
      "vorname": "Benedict", "nachname": "Altenkamp", "vo": "Altpapier" }
  ]
}
```

- Enthalten sind alle aktiven Konten, auf die gestrichelt werden kann (Mitglieder, Bierwart, Kassen), alphabetisch nach Nachname.
- `gruppe` ist eine Gruppe des Tools (`Bbr/Ak/FK`, `AH`, `Hausbewohner`, `Gäste`, `Sauerlanden`) oder `""`, wenn die App sie nicht kennt. Dann behält das Tool die Gruppe, die es schon hat, und setzt bei neuen Personen „Zuordnung offen“.
- Kassen: `vorname` = Amt (Quaestor, Fuxmajor), `nachname` = `name` = Kasse, wie auf der Papierliste.

Beim Laden ändert das Tool **nur Personen**, nie Listen oder Striche (Regeln siehe Plan zum Tool).
