# Polityka danych dla wewnętrznego LLM (salesmore-llm)

Ostatnia aktualizacja: 2026-09-16. Właściciel: [do uzupełnienia — osoba
odpowiedzialna za compliance/bezpieczeństwo danych w Agencji].

## 1. Klasyfikacja danych i co się z nimi dzieje

Zgodnie z firmową klasyfikacją (zielona/żółta/czerwona):

| Poziom | Co obejmuje | Co się dzieje w systemie |
|---|---|---|
| 🟢 Zielona | dane publiczne, treści kreatywne | idzie wprost do modelu, bez ograniczeń |
| 🟡 Żółta | dane wewnętrzne Agencji, dane osobowe pracowników, info handlowe | **blokada twarda** przed wysłaniem — patrz §2 |
| 🔴 Czerwona | dane klientów/konsumentów, tajemnica handlowa, umowy | **blokada twarda** przed wysłaniem — patrz §2 |

Klasyfikacja wykonywana jest automatycznie przez osobne, tanie wywołanie
modelu (`PRECHECK_MODEL`, domyślnie Claude Haiku) na **każdej** wiadomości
użytkownika, przed jakimkolwiek innym przetwarzaniem — patrz
`backend/src/services/security/sensitiveDataPrecheck.js`.

## 2. Warstwa redakcji PRZED promptem

Zanim tekst trafi do `messages.create()` (do prechecku i do właściwego
modelu), przechodzi przez `backend/src/services/security/piiRedaction.js`:

- **Detekcja wzorców** (regex): e-mail, PESEL, numer karty płatniczej, telefon.
- **Tokenizacja odwracalna**: każde trafienie zamieniane jest na unikalny
  token (`[EMAIL_1]`, `[PESEL_1]`, ...), nie na stały placeholder — model
  widzi strukturę wiadomości, nigdy realną wartość.
- **Mapa `token → wartość`** żyje wyłącznie w pamięci procesu, na czas
  jednego requestu. Nie jest logowana, nie jest zapisywana do bazy.
- **Detokenizacja odpowiedzi**: jeśli odpowiedź modelu odwołuje się do
  tokenu (np. bo powtarza fragment pytania), na drodze powrotnej do
  przeglądarki specjalisty token jest podmieniany z powrotem na realną
  wartość — ale **tylko w tej jednej, żywej odpowiedzi**. To, co ląduje w
  bazie (`messages` table) i to, co widzi model, zawsze zostaje
  ztokenizowane. Zobacz `restorePii` / `createDetokenizingChunker`.

**Nazwy klientów/marek — zamknięte**: obok wzorców regex, redakcja
tokenizuje też literalne nazwy z tabeli `redaction_terms` (migracja
`011_redaction_terms.sql`, zarządzana przez `POST/GET/DELETE
/metrics/redaction-terms`, tylko `manager`/`admin`). Każda nazwa klienta lub
marki dodana do tej listy jest odtąd tokenizowana dokładnie tak samo jak
PESEL czy e-mail — patrz `createRedactionSession` w
`backend/src/services/security/piiRedaction.js`. Jeśli jakość odpowiedzi
wymaga, żeby model znał realną nazwę (np. do zapytania do Google Ads), to
dziś nadal może iść jawnie — ale tylko dopóki nikt nie doda tej nazwy do
listy; to świadomy wybór per-klient, nie domyślne zachowanie systemu.

## 3. Odpowiedzi z wewnętrznych narzędzi (RAG/BigQuery) — redagowane tak samo

Precheck (klasyfikacja zielona/żółta/czerwona, z twardą blokadą) działa
**wyłącznie na wiadomości przychodzącej od specjalisty** (plus OCR z
załączników) — to się nie zmieniło. Ale redakcja PII/nazw klientów działa
teraz **też** na wynikach, które model dostaje z powrotem z
`query_bigquery`/`search_knowledge_base`: zanim taki wynik trafi do
kolejnego wywołania `messages.create`, przechodzi przez tę samą
`createRedactionSession`, która zredagowała oryginalną wiadomość
specjalisty (dzielą jedną mapę token→wartość na cały request) — patrz
`runAllToolUses` w `backend/src/services/chatCore/pipeline.js`. Numer
klienta czy budżet, który wróci z BigQuery, nigdy nie trafia do Anthropic
API jako surowa wartość — dokładnie ten błąd, który wcześniej powtarzał
Sigma.

Blokada twarda pozostaje tylko na wejściu, bo chroni przed tym, że
specjalista świadomie wklei dane wrażliwe do promptu — nie ma potrzeby
blokować naszego własnego, zatwierdzonego systemu odpytującego naszą
własną bazę; redakcja wystarcza, żeby surowa wartość i tak nie wyszła.

**Zastrzeżenie, które trzeba świadomie zaakceptować**: żeby model
przetworzył i odpowiedział, cały (zredagowany) kontekst musi fizycznie
przejść przez Anthropic API. Nie trafia do internetu ani do trzeciej firmy
poza Anthropic, ale technicznie *wychodzi* poza nasze serwery do procesora
AI. Zgodnie z naszą polityką klasyfikacji, Anthropic API jest traktowany
jako "narzędzie z Listy Zatwierdzonej" — to przetwarzanie wewnętrzne przez
zatwierdzonego procesora, nie wyciek na zewnątrz.

## 4. Retencja danych po stronie Anthropic

