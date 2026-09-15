# Zadania po audycie "chat jak Claude" (2026-09-14/15)

Ten folder rozbija pracę na osobne pliki, żeby dało się je robić **częściami,
czyszcząc czat między nimi**. Każdy plik to jedno zadanie: cel, stan wyjściowy,
kroki, kryterium "zrobione". Otwórz nowy czat i poproś: *"weź się za
docs/tasks/00X-nazwa.md"* — nie trzeba powtarzać kontekstu, jest w pliku.

Kolejność ma znaczenie (numeracja) — 001 blokuje resztę (nic nie da się
przetestować, dopóki produkcja nie działa).

## Status na 2026-09-15

- [ ] 001 — Dokończyć deploy produkcyjny (push zrobiony, deploy w toku)
- [ ] 002 — Ręczna weryfikacja QA wszystkich 10 nowych funkcji
- [ ] 003 — Drobne poprawki zostawione przez agenta implementującego
- [ ] 004 — Podatności bezpieczeństwa (Dependabot: 1 critical, 12 high, 8 moderate)
- [ ] 005 — Polityka retencji danych / RODO (dokument, nie kod)

## Kontekst ogólny (nie trzeba tego powtarzać w nowym czacie)

- Projekt: wewnętrzny chat LLM dla Sales&More, logowanie tylko Google OAuth
  z domeną `@salesmore.pl`, hostowane na Railway (backend + frontend +
  Postgres), repo `salesandmore/salesmore-LLM-mvp`.
- 2026-09-14: naprawiony błąd `relation "users" does not exist` (migracje
  nie odpalały się automatycznie) — teraz Dockerfile robi `npm run migrate`
  przed startem serwera.
- 2026-09-14/15: zaimplementowano 10 brakujących funkcji "jak w Claude.ai"
  (syntax highlighting, obsługa błędów UI, usuwanie/zmiana nazwy
  konwersacji, wybór modelu + system prompt, wyszukiwanie, eksport rozmowy,
  mobile UI, streszczanie długiego kontekstu, ekstrakcja PDF, RODO/usuwanie
  konta) — wszystko scommitowane i wypchnięte na `main`, deploy w toku.
- `railway` CLI jest zalogowane i podpięte do projektu `salesmore-llm`
  (`cd backend && railway status` pokazuje service `backend`). Auto-deploy
  z GitHuba na Railway **nie działa niezawodnie** — po pushu trzeba ręcznie
  `railway up` (buduje z lokalnego kodu) albo `railway redeploy` (tylko
  ponownie odpala already-built obraz, NIE bierze nowego kodu — nie mylić).
- Migracje na produkcyjnej bazie odpala się przez
  `cd backend && railway ssh "npm run migrate"` (działa, bo `railway ssh`
  wchodzi do sieci Railway, gdzie `postgres.railway.internal` się
  rozwiązuje — lokalnie `railway run` tego nie zrobi).
- Pierwsze konto admina tworzy się przez
  `railway ssh "SEED_ADMIN_EMAIL=twój@salesmore.pl npm run seed:admin"`.
