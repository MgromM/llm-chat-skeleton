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

- [x] **1. Syntax highlighting** — poproś model o blok kodu (np. "napisz
      hello world w Pythonie"), sprawdź czy kod ma kolorowanie składni
      (motyw github-dark).
      **DZIAŁA.** Sprawdzone lokalnie (`npm run dev` obu serwisów, konto
      testowe). Blok kodu renderuje się na ciemnym tle z kolorowaniem
      (`print(...)` i string w różnych kolorach).
- [x] **2. Banner błędów** — wyłącz na chwilę internet / poczekaj na 429
      (masowo wysyłaj wiadomości) i sprawdź czy pojawia się czytelny
      komunikat błędu zamiast cichej ciszy.
      **BUG.** Wywołano realny 429 (60 żądań/min limit z
      `backend/src/server.js`) i przeładowano stronę w tym oknie: lista
      konwersacji w sidebarze cicho pokazuje "Brak wyników" (bez banera,
      bez toasta), a w konsoli leci nieobsłużony
      `Uncaught (in promise) Error: Request failed: 500/429` z
      `frontend/src/app/chat/page.tsx:691` (`apiFetch`). Użytkownik nie
      dostaje żadnej informacji o błędzie — dokładnie ten problem, który
      punkt miał wykryć. Do naprawy w 003: `apiFetch` powinien pokazywać
      widoczny banner/toast przy błędach sieci/HTTP zamiast tylko
      rzucać wyjątkiem do konsoli.
- [x] **3. Usuwanie/zmiana nazwy konwersacji** — w sidebarze zmień nazwę
      konwersacji, potem usuń inną. Odśwież stronę — zmiany mają zostać.
      **DZIAŁA.** Rename przez UI przetrwał odświeżenie. Usuwanie w UI
      używa natywnego `window.confirm()` — narzędzie przeglądarki użyte do
      testów automatycznie tłumi natywne dialogi (`confirm()` zwraca
      `false`), więc samo kliknięcie usuwania nie dało się zweryfikować
      w UI tego narzędzia; potwierdzono więc działanie samego
      `DELETE /chat/conversations/:id` przez API (z tym samym tokenem z
      sesji) — usunięcie i trwałość po odświeżeniu OK. Realny użytkownik w
      prawdziwej przeglądarce zobaczy natywny popup potwierdzenia bez
      przeszkód.
- [x] **4. System prompt** — ~~wybór modelu~~ usunięty w `79a677c`
      (16.09) — appka serwuje tylko Sonnet 5, UI pokazuje statyczny label,
      nie ma już czego testować w tej części. Zostaje system prompt: w
      ustawieniach konwersacji wpisz system prompt typu "zawsze odpowiadaj
      tylko słowem BANANA", wyślij wiadomość — sprawdź czy faktycznie
      posłuchał.
      **DZIAŁA.** Zapisany prompt systemowy przetrwał, model odpowiedział
      dokładnie "BANANA" na niepowiązane pytanie.
- [x] **5. Wyszukiwanie** — wpisz frazę z jednej ze starych konwersacji w
      pole szukania w sidebarze, sprawdź czy filtruje poprawnie.
      **DZIAŁA** (z zastrzeżeniem). `GET /chat/conversations/search`
      filtruje po treści WIADOMOŚCI (`m.content ILIKE`), nie po tytule
      konwersacji — wyszukanie frazy z treści starej rozmowy działa
      poprawnie i pokazuje `matchedSnippet`. Szukanie samego tytułu
      konwersacji (jeśli nie występuje też w treści wiadomości) nie
      zwróci wyniku — to raczej świadomy zakres funkcji niż bug, ale
      warto dopisać do UI podpowiedź, że szuka się w treści, nie w
      nazwach.
- [x] **6. Eksport rozmowy** — kliknij "Eksportuj", sprawdź czy pobrany
      plik `.md` ma poprawną treść całej rozmowy.
      **DZIAŁA.** `GET /chat/conversations/:id/export` zwraca poprawny
      Markdown z tytułem, znacznikami czasu i treścią user/assistant.
- [x] **7. Mobile UI** — otwórz na telefonie (albo zwęź okno przeglądarki
      do ~375px), sprawdź czy sidebar chowa się za hamburgerem i czat jest
      używalny.
      **DZIAŁA.** Przy 375×812 sidebar chowa się, hamburger otwiera go
      jako nakładkę (drawer) nad czatem, czat pozostaje czytelny i
      używalny.
- [x] **8. Streszczanie długiego kontekstu** — przeprowadź rozmowę
      >20 wiadomości, sprawdź czy model dalej "pamięta" wątek sprzed
      streszczenia (np. zapytaj o coś z 1. wiadomości).
      **DZIAŁA.** Po >20 wiadomościach model poprawnie odwołał się do
      podsumowania wcześniejszej części rozmowy zamiast "zapominać" wątek.
      Przy okazji zaobserwowano ciekawy (poprawny) efekt uboczny: gdy
      pierwsza wiadomość została zablokowana przez precheck, model i tak
      zobaczył jej treść w wygenerowanym podsumowaniu i **prawidłowo
      odmówił** potraktowania jej jako zweryfikowanej informacji, ostrzegając
      o możliwym prompt injection — zachowanie bezpieczne, nie bug.
- [x] **9. Ekstrakcja PDF** — załącz PDF z tekstem, zapytaj model o jego
      treść — ma odpowiedzieć na podstawie realnej zawartości.
      **DZIAŁA.** Z poprawnie wygenerowanym PDF-em (`cupsfilter`) model
      dokładnie zacytował treść załącznika. (Pierwsza próba z ręcznie
      sklejonym, wadliwym PDF-em bez poprawnej tablicy `xref` nie została
      odczytana i model to zgłosił — to wina testowego pliku, nie appki.)
- [x] **10. RODO / usuwanie konta** — NA KONCIE TESTOWYM (nie na swoim!)
      wejdź w `/settings`, usuń konto, sprawdź że nie da się już zalogować
      tym kontem i że jego konwersacje zniknęły z bazy.
      **DZIAŁA.** Użyto konta `test@salesmore.pl` (dedykowane konto
      testowe, hasło ustawione lokalnie na potrzeby tej sesji QA).
      `DELETE /auth/me` → 200, próba logowania tym samym mailem/hasłem →
      `Invalid credentials`, w bazie 0 rekordów w `users` i `conversations`
      dla tego usera (kaskada zadziałała).

## Znane drobne problemy do sprawdzenia przy okazji (z raportu agenta)
- **POTWIERDZONE.** Precheck bezpieczeństwa (LLM-judge) blokuje niewinne
  wiadomości ze słowami typu "hasło", "kod", a nawet "magiczna liczba" —
  w tej sesji zablokował m.in. "Zapamiętaj proszę magiczną liczbę: 4217"
  i wiadomość zawierającą słowo "hasło". To realnie przeszkadza w
  normalnym użyciu (np. rozmowa o hasłach/kluczach API w kontekście
  biznesowym, o czym już wspominał raport agenta). Do rozważenia w 003:
  zawężenie prechecka albo dodanie confirm/override dla fałszywych
  trafień.
- **POTWIERDZONE.** `GET /chat/conversations` faktycznie zwraca zdublowane
  pole `system_prompt`/`systemPrompt` (sprawdzone przez API) — nadal
  nieszkodliwe, tylko do ewentualnego sprzątnięcia.

## Nowy błąd znaleziony w tej sesji
- **Brak widocznego banera błędów przy 429/500** (patrz punkt 2 wyżej) —
  jedyny realny bug znaleziony podczas tego przebiegu QA. Reszta 9
  punktów działa zgodnie z oczekiwaniami na środowisku lokalnym.

## Kryterium "zrobione"
9 z 10 punktów działa poprawnie lokalnie (`cd backend && npm run dev` +
`cd frontend && npm run dev`, konto testowe `test@salesmore.pl` — usunięte
na końcu sesji w ramach testu punktu 10, do odtworzenia w razie potrzeby
przez `npm run seed:admin` + rejestrację). Jedyny znaleziony błąd: brak
banera błędów przy 429/500 (punkt 2) — do przekazania na 003. QA na
produkcji (prawdziwy URL) wciąż wymaga domknięcia 001 (potwierdzenia, że
naprawka `PORT` na Railway rzeczywiście naprawiła logowanie).
