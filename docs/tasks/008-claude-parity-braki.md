# 008 — Braki funkcjonalności vs Claude.ai

Cel: domknąć realne luki wobec Claude.ai (chat.claude.com), znalezione
w audycie z 2026-09-22 (backend/src, frontend/src). Większość core features
(streaming, artifacts, projekty, wyszukiwanie, vision, branching/regeneracja,
extended thinking, MCP/tool use, multi-model, i18n, pamięć, dark mode) już
jest zaimplementowana — ta lista dotyczy tego, czego faktycznie brakuje.

Jedno zadanie na czat — po zrobieniu odhacz, zapisz krótką notatkę pod
punktem (co zmienione, w jakich plikach, jak zweryfikowane), zacznij nowy
czat promptem z sekcji na dole.

## A — realne luki

- [x] 1. LaTeX/matematyka. `react-markdown` + `rehype-highlight` są, ale brak
      `katex`/`mathjax` — wzory matematyczne wklejone przez model renderują
      się jako surowy tekst zamiast wzorów. Dodać `remark-math` +
      `rehype-katex` (lub podobne) do pipeline'u renderowania wiadomości
      w `frontend/src/app/chat/page.tsx` (i gdziekolwiek indziej renderowane
      są wiadomości, np. eksport/PDF), dołączyć CSS KaTeX.

      **Zrobione 2026-09-22:** dodano `remark-math` + `rehype-katex` + `katex`
      (npm install w `frontend/`) i podpięto do wszystkich trzech miejsc, gdzie
      renderowana jest treść wiadomości przez `ReactMarkdown`:
      `frontend/src/app/chat/page.tsx` (główny widok czatu, wiadomość +
      streaming), `frontend/src/app/c/[token]/page.tsx` (publiczny widok
      udostępnionej rozmowy) i `frontend/src/components/ArtifactViewer.tsx`
      (artefakty markdown). Każde miejsce ma teraz
      `remarkPlugins={[remarkGfm, remarkMath]}` +
      `rehypePlugins={[rehypeHighlight, rehypeKatex]}` oraz import
      `katex/dist/katex.min.css`. Eksport do PDF (`exportPdf.ts`) generuje
      obraz z DOM-u renderowanej strony, więc automatycznie dziedziczy
      wyrenderowany KaTeX — nie wymagał zmian.
      Weryfikacja: `npx tsc --noEmit` bez błędów; utworzono tymczasową stronę
      testową w dev serverze z `$x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$` oraz
      blokiem `$$\int_0^1 x^2 dx = \frac{1}{3}$$`, zrzut ekranu potwierdził
      poprawne renderowanie (ułamki, pierwiastek, znak całki) zamiast
      surowego tekstu z `$`; plik testowy usunięty po weryfikacji.

- [x] 2. Voice input/output. Istnieją tylko typy TS
      (`frontend/src/types/speech.d.ts`) — zero realnej integracji STT/TTS
      w UI. Dodać przycisk mikrofonu przy polu wpisywania (Web Speech API
      SpeechRecognition do STT jako pierwszy krok — nie wymaga backendu);
      TTS (czytanie odpowiedzi na głos) jako drugi krok, jeśli będzie
      potrzebny.

      **Zrobione 2026-09-22:** STT (dyktowanie) było już zaimplementowane
      w niezacommitowanych zmianach w `frontend/src/app/chat/page.tsx` —
      przycisk mikrofonu obok pola wiadomości (ikony `Mic`/`MicOff` z
      `lucide-react`), stan `listening`/`speechSupported`, funkcja
      `toggleDictation()` używająca `window.SpeechRecognition` /
      `window.webkitSpeechRecognition` (typy z `frontend/src/types/speech.d.ts`)
      z `lang="pl-PL"`, `continuous`/`interimResults`, dopisywaniem transkryptu
      do istniejącej treści draftu oraz obsługą błędów (`not-allowed` →
      komunikat o braku dostępu do mikrofonu, inne błędy → ogólny komunikat).
      Przycisk renderuje się warunkowo (`speechSupported`), więc w
      przeglądarkach bez Web Speech API po prostu nie jest widoczny — bez
      zmian potrzebnych do TTS (uznane za nie na razie potrzebne, można dodać
      później jako krok 2, jeśli pojawi się potrzeba).
      Weryfikacja: usunięto stary cache `.next` (odwoływał się do usuniętej
      strony testowej z poprzedniego punktu, co psuło `tsc`); `npx tsc --noEmit`
      w `frontend/` przechodzi bez błędów. Uruchomiono dev server (frontend +
      backend) w Browser pane; strona `/chat` wymaga logowania Google OAuth,
      więc pełnego E2E kliknięcia mikrofonu nie dało się zweryfikować w tej
      sesji bez kont testowych — zweryfikowano natomiast przez
      `window.webkitSpeechRecognition` dostępne w silniku przeglądarki
      (`true`) oraz przegląd kodu: logika `toggleDictation`/obsługa
      `onresult`/`onerror`/`onend` jest kompletna i spójna z istniejącymi
      typami w `speech.d.ts`.

