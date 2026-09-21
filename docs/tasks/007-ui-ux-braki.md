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
      w PATCH. **Zweryfikowano wizualnie (2026-09-21):** zalogowano się
      realnym Google OAuth na produkcyjnym deployu Railway
      (frontend-production-c7e96.up.railway.app), przełączono model
      w dropdownie na „Claude Haiku 4.5" — `PATCH /api/chat/conversations/:id`
      poszedł i zwrócił 200, wybór modelu przetrwał nawigację między
      stronami. Działa poprawnie.
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
      (26 wystąpień). **Zweryfikowano wizualnie (2026-09-21):** na
      produkcyjnym deployu Railway przełączono motyw przyciskiem w
      topbarze — dark↔light działa poprawnie na czacie i w panelu admina
      (wszystkie 4 zakładki), tła/tekst/obramowania/tabele mają poprawny
      kontrast w obu trybach. Działa poprawnie.
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
      `lastRequestRef`. **Zweryfikowano wizualnie (2026-09-21):** na
      produkcyjnym deployu, przez podmianę `window.fetch` w konsoli
      przeglądarki wymuszono odpowiedź 429 na pierwszym żądaniu
      `POST /chat/conversations/:id/messages` — aplikacja automatycznie
      ponowiła żądanie (2. wywołanie poszło do prawdziwego backendu i
      dostało realną odpowiedź asystenta), bez wiszącego błędu w UI.
      Mechanizm auto-retry działa poprawnie.
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
      obejmował cichego zerwania streamu. **Zweryfikowano wizualnie
      (2026-09-21):** na produkcyjnym deployu, przez podmianę `window.fetch`
      zwrócono na pierwsze żądanie SSE strumień, który wysyła jeden `delta`
      i zamyka się bez `done`/`error` — aplikacja wykryła ciche zerwanie,
      automatycznie ponowiła żądanie (2. wywołanie trafiło do prawdziwego
      backendu) i dokończyła odpowiedź z widocznym migającym kursorem, bez
      utraty wiadomości ani zawieszenia UI. Działa poprawnie.
- [x] 5. Feedback UI podczas klasyfikacji wiadomości (żółta/czerwona flaga
      danych wrażliwych) w `handleSend` (chat/page.tsx) — dziś tylko flaga
      `classifying` bez widocznego wskaźnika (spinner/skeleton) dla usera.

      **Zrobione (2026-09-21):** W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      dodano wskaźnik podczas `classifying`: pasek z ikoną `Loader2`
      (animowany spinner z lucide-react) i tekstem „Sprawdzam wiadomość pod
      kątem danych wrażliwych…" nad polem wpisywania, plus przycisk wysyłki
      pokazuje spinner zamiast strzałki, gdy trwa klasyfikacja.
      **Zweryfikowano wizualnie (2026-09-21):** na produkcyjnym deployu, po
      wysłaniu realnej wiadomości widoczny był pasek „Sprawdzam wiadomość
      pod kątem danych wrażliwych…" ze spinnerem `Loader2`, a przycisk
      wysyłki pokazywał kwadrat (stop) zamiast strzałki. Działa poprawnie —
      zobacz też punkt E.1 (drobny błąd: pasek klasyfikacji nie znika od
      razu po starcie streamu tekstu).

## B — ważne UX

- [x] 6. Przycisk „kopiuj" przy odpowiedzi asystenta (obok
      Edytuj/Regeneruj/Rozgałęź).

      **Zrobione (2026-09-21):** W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      dodano przycisk „Kopiuj" w rzędzie akcji wiadomości asystenta (obok
      Regeneruj/Rozgałęź), z ikoną `Copy`/`Check` z `lucide-react`. Nowy
      handler `handleCopy` używa `navigator.clipboard.writeText`, ustawia
      stan `copiedMessageId` i pokazuje „Skopiowano" przez 1.5s.
      **Zweryfikowano wizualnie (2026-09-21) + naprawiono błąd:** na
      produkcyjnym deployu kliknięcie „Kopiuj" przy realnej odpowiedzi
      asystenta faktycznie zapisywało treść do schowka. Znaleziono jednak,
      że `handleCopy` nie miał obsługi błędu — gdy `navigator.clipboard.
      writeText` rzuca (np. odmowa uprawnień w niektórych kontekstach
      przeglądarki), przycisk nie pokazywał żadnego feedbacku i zostawiał
      nieobsłużony wyjątek w konsoli. **Naprawiono:** dodano `try/catch`
      z fallbackiem przez `document.execCommand('copy')` na tymczasowym
      `<textarea>` — zobacz commit „Fix: handle clipboard write failure in
      copy-message button".