To jest **decyzja kontraktowa, nie parametr w kodzie**. Standardowe API
Anthropic ma domyślną politykę retencji (dane API nie są używane do
trenowania modeli; są przechowywane krótkoterminowo do celów
bezpieczeństwa/nadużyć zgodnie z ich Commercial Terms of Service). Opcja
**Zero Data Retention (ZDR)** jest dostępna wyłącznie w ramach umowy
Enterprise i wymaga osobnego uzgodnienia z Anthropic (Sales/Legal) — nie da
się jej "włączyć" wywołaniem API.

**Decyzja (2026-09-16): zostajemy na standardowym Anthropic API, bez ZDR,
na teraz.** Świadomie zaakceptowane ryzyko, nie przeoczenie — pilotaż nie
uzasadnia dziś kosztu/czasu negocjacji umowy Enterprise, a warstwa redakcji
(§2-3) już gwarantuje, że surowe dane wrażliwe (PII, nazwy klientów z listy
`redaction_terms`, dane z BigQuery/RAG) nigdy nie docierają do API w
niezredagowanej formie — ZDR chroniłoby tylko to, co i tak jest już
zredagowane. Do zrobienia mimo to:
- [ ] Sprawdzić z Anthropic (przez konto Enterprise/API commercial) czy ZDR
      jest dostępne dla naszego planu, i po jakim koszcie/czasie — wrócić
      do tej decyzji, jeśli skala projektu wyjdzie poza pilotaż.
- [ ] Do tego czasu traktować retencję jako "standardowa polityka
      Anthropic API", nie ZDR — i uwzględnić to przy klasyfikacji, jakie
      dane wolno wysyłać jawnie (czerwona/żółta idą zredagowane, patrz §2).

## 5. Audit log — osobno od logów funkcjonalnych

`usage_metrics` (koszt/latency) i `precheck_results` (wynik klasyfikacji)
to logi funkcjonalne/debugowe. Osobno od nich istnieje `ai_audit_log`
(migracja `010_ai_audit_log.sql`):

- `data_categories_sent` — **kategorie**, nie wartości (np. `{EMAIL,
  PESEL}` albo `{PII, DANE_FIRMOWE}`), zebrane z redakcji PII i z
  klasyfikacji prechecku.
- `redaction_applied` — czy w tej wiadomości w ogóle wykryto i
  zredagowano PII.
- `precheck_level` — zielona/żółta/czerwona.
- `model`, `purpose` (nazwa komendy albo `chat`/`precheck`/`classify-draft`).

Wpis jest zapisywany dla **każdego** faktycznego wywołania modelu (precheck
zawsze, plus właściwy model czatu jeśli wiadomość przeszła dalej) — patrz
`backend/src/services/security/aiAuditLog.js`, wpięte w
`backend/src/services/chatCore/pipeline.js`.

To pozwala odpowiedzieć na pytanie "jakie kategorie danych, kiedy i dla
kogo wyszły poza firmę" bez trzymania drugiej kopii danych wrażliwych.

## 6. Kto jest właścicielem i kiedy przeglądamy

- **Właściciel decyzji**: [do uzupełnienia].
- **Przegląd**: [do uzupełnienia — sugerowane: kwartalnie, oraz przy każdej
  zmianie klasyfikacji danych lub dodaniu nowego narzędzia/MCP z dostępem
  do danych klientów].

## 7. Checklist przed każdym większym wdrożeniem zmian bezpieczeństwa

- [x] Pipeline redakcji działa przed każdym wywołaniem `messages.create`
      (precheck i właściwy model) — zweryfikowane w kodzie
      (`prepareNewTurn`/`continueFromUserMessage`/`classifyDraftMessage`).
- [ ] Retention flag / ZDR ustalone jawnie z Anthropic (patrz §4) —
      **otwarte, nie zrobione**.
- [x] Audit log kategorii danych (nie treści), osobna tabela od logów
      funkcjonalnych — `ai_audit_log`.
- [ ] Polityka (ten dokument) zaakceptowana przez osobę odpowiedzialną za
      compliance — **do zrobienia, wymaga człowieka**.
- [x] Test automatyczny (jednostkowy): symulacja jednej sesji redakcji z
      fikcyjnym klientem/PII w wiadomości specjalisty i w wyniku
      narzędzia (BigQuery), sprawdzający że surowe wartości nie przetrwają
      redakcji i że są poprawnie odwracalne —
      `backend/src/services/security/piiRedaction.test.js` (`npm test`).
- [ ] Test end-to-end (z mockowanym Anthropic API i prawdziwym Postgresem)
      weryfikujący cały `handleChatTurn`/`streamChatTurn` — wymaga najpierw
      wybrania frameworka testowego (dziś projekt nie ma żadnego) i
      testowej bazy danych. **Nie zrobione, świadomie odłożone.**

## 8. Znane luki / świadomie poza zakresem (na razie)

- Rola/uprawnienia per-dokument w bazie wiedzy (RAG) — dziś każdy
  zalogowany specjalista może odpytać całą bazę wiedzy; nie ma
  granularnego dostępu per klient. Do rozważenia razem z dokończeniem RAG
  (patrz `docs/backlog-funkcjonalnosci.md`).
- Klient z pisemnym sprzeciwem wobec AI (kategoria czerwona w polityce) —
  system nie ma dziś sposobu żeby to wymusić automatycznie (np. flaga per
  klient blokująca odpytywanie jego danych). Śledzone poza systemem.
- Redakcja nazw klientów wymaga, żeby ktoś faktycznie dodał je do
  `redaction_terms` — mechanizm istnieje, ale lista zaczyna pusta; trzeba ją
  aktywnie utrzymywać przy onboardingu nowego klienta.
