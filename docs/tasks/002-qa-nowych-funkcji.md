# 002 — Ręczna weryfikacja QA wszystkich 10 nowych funkcji

**Blokowane przez:** [001-deploy-produkcja.md](001-deploy-produkcja.md) — bez
działającego logowania na produkcji nie da się tego zrobić na prawdziwym
środowisku (można częściowo lokalnie, `cd backend && npm run dev` +
`cd frontend && npm run dev`).

## Cel
Przejść ręcznie każdą z 10 funkcji na produkcyjnym URL (albo lokalnie, jeśli
001 się przeciąga) i zaznaczyć w tym pliku co działa, co nie.

## Checklist

- [ ] **1. Syntax highlighting** — poproś model o blok kodu (np. "napisz
      hello world w Pythonie"), sprawdź czy kod ma kolorowanie składni
      (motyw github-dark).
- [ ] **2. Banner błędów** — wyłącz na chwilę internet / poczekaj na 429
      (masowo wysyłaj wiadomości) i sprawdź czy pojawia się czytelny
      komunikat błędu zamiast cichej ciszy.
- [ ] **3. Usuwanie/zmiana nazwy konwersacji** — w sidebarze zmień nazwę
      konwersacji, potem usuń inną. Odśwież stronę — zmiany mają zostać.
- [ ] **4. Wybór modelu + system prompt** — w ustawieniach konwersacji
      wybierz inny model (Sonnet/Opus/Haiku), wpisz system prompt typu
      "zawsze odpowiadaj tylko słowem BANANA", wyślij wiadomość — sprawdź
      czy faktycznie posłuchał.
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