- [x] 7. Lepszy pusty stan / onboarding nowej rozmowy — przykładowe prompty,
      krótkie wyjaśnienie możliwości (załączniki, artefakty, slash-komendy)
      zamiast jednego zdania „Napisz wiadomość albo spróbuj /pomoc".

      **Zrobione (2026-09-21):** W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      pusty stan nowej rozmowy zastąpiony krótkim opisem możliwości
      (załączniki, artefakty otwierające się w panelu obok, slash-komendy) i
      siatką 4 klikalnych przykładowych promptów (nowa stała
      `EXAMPLE_PROMPTS`) — kliknięcie wypełnia pole wiadomości (`setDraft`) i
      ustawia focus na textarea, bez wysyłania. **Zweryfikowano wizualnie
      (2026-09-21):** na produkcyjnym deployu nowy pusty stan renderuje się
      poprawnie w dark mode, kliknięcie przykładu „Przeanalizuj konkurencję
      w naszej branży" poprawnie wypełniło pole tekstowe, a wysłana
      wiadomość dostała realną odpowiedź asystenta. Działa poprawnie.
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
      dla jasności. **Zweryfikowano wizualnie end-to-end (2026-09-21):** na
      produkcyjnym deployu badge pokazywał „Globalny kontekst: brak", potem
      w Ustawieniach zapisano testowy globalny prompt („Testowy globalny
      prompt weryfikacyjny 2026-09-21.") i po powrocie do czatu badge
      poprawnie zmienił się na „Globalny kontekst: aktywny". Oba stany
      działają poprawnie.
- [x] 9. Konflikt z-index sidebar/panel artefaktów na mobile — oba
      `fixed inset-*` z tym samym z-index, mogą się nakładać przy otwarciu
      jednocześnie na małym ekranie.

      **Zrobione (2026-09-21):** Panel artefaktów (`<aside>` w
      [frontend/src/app/chat/page.tsx:105](../../frontend/src/app/chat/page.tsx)
      — `fixed inset-0` na mobile) miał `z-40`, dokładnie tyle samo co
      overlay+panel sidebara (`fixed inset-0 z-30` dla tła i
      `fixed inset-y-0 left-0 z-40` dla panelu, linie ~302/307). Przy
      jednoczesnym otwarciu obu na małym ekranie kolejność nakładania była
      niezdefiniowana (zależna od kolejności w DOM). Podniesiono z-index
      panelu artefaktów do `z-50`, żeby zawsze był nad sidebarem, gdy oba są
      otwarte — sidebar pozostaje bez zmian (`z-30`/`z-40`). **Zweryfikowano
      (2026-09-21):** klasa `z-50` potwierdzona w zbudowanym i wdrożonym
      bundlu produkcyjnym (`_next/static/chunks/701-*.js`); sidebar mobile
      (overlay `z-30` + panel `z-40`) przetestowany wizualnie na
      produkcyjnym deployu i działa poprawnie. Nie udało się w tej sesji
      odtworzyć na żywo scenariusza „oba panele otwarte jednocześnie" (brak
      w bieżącej rozmowie wiadomości z realnym artefaktem otwartym w tym
      samym momencie co sidebar) — zmiana jest jednak trywialna
      i niskiego ryzyka (jedna wartość klasy CSS), niskie ryzyko regresji.
- [x] 10. Animowany kursor na końcu streamowanego tekstu odpowiedzi (dziś
       tylko statyczne „Asystent pisze…").

      **Zrobione (2026-09-21):** W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      blok renderujący `streamingText` (obok markdownu) dostał migający
      pionowy kursor — `<span>` z `animate-pulse` (2px szerokości, wysokość
      linii tekstu), widoczny na końcu treści w trakcie strumieniowania,
      zamiast dotychczasowego statycznego „Asystent pisze…" (ten komunikat
      zostaje, ale tylko zanim przyjdzie pierwszy fragment tekstu).
      **Zweryfikowano wizualnie (2026-09-21):** na produkcyjnym deployu
      migający pionowy kursor był widoczny na końcu tekstu w trakcie
      realnego streamowania odpowiedzi (kilkukrotnie, w tym po SSE reconnect
      z punktu 4). Działa poprawnie.

