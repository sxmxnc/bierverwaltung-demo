-- Demo-Daten für die lokale Entwicklung (wird NICHT in Produktion geladen).
-- Alle Demo-Mitglieder haben das Passwort "Test1234!".

INSERT INTO "users" ("id", "createdAt", "firstName", "lastName", "nickname", "email", "password", "residence", "role", "status", "sepaMandate") VALUES
  ('demo-max', 0, 'Max', 'Mustermann', 'Maxe', 'max@example.org', '$2b$10$iOH8G.wmNx9BfD04n6usIeod7CHgvZjD7ZA1zZPWUg3oFigffVXUS', 'Münster', 'user', 'active',
   '{"creditorName":"K.D.St.V. Sauerlandia – Bierkasse","creditorId":"DE98ZZZ09999999999","debtorName":"Max Mustermann","debtorBank":"Commerzbank","iban":"DE89370400440532013000"}'),
  ('demo-moritz', 0, 'Moritz', 'Beispiel', 'Hopfen', 'moritz@example.org', '$2b$10$iOH8G.wmNx9BfD04n6usIeod7CHgvZjD7ZA1zZPWUg3oFigffVXUS', 'Münster', 'user', 'active',
   '{"creditorName":"K.D.St.V. Sauerlandia – Bierkasse","creditorId":"DE98ZZZ09999999999","debtorName":"Moritz Beispiel","debtorBank":"","iban":""}'),
  ('demo-paul', 0, 'Paul', 'Platzhalter', NULL, 'paul@example.org', '$2b$10$iOH8G.wmNx9BfD04n6usIeod7CHgvZjD7ZA1zZPWUg3oFigffVXUS', 'Münster', 'user', 'active',
   '{"creditorName":"K.D.St.V. Sauerlandia – Bierkasse","creditorId":"DE98ZZZ09999999999","debtorName":"Paul Platzhalter","debtorBank":"","iban":""}'),
  ('demo-erika', 0, 'Erika', 'Neumann', NULL, 'erika@example.org', '$2b$10$iOH8G.wmNx9BfD04n6usIeod7CHgvZjD7ZA1zZPWUg3oFigffVXUS', 'Münster', 'user', 'pending',
   '{"creditorName":"K.D.St.V. Sauerlandia – Bierkasse","creditorId":"DE98ZZZ09999999999","debtorName":"Erika Neumann","debtorBank":"","iban":""}')
ON CONFLICT DO NOTHING;

INSERT INTO "orders" ("id", "createdAt", "userId", "bookedById", "drinkId", "name", "unit", "value", "price", "date") VALUES
  ('demo-order-1', 1780401600000, 'demo-max',    'demo-max',   'drink-bitburger-03', 'Bitburger', '0,3 l', 4, 1.25, '2026-10-09T20:15:00Z'),
  ('demo-order-2', 1780401600000, 'demo-max',    'demo-moritz','drink-bitburger-05', 'Bitburger', '0,5 l', 1, 2.10, '2026-10-09T22:40:00Z'),
  ('demo-order-3', 1780401600000, 'demo-moritz', 'user-theke', 'drink-bitburger-03', 'Bitburger', '0,3 l', 6, 1.25, '2026-10-09T21:05:00Z'),
  ('demo-order-4', 1780401600000, 'demo-moritz', 'demo-moritz','drink-softdrink-03', 'Softdrink', '0,3 l', 2, 0.60, '2026-10-10T19:30:00Z'),
  ('demo-order-5', 1780401600000, 'kasse-fuxenkasse', 'demo-max', 'drink-bitburger-02', 'Bitburger', '0,2 l', 10, 0.85, '2026-10-10T21:00:00Z')
ON CONFLICT DO NOTHING;

INSERT INTO "payments" ("id", "createdAt", "userId", "amount", "note", "date", "createdByAdminId") VALUES
  ('demo-pay-max',   1780401600000, 'demo-max',   20.0, 'Einzahlung (Überweisung)', '2026-10-01T12:00:00Z', 'user-bierwart'),
  ('demo-pay-paul',  1780401600000, 'demo-paul',  10.0, 'Einzahlung (Bar)',         '2026-10-01T12:00:00Z', 'user-bierwart'),
  ('demo-pay-fuxen', 1780401600000, 'kasse-fuxenkasse', 50.0, 'Einzahlung (Überweisung) – Fuxenkasse', '2026-10-01T12:00:00Z', 'user-bierwart')
ON CONFLICT DO NOTHING;
