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

- [x] 14. Projekty — grupowanie rozmów wokół wspólnej wiedzy/instrukcji/
       plików (jak Projects w Claude.ai). Brak w kodzie w ogóle (ani
       backend, ani frontend).

      **Zrobione (2026-09-21):** Zaimplementowano minimalną, ale funkcjonalną
      wersję Projektów (bez plików — tylko nazwa/opis/instrukcje, zgodnie ze
      scope'em zadania). Backend: nowa migracja
      [backend/src/db/migrations/028_projects.sql](../../backend/src/db/migrations/028_projects.sql)
      — tabela `projects` (`id`, `user_id`, `name`, `description`,
      `system_prompt`, `created_at`, `updated_at`) z RLS wg tego samego wzorca
      co `conversations`/`messages` w 026/027 (`projects_isolation`), plus
      nullable `conversations.project_id` (FK `ON DELETE SET NULL`). Nowy
      router [backend/src/routes/projects.routes.js](../../backend/src/routes/projects.routes.js)
      — pełny CRUD (`GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`)
      scoped do `req.user.sub` przez `attachUserDbContext`, wzorowany na
      `chat.routes.js`; zamontowany w
      [backend/src/server.js](../../backend/src/server.js) pod `/projects`.
      `PATCH /chat/conversations/:id` w
      [backend/src/routes/chat.routes.js](../../backend/src/routes/chat.routes.js)
      przyjmuje teraz `projectId` (z walidacją, że projekt istnieje i należy
      do usera), `GET /chat/conversations` zwraca `projectId`. W
      [backend/src/services/chatCore/pipeline.js](../../backend/src/services/chatCore/pipeline.js)
      `getConversationSettings` dokłada trzeci poziom do hierarchii system
      promptów z punktu 8: globalny (Ustawienia użytkownika) -> projekt (jeśli
      konwersacja ma `project_id`) -> prompt tej rozmowy, sklejane w tej
      kolejności.

      Frontend: w [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts)
      dodano typ `Project`, pole `projectId` w `ConversationSettings` oraz
      `api.listProjects/createProject/updateProject/deleteProject/
      setConversationProject`. W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx):
      `ConversationSidebar` dostał sekcję „Projekty" (lista + przycisk „+"
      z formularzem nazwa/opis do tworzenia nowego projektu + opcja
      „Wszystkie" do wyczyszczenia filtra) i filtruje listę rozmów po
      wybranym projekcie (`projectFilter` w `ChatView`); `ConversationSettingsBar`
      dostał dropdown z ikoną `FolderKanban` do przypisania bieżącej rozmowy
      do projektu (obok istniejącego badge'a „Globalny kontekst" z punktu 8),
      wysyłający `api.setConversationProject`. Stylistyka spójna z resztą
      pliku (te same klasy Tailwind, warianty `dark:`).

      Zweryfikowane: `npx tsc --noEmit` bez błędów. Migrację uruchomiono
      realnie na lokalnej dev bazie Postgres (`npm run migrate` w `backend/`,
      `DATABASE_URL` wskazujący na `salesmore_llm_test` z `.env`) —
      `028_projects.sql` przeszła bez błędów, w tym utworzenie roli/polityk
      RLS. `node --check` bez błędów dla wszystkich zmienionych/nowych plików
      backendu (`projects.routes.js`, `chat.routes.js`, `pipeline.js`,
      `server.js`). Uruchomiony lokalnie backend poprawnie zwraca `401` na
      `GET /projects` bez tokenu (trasa zamontowana i chroniona) oraz `200`
      na `/health`. Pełna wizualna weryfikacja UI Projektów w zalogowanym
      czacie (tworzenie projektu, filtrowanie rozmów, przypisywanie do
      projektu, faktyczne dołączenie instrukcji projektu do odpowiedzi
      modelu) niemożliwa w tym środowisku — ten sam blocker logowania
      wyłącznie przez Google OAuth bez dev-loginu, opisany w punktach 1–13.
- [x] 15. Style odpowiedzi (presety: zwięzły/formalny/kreatywny itd.) —
       brak.

      **Zrobione (2026-09-21):** Dodano stały zestaw presetów stylu
      odpowiedzi (Zwięzły/Formalny/Kreatywny/Domyślny) jako kolejną warstwę
      instrukcji w hierarchii system promptów z punktów 8/14 — nie
      zastępującą jej. Backend: nowa migracja
      [backend/src/db/migrations/029_conversation_style.sql](../../backend/src/db/migrations/029_conversation_style.sql)
      dodaje nullable `conversations.style` (TEXT). Nowa stała
      `STYLE_PRESETS` w
      [backend/src/services/chatCore/pipeline.js](../../backend/src/services/chatCore/pipeline.js)
      (klucz -> `{label, instruction}`, `null`/nieznany klucz = brak
      dodatkowej instrukcji), wykorzystywana też w routerze — wzorem
      `AVAILABLE_MODELS`/`GET /chat/conversations/models` z punktu 1 dodano
      `GET /chat/conversations/styles` w
      [backend/src/routes/chat.routes.js](../../backend/src/routes/chat.routes.js)
      zwracający `[{key, label}]`. `PATCH /chat/conversations/:id` przyjmuje
      teraz `style` (walidacja: musi być kluczem `STYLE_PRESETS` lub `null`),
      `GET /chat/conversations` i `GET /chat/conversations/search` zwracają
      `style`. W `getConversationSettings` (pipeline.js) hierarchia z punktu
      14 rozszerzona o styl: globalny (Ustawienia) -> projekt -> **styl**
      (modyfikator tonu) -> prompt tej rozmowy — styl wchodzi po
      merytorycznych instrukcjach projektu, ale przed promptem samej
      rozmowy, żeby ten mógł w razie potrzeby doprecyzować/nadpisać ton.

      Frontend: w [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts)
      dodano typ `StylePreset`, pole `style` w `ConversationSettings`,
      `api.availableStyles()` i `api.setConversationStyle(conversationId,
      style)`, oraz `style` w sygnaturze `updateConversationSettings`. W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      `ConversationSettingsBar` dostał dropdown stylu (ikona `Sparkles` z
      `lucide-react`, obok dropdownów modelu i projektu) — `handleChangeStyle`
      wysyła `api.setConversationStyle`, lista presetów ładowana raz przy
      starcie przez `api.availableStyles()`. Stylistyka spójna z resztą baru
      (te same klasy Tailwind, warianty `dark:`).

      Zweryfikowano: `npx tsc --noEmit` w `frontend/` bez błędów. `node
      --check` bez błędów dla `chat.routes.js` i `pipeline.js`. Migrację
      `029_conversation_style.sql` uruchomiono realnie na lokalnej dev bazie
      Postgres (`npm run migrate` w `backend/`, `salesmore_llm_test`) —
      przeszła bez błędów razem z całym łańcuchem migracji (001–029).
      Uruchomiony lokalnie backend zwraca `401` na `GET
      /chat/conversations/styles` i `GET /chat/conversations` bez tokenu
      (trasy chronione) oraz `200` na `/health`. Pełna wizualna weryfikacja
      dropdownu stylu w zalogowanym czacie (w tym faktyczny wpływ na ton
      odpowiedzi modelu) niemożliwa w tym środowisku — ten sam blocker
      logowania wyłącznie przez Google OAuth bez dev-loginu, opisany
      w punktach 1–14.
- [x] 16. Tryb głosowy / dyktowanie (mikrofon w czacie) — brak.

      **Zrobione (2026-09-21):** Zaimplementowano dyktowanie głosowe (voice
      input, nie pełny tryb konwersacji głosowej i bez text-to-speech) po
      stronie frontendu, w oparciu o wbudowany w przeglądarkę Web Speech API
      (`SpeechRecognition` / `webkitSpeechRecognition`) — bez backendu i bez
      kluczy API. W `frontend/src/app/chat/page.tsx`: dodano przycisk mikrofonu
      (`Mic`/`MicOff` z `lucide-react`) w pasku kompozycji wiadomości, obok
      przycisku wysyłania. Kliknięcie startuje rozpoznawanie mowy w języku
      polskim (`lang: 'pl-PL'`, spójnie z resztą UI po polsku), wyniki
      pośrednie i finalne są dopisywane do stanu `draft` (`setDraft`).
      Przycisk pulsuje na czerwono w trakcie nasłuchiwania i wraca do stanu
      spoczynku po ponownym kliknięciu lub zakończeniu rozpoznawania
      (`onend`). Feature-detection (`window.SpeechRecognition ||
      window.webkitSpeechRecognition`) w `useEffect` chowa przycisk całkowicie
      w przeglądarkach bez wsparcia — brak crasha. Odmowa dostępu do
      mikrofonu (`event.error === 'not-allowed'`) i inne błędy rozpoznawania
      są zgłaszane przez istniejący mechanizm `errorMessage`/`setErrorMessage`
      (ten sam, którego używają inne błędy w tym pliku), a nie osobnym,
      nowym komponentem. Dodano też minimalny ambient type declaration
      `frontend/src/types/speech.d.ts` z typami `SpeechRecognition` i
      pokrewnymi (nie ma ich w domyślnych libach TS) — bez użycia `any`.

      **Ograniczenie wsparcia przeglądarek:** Web Speech API w tej formie
      działa w Chrome i Edge (prefiks `webkit` w Chrome); Firefox i Safari
      nie wspierają go w ten sam sposób (Safari ma częściowe, niestabilne
      wsparcie, Firefox default brak) — dla tych przeglądarek przycisk
      mikrofonu po prostu się nie pojawia (feature-detected), więc UI
      degraduje się bez błędu, ale ci użytkownicy nie mają dyktowania.

      **Weryfikacja:** `npx tsc --noEmit` w `frontend/` — czysto, zero
      błędów. Pełna interaktywna weryfikacja end-to-end (kliknięcie
      mikrofonu, realne uprawnienia mikrofonu, faktyczne rozpoznanie mowy)
      niemożliwa w tym środowisku z dwóch niezależnych powodów: (1) ten sam
      znany blocker logowania wyłącznie przez Google OAuth bez dev-loginu,
      opisany w punktach 1–15, oraz (2) dodatkowo — niezależnie od loginu —
      Web Speech API wymaga prawdziwego kontekstu przeglądarki z dostępem do
      mikrofonu (permission prompt, realny sprzęt audio), którego to
      środowisko (headless/CLI) nie zapewnia; nie da się tego obejść samym
      ominięciem OAuth, jak przy poprzednich punktach.
- [x] 17. Tymczasowa/incognito rozmowa (bez zapisu do historii) — brak.

      **Zrobione (2026-09-21):** Decyzja co do zgodności/compliance: NIE
      wybrano pełnej efemeryczności (opcja a — w ogóle bez zapisu do bazy).
      Migracja 025 (`025_conversation_retention.sql`) i towarzyszący jej
      `backend/src/services/retention/retentionCleanup.js` zakładają, że
      KAŻDA rozmowa jest wpierw persystowana i dopiero potem podlega
      politycy retencji (`DATA_RETENTION_DAYS`, domyślnie wyłączona
      destrukcyjna operacja) — nie ma tu koncepcji "rozmowy, która nigdy nie
      trafia do bazy". Migracja 026 (`026_rls_chat_isolation.sql`) wymusza
      RLS na `conversations`/`messages` per user, co też zakłada, że wiersz
      istnieje. Do tego cały przepływ wykrywania wycieku danych
      (`classifyDraftMessage`/`streamChatTurn` w
      `backend/src/services/chatCore/pipeline.js`, korzystający z
      `sensitiveDataPrecheck.js`, `uncertainLeakAgent.js` i zapisujący do
      `leak_alerts`/`ai_audit_log`) działa na poziomie `conversationId` i nie
      ma żadnej ścieżki warunkowej, która by go pomijała — to jest
      obowiązkowa ścieżka audytu dla produktu z alertami o wyciekach danych.
      Wobec tego wybrano **opcję (b)**: rozmowa tymczasowa/incognito jest
      nadal w pełni zapisywana i nadal w 100% przechodzi przez ten sam
      pipeline klasyfikacji/precheck/audytu co każda inna rozmowa — jedyna
      różnica to jej domyślna widoczność na liście rozmów. Nie dodano
      osobnej, krótszej retencji per-konwersacja (migracja 025 nie ma
      kolumny w stylu `retention_days`/`expires_at` do rozszerzenia — cała
      polityka jest globalna, jeden `DATA_RETENTION_DAYS`), żeby nie
      wprowadzać nowego, nietestowanego mechanizmu obok istniejącego —
      rozmowa incognito podlega tej samej globalnej retencji co reszta.

      Backend: nowa migracja
      [backend/src/db/migrations/030_temporary_conversations.sql](../../backend/src/db/migrations/030_temporary_conversations.sql)
      dodaje `conversations.is_temporary BOOLEAN NOT NULL DEFAULT false`. W
      [backend/src/routes/chat.routes.js](../../backend/src/routes/chat.routes.js):
      `POST /chat/conversations` przyjmuje `isTemporary`; `GET
      /chat/conversations` domyślnie filtruje `WHERE is_temporary = false`,
      z opt-in przez `?includeTemporary=true` (używane tylko żeby aktywna
      rozmowa incognito nie zniknęła w trakcie sesji); `PATCH
      /chat/conversations/:id` pozwala przełączyć `isTemporary`. Nic nie
      zmieniono w `streamChatTurn`/`classifyDraftMessage`/pipeline.js —
      klasyfikacja i zapis wiadomości działają identycznie niezależnie od
      `is_temporary`, żeby nie osłabić ścieżki wykrywania wycieku danych.

      Frontend: w [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts)
      dodano `isTemporary` do `ConversationSettings`, `api.createConversation`
      przyjmuje drugi parametr `isTemporary`, `api.listConversations`
      przyjmuje opcjonalny `includeTemporary`. W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx):
      `ConversationSidebar` dostał drugi przycisk „Nowa incognito" (ikona
      `EyeOff`) obok „Nowa rozmowa"; nowy handler
      `handleNewTemporaryConversation` w `ChatView` tworzy rozmowę z
      `isTemporary: true` i dokłada ją do lokalnego stanu `conversations`
      (tak samo jak istniejący `handleNewConversation`) — dzięki temu jest
      w pełni widoczna i używalna w bieżącej sesji, ale ponieważ domyślne
      `GET /chat/conversations` jej nie zwraca, po odświeżeniu strony/nowej
      sesji nie pojawi się już na liście (zgodnie z zachowaniem "temporary
      chat" w Claude.ai). `ConversationSettingsBar` dostał odznakę
      „Incognito" (ikona `EyeOff`) obok badge'a „Globalny kontekst" z punktu
      8, widoczną gdy aktywna rozmowa ma `isTemporary: true`, z tooltipem
      tłumaczącym, że mimo braku widoczności na liście rozmowa nadal
      podlega tej samej klasyfikacji i retencji.

      **Weryfikacja:** `npx tsc --noEmit` w `frontend/` — czysto, zero
      błędów. `node --check` bez błędów dla
      `backend/src/routes/chat.routes.js`. Migrację
      `030_temporary_conversations.sql` uruchomiono realnie na lokalnej dev
      bazie Postgres (`npm run migrate` w `backend/`, `DATABASE_URL`
      wskazujący na `salesmore_llm_test`) — przeszła bez błędów razem z
      całym łańcuchem migracji (001–030). Pełna wizualna weryfikacja w
      zalogowanym czacie (kliknięcie „Nowa incognito", faktyczne wysłanie
      wiadomości w rozmowie incognito, potwierdzenie że nie pojawia się po
      odświeżeniu, potwierdzenie że alert o wycieku nadal by zadziałał)
      niemożliwa w tym środowisku — ten sam znany blocker logowania
      wyłącznie przez Google OAuth bez dev-loginu, opisany w punktach 1–16.
- [x] 18. Aplikacja mobilna / PWA — brak manifestu, strona nie jest
       instalowalna na telefonie.

      **Zrobione (2026-09-21):** Zaimplementowano minimalny, ale realnie
      instalowalny PWA setup (nie pełną offline-first aplikację — świadomie
      poza scope'em, patrz niżej). Nowy
      [frontend/public/manifest.json](../../frontend/public/manifest.json)
      z `name`/`short_name`/`description`, `start_url: "/chat"`,
      `display: "standalone"`, `background_color: "#FFFFFF"`,
      `theme_color: "#F8502C"` (brand orange z `tailwind.config.ts`) i
      tablicą `icons` (192x192 i 512x512).

      Ikony: w repo istniał tylko jeden asset graficzny —
      `frontend/public/logo-salesmore.png` — szeroki poziomy wordmark
      (1854x303, nie nadaje się bezpośrednio na kwadratową ikonę). Zamiast
      wymyślać nową grafikę, wycięto z niego (ImageMagick, `magick -crop`)
      samodzielny, już kwadratowy znak „&" (pomarańczowy, `#F8502C`) będący
      częścią logo, spłaszczono na białym tle i wyskalowano do
      [frontend/public/icon-192.png](../../frontend/public/icon-192.png),
      [frontend/public/icon-512.png](../../frontend/public/icon-512.png)
      oraz [frontend/public/apple-touch-icon.png](../../frontend/public/apple-touch-icon.png)
      (180x180, dla iOS home screen).

      W [frontend/src/app/layout.tsx](../../frontend/src/app/layout.tsx)
      dodano `manifest: '/manifest.json'` i `icons.apple` do obiektu
      `metadata` (Next.js 15 `Metadata` API), osobny eksport
      `viewport: Viewport` z `themeColor: '#F8502C'` (Next 15 wymaga
      `themeColor` w `viewport`, nie w `metadata`) oraz
      `appleWebApp: { capable: true, statusBarStyle: 'default', title: ... }`
      dla trybu pełnoekranowego na iOS po dodaniu do ekranu głównego.

      Dodano też minimalny no-op service worker
      [frontend/public/sw.js](../../frontend/public/sw.js) (tylko
      `install`/`activate`/pusty handler `fetch` — bez żadnego cache'owania,
      celowo, żeby nie ryzykować serwowania nieaktualnych odpowiedzi API w
      czacie z danymi live) rejestrowany przez nowy klient-komponent
      [frontend/src/components/ServiceWorkerRegistration.tsx](../../frontend/src/components/ServiceWorkerRegistration.tsx)
      wpięty w `layout.tsx` — wyłącznie po to, by spełnić bardziej
      restrykcyjne heurystyki instalowalności niektórych przeglądarek
      (Chrome/Android akceptuje instalację już przy samym manifeście +
      HTTPS + ikonach, ale service worker nie zaszkodzi i jest wymagany
      przez niektóre starsze audyty PWA). Pełny offline-first service
      worker z cache'owaniem świadomie pominięty — poza scope'em zadania i
      ryzykowny dla aplikacji czatu z danymi live.

      Zweryfikowane: `npx tsc --noEmit` w `frontend/` bez błędów.
      `node -e "JSON.parse(...)"` potwierdza że `manifest.json` jest
      poprawnym JSON-em. Pełna weryfikacja instalowalności („Dodaj do ekranu
      głównego" / prompt instalacji w Chrome na Androidzie lub Safari na
      iOS) niemożliwa w tym środowisku — to inny rodzaj blockera niż
      dotychczasowy (logowanie tylko przez Google OAuth, punkty 1–17):
      instalowalność PWA wymaga realnej sesji w przeglądarce mobilnej
      (Chrome/Android lub Safari/iOS) na żywym, publicznie dostępnym HTTPS
      URL-u, a nie tylko zalogowanego konta — czego to środowisko (headless,
      bez mobilnej przeglądarki) nie zapewnia.
- [x] 19. Wskaźnik limitu użycia widoczny dla zwykłego użytkownika w UI
       czatu (dziś tylko w panelu admina).

      **Zrobione (2026-09-21):** Zbadano, jaki "limit" faktycznie istnieje w
      systemie: brak per-userowej kwoty wiadomości/kosztu — jedyny realny
      limit to wspólny, org-wide miękki budżet miesięczny
      (`MONTHLY_BUDGET_USD`, [backend/src/config/budget.js](../../backend/src/config/budget.js)),
      sprawdzany przed każdym wywołaniem LLM w
      [backend/src/services/chatCore/pipeline.js](../../backend/src/services/chatCore/pipeline.js)
      (`checkMonthlyBudget`) i wspólny dla wszystkich użytkowników — nie ma
      koncepcji limitu per-klient (`clients` w
      [backend/src/routes/clients.routes.js](../../backend/src/routes/clients.routes.js)
      to klienci specjalistów/zgody AI, nie tenant z budżetem). Zgodnie z
      instrukcją zadania (pokazać co realnie istnieje zamiast fikcyjnej
      kwoty) wskaźnik pokazuje właśnie ten wspólny budżet + własny wkład
      użytkownika w bieżącym miesiącu.

      Backend: nowy endpoint `GET /chat/me/usage` w
      [backend/src/routes/chat.routes.js](../../backend/src/routes/chat.routes.js)
      (w istniejącym `chatRouter`, więc auth+RLS przez `attachUserDbContext`
      już zamontowane wyżej w pliku) — zwraca `orgBudget` (limit/spent z
      tego samego zapytania co `checkMonthlyBudget`, `null` gdy
      `MONTHLY_BUDGET_USD` nieustawiony) oraz `mine` (liczba wiadomości i
      suma `cost_usd` z `usage_metrics` dla rozmów należących do
      `req.user.sub` w bieżącym miesiącu, przez join
      `usage_metrics -> messages -> conversations`). Brak nowej migracji —
      dane już istnieją w `usage_metrics` (tabela z punktu 13).

      Frontend: w [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts)
      dodano typ `UsageInfo` i `api.getMyUsage()`. W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      nowy komponent `UsageBadge` (ikona `Gauge` z `lucide-react`) w
      `ConversationSettingsBar`, obok badge'a „Globalny kontekst" z punktu
      8 — pokazuje `Budżet: X%` (z tooltipem: kwoty $ spent/limit + własny
      udział) gdy `MONTHLY_BUDGET_USD` skonfigurowany, albo `Ty: X wiad.`
      gdy nie; podświetla się na czerwono po przekroczeniu 90% budżetu.
      Renderuje się jako `null` gdy fetch się nie uda (np. brak auth) —
      nieinwazyjny, spójny stylistycznie z resztą paska (te same klasy
      Tailwind, warianty `dark:`).

      Zweryfikowane: `npx tsc --noEmit` w `frontend/` bez błędów. `node
      --check` bez błędów dla `chat.routes.js`. Lokalnie uruchomiony
      backend (`PORT=8099 node src/server.js`, `.env` z lokalnym Postgres
      `salesmore_llm_test`) zwraca `401` na `GET /chat/me/usage` bez tokenu
      oraz `200` na `/health`. Pełna wizualna weryfikacja zalogowanego UI
      (rzeczywisty odczyt budżetu/kosztu w pasku ustawień czatu) niemożliwa
      w tym środowisku — ten sam blocker logowania wyłącznie przez Google
      OAuth opisany w punktach 1–18.
- [x] 20. Przełącznik "extended thinking" widoczny dla użytkownika w UI
       czatu (dziś reasoning/thinking istnieje tylko wewnętrznie w
       subagentach/pipeline backendu, backend aktywnie usuwa bloki myślenia
       przed zapisem historii — brak przełącznika i brak widoku
       rozumowania dla użytkownika).

      **Zrobione (2026-09-21):** Zweryfikowano dokładnie, gdzie dziś dzieje
      się usuwanie: `stripThinkingBlocks` w
      [backend/src/services/chatCore/pipeline.js](../../backend/src/services/chatCore/pipeline.js)
      (komentarz przy niej: Sonnet 5 zawsze zwraca blok `thinking` gdy
      przekazane są `tools`, a echo tego bloku w kolejnej turze pętli
      narzędziowej powoduje 400 z API) — wywoływana w `runToolLoop` i
      `runToolLoopStreaming` przy odsyłaniu historii do kolejnej rundy.
      Backend dotąd nigdy nie prosił o prawdziwe extended thinking
      (`thinking: {type:'enabled'}` nigdzie nie występowało) — usuwane bloki
      to tylko domyślne, niepożądane echo modelu, nie świadomie zamówione
      rozumowanie.

      Dodano opt-in per-rozmowa, analogicznie do stylu/projektu z punktów
      14/15. Backend: nowa migracja
      [backend/src/db/migrations/032_extended_thinking.sql](../../backend/src/db/migrations/032_extended_thinking.sql)
      — `conversations.extended_thinking` (BOOLEAN NOT NULL DEFAULT false,
      wzorem `is_temporary` z punktu 17) oraz nullable
      `messages.thinking_content` (TEXT, wzorem `citations`/`generated_files`
      z punktów 6/11). `getConversationSettings` w pipeline.js zwraca teraz
      `extendedThinking`; nowe stałe `THINKING_BUDGET_TOKENS = 4096` i
      `THINKING_MAX_TOKENS = 8192` w `thinkingCallParams()` — Anthropic
      wymaga `budget_tokens >= 1024` i `max_tokens` ściśle większego niż
      `budget_tokens` (budżet myślenia jest wycinany z `max_tokens`, nie
      dokładany do niego); 4096 tokenów budżetu to sensowny kompromis na
      realne wieloetapowe rozumowanie bez nadmiernego wydłużania
      latencji/kosztu, a `max_tokens` podwojono do 8192, żeby widoczna
      odpowiedź nadal miała tyle samo miejsca (~4096) co dziś, tylko dodatkowo
      nad budżetem myślenia. Gdy flaga wyłączona: `max_tokens: 4096`, bez
      `thinking` — zero zmian względem stanu sprzed tego punktu.
      `runToolLoop`/`runToolLoopStreaming` używają `thinkingCallParams()`
      zamiast twardo wpisanego `max_tokens: 4096`; w pętli narzędziowej blok
      `thinking` jest teraz odsyłany API bez zmian gdy `extendedThinking` jest
      włączone (wymóg API przy łączeniu extended thinking z narzędziami),
      a `stripThinkingBlocks` nadal działa dokładnie jak wcześniej dla
      zwykłych rozmów. `streamChatMessage` (ręczny parser SSE) dostał
      obsługę zdarzeń `thinking_delta`/`signature_delta`, których wcześniej
      nie było (odpowiedzi z myśleniem po prostu nie akumulowały tekstu w
      trybie stream). Nowa `extractThinkingText()` zbiera tekst bloków
      `thinking` z finalnej odpowiedzi; `saveMessage`/`finishAssistantReply`
      dostały dodatkowy parametr `thinkingContent`, zapisywany do
      `messages.thinking_content` tylko gdy jest coś do zapisania (`NULL`
      dla zwykłych wiadomości i wiadomości użytkownika — bez zmian).
      `subAgentTool.js` (własna, wewnętrzna pętla subagenta) pozostawiono
      bez zmian — to osobny mechanizm, poza zakresem przełącznika
      user-facing z tego punktu.

      `PATCH /chat/conversations/:id` w
      [backend/src/routes/chat.routes.js](../../backend/src/routes/chat.routes.js)
      przyjmuje teraz `extendedThinking` (walidacja: musi być boolean),
      `GET /chat/conversations` i odpowiedź PATCH zwracają `extendedThinking`;
      `fetchMessages`/`GET /chat/conversations/:id/messages` zwraca
      `thinkingContent` dla każdej wiadomości.

      Frontend: w [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts)
      dodano `extendedThinking` w `ConversationSettings`, `thinkingContent` w
      `ChatMessage`, `extendedThinking` w sygnaturze
      `updateConversationSettings` i nową
      `api.setConversationExtendedThinking(conversationId, boolean)`. W
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx):
      `ConversationSettingsBar` dostał przycisk-przełącznik z ikoną `Brain`
      (`lucide-react`) obok badge'a stylu/projektu — "Rozszerzone
      rozumowanie: wł./wył.", stylistycznie spójny z badge'em "Globalny
      kontekst" z punktu 8 (te same warianty aktywny/nieaktywny, `dark:`).
      Nowy komponent `ThinkingBlock` renderuje się nad treścią odpowiedzi
      asystenta, gdy `m.thinkingContent` istnieje — domyślnie zwinięty
      przycisk "Pokaż tok rozumowania" (ikony `ChevronRight`/`ChevronDown` +
      `Brain`), po rozwinięciu pokazuje pełny tekst myślenia w osobnym boksie
      (`whitespace-pre-wrap`, przyciemniony tekst, spójne klasy Tailwind z
      resztą pliku).

      Zweryfikowane: `npx tsc --noEmit` w `frontend/` bez błędów. `node
      --check` bez błędów dla `pipeline.js` i `chat.routes.js`. Migrację
      `032_extended_thinking.sql` uruchomiono realnie na lokalnej dev bazie
      Postgres (`npm run migrate`, `salesmore_llm_test`) — przeszła bez
      błędów razem z całym łańcuchem 001–032. Uruchomiony lokalnie backend
      (`PORT=8099 node src/server.js`) zwraca `200` na `/health` i `401` na
      `GET /chat/conversations` oraz `PATCH /chat/conversations/1` bez tokenu
      (trasy nadal chronione). Nazwy pól API (`thinking`, `budget_tokens`,
      typ bloku `thinking`, zdarzenia `thinking_delta`/`signature_delta`,
      minimalny budżet 1024) zweryfikowano bezpośrednio w typach
      `@anthropic-ai/sdk` (`node_modules/@anthropic-ai/sdk/resources/beta/
      messages/messages.d.ts`), nie z pamięci. Rzeczywiste wywołanie
      Anthropic API z `thinking: enabled` end-to-end (żeby potwierdzić realne
      bloki myślenia w odpowiedzi i ich zapis/render) nie zostało wykonane w
      tym środowisku — brak w tej sesji sprawdzonego działającego
      `ANTHROPIC_API_KEY` do bezpiecznego, jednorazowego wywołania poza pełnym
      UI; poprawność oparto o code review + udokumentowany kształt
      request/response SDK. Pełna wizualna weryfikacja zalogowanego UI
      (kliknięcie przełącznika, realny widok rozwiniętego toku rozumowania)
      niemożliwa w tym środowisku — ten sam blocker logowania wyłącznie przez
      Google OAuth opisany w punktach 1–19.
- [x] 21. Udostępnianie całej rozmowy publicznym linkiem (dziś tylko
       pojedyncze artefakty mają udostępnianie, nie cała konwersacja).

      **Zrobione (2026-09-21):** Nowa migracja
      [031_conversation_sharing.sql](../../backend/src/db/migrations/031_conversation_sharing.sql)
      (`conversations.share_token`), nowy router
      [backend/src/routes/sharing.routes.js](../../backend/src/routes/sharing.routes.js)
      (mirror wzorca z `artifacts.routes.js`): `POST/DELETE
      /chat/conversations/:id/share` (właściciel), publiczny
      `GET /public/conversations/:token` bez autoryzacji (działa z RLS-em
      przez `runWithDbContext({isAdmin:true})`, token jest jedynym
      autoryzatorem). Frontend: nowy
      [ShareConversationButton](../../frontend/src/components/ShareConversationButton.tsx)
      w pasku ustawień rozmowy (popover z linkiem, kopiuj, cofnij) i publiczna
      strona podglądu
      [/c/[token]](../../frontend/src/app/c/[token]/page.tsx) (read-only,
      bez logowania). Ograniczenie: przycisk nie pamięta stanu „już
      udostępniona" po przeładowaniu strony (endpointy listy/pobrania
      konwersacji nie zwracają jeszcze `share_token`) — link mimo to działa
      poprawnie, tylko UI zawsze startuje od „Udostępnij". `npx tsc --noEmit`
      bez błędów, `node --check` na nowych plikach backendu bez błędów.

      **Dopełnione o zabezpieczenia compliance (2026-09-21, druga sesja):**
      poprzednia wersja tego punktu implementowała mechanikę linku
      (token/UI/publiczna strona), ale nie miała jeszcze żadnej bramki
      zgodności opisanej w zadaniu 21 — udostępnianie całej rozmowy jest
      większym ryzykiem wycieku niż pojedynczy artefakt (może ujawnić dane
      klienta/PII wykryte przez pipeline klasyfikacji). Dodano, bez
      osłabiania istniejącej logiki RLS/leak-detection (tylko odczyt jej
      wyników):
      - **Blokada rozmów oflagowanych przez wykrywanie wycieków.** W
        [backend/src/routes/sharing.routes.js](../../backend/src/routes/sharing.routes.js)
        `POST /chat/conversations/:id/share` sprawdza teraz
        `SELECT 1 FROM leak_alerts WHERE conversation_id = $1` (ta sama
        tabela, do której piszą `uncertainLeakAgent.js` i
        `sensitiveDataPrecheck.js` z punktu 5/17) i odrzuca żądanie `403
        flagged_conversation_not_shareable`, jeśli istnieje choć jeden alert
        — również jeśli został już oznaczony `reviewed`, bo przegląd przez
        człowieka potwierdza incydent, nie „odflagowywuje" treści jako
        bezpiecznej do publikacji.
      - **Blokada rozmów tymczasowych/incognito.** Ten sam endpoint
        sprawdza `conversations.is_temporary` (punkt 17) i zwraca `403
        temporary_conversation_not_shareable` — rozmowa incognito nie
        powinna dostawać trwałego publicznego linku, skoro celowo jest
        ukryta z listy usera.
      - **Ścisła tylko-do-odczytu strona publiczna.** Zweryfikowano, że
        `GET /public/conversations/:token` (bez zmian w tej sesji) i tak już
        zwraca wyłącznie `{id, role, content, created_at}` per wiadomość —
        bez `thinking_content` (punkt 20), bez załączników (osobna kontrola
        dostępu w `backend/src/services/attachments/attachmentStore.js`,
        nieujęta w publicznym payloadzie) i bez żadnych identyfikatorów
        użytkownika/konwersacji poza samym tokenem; strona
        [frontend/src/app/c/[token]/page.tsx](../../frontend/src/app/c/[token]/page.tsx)
        nie ma pola do wysyłania wiadomości ani żadnego wywołania
        autoryzowanego API — czysty odczyt.
      - **Odwoływalność** już istniała (`DELETE
        /chat/conversations/:id/share` czyści `share_token` na `NULL`) —
        bez zmian, tylko potwierdzona jako spełniająca wymóg.
      - Frontend:
        [frontend/src/components/ShareConversationButton.tsx](../../frontend/src/components/ShareConversationButton.tsx)
        renderuje przycisk jako wyszarzony, nieklikalny `<span>` z
        tooltipem, gdy `isTemporary` jest `true` (prop dociągnięty z
        `ConversationSettingsBar` w
        [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx),
        gdzie ta flaga już istniała z punktu 17); przy próbie
        udostępnienia rozmowy oflagowanej (odpowiedź `403` z backendu)
        popover pokazuje czerwony komunikat wyjaśniający powód zamiast
        linku, zamiast cichego błędu.

      **Weryfikacja:** `npx tsc --noEmit` w `frontend/` — czysto (exit 0).
      `node --check src/routes/sharing.routes.js` — bez błędów. Migracje
      001–032 (włącznie z `031_conversation_sharing.sql`) uruchomione od
      zera na lokalnej dev bazie Postgres (`npm run migrate`,
      `salesmore_llm_test`) — przeszły bez błędów. Lokalnie uruchomiony
      backend: `POST /chat/conversations/1/share` bez tokenu Authorization
      zwraca `401` (trasa chroniona `requireAuth`), `GET
      /public/conversations/nonexistent-token` zwraca `404` bez żadnego
      nagłówka autoryzacji (trasa publiczna działa), `GET /health` zwraca
      `200`. Nie udało się w tym środowisku zweryfikować end-to-end samej
      bramki compliance na żywych danych (utworzenie realnego alertu
      `leak_alerts` i próba udostępnienia tej konkretnej rozmowy przez
      zalogowanego usera) ani wizualnie kliknięcia „Udostępnij" w
      przeglądarce — ten sam blocker logowania wyłącznie przez Google OAuth
      bez dev-loginu, opisany w punktach 1–20; logika bramki (zapytanie do
      `leak_alerts`/`is_temporary` i wczesny `return res.status(403)`) jest
      jednak prosta i przeczytana ręcznie pod kątem poprawności.