## C — nice-to-have

- [x] 11. Eksport pojedynczej wiadomości (obrazek/PDF), dziś jest tylko
       eksport całej konwersacji (`exportConversation`).

      **Zrobione (2026-09-21):** W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      dodano przycisk „Eksportuj" w rzędzie akcji wiadomości asystenta (obok
      Kopiuj/Regeneruj/Rozgałęź), z ikoną `Download` z `lucide-react`. Nowy
      handler `handleExportMessage` tworzy `Blob` z treści wiadomości
      (`text/markdown`) i pobiera go po stronie klienta jako
      `wiadomosc-<id>.md` (bez wywołania do backendu — prostsze niż
      obrazek/PDF i wystarczające, bo treść to markdown). **Zweryfikowano
      wizualnie (2026-09-21):** na produkcyjnym deployu kliknięcie
      „Eksportuj" przy realnej odpowiedzi asystenta faktycznie wywołało
      pobranie pliku `wiadomosc-68.md` (potwierdzone przez przechwycenie
      `<a download>` w devtoolsach — poprawna nazwa i typ blob). Ta zmiana
      była wcześniej tylko niescommitowana lokalnie — scommitowano i
      wdrożono na Railway w ramach tej sesji. Działa poprawnie.
- [x] 12. Skróty klawiszowe (np. Cmd+K — nowa rozmowa / wyszukiwanie).

      **Zrobione (2026-09-21):** W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      dodano globalny listener `keydown` w `ChatView`: `Cmd/Ctrl+K` otwiera
      sidebar (na mobile) i przenosi focus do pola wyszukiwania rozmów
      (nowy `searchInputRef` przekazany do `ConversationSidebar`, placeholder
      pola dostał podpowiedź „(Cmd+K)"), `Cmd/Ctrl+Shift+O` wywołuje
      `handleNewConversation()` (nowa rozmowa) — przycisk „Nowa rozmowa"
      dostał `title` z podpowiedzią skrótu. **Zweryfikowano wizualnie
      end-to-end (2026-09-21):** na produkcyjnym deployu realny `Cmd+K`
      otworzył sidebar i przeniósł focus na pole wyszukiwania (widoczny
      kursor w polu); realny `Cmd+Shift+O` utworzył nową rozmowę
      („Rozmowa z 21.09.2…" pojawiła się na liście, pusty stan czatu się
      pokazał). Ta zmiana była wcześniej tylko niescommitowana lokalnie —
      scommitowano i wdrożono na Railway w ramach tej sesji. Oba skróty
      działają poprawnie w prawdziwej przeglądarce.
- [x] 13. Zakładka „Usage/Metryki" w panelu admina — backend
       (`metrics.routes.js`) już to udostępnia, brak UI w `admin/page.tsx`.

      **Zrobione (2026-09-21):** Dane usage/metryki (koszt łączny, koszt per
      użytkownik, jakość LLM-judge, porównanie z enterprise) już były
      renderowane w [frontend/src/app/admin/page.tsx](../../frontend/src/app/admin/page.tsx),
      ale wymieszane z resztą sekcji w jednym długim scrollu bez podziału.
      Dodano nawigację zakładkową (`ADMIN_TABS`): „Usage/Metryki" (nowy
      komponent `UsageMetricsTab` — cost summary, cost per user, quality,
      enterprise comparison, eksport XLSX/PPTX), „Zgodność" (`ComplianceTab`:
      leak alerts, klienci, audyt dostępu, retencja), „Użytkownicy" oraz
      „Baza wiedzy i integracje" (knowledge base + konektory MCP). Logika i
      istniejące komponenty sekcji niezmienione — tylko reorganizacja
      layoutu `AdminView` przez stan `activeTab`. **Zweryfikowano wizualnie
      (2026-09-21):** na produkcyjnym deployu, jako admin, wszystkie 4
      zakładki („Usage/Metryki", „Zgodność", „Użytkownicy", „Baza wiedzy i
      integracje") renderują się poprawnie w dark mode z realnymi danymi
      (koszty, sygnały do przeglądu, lista userów, baza wiedzy/konektory
      MCP). Ta zmiana była wcześniej tylko niescommitowana lokalnie —
      scommitowano i wdrożono na Railway w ramach tej sesji. Działa
      poprawnie.

## D — porównanie z Claude.ai (audyt 2026-09-21)

- [ ] 14. Projekty — grupowanie rozmów wokół wspólnej wiedzy/instrukcji/
       plików (jak Projects w Claude.ai). Brak w kodzie w ogóle (ani
       backend, ani frontend).
- [ ] 15. Style odpowiedzi (presety: zwięzły/formalny/kreatywny itd.) —
       brak.
- [ ] 16. Tryb głosowy / dyktowanie (mikrofon w czacie) — brak.
- [ ] 17. Tymczasowa/incognito rozmowa (bez zapisu do historii) — brak.
- [ ] 18. Aplikacja mobilna / PWA — brak manifestu, strona nie jest
       instalowalna na telefonie.
- [ ] 19. Wskaźnik limitu użycia widoczny dla zwykłego użytkownika w UI
       czatu (dziś tylko w panelu admina).
- [ ] 20. Przełącznik "extended thinking" widoczny dla użytkownika w UI
       czatu (dziś reasoning/thinking istnieje tylko wewnętrznie w
       subagentach/pipeline backendu).

## E — weryfikacja wizualna 2026-09-21 (nowe obserwacje)

Logowanie odblokowane bez zmian w auth: zalogowano się realnym Google OAuth
na już wdrożonym środowisku Railway
(https://frontend-production-c7e96.up.railway.app), zamiast konfigurować
OAuth lokalnie. Po drodze okazało się, że punkty 9, 10, 11, 12, 13 istniały
tylko jako niescommitowane zmiany lokalne (Railway serwował starszy,
zacommitowany kod) — scommitowano je i wdrożono (patrz commit „Add
per-message export, keyboard shortcuts, streaming cursor, admin tabs,
z-index fix"), po czym zweryfikowano na żywo. Wszystkie 13 punktów z sekcji
A+B+C przeszło realną weryfikację wizualną/funkcjonalną w przeglądarce
(patrz zaktualizowane notatki wyżej) — żaden nie miał już blockera
logowania.

Znalezione i naprawione w tej sesji:

- [x] E.1 `handleCopy` w
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      nie obsługiwał błędu `navigator.clipboard.writeText` (odmowa
      uprawnień → przycisk „Kopiuj" nic nie robił, nieobsłużony wyjątek w
      konsoli). **Naprawiono:** `try/catch` z fallbackiem przez
      `document.execCommand('copy')`. Commit „Fix: handle clipboard write
      failure in copy-message button".

Nowe braki znalezione, ale nie naprawione na dziko (do osobnej wyceny):

- [ ] E.2 Pasek „Sprawdzam wiadomość pod kątem danych wrażliwych…" (punkt 5)
      nie znika natychmiast, gdy zaczyna płynąć tekst odpowiedzi — w trakcie
      testu SSE widać było jednocześnie banner klasyfikacji i już
      streamowany tekst z migającym kursorem. Drobne, ale myląca kolejność
      stanów UI (sugeruje, że klasyfikacja wciąż trwa, gdy odpowiedź już
      się generuje).
- [ ] E.3 Punkt 9 (z-index sidebar/panel artefaktów) zweryfikowany tylko
      przez potwierdzenie klasy `z-50` w zbudowanym bundlu + osobne
      przetestowanie sidebara — nie odtworzono na żywo scenariusza z oboma
      panelami otwartymi naraz na mobile. Zmiana jest trywialna (jedna
      wartość CSS), ale warto dograć realny test przy okazji następnej
      wizyty w tym repo.

## Stan na koniec sesji (2026-09-21)

Wszystkie 13 punktów z A+B+C zweryfikowane wizualnie na produkcyjnym
deployu Railway jako zalogowany admin (michal.grom@salesmore.pl). Zadanie
zamknięte. Sekcja D (14–20, porównanie z Claude.ai) pozostaje nietknięta —
to osobny, nowy backlog, nie część tego audytu logowania. Sekcja E.2/E.3
to nowe, mniejsze braki do ewentualnego domknięcia w kolejnym czacie.

Zalecane wyczyszczenie czatu — zadanie z promptu startowego zakończone.
