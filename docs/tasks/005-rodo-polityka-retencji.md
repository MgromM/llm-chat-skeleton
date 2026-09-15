# 005 — Polityka retencji danych / RODO

**Nie blokuje** deployu ani demo — to dokument, nie kod. Niski priorytet na
"jutro", ale CEO może o to zapytać przy pokazywaniu produktu na zewnątrz.

## Cel
Spisać krótką politykę: jak długo trzymamy dane rozmów, co się dzieje przy
usunięciu konta, kto ma dostęp do czyich danych.

## Stan wyjściowy (2026-09-15)
Kod na usuwanie konta już istnieje (`DELETE /auth/me`, commit `a586a67`,
patrz [001](001-deploy-produkcja.md)) — kasuje konto i kaskadowo jego
konwersacje/wiadomości. Nie ma jednak spisanej **polityki**: czy dane są
gdzieś backupowane mimo usunięcia konta (np. backup bazy Railway), jak
długo trzymamy logi (`winston`), czy specialiści/managerowie widzą
rozmowy innych użytkowników.

## Kroki
1. Sprawdź faktyczne zachowanie backupów Railway Postgres — czy usunięcie
   rekordu z `DELETE /auth/me` naprawdę usuwa dane, czy tylko z aktywnej
   bazy (backup może trzymać kopię przez X dni — to normalne i trzeba to
   tylko nazwać w polityce, nie da się tego obejść).
2. Sprawdź w kodzie (`backend/src/middleware/auth.js`, role w
   `chat.routes.js`) czy manager/admin ma wgląd w rozmowy specjalistów —
   jeśli tak, to musi być jawnie napisane w polityce (nie każdy user może
   się tego spodziewać).
3. Napisz krótki dokument (1 strona, np. `docs/polityka-danych.md`):
   - jakie dane zbieramy (treść rozmów, załączniki, email z Google OAuth)
   - jak długo trzymamy (domyślnie: bezterminowo do usunięcia konta —
     zdecydować czy to OK, czy potrzebny automatyczny retencyjny cron)
   - kto ma dostęp (role i co widzą)
   - jak usunąć swoje dane (link do `/settings`)
4. Pokazać do akceptacji CEO/osobie odpowiedzialnej za zgodność, zanim
   trafi do klientów zewnętrznych.

## Kryterium "zrobione"
Dokument `docs/polityka-danych.md` istnieje i jest zaakceptowany.
