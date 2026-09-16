# 001 — Dokończyć deploy produkcyjny

**Status: ZROBIONE (2026-09-16).** Backend i frontend zdeployowane na
Railway z aktualnym kodem (`main` po `9dceeed`), login page ładuje się bez
błędów na produkcyjnym URL. Uwaga: linkowanie Railway CLI dla `frontend/`
było błędnie podpięte do serwisu `backend` — naprawione trwałym
`railway link -s frontend` (patrz commit historii deployów z 16.09).

## Cel
Wszystkie 10 commitów z nowymi funkcjami ma działać na
`https://backend-production-bff3.up.railway.app` /
`https://frontend-production-c7e96.up.railway.app`, a Michał ma móc się
zalogować kontem Google `michal.grom@salesmore.pl`.

## Stan wyjściowy (2026-09-15)
- 10 commitów wypchniętych na `main` (od `5712f90` do `a586a67`).
- `cd backend && railway up --detach` odpalone — build w toku w momencie
  pisania tego pliku. Sprawdź czy się skończył: `railway deployment list`
  (najnowszy wpis ma być `SUCCESS`, nie `FAILED`).
- Frontend **jeszcze nie był deployowany** z nowym kodem (nowe strony
  `/settings`, zmiany w `chat/page.tsx`) — trzeba zrobić analogicznie
  `cd frontend && railway up --detach`.
- Dwie nowe migracje SQL czekają na odpalenie na produkcyjnej bazie:
  `backend/src/db/migrations/007_conversation_settings.sql` i
  `008_gdpr_account_deletion.sql`.
- Konto `michal.grom@salesmore.pl` może już istnieć w tabeli `users` z
  wcześniejszej sesji (był tam seed) — sprawdź przed ponownym seedowaniem,
  żeby nie dublować (skrypt ma `ON CONFLICT DO UPDATE`, więc jest bezpieczny
  do ponownego odpalenia).

## Kroki
1. `cd backend && railway deployment list` — potwierdź że build backendu
   się udał (`SUCCESS`).
2. `cd backend && railway ssh "npm run migrate"` — odpali WSZYSTKIE
   migracje włącznie z nowymi 007/008 (są idempotentne, bezpieczne do
   wielokrotnego odpalania).
3. `cd backend && railway ssh "SEED_ADMIN_EMAIL=michal.grom@salesmore.pl npm run seed:admin"`
   — upewnij się że konto ma rolę `admin`.
4. `cd frontend && railway up --detach` — zdeployuj nowy frontend
   (sidebar, `/settings`, eksport, wyszukiwanie itd. są tam).
5. `cd frontend && railway deployment list` — potwierdź `SUCCESS`.
6. Wejdź na `https://frontend-production-c7e96.up.railway.app`, zaloguj się
   przez Google (`michal.grom@salesmore.pl`) — ma zadziałać bez błędu
   "Nie masz konta w tym systemie".
7. Jeśli coś nie działa: `cd backend && railway logs` / `cd frontend &&
   railway logs` — sprawdź błędy startu (najczęstsze: brakująca zmienna
   env, migracja się nie odpaliła, port mismatch — patrz 003).

## Kryterium "zrobione"
Logowanie działa na produkcyjnym URL, wysłanie wiadomości w czacie daje
odpowiedź modelu (streaming widoczny), sidebar pokazuje listę konwersacji.
