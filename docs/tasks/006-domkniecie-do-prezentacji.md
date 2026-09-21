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
- [x] 4. Commit całości (RLS + retencja + compliance panel), opisowy
      message.
- [x] 5. Utwórz rolę `salesmore_app` na produkcyjnej bazie Railway + ustaw
      `APP_DATABASE_URL` jako sekret `backend` (`railway variables -s
      backend --set ...`).
- [x] 6. Odpal migracje 025-027 na Railway (`railway ssh "npm run
      migrate"` — patrz notatka w [README](README.md) o `railway ssh` vs
      `railway run`).
- [x] 7. Zweryfikuj RLS na żywo na produkcji — zweryfikowane na poziomie
      bazy (rola `salesmore_app` NOSUPERUSER/NOBYPASSRLS, `FORCE ROW LEVEL
      SECURITY` na `conversations`/`messages`, symulacja kontekstu
      `app.current_user_id`/`app.is_admin` przez `salesmore_app` potwierdza
      izolację: właściciel widzi swoje 2 konwersacje, inny user_id widzi 0,
      `is_admin=true` widzi wszystko, brak kontekstu widzi 0). **Nie
      zweryfikowano end-to-end przez UI** — produkcja ma obecnie tylko 3
      konta i wszystkie mają `role='admin'`, więc nie było jak przetestować
      "dwa nieadministracyjne konta widzą tylko swoje" przez przeglądarkę;
      panel `/clients/access-audit` i `/metrics/retention` nie zostały
      sprawdzone przez zalogowanie (brak hasła), tylko przez potwierdzenie,
      że leżące pod nimi dane istnieją (`ai_audit_log`: 57 wierszy).
- [x] 8. Napraw banner błędów przy 429/500 w `frontend/src/app/chat/page.tsx`
      (`apiFetch`) — jedyny znany, niezałatany bug z 002. Zweryfikowane: fix
      już istnieje (commit `0b12e55`, 2026-09-15) — `consumeSseResponse`/
      `apiFetch` rzucają `ApiError`, `runStream` łapie ją i pokazuje
      widoczny banner (`friendlyErrorMessage` z osobnymi komunikatami dla
      429/5xx), z przyciskiem zamknięcia. Checklista była tylko
      nieodhaczona.
- [x] 9. `npm test` w backendzie — 14/14 testów zielonych (PII tokenizacja,
      pre-check zgody/wrażliwych danych, progi confidence).
- [ ] 10. Przejdź checklistę z [002](002-qa-nowych-funkcji.md) jeszcze raz,
      na produkcyjnym URL Railway (domyka blokadę z
      [001](001-deploy-produkcja.md)).
      **Status 2026-09-21:** produkcja (`https://frontend-production-c7e96.up.railway.app`)
      ma tylko 3 konta, wszystkie `role='admin'` (`michal.grom`,
      `andrzej.rusilowicz`, `tomasz.kozarzewski`) — sprawdzone przez
      `railway ssh` (`SELECT id, email, role FROM users`). Logowanie na
      produkcji to wyłącznie Google OAuth dla domeny `@salesmore.pl`
      ([backend/src/routes/auth.routes.js:67-94](../../backend/src/routes/auth.routes.js)) —
      konto samoprowizonuje się z rolą `specialist` przy pierwszym
      logowaniu danego adresu, nie ma endpointu rejestracji hasłem. Nie da
      się więc "utworzyć" non-admin konta samym zapisem w bazie z sufitu —
      potrzebny jest realny adres `@salesmore.pl` z dostępem do Google.
      Ustalono z Michałem: nie zmieniać roli istniejących 3 kont, testy
      loginu i checklisty 002 na produkcji **Michał robi sam ręcznie**
      (loguje się dwoma nowymi adresami @salesmore.pl przez Google w
      przeglądarce, w tym sprawdza że dwa różne non-admin konta widzą
      tylko swoje konwersacje). Do zrobienia przez Michała: przejść 002 na
      powyższym URL i odhaczyć ten punkt tutaj po zakończeniu.
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