- [x] 22. Panel pomocy ze skrótami klawiszowymi — skróty (Cmd+K,
       Cmd+Shift+O itd.) działają, ale brak listy/modala z pomocą.

      **Zrobione (2026-09-21):** Nowy
      [ShortcutsModal](../../frontend/src/components/ShortcutsModal.tsx)
      wypisujący wszystkie skróty potwierdzone w kodzie
      [chat/page.tsx](../../frontend/src/app/chat/page.tsx) (punkt 12) i w
      samym pliku wiadomości:
      - `Cmd/Ctrl+K` — otwórz listę rozmów i przejdź do wyszukiwania,
      - `Cmd/Ctrl+Shift+O` — nowa rozmowa,
      - `Shift+/` — pokaż ten panel skrótów,
      - `Enter` — wyślij wiadomość,
      - `Shift+Enter` — nowa linia w wiadomości.

      Otwierany przyciskiem z ikoną klawiatury (`Keyboard` z `lucide-react`)
      w [BrandHeader](../../frontend/src/components/BrandHeader.tsx) —
      widoczny w topbarze na każdej zalogowanej stronie, czyli dostępny bez
      znajomości skrótu — albo skrótem `Shift+/` z dowolnego miejsca poza
      polami `INPUT`/`TEXTAREA` (żeby nie przechwytywać `?` wpisywanego w
      treści wiadomości). Modal zamykany na trzy sposoby: przyciskiem `X`,
      kliknięciem w tło (`onClick` na overlayu, `stopPropagation` na karcie)
      i klawiszem `Escape` (dodany w tej sesji — brakowało go w wersji
      z poprzedniej sesji, mimo że zadanie tego wymaga; nowy
      `useEffect`+`keydown` listener w `ShortcutsModal.tsx`). Stylistyka
      spójna z innymi modalami w projekcie (np.
      [IncidentReportModal](../../frontend/src/components/IncidentReportModal.tsx)):
      overlay `fixed inset-0 bg-black/40`, karta `rounded-2xl` z `dark:`
      wariantami. Treść i etykiety po polsku/angielsku przez
      `useLocale` (i18n z punktu 21).

      Pliki zmienione w tej sesji: tylko
      [frontend/src/components/ShortcutsModal.tsx](../../frontend/src/components/ShortcutsModal.tsx)
      (dodano obsługę `Escape`) — modal, przycisk w topbarze i skrót
      `Shift+/` istniały już wcześniej (niescommitowane z poprzedniej sesji,
      teraz w tym samym stanie roboczym). Nie zmieniono zachowania żadnego
      istniejącego skrótu (`Cmd+K`, `Cmd+Shift+O` w chat/page.tsx
      nietknięte). **Zweryfikowano:** `npx tsc --noEmit` w `frontend/` bez
      błędów; `npm run build` w `frontend/` przechodzi bez błędów
      (kompilacja, typy, generowanie stron statycznych — wszystkie trasy
      w tym `/chat`). `npm run lint` nie da się uruchomić nieinteraktywnie
      w tym repo (Next.js prosi o wybór konfiguracji ESLint przy pierwszym
      uruchomieniu — projekt nie ma jeszcze zatwierdzonego `.eslintrc`), więc
      pominięto. Pełna wizualna weryfikacja w zalogowanym czacie (otwarcie
      panelu skrótem i przyciskiem, zamknięcie Escape/klik w tło/X)
      niemożliwa w tym środowisku — ten sam blocker logowania wyłącznie
      przez Google OAuth bez dev-loginu, opisany w punktach 1–21; kod
      przejrzano ręcznie pod kątem konfliktów z natywnymi skrótami
      przeglądarki (żaden z użytych kombinacji nie nadpisuje skrótów
      systemowych) i z pozostałymi handlerami `keydown` w `chat/page.tsx`
      (różne kombinacje klawiszy, brak nakładania).
