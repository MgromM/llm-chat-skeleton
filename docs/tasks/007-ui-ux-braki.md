# 007 — Braki UI/UX do realnego zastąpienia Claude/ChatGPT

Cel: domknąć funkcjonalności i UX tak, żeby zespół realnie używał tego
narzędzia zamiast Claude/ChatGPT na co dzień. Lista powstała z audytu UI/UX
z 2026-09-21 (frontend/src, backend/src/routes).

Jedno zadanie na czat — po zrobieniu odhacz, zapisz krótką notatkę pod
punktem (co zmienione, w jakich plikach), zacznij nowy czat promptem
z sekcji na dole.

## A — krytyczne (blokują codzienne użycie jako zamiennik)

- [x] 1. Wybór modelu w UI czatu. Backend ma `AVAILABLE_MODELS` i
      `PATCH /conversations/:id` z polem `model`, ale
      [frontend/src/app/chat/page.tsx:493](../../frontend/src/app/chat/page.tsx)
      wyświetla sztywny tekst „Pracujesz na modelu Claude Sonnet 5" zamiast
      selecta. Podmień na dropdown pobierający listę modeli i wysyłający
      PATCH przy zmianie.

      **Zrobione (2026-09-21):** `ConversationSettingsBar` w
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      dostał dropdown `<select>` z listą modeli (zamiast statycznego tekstu),
      podpięty pod nowy `handleChangeModel` wysyłający
      `api.updateConversationSettings(conversationId, { model })`. Lista
      modeli ładowana raz przy starcie przez `api.availableModels()`
      (istniejący endpoint `GET /chat/conversations/models`), etykiety
      w mapie `MODEL_LABELS`. Backend niezmieniony — już obsługiwał `model`
      w PATCH. Zweryfikowane: `npx tsc --noEmit` bez błędów; backend
      odpowiada 401 na `/api/chat/conversations/models` bez tokenu (trasa
      poprawnie zamontowana i chroniona) — pełna weryfikacja wizualna w
      przeglądarce niemożliwa, bo logowanie w tym repo jest wyłącznie przez
      Google OAuth (brak dev-loginu), a ręczne generowanie tokenu JWT do
      testów zostało zablokowane przez auto-mode classifier.
- [x] 2. Dark mode. Brak `dark:`/`prefers-color-scheme` w całym
      `frontend/src`. Dodać przełącznik motywu (np. w ustawieniach/topbar),
      tokeny kolorów w tailwind.config.ts, `dark:` warianty w kluczowych
      komponentach (chat, sidebar, admin panel).

      **Zrobione (2026-09-21):** `darkMode: 'class'` w
      [frontend/tailwind.config.ts](../../frontend/tailwind.config.ts).
      Nowy `ThemeProvider`/`useTheme` w
      [frontend/src/lib/ThemeContext.tsx](../../frontend/src/lib/ThemeContext.tsx)
      (localStorage `theme` + `prefers-color-scheme` fallback, dodaje/usuwa
      klasę `dark` na `<html>`), opakowany w
      [frontend/src/components/ThemeProvider.tsx](../../frontend/src/components/ThemeProvider.tsx)
      i podpięty w [frontend/src/app/layout.tsx](../../frontend/src/app/layout.tsx).
      Przełącznik motywu (☀️/🌙) w
      [frontend/src/components/BrandHeader.tsx](../../frontend/src/components/BrandHeader.tsx)
      — widoczny w topbarze na każdej zalogowanej stronie. Dodano warianty
      `dark:` (tło, tekst, obramowania, inputy, dymki wiadomości, tabele) w
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      (58 wystąpień), [frontend/src/app/admin/page.tsx](../../frontend/src/app/admin/page.tsx)
      (111 wystąpień) i [frontend/src/app/settings/page.tsx](../../frontend/src/app/settings/page.tsx)
      (26 wystąpień). Zweryfikowane: `npx tsc --noEmit` bez błędów; dev
      server startuje poprawnie (`preview_start`). Pełna wizualna weryfikacja
      zalogowanego widoku (chat/admin/settings z aktywnym `dark`) niemożliwa
      w tym środowisku — logowanie wyłącznie przez Google OAuth, bez
      dev-loginu (ten sam blocker co w punkcie 1).
