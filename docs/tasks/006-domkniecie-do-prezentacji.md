# 006 — Domknięcie compliance panelu + demo na prezentację dla prezesa

**Deadline: 2 dni** (ustalone 2026-09-21). Cel: pokazać prezesowi działający
produkt + twarde dane kosztu/jakości, żeby podjął decyzję build/buy/hybryda.

## Stan wyjściowy (2026-09-21, audyt niescommitowanych zmian)

W repo leżą niescommitowane zmiany: RLS izolacja user/klient (migracje
025-027), retencja konwersacji, panel compliance (przypisania klient↔zespół,
agent compliance, access-audit), middleware `dbContext.js`. Przetestowane
ręcznie na lokalnej bazie:

- **RLS działa poprawnie** (zweryfikowane w psql: użytkownik widzi tylko
  swoje konwersacje, brak kontekstu = 0 wierszy, `is_admin=true` = widzi
  wszystko).
- **Krytyczny bug**: `POST /metrics/retention/run`
  ([backend/src/routes/metrics.routes.js](../../backend/src/routes/metrics.routes.js))
  ignoruje `DATA_RETENTION_ENABLED` i pozwala realnie skasować konwersacje
  nawet gdy flaga jest wyłączona — potwierdzone: z `ENABLED=false` wywołanie
  skasowało 25 konwersacji z lokalnej bazy testowej.
- **Bug kolejności middleware** w
  [backend/src/routes/clients.routes.js:12](../../backend/src/routes/clients.routes.js)
  — `attachAdminDbContext` zarejestrowany przed `requireAuth` (niespójne z
  poprawnym wzorcem w `metrics.routes.js`).
- `APP_DATABASE_URL` / `DATA_RETENTION_ENABLED` / `DATA_RETENTION_DAYS` nie
  są w `backend/.env.example` ani ustawione na Railway → RLS jest dziś
  **martwe na produkcji** (backend łączy się jako superuser, fallback z
  `config/db.js`).
- Z listy QA (patrz [002](002-qa-nowych-funkcji.md)): jedyny nienaprawiony
  bug to brak widocznego bannera błędów przy 429/500 w czacie.

## Dzień 1 — kod, deploy, weryfikacja

- [x] 1. Napraw `/metrics/retention/run` — realne kasowanie tylko gdy
      `DATA_RETENTION_ENABLED=true`, niezależnie od `dryRun` w body.
- [x] 2. Popraw kolejność middleware w `clients.routes.js` —
      `requireAuth` przed `attachAdminDbContext`.
- [x] 3. Dopisz `APP_DATABASE_URL`, `DATA_RETENTION_ENABLED`,
      `DATA_RETENTION_DAYS` do `backend/.env.example`.
- [ ] 4. Commit całości (RLS + retencja + compliance panel), opisowy
      message.
- [ ] 5. Utwórz rolę `salesmore_app` na produkcyjnej bazie Railway + ustaw
      `APP_DATABASE_URL` jako sekret `backend` (`railway variables -s
      backend --set ...`).
- [ ] 6. Odpal migracje 025-027 na Railway (`railway ssh "npm run
      migrate"` — patrz notatka w [README](README.md) o `railway ssh` vs
      `railway run`).
- [ ] 7. Zweryfikuj RLS na żywo na produkcji — dwa konta, każde widzi
      tylko swoje; admin widzi wszystko; panel retencji/access-audit
      pokazuje realne dane.
- [ ] 8. Napraw banner błędów przy 429/500 w `frontend/src/app/chat/page.tsx`
      (`apiFetch`) — jedyny znany, niezałatany bug z 002.
- [ ] 9. `npm test` w backendzie.
- [ ] 10. Przejdź checklistę z [002](002-qa-nowych-funkcji.md) jeszcze raz,
      na produkcyjnym URL Railway (domyka blokadę z
      [001](001-deploy-produkcja.md)).
- [ ] 11. Smoke test całego flow: login → czat → koszt/jakość w bazie →
      eksport pptx/xlsx z panelu admina.

## Dzień 2 — dane i materiał na prezentację

- [ ] 12. Wyciągnij realne liczby z `/metrics/costs` i `/metrics/quality`
      (koszt/request, śr. jakość 1-5, koszt/user/miesiąc).
- [ ] 13. Policz porównanie: własne narzędzie vs. `ENTERPRISE_SEATS ×
      ENTERPRISE_SEAT_COST_USD`.
- [ ] 14. Zbuduj prezentację (branding Sales&More, skill
      `salesmore-prezentacja`): problem → co działa → bezpieczeństwo/
      compliance (RLS, pre-check PII, zgody klientów, retencja, audit
      trail) → liczby → rekomendacja + następne kroki (GCP deploy,
      BigQuery e2e — oba czekają na projekt GCP, patrz `docs/plan-mvp.md`).
- [ ] 15. Przygotuj żywe demo (2-3 min: czat, slash-komenda, panel admina).
- [ ] 16. Próba generalna na produkcyjnym URL Railway.
- [ ] 17. Plan B: screencast/screenshoty na wypadek awarii live.

## Kryterium "zrobione"
Wszystkie 17 punktów odhaczone, produkt działa stabilnie na produkcyjnym
URL Railway, prezentacja + demo gotowe do pokazania prezesowi.