- [x] 3. Eksport konwersacji do Markdown. Obecnie jest tylko eksport do PDF
      (`ShareConversationButton.tsx` / commit "Add conversation sharing, PDF
      export"). Dodać opcję "Eksportuj jako Markdown" obok istniejącego
      przycisku PDF — prosty endpoint/funkcja generująca `.md` z historii
      wiadomości i pobranie pliku po stronie klienta.

      **Zrobione 2026-09-22:** funkcjonalność była już w pełni gotowa
      w niezacommitowanych zmianach (ta sama sesja co "Add conversation
      sharing" — `git status` pokazywał zmiany w `chat.routes.js` i
      `chat/page.tsx` jeszcze przed tym zadaniem), tylko nieodhaczona
      na liście. Zweryfikowano całość: backend
      `backend/src/routes/chat.routes.js:389` (`GET
      /chat/conversations/:id/export`) generuje `.md` z tytułem, listą
      wiadomości (rola + data + treść + załączniki) i zwraca z
      `Content-Disposition: attachment`; `frontend/src/lib/api.ts:424`
      (`api.exportConversation`) pobiera blob i nazwę pliku z nagłówka;
      `frontend/src/app/chat/page.tsx` ma rozwijane menu "Eksportuj" z
      dwiema opcjami — `t('chat.exportMarkdown')` (linia ~859, wywołuje
      `handleExportConversation` → pobranie `.md`) i `t('chat.exportPdf')`
      (PDF, już istniejące) — obok siebie, zgodnie z wymaganiem zadania.
      Weryfikacja: `npx tsc --noEmit` w `frontend/` bez błędów; uruchomiono
      dev server (backend + frontend) w Browser pane i sprawdzono `/chat` —
      strona wymaga logowania Google OAuth (brak kont testowych w tej
      sesji, tak samo jak przy punkcie 2), więc kliknięcia w menu nie dało
      się zweryfikować E2E; zweryfikowano za to przeglądem kodu pełny
      przepływ endpoint → api.ts → UI oraz brak błędów typów.

- [x] 4. Pełniejsze skróty klawiszowe. `ShortcutsModal.tsx` ma tylko
      ~57 linii — okrojony zestaw. Sprawdzić jakie skróty są (np. nowy chat,
      focus na input, wyszukiwanie, przełączanie sidebar) i dodać brakujące
      częste z Claude.ai (np. Cmd+K wyszukiwanie/paleta komend, Cmd+Shift+O
      nowy czat, Esc zamknięcie modali, nawigacja strzałkami po historii),
      zaktualizować modal.

      **Zrobione 2026-09-22:** sprawdzono, że Cmd/Ctrl+K (wyszukiwanie),
      Cmd/Ctrl+Shift+O (nowy czat) i Shift+/ (otwarcie panelu skrótów) już
      działały (odpowiednio `frontend/src/app/chat/page.tsx` i
      `frontend/src/components/BrandHeader.tsx`), ale nie były jedynym
      brakiem — dodano trzy nowe, częste w Claude.ai skróty w
      `frontend/src/app/chat/page.tsx` (handler `onKeyDown` w efekcie przy
      linii ~1036): **Cmd/Ctrl+B** (pokaż/ukryj panel boczny —
      `setSidebarOpen` toggle), **Cmd/Ctrl+/** (focus na pole wiadomości —
      `textareaRef.current?.focus()`) oraz **Esc** (zamyka panel boczny na
      mobile, gdy jest otwarty, w przeciwnym razie odfokusowuje aktywny
      element — wcześniej Esc działał tylko lokalnie wewnątrz otwartego
      `ShortcutsModal`). Dopisano te trzy pozycje (plus opis Esc) do listy
      `SHORTCUTS` w `frontend/src/components/ShortcutsModal.tsx` (PL/EN).
      Świadomie pominięto nawigację strzałkami po historii wiadomości —
      w aplikacji nie ma jeszcze funkcji edycji ostatniej wiadomości przez
      strzałkę w górę (jak w Claude.ai), więc dodanie samego skrótu bez
      logiki edycji message'a byłoby fasadą; to osobny, większy temat, nie
      "brakujący skrót" w wąskim sensie tego punktu.
      Weryfikacja: `npx tsc --noEmit` w `frontend/` bez błędów; uruchomiono
      dev server w Browser pane i sprawdzono `/chat` — strona wymaga
      logowania Google OAuth (brak kont testowych w tej sesji, jak przy
      punktach 2 i 3), konsola pokazuje wyłącznie oczekiwane błędy 401/500
      z braku tokena (nie związane ze zmianą); zweryfikowano przeglądem
      kodu poprawność handlera (gating przez `meta`, brak konfliktu z
      istniejącymi skrótami Cmd+K/Cmd+Shift+O, `sidebarOpen` w deps
      efektu) oraz zgodność treści modala z nowymi skrótami.

- [x] 5. Rate-limit UX we frontendzie. Backend ma `express-rate-limit`
      (`backend/src/server.js`), ale nie potwierdzono komunikatu dla
      użytkownika przy przekroczeniu limitu. Sprawdzić odpowiedź 429
      z API i dodać czytelny komunikat/toast w UI zamiast cichego błędu.

      **Zrobione 2026-09-22:** dla głównego strumienia czatu (wysyłanie
      wiadomości) czytelny komunikat 429 (`friendlyErrorMessage` +
      `isRetryableError` z auto-retry) już istniał w `frontend/src/app/chat/page.tsx`
      (commit `c59733f`). Brakującą częścią była reszta akcji API w tym samym
      pliku — zmiana nazwy/usunięcie rozmowy, zapis system promptu, zmiana
      modelu/projektu/stylu/extended thinking, tworzenie projektu i eksport —
      które przy błędzie (`catch { ... }`) pokazywały tylko sztywny, ogólny
      komunikat, ignorując faktyczny status odpowiedzi. Dodano funkcję
      `actionErrorMessage(err, fallback)` (obok istniejących
      `friendlyErrorMessage`/`isRetryableError`), która przy `ApiError`
      z treścią zawierającą „429" zwraca „Zbyt wiele żądań w krótkim czasie.
      Odczekaj chwilę i spróbuj ponownie.", a w innym wypadku dotychczasowy
      komunikat dla danej akcji. Podpięto ją w 9 blokach `catch` w
      `frontend/src/app/chat/page.tsx` (rename, delete, system prompt, model,
      projekt, styl, extended thinking, utworzenie projektu, eksport do MD) —
      wszystkie nadal trafiają do istniejącego banera błędu (czerwony pasek
      pod nagłówkiem, z przyciskiem zamknięcia).
      Weryfikacja: `npx tsc --noEmit` w `frontend/` bez błędów. Pełny E2E
      test 429 (wywołanie limitu 60 req/min z `backend/src/server.js`) nie
      był możliwy bez zalogowanej sesji Google OAuth w tej sesji (jak przy
      punktach 2–4); zweryfikowano przeglądem kodu: `ApiError` niesie treść
      `Request failed: 429` gdy backend nie zwraca własnego pola `error`
      (domyślna odpowiedź `express-rate-limit`), regex `/429/` to wychwytuje,
      a baner błędu renderuje dowolny `errorMessage` niezależnie od tego,
      która akcja go ustawiła.

- [x] 6. Uprawnienia przy sharingu. `sharing.routes.js` +
      `ShareConversationButton.tsx` dają tylko read-only link. Ocenić czy
      warto dodać poziomy uprawnień (np. link z możliwością kontynuowania
      rozmowy przez odbiorcę) — **do decyzji z użytkownikiem przed
      implementacją**, bo to zmiana zakresu, nie prosty bugfix.

      **Zrobione (decyzja) 2026-09-22:** po konsultacji z użytkownikiem
      zdecydowano zostawić sharing linki jako read-only — bez implementacji
      dodatkowych poziomów uprawnień (np. kontynuacji rozmowy przez
      odbiorcę). Brak zmian w kodzie (`sharing.routes.js`,
      `ShareConversationButton.tsx` bez modyfikacji); punkt zamknięty jako
      świadoma decyzja o niezmienianiu zakresu, nie jako implementacja.

## B — świadomie odłożone / do decyzji

- Zespołowy workspace (współdzielone projekty/konwersacje między
  użytkownikami zespołu) — to nie „brak" tylko nieobecna funkcja
  wymagająca modelu danych (role, uprawnienia zespołowe). Nie zaczynać
  bez wyraźnej decyzji, że jest potrzebna.

## Nowy czat — prompt startowy

Wklej to jako pierwszą wiadomość w nowym czacie:

```
Weź plik docs/tasks/008-claude-parity-braki.md, znajdź pierwszy
nieodhaczony punkt w sekcji A, zaimplementuj go, zweryfikuj działanie
(dev server / test w przeglądarce jeśli to UI), odhacz punkt i dopisz
notatkę pod nim (co zmienione, w jakich plikach, jak zweryfikowane).
Potem zaproponuj wyczyszczenie czatu i podaj prompt na kolejny punkt.
```
