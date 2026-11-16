# Bierverwaltung

Digitale Strichliste und Getränkekasse für die K.D.St.V. Sauerlandia. Simon
Cebula hat das Web-Engineering-Teamprojekt „Deckel 2.0“ für den
Thekenbetrieb weiterentwickelt. Die Autorenhinweise der Ausgangsversion
stehen weiterhin im Quellcode.

Mitglieder können Getränke buchen und eigene Buchungen einsehen. Die
Verwaltung pflegt Getränke, Preise und Bestände, korrigiert Buchungen und
übernimmt ältere Papierlisten oder Excel-Salden. Der Projektstand enthält
auch den Import und Abgleich von Bank-CSV-Dateien.

## Lokale Demo

```sh
docker compose up --build
```

Die App steht unter http://localhost:3081 bereit. Die Datenbank enthält
fiktive Konten und Buchungen. Zum Ausprobieren stehen das Mitglied
`max@example.org`, das Verwaltungskonto `bierwart@bierkasse.local`
und das Thekenkonto `theke@bierkasse.local` bereit. Das lokale
Demo-Passwort lautet jeweils `Test1234!`.

`docker compose down` stoppt die Anwendung. Der Demo-Datenbestand liegt im
Docker-Volume und bleibt beim nächsten Start erhalten.

## Technik und Tests

Lit und TypeScript im Frontend, Express und PostgreSQL im Backend.
`npm ci --prefix api-server && npm test --prefix api-server` führt die
API- und Importtests aus. Das Format für Papierlisten ist unter
[Strichlisten-Format](docs/STRICHLISTEN-FORMAT.md) beschrieben.
