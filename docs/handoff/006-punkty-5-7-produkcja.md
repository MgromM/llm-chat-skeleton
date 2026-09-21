# Prompt do wklejenia w nowym czacie — 006, punkty 5-7 (baza produkcyjna Railway)

## Kontekst
Repo `salesmore-llm`. Punkty 1-4 z [docs/tasks/006-domkniecie-do-prezentacji.md](../tasks/006-domkniecie-do-prezentacji.md)
są zrobione i zmergowane do `main` (commit `8de0145`, wypchnięty na
`origin/main` → michalgrom-salesmore/salesmore-LLM-mvp, Railway auto-deployuje
z tego repo). Zostają punkty 5-7: włączenie realnej izolacji RLS na
produkcji.

## Wymagania / kroki do wykonania

1. **Utwórz rolę `salesmore_app` na produkcyjnej bazie Railway** —
   non-superuser, żeby polityki RLS z migracji 025-027
   (`conversations_isolation`, `messages_isolation`) faktycznie się
   egzekwowały (superuser je omija). Backend łączy się jako
   `APP_DATABASE_URL` (patrz [backend/src/config/db.js](../../backend/src/config/db.js))
   z fallbackiem do `DATABASE_URL` (superuser) gdy nie ustawione — dziś nie
   jest ustawione, więc RLS jest martwe na produkcji.
2. **Ustaw sekret `backend`** na Railway:
   `railway variables -s backend --set APP_DATABASE_URL=<connection string dla salesmore_app>`.
3. **Odpal migracje 025-027 na produkcji** przez
   `cd backend && railway ssh "npm run migrate"` (NIE `railway run` —
   `postgres.railway.internal` rozwiązuje się tylko wewnątrz sieci Railway,
   patrz [docs/tasks/README.md](../tasks/README.md)).
4. **Zweryfikuj RLS na żywo**: dwa konta testowe, każde widzi tylko swoje
   konwersacje; konto z `is_admin=true` widzi wszystko; panel
   retencji/access-audit w adminie pokazuje realne dane z produkcyjnej bazy.

## Uwagi bezpieczeństwa
- Tworzenie roli DB, ustawianie sekretów produkcyjnych i migracje na
  produkcyjnej bazie to nieodwracalne/trudno odwracalne akcje na
  współdzielonej infrastrukturze — potwierdź plan z użytkownikiem przed
  wykonaniem każdego z tych kroków (nie wykonuj automatycznie w trybie auto).
- Przed `railway variables --set` sprawdź obecne zmienne (`railway variables`),
  żeby nie nadpisać czegoś istniejącego przez pomyłkę.
- Po zakończeniu odhacz punkty 5-7 w
  [docs/tasks/006-domkniecie-do-prezentacji.md](../tasks/006-domkniecie-do-prezentacji.md)
  i przejdź do punktu 8 (banner błędów 429/500 w czacie).