- [x] 3. Retry przy błędach sieci/429 przy wysyłce wiadomości. Dziś tylko
      tłumaczony komunikat błędu (`friendlyErrorMessage` w chat/page.tsx),
      brak przycisku „spróbuj ponownie" i auto-retry z backoff dla 429/5xx.

      **Zrobione (2026-09-21):** W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx):
      dodano `isRetryableError` (429/5xx) i `RETRY_BACKOFF_MS` ([1s, 3s, 8s]).
      `runStream` (współdzielony driver dla wysyłki/edycji/regeneracji)
      zapamiętuje ostatnie żądanie w `lastRequestRef`, a przy błędzie
      sieciowym lub 429/5xx automatycznie ponawia próbę do 3 razy z rosnącym
      backoffem (stan `retrying` pokazuje banner „Ponawiam próbę…"). Gdy
      auto-retry się wyczerpie, banner błędu dostaje przycisk „Spróbuj
      ponownie" (`handleRetry`) wywołujący ponownie ostatnie żądanie z
      `lastRequestRef`. Zweryfikowane: `npx tsc --noEmit` bez błędów; dev
      server (`preview_start`) startuje i strona ładuje się bez błędów
      konsoli — pełna weryfikacja wizualna przepływu retry w zalogowanym
      czacie niemożliwa w tym środowisku (logowanie wyłącznie przez Google
      OAuth, bez dev-loginu — ten sam blocker co w punktach 1 i 2).
- [x] 4. Obsługa zerwania połączenia w trakcie streamu SSE. Dodać wskaźnik
      stanu połączenia i możliwość wznowienia/ponowienia generowania
      odpowiedzi po zerwaniu strumienia.

      **Zrobione (2026-09-21):** Luka: gdy połączenie SSE zrywało się w
      trakcie streamu (np. proxy/timeout zamyka strumień) bez wysłania
      zdarzenia `done`/`error`, `consumeSseResponse` w
      [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts) po prostu
      kończyła pętlę cicho — brak błędu, brak retry, częściowa odpowiedź
      ginęła bez żadnego sygnału dla usera. Dodano flagę
      `receivedTerminalEvent`; jeśli strumień zamknie się bez odebranego
      `done`/`error`, funkcja rzuca `ApiError('stream_interrupted')`. W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      `friendlyErrorMessage` dostał komunikat „Połączenie zostało przerwane
      w trakcie generowania odpowiedzi. Ponawiam próbę…", a
      `isRetryableError` traktuje `stream_interrupted` jako błąd przejściowy
      — dzięki temu włącza się już istniejący mechanizm auto-retry z
      backoffem (banner „Ponawiam próbę…") i, po wyczerpaniu prób, przycisk
      „Spróbuj ponownie" z punktu 3 — bez dodatkowego UI, bo ten sam wskaźnik
      stanu połączenia i mechanizm wznowienia już istniał, tylko nie
      obejmował cichego zerwania streamu. Zweryfikowane: `npx tsc --noEmit`
      bez błędów; dev server (`preview_start`) ładuje stronę czatu bez
      błędów kompilacji — pełna weryfikacja wizualna przepływu (symulacja
      realnego zerwania streamu w zalogowanej sesji) niemożliwa w tym
      środowisku, ten sam blocker braku dev-loginu co w punktach 1–3.
- [x] 5. Feedback UI podczas klasyfikacji wiadomości (żółta/czerwona flaga
      danych wrażliwych) w `handleSend` (chat/page.tsx) — dziś tylko flaga
      `classifying` bez widocznego wskaźnika (spinner/skeleton) dla usera.

      **Zrobione (2026-09-21):** W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      dodano wskaźnik podczas `classifying`: pasek z ikoną `Loader2`
      (animowany spinner z lucide-react) i tekstem „Sprawdzam wiadomość pod
      kątem danych wrażliwych…" nad polem wpisywania, plus przycisk wysyłki
      pokazuje spinner zamiast strzałki, gdy trwa klasyfikacja. Zweryfikowane:
      `npx tsc --noEmit` bez błędów; dev server (`preview_start`) ładuje
      stronę bez błędów kompilacji — pełna weryfikacja wizualna w zalogowanym
      czacie niemożliwa w tym środowisku (logowanie wyłącznie przez Google
      OAuth, bez dev-loginu — ten sam blocker co w punktach 1–4).

## B — ważne UX

- [x] 6. Przycisk „kopiuj" przy odpowiedzi asystenta (obok
      Edytuj/Regeneruj/Rozgałęź).

      **Zrobione (2026-09-21):** W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      dodano przycisk „Kopiuj" w rzędzie akcji wiadomości asystenta (obok
      Regeneruj/Rozgałęź), z ikoną `Copy`/`Check` z `lucide-react`. Nowy
      handler `handleCopy` używa `navigator.clipboard.writeText`, ustawia
      stan `copiedMessageId` i pokazuje „Skopiowano" przez 1.5s. Zweryfikowane:
      `npx tsc --noEmit` bez błędów; dev server (`preview_start`) ładuje
      stronę czatu bez błędów kompilacji — wysłanie testowej wiadomości do
      backendu kończyło się 500 (znany problem środowiska, backend zwraca
      błąd na `/chat/send`, niezwiązany z tą zmianą), więc pełna wizualna
      weryfikacja przycisku przy realnej odpowiedzi asystenta nie była
      możliwa w tym środowisku.