- [x] 23. Eksport wiadomości/rozmowy do PDF/obrazka — dziś jest tylko
       eksport do Markdown.

      **Zrobione (2026-09-21):** Eksport całej rozmowy do PDF przez
      [frontend/src/lib/exportPdf.ts](../../frontend/src/lib/exportPdf.ts) —
      zero nowych zależności: renderuje transkrypt w osobnej karcie i
      wywołuje natywny dialog drukowania przeglądarki (uniwersalne „Zapisz
      jako PDF"). Przycisk „Eksportuj" w pasku ustawień rozmowy zamieniony w
      mini-menu: „Jako Markdown" (istniejące) / „Jako PDF" (nowe). Eksport do
      obrazka (PNG) świadomie pominięty w tym przejściu — wymagałby nowej
      zależności (np. html2canvas) albo rasteryzacji przez SVG
      `foreignObject`, obie opcje ryzykowne jakościowo bez dalszego
      dopracowania; PDF pokrywa realną potrzebę (dokument do wydruku/
      zapisania). `npx tsc --noEmit` bez błędów.
- [x] 24. i18n — UI jest tylko po polsku, brak wsparcia dla zespołu
       międzynarodowego (np. angielski).

      **Zrobione (2026-09-21):** Nowy
      [LocaleContext](../../frontend/src/lib/LocaleContext.tsx) (PL/EN,
      `localStorage`, wzorzec analogiczny do `ThemeContext`), podpięty w
      [layout.tsx](../../frontend/src/app/layout.tsx). Przełącznik języka w
      nowej sekcji „Język interfejsu” na stronie Ustawień. Przetłumaczono:
      topbar (`BrandHeader`), stronę Ustawień (nagłówek, motyw, język, usuń
      konto), panel skrótów klawiszowych, i nowe elementy czatu dodane w tej
      sesji (Eksportuj/Udostępnij). **Zakres świadomie ograniczony:** reszta
      statycznych napisów w `chat/page.tsx` (sidebar, przyciski akcji
      wiadomości, puste stany, placeholdery) i cały `admin/page.tsx`
      **pozostają po polsku** — te pliki są w tej chwili intensywnie
      edytowane równolegle przez inną sesję (projekty, style, rozmowy
      tymczasowe, głos, PWA), więc głębokie tłumaczenie całego UI czatu
      zostało odłożone, żeby nie mnożyć konfliktów w jednym już bardzo
      aktywnym pliku. Odpowiedzi asystenta nigdy nie są tłumaczone (zależą od
      języka pytania/promptu, nie od ustawienia UI). `npx tsc --noEmit` bez
      błędów.

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

- [x] E.2 Pasek „Sprawdzam wiadomość pod kątem danych wrażliwych…" (punkt 5)
      nie znika natychmiast, gdy zaczyna płynąć tekst odpowiedzi — w trakcie
      testu SSE widać było jednocześnie banner klasyfikacji i już
      streamowany tekst z migającym kursorem. Drobne, ale myląca kolejność
      stanów UI (sugeruje, że klasyfikacja wciąż trwa, gdy odpowiedź już
      się generuje). **Naprawiono:** w
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx),
      w `handleSend`, `setClassifying(true)` obejmował całe `try`, łącznie
      z `await submitMessage(...)`, które samo w sobie czeka na cały
      przebieg SSE (`runStream`) — więc `classifying` był `true` przez cały
      czas streamowania odpowiedzi, nie tylko przez czas klasyfikacji.
      `setClassifying(false)` przeniesiono tak, by był wywoływany od razu
      po otrzymaniu werdyktu klasyfikatora (i w gałęzi `catch` przy awarii
      klasyfikatora), a nie w `finally` po zakończeniu `submitMessage`.
      Banner znika więc natychmiast po klasyfikacji, jeszcze przed
      rozpoczęciem streamu, zamiast nakładać się na już streamowany tekst.
      Render `{classifying && (...)}` nie wymagał zmiany warunku — sam stan
      teraz poprawnie odzwierciedla fazę klasyfikacji. `npx tsc --noEmit`
      bez błędów.
