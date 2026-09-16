# 002 — Ręczna weryfikacja QA wszystkich 10 nowych funkcji

**Blokowane przez:** [001-deploy-produkcja.md](001-deploy-produkcja.md) — bez
działającego logowania na produkcji nie da się tego zrobić na prawdziwym
środowisku (można częściowo lokalnie, `cd backend && npm run dev` +
`cd frontend && npm run dev`).

## Cel
Przejść ręcznie każdą z 10 funkcji na produkcyjnym URL (albo lokalnie, jeśli
001 się przeciąga) i zaznaczyć w tym pliku co działa, co nie.

## Stan na 2026-09-16 (sesja QA)
- Logowanie na produkcji dawało `Request failed: 500` (Google i email/hasło).
  Przyczyna: serwis `backend` na Railway nie miał ustawionej zmiennej `PORT`,
  więc referencja `${{backend.PORT}}` w `BACKEND_URL` frontendu (patrz
  `.railway/railway.ts:49`) rozwiązywała się do pustego stringa —
  `http://backend.railway.internal:` bez portu → `ECONNREFUSED` przy
  proxowaniu `/auth/google/login-url`. **Naprawione:** ustawiono
  `PORT=8080` na serwisie `backend` (`cd backend && railway variables -s
  backend --set "PORT=8080"`), zrobiono redeploy backendu (automatyczny po
  zmianie zmiennej) i ręczny `railway redeploy -s frontend` — oba SUCCESS.
  **Do zrobienia:** potwierdzić, że logowanie faktycznie przechodzi po tej
  naprawie, zanim ruszymy dalej z checklistą.
- Uwaga przy okazji: `cd backend && railway status` czasem znów pokazuje
  serwis `frontend` zamiast `backend` (nawrót problemu opisanego w pamięci
  "Railway linking naprawiony") — zawsze dodawaj `-s backend` / `-s
  frontend` jawnie do komend `railway logs`/`variables`, nie polegaj na
  samym linkowaniu katalogu.

## Checklist

- [ ] **1. Syntax highlighting** — poproś model o blok kodu (np. "napisz
      hello world w Pythonie"), sprawdź czy kod ma kolorowanie składni
      (motyw github-dark).
- [ ] **2. Banner błędów** — wyłącz na chwilę internet / poczekaj na 429
      (masowo wysyłaj wiadomości) i sprawdź czy pojawia się czytelny
      komunikat błędu zamiast cichej ciszy.
- [ ] **3. Usuwanie/zmiana nazwy konwersacji** — w sidebarze zmień nazwę
      konwersacji, potem usuń inną. Odśwież stronę — zmiany mają zostać.
- [ ] **4. System prompt** — ~~wybór modelu~~ usunięty w `79a677c`
      (16.09) — appka serwuje tylko Sonnet 5, UI pokazuje statyczny label,
      nie ma już czego testować w tej części. Zostaje system prompt: w
      ustawieniach konwersacji wpisz system prompt typu "zawsze odpowiadaj
      tylko słowem BANANA", wyślij wiadomość — sprawdź czy faktycznie
      posłuchał.
- [ ] **5. Wyszukiwanie** — wpisz frazę z jednej ze starych konwersacji w
      pole szukania w sidebarze, sprawdź czy filtruje poprawnie.
- [ ] **6. Eksport rozmowy** — kliknij "Eksportuj", sprawdź czy pobrany
      plik `.md` ma poprawną treść całej rozmowy.
- [ ] **7. Mobile UI** — otwórz na telefonie (albo zwęź okno przeglądarki
      do ~375px), sprawdź czy sidebar chowa się za hamburgerem i czat jest
      używalny.
- [ ] **8. Streszczanie długiego kontekstu** — przeprowadź rozmowę
      >20 wiadomości, sprawdź czy model dalej "pamięta" wątek sprzed
      streszczenia (np. zapytaj o coś z 1. wiadomości).
- [ ] **9. Ekstrakcja PDF** — załącz PDF z tekstem, zapytaj model o jego
      treść — ma odpowiedzieć na podstawie realnej zawartości.
- [ ] **10. RODO / usuwanie konta** — NA KONCIE TESTOWYM (nie na swoim!)
      wejdź w `/settings`, usuń konto, sprawdź że nie da się już zalogować
      tym kontem i że jego konwersacje zniknęły z bazy.

## Znane drobne problemy do sprawdzenia przy okazji (z raportu agenta)
- Precheck bezpieczeństwa (LLM-judge) czasem blokuje niewinne wiadomości ze
  słowami typu "secret code" — sprawdź czy to nie przeszkadza w normalnym
  użyciu (np. rozmowa o hasłach/kluczach API w kontekście biznesowym).
- `GET /conversations` zwraca zdublowane pole `system_prompt`/
  `systemPrompt` — nieszkodliwe, ale sprawdź czy frontend nie miesza który
  czyta.

## Kryterium "zrobione"
Wszystkie 10 punktów odhaczone jako działające, albo spisana lista błędów
do przekazania na 003.