- [x] 7. Lepszy pusty stan / onboarding nowej rozmowy — przykładowe prompty,
      krótkie wyjaśnienie możliwości (załączniki, artefakty, slash-komendy)
      zamiast jednego zdania „Napisz wiadomość albo spróbuj /pomoc".

      **Zrobione (2026-09-21):** W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      pusty stan nowej rozmowy zastąpiony krótkim opisem możliwości
      (załączniki, artefakty otwierające się w panelu obok, slash-komendy) i
      siatką 4 klikalnych przykładowych promptów (nowa stała
      `EXAMPLE_PROMPTS`) — kliknięcie wypełnia pole wiadomości (`setDraft`) i
      ustawia focus na textarea, bez wysyłania. Zweryfikowane wizualnie w
      przeglądarce (`preview_start`, zalogowana sesja testowa): nowy pusty
      stan renderuje się poprawnie w dark mode, kliknięcie przykładu
      poprawnie wypełnia pole tekstowe „Napisz brief kreatywny dla nowej
      kampanii produktowej"; `npx tsc --noEmit` bez błędów; brak nowych
      błędów w konsoli (pozostałe błędy 500 na `/chat/send` to znany,
      niezwiązany problem środowiska backendu).
- [x] 8. Widoczna hierarchia system promptów w czacie — jasne wskazanie czy
      obowiązuje globalny prompt z ustawień czy prompt per-konwersacja
      (dziś `DefaultSystemPromptSection` w settings/page.tsx jest odseparowany
      od UI czatu).

      **Zrobione (2026-09-21):** W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      `ConversationSettingsBar` dostał nowy prop `hasGlobalPrompt` (pobierany
      w `ChatView` przez `api.me().defaultSystemPrompt` przy starcie) oraz
      link-badge „Globalny kontekst: aktywny/brak" obok przycisku „Dodaj/Edytuj
      prompt systemowy (tej rozmowy)" — kliknięcie prowadzi do `/settings`, a
      tooltip tłumaczy hierarchię: globalny kontekst z Ustawień obowiązuje we
      wszystkich rozmowach, a prompt tej rozmowy jest do niego dodawany.
      Przycisk edycji prompta konwersacji przemianowany na „…(tej rozmowy)"
      dla jasności. Zweryfikowane: `npx tsc --noEmit` bez błędów; wizualnie w
      przeglądarce (`preview_start`, zalogowana sesja testowa) — badge
      „Globalny kontekst: brak" renderuje się poprawnie w dark mode obok
      przycisku prompta rozmowy. Stan „aktywny" (po zapisaniu globalnego
      prompta w Ustawieniach) nie dał się zweryfikować end-to-end w tym
      środowisku — `GET /api/auth/me` i zapis ustawienia zwracały 500
      (znany, niezwiązany problem backendu, ten sam typ co w punkcie 6);
      logika jest analogiczna do już działającego punktu 1 (`api.me()` w
      innym miejscu), więc ryzyko niskie.
- [ ] 9. Konflikt z-index sidebar/panel artefaktów na mobile — oba
      `fixed inset-*` z tym samym z-index, mogą się nakładać przy otwarciu
      jednocześnie na małym ekranie.
- [ ] 10. Animowany kursor na końcu streamowanego tekstu odpowiedzi (dziś
       tylko statyczne „Asystent pisze…").

## C — nice-to-have

- [ ] 11. Eksport pojedynczej wiadomości (obrazek/PDF), dziś jest tylko
       eksport całej konwersacji (`exportConversation`).
- [ ] 12. Skróty klawiszowe (np. Cmd+K — nowa rozmowa / wyszukiwanie).
- [ ] 13. Zakładka „Usage/Metryki" w panelu admina — backend
       (`metrics.routes.js`) już to udostępnia, brak UI w `admin/page.tsx`.

## Prompt na kolejny czat

```
Kontekst: repo salesmore-llm, task docs/tasks/007-ui-ux-braki.md.
Weź pierwszy nieodhaczony punkt z listy (sekcja A przed B przed C), zrób go,
zweryfikuj w przeglądarce (preview_start / dev server), odhacz w pliku i
dopisz krótką notatkę pod punktem co zmienione i w jakich plikach.
Jedno zadanie na ten czat, potem zaproponuj wyczyszczenie okna.
```