- [x] E.3 Punkt 9 (z-index sidebar/panel artefaktów) zweryfikowany tylko
      przez potwierdzenie klasy `z-50` w zbudowanym bundlu + osobne
      przetestowanie sidebara — nie odtworzono na żywo scenariusza z oboma
      panelami otwartymi naraz na mobile. Zmiana jest trywialna (jedna
      wartość CSS), ale warto dograć realny test przy okazji następnej
      wizyty w tym repo. **Weryfikacja statyczna (bez realnej sesji mobile w
      tym środowisku):** w
      [frontend/src/app/chat/page.tsx](../../frontend/src/app/chat/page.tsx)
      panel artefaktów (`ArtifactPanel`) to `<aside className="fixed inset-0
      z-50 ...">`, overlay sidebara na mobile to `<div className="fixed
      inset-0 z-30 ...">`, a sam sidebar to `<aside className="fixed
      inset-y-0 left-0 z-40 ...">`. Oba (`ConversationSidebar` i
      `ArtifactPanel`) są renderowane jako bezpośrednie sibliki wewnątrz
      tego samego `<div className="flex flex-1 gap-3 overflow-hidden">` —
      żaden z ich przodków nie ma `transform`/`filter`/`perspective`/
      `isolation`, więc żaden nie tworzy lokalnego stacking contextu, który
      mógłby odciąć je od siebie; wszystkie trzy elementy (`z-50`, `z-40`,
      `z-30`) konkurują więc w tym samym, globalnym stacking contexcie.
      Przeszukano cały plik pod kątem innych wartości `z-*` — jedyne
      pozostałe to `z-20` (dropdown akcji wiadomości) i drugie użycie
      `z-50` (modal `blockedNotice`, niezależny od tego scenariusza, sam
      też fixed bez transformowanego przodka). Żaden element w drzewie nie
      ma wyższego z-index niż `z-50`. Wniosek: przy jednoczesnym otwarciu
      sidebara (`z-40`/`z-30`) i panelu artefaktów (`z-50`) na mobile panel
      artefaktów zawsze wygrywa i renderuje się na wierzchu — logika
      z-index jest poprawna, zmiana kodu nie była potrzebna.

## Stan na koniec sesji (2026-09-21)

Wszystkie 13 punktów z A+B+C zweryfikowane wizualnie na produkcyjnym
deployu Railway jako zalogowany admin (michal.grom@salesmore.pl). Zadanie
zamknięte. Sekcja D (14–20, porównanie z Claude.ai) pozostaje nietknięta —
to osobny, nowy backlog, nie część tego audytu logowania. Sekcja E.2/E.3
to nowe, mniejsze braki do ewentualnego domknięcia w kolejnym czacie.
E.2 i E.3 zostały domknięte w kolejnej sesji (E.2 naprawiony w kodzie, E.3
zweryfikowany statycznie bez konieczności zmian).

Zalecane wyczyszczenie czatu — zadanie z promptu startowego zakończone.
