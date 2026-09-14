# salesmore-llm — MVP wewnętrznego LLM dla Sales&More

## Kontekst

Sales&More (razem z szefem) chce sprawdzić, czy opłaca się zbudować własne narzędzie czatowe oparte o Anthropic Claude zamiast (lub obok) wykupienia subskrypcji enterprise (Claude/ChatGPT Enterprise). Cel MVP: **automatyczne mierzenie kosztu i jakości odpowiedzi** na realnym ruchu 30–60 specjalistów, żeby podjąć decyzję: zbudować własne narzędzie w całości, kupić enterprise, czy zrobić model hybrydowy (część miejsc enterprise, reszta na własnym narzędziu).

Repo GitHub `salesandmore/salesmore-LLM-mvp` jest puste — to greenfield. W folderze projektu jest już `BrandGuidelines-Sales&More v3-kopia.pdf`, z którego wzięty jest branding frontendu. W innym repo firmy (`pongo-monorepo`, Django+React) są dobre wzorce koncepcyjne do powtórzenia w Node: fabryka klienta Anthropic z kluczem z GCP Secret Manager, centralny dispatcher slash-komend (bypass vs. continue-do-LLM), moduły integracji per-dostawca (Google Ads, DV360, BigQuery) — kod nie jest 1:1 przenośny (Python→Node), ale architektura tak.

## Zakres MVP

1. Backend Express + PostgreSQL, silnik czatu na `@anthropic-ai/sdk`.
2. Auth JWT własny (30–60 użytkowników — prosta tabela `users`, e-mail+hasło, brak SSO na start).
3. Jeden MCP server na start: **BigQuery** (najłatwiej zmierzyć koszt vs. wartość, dane już są w GCP).
4. System custom slash-komend w czacie (wzorem `slash_dispatch.py` z pongo, przepisany na Node: rejestr komend, tryb "bypass" i "continue-to-LLM").
5. **Automatyczne metryki**: koszt/request (z response usage Anthropic API), czas odpowiedzi (latency), jakość oceniana przez LLM-as-judge (osobne wywołanie oceniające, zapisywane w DB) — to jest serce decyzji biznesowej, więc trzeba to zaprojektować solidnie już w MVP.
6. Eksporty (pptx/xlsx) do raportowania wyników porównania kierownictwu.
7. Frontend w brandingu Sales&More (kolory z PDF, prosty czat + panel metryk/kosztów dla adminów).
8. Hosting: GCP (Cloud Run dla backendu+frontendu, Cloud SQL Postgres), Secret Manager na klucze (Anthropic API key, DB creds, JWT secret).

Świadomie POZA MVP (do doprecyzowania później, gdy pierwszy etap ruszy): Google Ads API i DV360 jako MCP servery, dodatkowe MCP zewnętrzne (Slack/ClickUp/Notion), SSO.

## Struktura repo (monorepo, 2 foldery)

```
salesmore-llm/
├── backend/
│   ├── src/
│   │   ├── server.js                  # Express bootstrap, helmet/cors/rate-limit
│   │   ├── config/
│   │   │   ├── db.js                  # pg Pool
│   │   │   └── secrets.js             # GCP Secret Manager client (wzorzec z anthropic_client.py)
│   │   ├── middleware/
│   │   │   ├── auth.js                # JWT verify middleware
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js         # /login, /register (admin-only)
│   │   │   ├── chat.routes.js         # /chat (stream), /conversations
│   │   │   ├── metrics.routes.js      # /metrics/costs, /metrics/quality
│   │   │   └── export.routes.js       # /export/pptx, /export/xlsx
│   │   ├── services/
│   │   │   ├── anthropicClient.js     # fabryka klienta, klucz z Secret Manager, singleton
│   │   │   ├── chatCore/
│   │   │   │   ├── slashDispatch.js   # centralny rejestr komend (bypass/continue)
│   │   │   │   ├── commands/          # jedna komenda = jeden plik (np. pomoc.js, raportKosztow.js)
│   │   │   │   └── pipeline.js        # budowa promptu, wywołanie Claude, streaming
│   │   │   ├── judge/
│   │   │   │   └── qualityJudge.js    # drugie wywołanie LLM oceniające odpowiedź (1-5, rationale)
│   │   │   ├── metrics/
│   │   │   │   └── usageTracker.js    # zapis kosztu (input/output tokens * cena modelu), latency
│   │   │   ├── mcp/
│   │   │   │   └── bigqueryServer.js  # MCP server: query BigQuery jako narzędzie
│   │   │   └── export/
│   │   │       ├── pptxExport.js      # pptxgenjs
│   │   │       └── xlsxExport.js      # exceljs
│   │   └── db/
│   │       └── migrations/            # SQL: users, conversations, messages, usage_metrics, quality_scores
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── theme/
│   │   │   └── colors.ts              # z brand guidelines: #29272E, #F8502C, #FFFFFF, #EDEDF5, akcenty #5A54BE/#9DB0DF/#D74AD6
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Chat.tsx
│   │   │   └── AdminDashboard.tsx     # koszt/jakość/latency per user, per okres
│   │   └── components/
│   ├── package.json
│   └── vite.config.ts
├── .claude/ (jeśli zostaje w tym repo)
└── README.md
```

## Kluczowe decyzje projektowe

- **Auth**: własny JWT (`jsonwebtoken`), tabela `users` w Postgresie, hash hasła (`bcrypt`), brak SSO w MVP — dopisane jako TODO na przyszłość (Google Workspace OAuth, wzorem `GoogleJWTAuthentication` z pongo, gdyby firma chciała ujednolicić logowanie).
- **Metryki jakości**: po każdej odpowiedzi Claude, osobne, tanie wywołanie (np. Claude Haiku) jako "sędzia" — ocenia trafność/pomocność w skali 1–5 z uzasadnieniem, zapisywane do `quality_scores`. To pozwala liczyć średnią jakość vs. koszt per okres/per komenda i realnie porównać z subskrypcją enterprise.
- **Metryki kosztu**: Anthropic API zwraca `usage.input_tokens`/`usage.output_tokens` w każdej odpowiedzi — zapisujemy per wiadomość razem z ceną modelu (tabela cennika w konfiguracji, aktualizowana ręcznie), agregujemy per user/dzień/miesiąc.
- **MCP**: BigQuery jako pierwszy serwer MCP (via `@modelcontextprotocol/sdk`), rejestrowany w kliencie Anthropic jako tool. Google Ads/DV360 jako kolejne MCP servery później, wzorem istniejących klientów Node w innych repo firmy — struktura folderu `services/mcp/` ma być łatwo rozszerzalna o kolejne serwery.
- **Custom komendy**: wzorowane na `slash_dispatch.py` z pongo — rejestr komend z dwoma trybami: `bypass` (komenda zwraca gotową odpowiedź/dane bez wywołania LLM, np. `/koszt-dzisiaj`) i `continue` (komenda przepisuje/wzbogaca prompt i przekazuje dalej do Claude, np. `/analiza-bigquery <zapytanie>`).
- **Bezpieczeństwo**: `helmet`, `cors` (allowlist domen firmowych), `express-rate-limit` per-user i per-IP, `winston` do logów strukturalnych (request id, user id, koszt, czas trwania) — pod GCP Cloud Logging.
- **Sekrety**: `@google-cloud/secret-manager`, jeden moduł `config/secrets.js` cache'ujący sekrety w pamięci procesu (wzorzec z `anthropic_client.py` w pongo) — klucz Anthropic, connection string do Cloud SQL, JWT secret.

## Baza danych (szkic tabel)

- `users` (id, email, password_hash, role, created_at)
- `conversations` (id, user_id, title, created_at)
- `messages` (id, conversation_id, role, content, created_at)
- `usage_metrics` (id, message_id, model, input_tokens, output_tokens, cost_usd, latency_ms, command_used, created_at)
- `quality_scores` (id, message_id, judge_model, score, rationale, created_at)

## Weryfikacja / jak sprawdzić, że działa

1. Backend: `npm run dev`, healthcheck `/health`; ręczny request `/chat` z tokenem JWT — sprawdzić że odpowiedź Claude wraca, a wiersz w `usage_metrics` i `quality_scores` się zapisuje.
2. Test slash-komendy `bypass` (np. `/koszt-dzisiaj`) — brak wywołania Anthropic API (sprawdzić logi/koszt = 0 dla tego requestu).
3. Test slash-komendy `continue` odpalającej MCP BigQuery — sprawdzić że tool call trafia do BigQuery i wynik wraca w odpowiedzi.
4. Frontend: zalogować się, wysłać wiadomość w czacie, sprawdzić że kolory/branding zgadzają się z PDF (grafit/pomarańcz/biel), zobaczyć panel admina z agregatami kosztu/jakości.
5. Eksport: wygenerować raport pptx/xlsx z danymi z `usage_metrics`/`quality_scores` za wybrany okres.
6. Deploy: `gcloud run deploy` dla backend i frontend, Cloud SQL podłączony przez Cloud SQL Auth Proxy, sekrety pobierane z Secret Manager (nie z `.env` na produkcji).

## Status weryfikacji MVP (2026-09-10)

Zweryfikowane i działające lokalnie:

- Backend startuje, migracje przechodzą, `/health` OK.
- Auth: seed admina, `/auth/login` zwraca JWT, middleware odrzuca zły token.
- Frontend: `npm run build` bez błędów, login + czat renderują się z poprawnym
  brandingiem, proxy `/api/*` → backend działa.
- Slash-komenda bypass `/pomoc` działa end-to-end bez wywołania Anthropic API.
- `/chat` (`POST /chat/conversations/:id/messages`) działa z realnym kluczem
  Anthropic API — odpowiedź Claude wraca, koszt/latency zapisują się w
  `usage_metrics`.
- Naprawiony bug: `qualityJudge.js` wywalał się na `JSON.parse`, bo model
  Haiku owija odpowiedź w ` ```json ` code fence — dodano zdejmowanie fence
  przed parsowaniem. Po poprawce `quality_scores` zapisuje się poprawnie, a
  `/metrics/costs` i `/metrics/quality` zwracają realne dane.
- Slash-komenda `continue` `/analiza-bigquery` — kod domknięty: walidacja
  pustych argumentów (`/analiza-bigquery` bez pytania zwraca teraz bypass z
  prośbą o pytanie, zero kosztu), `projectId` przekazywany do klienta
  `BigQuery` z `GCP_PROJECT_ID`, `context` (`conversationId`) poprawnie
  przekazywany przez `dispatchCommand`, usunięto nieużywany
  `BIGQUERY_DATASET` z `.env.example`. Zweryfikowane lokalnie: przypadek
  pustych argumentów działa end-to-end (bypass, brak wywołania Anthropic
  API).
- **P0 zrobione: Agent pre-check hard-block przed wywołaniem API.** Nowy
  moduł `backend/src/services/security/sensitiveDataPrecheck.js` — tanie
  wywołanie Haiku (`PRECHECK_MODEL`, domyślnie ten sam co `JUDGE_MODEL`)
  ocenia KAŻDĄ wiadomość użytkownika (przed slash-komendami, przed properem
  LLM) pod kątem PII/danych firmowych/AI Act/prompt injection i zwraca JSON
  `{blocked, category, confidence, rationale}`. Blokada następuje tylko przy
  wysokiej pewności (`confidence >= 0.8`), fail-open przy błędzie wywołania
  (log + przepuszczenie, żeby awaria pre-checku nie wywalała całego czatu).
  Wynik każdego sprawdzenia zapisywany do nowej tabeli `precheck_results`
  (migracja `002_precheck.sql`). Wpięte w `pipeline.js` jako pierwszy krok
  po redakcji PII, przed `parseCommand` — więc obejmuje też slash-komendy.
  Nowe zmienne env: `PRECHECK_ENABLED` (domyślnie `true`), `PRECHECK_MODEL`.
  Zweryfikowane lokalnie end-to-end: wiadomość z żądaniem PESEL/kont
  bankowych/wynagrodzeń pracowników → hard block, zero wywołania głównego
  modelu, wiersz w `precheck_results` (`blocked=true`, `category=PII|
  DANE_FIRMOWE`); zwykłe pytanie marketingowe → przechodzi bez blokady,
  odpowiedź Claude wraca normalnie, wiersz w `precheck_results`
  (`blocked=false`, `category=BRAK`).

- **P1 zrobione: Eksporty PPTX/XLSX z realnymi danymi kosztu i jakości.**
  Wcześniej eksporty pokazywały tylko koszt/latency — `quality_scores` w
  ogóle nie było w raporcie mimo że nazwa mówiła "raport kosztu i jakości".
  Dodano `getCostAndQualitySummary()` w `usageTracker.js` (LEFT JOIN
  `usage_metrics` → `quality_scores` po `message_id`, grupowanie po
  model/command, `avg_quality_score` + `scored_messages`), podpięte w
  `export.routes.js` (`/export/xlsx`, `/export/pptx`, funkcje przemianowane
  na `buildCostQualityReportXlsx`/`Pptx`). XLSX ma nowe kolumny „Śr. ocena
  jakości (1-5)” i „Ocenione wiadomości”; PPTX ma nową kolumnę „Śr. jakość
  (1-5)” w tabeli. Zweryfikowane end-to-end lokalnie: backend na porcie 8090
  (8080 zajęty przez inny proces), zalogowano się jako admin, pobrano oba
  pliki z realnymi danymi z lokalnej bazy (3 wiersze `usage_metrics`, 2
  `quality_scores`) — XLSX otwiera się poprawnie (`openpyxl`), wiersz
  danych: `claude-sonnet-5, 3 zapytania, koszt 0.019941 USD, śr. jakość
  5.00 (2 ocenione)`; PPTX to poprawny plik zip/OOXML (59 KB).

- **P1 zrobione: Agent wykrywający niepewne sytuacje wycieku danych +
  zgłaszanie z kontekstem.** Nowy moduł
  `backend/src/services/security/uncertainLeakAgent.js` — osobne, tanie
  wywołanie Haiku (`LEAK_AGENT_MODEL`) uruchamiane fire-and-forget po każdej
  nie-zablokowanej wiadomości (ten sam punkt w `pipeline.js` co hard-block
  precheck, więc obejmuje też slash-komendy), oceniające NIEJEDNOZNACZNE
  sygnały wycieku (za mało pewne na hard-block, ale podejrzane). Przy
  `suspicious: true` zapisuje wiersz do nowej tabeli `leak_alerts`
  (migracja `003_leak_alerts.sql`) z kategorią, pewnością, uzasadnieniem i
  kontekstem — domyślnie ostatnie 5 wiadomości konwersacji, chyba że
  specjalista ustawi inną liczbę przez nowy endpoint `PATCH
  /auth/me/settings` (`leakContextMessages`, kolumna `users
  .leak_context_messages`); gdy ustawiona liczba przekracza realną historię,
  bierze tyle, ile faktycznie jest (zwykłe `LIMIT` w SQL). Zgłoszenie „do
  odpowiedniej osoby" realizowane jako panel do przeglądu: `GET
  /metrics/leak-alerts` (z filtrem `?reviewed=false`) i `POST
  /metrics/leak-alerts/:id/review`, oba `requireRole('manager', 'admin')`.
  Zweryfikowane lokalnie end-to-end (backend na porcie 8091): wiadomość
  wprost proszona o dostęp do wynagrodzeń → hard-block (jak dotychczas,
  bez zmian); kolejna wiadomość w tej samej rozmowie, próbująca obejść
  blokadę parafrazą, też hard-blocked; trzecia, pozornie niewinna wiadomość
  biznesowa („podsumuj kampanię dla klienta X") przeszła przez precheck, ale
  agent niepewności — widząc w kontekście dwie wcześniejsze próby obejścia
  blokady — poprawnie oznaczył ją jako podejrzaną (`category: PII,
  confidence: 0.85`, uzasadnienie: możliwa próba kamuflażu wcześniejszego
  zamiaru), wiersz zapisał się w `leak_alerts` z pełnym kontekstem 4
  poprzednich wiadomości, widoczny przez `GET /metrics/leak-alerts` i
  poprawnie znikający po `POST .../review`. `PATCH /auth/me/settings`
  zweryfikowany osobno (zmiana `leakContextMessages` na 10 działa).

- **P2 zrobione: kod/config deploy na GCP (Cloud Run + Cloud SQL + Secret
  Manager).** Ustalone z użytkownikiem (2026-09-10): projekt GCP jeszcze
  nie istnieje, więc zakres ograniczony do gotowego kodu, bez wykonania
  realnych komend `gcloud`. Dodano: `backend/Dockerfile` +
  `.dockerignore` (multi-stage, non-root user, tylko prod deps);
  `frontend/Dockerfile` + `.dockerignore` (multi-stage, `output:
  'standalone'` dopisane w `frontend/next.config.mjs`, utworzono brakujący
  `frontend/public/.gitkeep`, bo folderu w ogóle nie było); `deploy/deploy.sh`
  — buduje oba obrazy przez `gcloud builds submit` (Cloud Build, nie
  wymaga lokalnego Dockera), wdraża backend (Cloud SQL przez
  `--add-cloudsql-instances`, sekrety z Secret Manager przez
  `--set-secrets` dla `anthropic-api-key`/`jwt-secret`/`database-url`),
  potem frontend z `BACKEND_URL` odczytanym z realnie wdrożonego serwisu;
  `docs/deploy-gcp.md` — checklist krok po kroku (API do włączenia,
  Artifact Registry, Cloud SQL, sekrety, uruchomienie skryptu,
  weryfikacja, znane ograniczenia). Świadoma decyzja: backend
  `--allow-unauthenticated` na Cloud Run (własny JWT auth w apce chroni
  endpointy) zamiast IAM service-to-service — opisane w
  `docs/deploy-gcp.md` jako do rewizji później. **Niezweryfikowane
  end-to-end** — brak projektu GCP i brak Dockera lokalnie (nie
  zainstalowany na tej maszynie), więc ani build obrazu, ani realny
  `gcloud run deploy` nie zostały uruchomione — tylko przegląd ręczny
  składni komend i configu. Pierwsze uruchomienie `docs/deploy-gcp.md`
  będzie jednocześnie pierwszą realną weryfikacją.

- **Dodane (2026-09-10): CI/CD przez GitHub Actions, wzorem projektu
  Sigma.** Na prośbę użytkownika sesja "renew sigma" (repo
  `/Users/michalgrom/Documents/sigma`) podzieliła się swoim działającym
  wzorcem wdrożenia. Dodano `.github/workflows/deploy.yml`: trigger na push
  do `main` (poza `docs/**`/`*.md`) + `workflow_dispatch`, `concurrency`
  serializujący deploye, auth do GCP przez **Workload Identity Federation**
  (bez pliku klucza JSON), joby `test` → `deploy-backend` →
  `deploy-frontend` (build+push do Artifact Registry, `gcloud run deploy`).
  Zachowano istniejące nazewnictwo repo (Artifact Registry `salesmore-llm`,
  nie GCR jak w Sigmie) i istniejącą listę sekretów/env z
  `deploy/deploy.sh` — `deploy/deploy.sh` zostaje jako opcja ręczna na
  pierwsze wdrożenie/debug, workflow jest docelową ścieżką na kolejne
  deploye. Dopisano do `docs/deploy-gcp.md` sekcję z jednorazowym setupem
  WIF (workload identity pool/provider, service account, uprawnienia) i
  listą wymaganych GitHub Secrets (`GCP_PROJECT_ID`,
  `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`,
  `CLOUDSQL_INSTANCE`). Zapisano też nauki od Sigmy: nigdy `setInterval`/
  `setTimeout` na zadania w tle przy Cloud Run `min-instances 0` (usypia w
  nocy, 2 incydenty w Sigmie) — używać Cloud Scheduler. **Niezweryfikowane
  end-to-end** — jak cały deploy, czeka na istniejący projekt GCP (patrz
  wyżej); YAML sprawdzony tylko wizualnie/składniowo.

Jeszcze do zweryfikowania:

- [ ] Slash-komenda `/analiza-bigquery` z realnym pytaniem — **kod gotowy,
  ale nie zweryfikowany end-to-end**, bo projekt GCP z danymi (kampanie/
  sprzedaż) jeszcze nie istnieje. Gdy powstanie: ustawić `GCP_PROJECT_ID` w
  `.env`, zalogować `gcloud auth login` + `gcloud auth application-default
  login`, i sprawdzić, że tool call `query_bigquery` trafia do BigQuery i
  wynik wraca w odpowiedzi Claude (patrz sekcja Weryfikacja, pkt 3).
  **Próba podpięcia się pod projekt Sigmy odrzucona (2026-09-10):**
  zapytano sesję "renew sigma" o użyczenie ich BigQuery
  (`sigma-meta-specialist`) zamiast czekać na osobny projekt. Odpowiedź:
  odmowa współdzielenia/utworzenia wspólnego service accounta — sigma nie
  ma tam uprawnień `setIamPolicy`/BigQuery admin (ma je tylko Andrzej), a
  poza tym odradzają współdzielenie SA między projektami (brak izolacji,
  trudna rotacja, brak kontroli kosztu). Dodatkowo: to prod z danymi
  zbliżonymi do PII (`user_pseudo_id` z GA4/audiences) i wrażliwym
  kontraktowo dashboardem klienta (Pekao), bez limitów kosztowych po
  naszej stronie. Rekomendacja sigmy: osobny, wąsko zakresowany read-only
  service account na jeden konkretny dataset, zatwierdzony i utworzony
  przez Andrzeja ich ustalonym kanałem (ClickUp+GCS), nie ad-hoc
  session-to-session. **Wniosek: nadal czekamy na własny projekt GCP** (lub
  formalny wniosek do Andrzeja o taki wąski SA) — nie próbować więcej
  współdzielić poświadczeń Sigmy.
- [ ] Deploy na GCP (Cloud Run + Cloud SQL + Secret Manager) — kod i
  dokumentacja (`deploy/deploy.sh`, `docs/deploy-gcp.md`,
  `backend/Dockerfile`, `frontend/Dockerfile`) gotowe, ale niezweryfikowane
  end-to-end: brak projektu GCP i brak Dockera lokalnie na tej maszynie.
  Gdy projekt GCP powstanie: przejść przez `docs/deploy-gcp.md` krok po
  kroku i zweryfikować realny `gcloud run deploy` obu serwisów.

- **Prototyp uruchomiony i sprawdzony na żywo (2026-09-10).** Backend na
  porcie 8092 (`DATABASE_URL` w `.env` wskazuje lokalnie na
  `salesmore_llm_test` rolą `michalgrom`, bo roli `postgres` nie ma na tej
  maszynie), frontend na porcie 3001 (`frontend/.env.local`:
  `BACKEND_URL=http://localhost:8092`), oba `npm run dev`. Admin zasiany
  przez `node src/db/seedAdmin.js <email> <hasło>`. Zweryfikowane w
  przeglądarce: login → czat renderuje branding, realne pytanie do Claude
  zwraca odpowiedź i zapisuje koszt/jakość/precheck w bazie,
  `/pomoc` i `/koszt-dzisiaj` (bypass) działają, panel `/admin` pokazuje
  realne agregaty kosztu i jakości z przyciskami eksportu.

- **Dodane (2026-09-10): historia rozmów + załączniki plików/zdjęć + 4 nowe
  slash-komendy dla marketerów.** Sidebar z listą konwersacji i przyciskiem
  „Nowa rozmowa” w [chat/page.tsx](../frontend/src/app/chat/page.tsx).
  Załączniki: `POST /chat/conversations/:id/messages` przyjmuje teraz
  `multipart/form-data` (pole `message` + do 5 plików `files`, limit 8 MB/plik,
  `multer`), pliki trafiają na dysk lokalny (`backend/uploads/`,
  `ATTACHMENTS_DIR` konfigurowalny), metadane w nowej tabeli
  `message_attachments` (migracja `004_attachments.sql`). Obrazy (`image/*`)
  są wysyłane do Claude jako bloki `image` (base64) — realna wizja, nie
  tylko nazwa pliku; pliki tekstowe (`text/plain`, `text/csv`,
  `text/markdown`, `application/json`) są wklejane jako tekst do promptu
  (max 20k znaków); inne typy są tylko przechowywane/pobieralne, nie
  analizowane przez model. Pobieranie: `GET /chat/attachments/:id`,
  autoryzacja przez `Authorization` lub `?token=` (żeby działało w `<img
  src>`, które nie ustawia nagłówków). Zweryfikowane end-to-end przez curl:
  upload obrazka (200×100, kolor brand-orange) → Claude poprawnie opisał
  kolor i kształt → wiersz w `message_attachments` → pobrany plik
  bajt-w-bajt identyczny z oryginałem; potwierdzone też wizualnie w
  przeglądarce (miniatura w czacie, konwersacja widoczna w sidebarze).
  **Znane ograniczenie**: `backend/uploads/` to lokalny dysk kontenera —
  na Railway (bez podłączonego volume do backendu) pliki znikną przy
  restarcie/redeployu. Do rozstrzygnięcia przy realnym deployu: albo
  wolume Railway dla backendu, albo przeniesienie na obiektowy storage
  (GCS/S3).
  Nowe slash-komendy dla specjalistów marketingu (`continue`, liczą się do
  kosztu jak zwykła rozmowa): `/brief-kreatywny`, `/tekst-reklamowy`,
  `/pomysly-na-posty`, `/analiza-konkurencji` — zarejestrowane w
  `slashDispatch.js`, widoczne w `/pomoc`. `/pomysly-na-posty` zweryfikowane
  end-to-end w przeglądarce (5 konkretnych pomysłów z formatem i captionem).

- **Prototyp na Railway — działa publicznie, brakuje tylko klucza
  Anthropic (2026-09-11).** Repo wypchnięte na
  `github.com/salesandmore/salesmore-LLM-mvp`. Wykonano
  `railway config apply --yes --confirm-destructive` (usunięto zdublowaną
  pustą bazę `Postgres-w8Mx`, ustawiono `rootDirectory`/zmienne per serwis
  z `.railway/railway.ts`). Dodano publiczne domeny: backend
  `https://backend-production-bff3.up.railway.app`, frontend
  `https://frontend-production-c7e96.up.railway.app`. Ustawione sekrety na
  `backend`: `JWT_SECRET` (wygenerowany losowo, 96 znaków hex),
  `CORS_ALLOWED_ORIGINS` (URL frontendu powyżej); na `frontend`:
  `NEXT_PUBLIC_BACKEND_URL` (URL backendu powyżej, potrzebny do
  bezpośredniego SSE z przeglądarki z pominięciem proxy Next — patrz wpis
  o streamingu wyżej). Oba serwisy wdrożone (`railway up`) i **Online**;
  `GET /health` backendu zwraca 200, frontend zwraca 307 (redirect na
  login — oczekiwane dla Next.js).
  **Naprawiony po drodze realny bug**: pierwszy deploy backendu crashował
  w pętli — `import pdfParse from 'pdf-parse'` w
  `backend/src/services/knowledge/textExtraction.js` wywalał się na
  starcie pod Node ESM (`SyntaxError: ... does not provide an export
  named 'default'`), bo `pdf-parse` to CJS bez statycznie wykrywalnego
  default exportu. Naprawione przez `import * as pdfParseModule` +
  `const pdfParse = pdfParseModule.default ?? pdfParseModule`.
  Zweryfikowane lokalnie (`node --input-type=module` import modułu bez
  błędu) i na Railway (redeploy → status `Online`).
  **Jedyny brakujący sekret**: `ANTHROPIC_API_KEY` na `backend` —
  niekrytyczny dla startu (leniwie ładowany w `anthropicClient.js`), ale
  bez niego każde wywołanie czatu/eksportu z realnym LLM się wywali. Do
  zrobienia przy wznowieniu: ustawić klucz (`railway variables --service
  backend --set ANTHROPIC_API_KEY=...`), potem pełny test end-to-end
  (login → czat → realna odpowiedź Claude) pod publicznym URL frontendu.

- **Dodane (2026-09-10): frontend przepisany wg realnego PDF-a brand
  guidelines.** Przeczytany cały `BrandGuidelines-Sales&More v3-kopia.pdf`
  (18 stron). Kolory już wcześniej ustawione w
  `frontend/tailwind.config.ts` zgadzają się dokładnie z PDF-em (dark
  `#29272E`, orange `#F8502C`, white `#FFFFFF`, lavender `#EDEDF5`, akcenty
  `#5A54BE`/`#9DB0DF`/`#D74AD6`) — bez zmian. Fonty z PDF-a: nagłówki/logo
  **PP Formula** (condensed bold display), treść **Lazare Grotesk**
  (grotesk sans), a **Segoe UI** jest zarezerwowany wyłącznie do
  prezentacji PowerPoint — nie do appki webowej (wcześniej front błędnie
  używał Segoe UI wszędzie). Oba właściwe fonty są płatne/licencjonowane i
  nie mam plików webfont — zastąpione najbliższymi darmowymi odpowiednikami
  z Google Fonts przez `next/font/google`: **Oswald** (`--font-display`,
  tylko na logo/nagłówek H1: `BrandHeader`, `login/page.tsx`) i **Inter**
  (`--font-body`, całość reszty tekstu). Podpięte w `tailwind.config.ts`
  (`fontFamily.display`/`fontFamily.sans`) i `layout.tsx`. **Do zrobienia
  gdy firma dostarczy pliki licencjonowanych fontów**: podmienić w tych
  dwóch plikach na prawdziwe PP Formula/Lazare Grotesk (self-hosted przez
  `next/font/local`) — struktura już to przewiduje, to będzie zmiana w
  jednym miejscu. Zweryfikowane wizualnie w przeglądarce (login, czat).

- **Dodane (2026-09-10): panel artefaktów (jak w Claude) + kolor
  pomarańczowy dominujący na paskach.** Odpowiedzi z komend-deliverable
  (`/brief-kreatywny`, `/tekst-reklamowy`, `/pomysly-na-posty`,
  `/analiza-konkurencji`) nie zaśmiecają już wątku czatu pełnym tekstem —
  renderują się jako kompaktowa karta („Otwórz artefakt”), klik otwiera
  boczny panel (`ArtifactPanel` w
  [chat/page.tsx](../frontend/src/app/chat/page.tsx)) z pełną treścią
  markdown i przyciskiem „Pobierz .md” (Blob + `<a download>`). Wymagało to
  zapisywania, która komenda wygenerowała daną odpowiedź asystenta — nowa
  kolumna `messages.command_used` (migracja `005_message_commands.sql`),
  wypełniana w `pipeline.js`, zwracana przez `GET
  /chat/conversations/:id/messages`. Zweryfikowane end-to-end w
  przeglądarce: `/tekst-reklamowy` → karta „Teksty reklamowe” → otwarty
  panel z 3 wariantami tekstu i rekomendacją.
  Dodatkowo, na prośbę użytkownika: kolor pomarańczowy (`brand-orange`)
  teraz dominuje na wszystkich paskach — górny header (`BrandHeader`), dolny
  pasek wysyłania w czacie, nagłówek tabeli w panelu admina (wcześniej
  ciemny grafit/lawenda).

- **Dodane (2026-09-11): kontekst rozmowy, streaming, stop, regeneruj/edytuj,
  auto-tytuły — duży rewrite `pipeline.js`/`chat.routes.js`.**
  **Ważna naprawiona luka**: przed tą zmianą `/chat` w ogóle NIE wysyłał
  historii rozmowy do Claude — każde wywołanie API widziało tylko bieżącą
  wiadomość, model nie pamiętał niczego z wcześniejszych tur. Sprawdzone i
  potwierdzone (curl: „zapamiętaj liczbę 42” → kolejna wiadomość „jaką
  liczbę podałem” → teraz poprawnie odpowiada 42; wcześniej by nie
  wiedział).
  - **Kontekst**: `loadHistory()` w `pipeline.js` ładuje do 20 ostatnich
    wiadomości konwersacji (user+assistant) i dołącza je przed bieżącym
    promptem w każdym wywołaniu Claude.
  - **Auto-tytuły**: `maybeSetConversationTitle()` — gdy to pierwsza
    wiadomość w konwersacji, tytuł ustawia się z jej treści (obcięty do 60
    znaków), zamiast zostawać „Nowa rozmowa”. Frontend odświeża listę
    konwersacji po pierwszej turze.
  - **Streaming (SSE)**: `streamChatTurn()`/`runToolLoopStreaming()` w
    backendzie używają `client.messages.stream()` z Anthropic SDK,
    `POST /chat/conversations/:id/messages` zwraca teraz
    `text/event-stream` (`delta` chunki + finalny `done`). Frontend
    (`consumeSseResponse` w `api.ts`) czyta strumień i dopisuje tekst na
    żywo (`streamingText` w `chat/page.tsx`).
  - **Stop generowania**: `AbortController` po stronie frontu (`handleStop`)
    + `req.on('close', () => controller.abort())` po stronie backendu —
    `client.messages.stream().abort()` przerywa wywołanie Anthropic, a
    częściowo wygenerowany tekst i tak zapisuje się do bazy (zweryfikowane:
    ucięty w połowie zdania esej, zapisany poprawnie).
  - **Regeneruj / edytuj**: nowe endpointy `POST
    /chat/conversations/:id/messages/:messageId/regenerate` (kasuje daną
    odpowiedź asystenta *i wszystko po niej*, generuje nową na podstawie tej
    samej wcześniejszej wiadomości usera — łącznie z ponownym wczytaniem
    jej załączników z dysku) oraz `PUT
    /chat/conversations/:id/messages/:messageId` (edytuje treść wiadomości
    usera, kasuje wszystko po niej, generuje nową odpowiedź). Oba streamują
    tak samo jak zwykłe wysłanie. UI: przycisk „Regeneruj” pod ostatnią
    odpowiedzią asystenta, „Edytuj” pod każdą wiadomością usera (inline
    textarea + „Zapisz i wyślij ponownie”). Zweryfikowane end-to-end w
    przeglądarce.
  - **Naprawiony po drodze realny bug infra**: Next.js dev `rewrites()`
    (proxy `/api/*` → backend) zrywał długotrwałe połączenia SSE w trakcie
    strumieniowania (`socket hang up`/`ECONNRESET` w logu Next, mimo że
    backend kończył i zapisywał odpowiedź poprawnie — błąd 500 widoczny
    tylko po stronie klienta). Naprawione przez wywoływanie backendu
    **bezpośrednio z przeglądarki** dla 3 streamujących metod
    (`sendMessageStream`/`editMessageStream`/`regenerateMessageStream` w
    `api.ts`) przez nową zmienną `NEXT_PUBLIC_BACKEND_URL`, z pominięciem
    proxy Next — wymaga dopisania originu frontendu do
    `CORS_ALLOWED_ORIGINS` na backendzie (zrobione dla `localhost:3000`/
    `:3001` lokalnie; **do zrobienia przy deployu**: dopisać publiczny URL
    frontendu z Cloud Run/Railway do `CORS_ALLOWED_ORIGINS` i ustawić
    `NEXT_PUBLIC_BACKEND_URL` na publiczny URL backendu). Potwierdzone po
    naprawie: długi esej (kilkaset słów) streamuje się do końca bez błędu,
    zero wpisów „Failed to proxy” w logu.
  - **Znany, zaakceptowany edge case**: przy regeneracji wywołanej *od razu*
    po kliknięciu Stop (poniżej ~1s odstępu) raz zaobserwowano błąd 500
    (prawdopodobnie race na współdzielonym połączeniu HTTP zaraz po abort) —
    kolejna próba (albo normalny odstęp czasu) działała poprawnie. Nie
    naprawiane celowo — rzadki przypadek brzegowy, nie blokuje normalnego
    użycia.

- **Naprawiony bug bezpieczeństwa (2026-09-11): JWT przez `?token=` w query
  string działał na WSZYSTKICH trasach czatu, nie tylko przy pobieraniu
  załączników.** Znalezione w przeglądzie kodu (code-review): `requireAuth`
  w [auth.js](../backend/src/middleware/auth.js) akceptował token z query
  stringu globalnie, co wystawiało JWT w logach serwera/proxy i historii
  przeglądarki dla każdego requestu do `/chat/*` (nie tylko obrazków w
  `<img src>`, do czego to było pomyślane). Naprawione: `requireAuth`
  przyjmuje teraz JWT wyłącznie z nagłówka `Authorization` (jak w
  metrics/export/knowledge), a nowy, osobny `requireAuthViaHeaderOrQuery`
  — dopuszczający też `?token=` — podpięty punktowo tylko na `GET
  /chat/attachments/:id` ([chat.routes.js](../backend/src/routes/chat.routes.js)).
  Zweryfikowane lokalnie (`node --check` + import obu plików bez błędu) i
  na Railway: redeploy backendu przeszedł, status `Online`, `GET /health`
  → 200.

- **Naprawione jeszcze dwa bugi z tego samego przeglądu kodu (2026-09-11).**
  - **Tytuł konwersacji z nieredagowaną PII**: `maybeSetConversationTitle()`
    w [pipeline.js](../backend/src/services/chatCore/pipeline.js) był
    wywoływany z surowym `userMessage` zamiast po-redakcyjnym
    `safeMessage`, więc PII usunięte z zapisu treści wiadomości i tak
    trafiało do `conversations.title`. Naprawione: teraz przekazywany jest
    `safeMessage`.
  - **Osierocone pliki załączników na dysku**: regeneracja/edycja
    wiadomości kasowały wiersze `message_attachments` przez `ON DELETE
    CASCADE`, ale nigdy nie usuwały samych plików z `backend/uploads/` —
    dysk rósł bez ograniczeń przy powtarzalnej edycji/regeneracji
    wiadomości z załącznikami. Naprawione: nowa funkcja
    `deleteAttachmentFile()` w
    [attachmentStore.js](../backend/src/services/attachments/attachmentStore.js)
    + `deleteMessagesFrom()` w `pipeline.js`, która przed skasowaniem
    wierszy `messages` odczytuje i usuwa powiązane pliki z dysku; podpięta
    w obu endpointach (`PUT .../messages/:messageId`, `POST
    .../messages/:messageId/regenerate`) w
    [chat.routes.js](../backend/src/routes/chat.routes.js) zamiast
    surowych zapytań `DELETE`.
  Zweryfikowane lokalnie (`node --check` + import wszystkich trzech
  plików bez błędu) i na Railway: redeploy backendu przeszedł, status
  `Online`, `GET /health` → 200.

- **Pełny audyt kodu + fixy pojemności (2026-09-11).** Na prośbę
  użytkownika zrobiony pełny audyt backendu (nie tylko diffu) pod kątem
  bugów, bezpieczeństwa i przeciążenia serwera. Główne ustalenia: pula
  PostgreSQL bez limitu (`max` domyślnie 10) przy ~6-8 zapytaniach do bazy
  na jedną wiadomość czatu, brak górnego limitu iteracji pętli tool-use w
  `runToolLoop`/`runToolLoopStreaming` (model uporczywie wołający
  narzędzia mógłby ciągnąć rundę bez końca), 4 wywołania Anthropic na
  wiadomość (precheck + leak-agent + judge + główna odpowiedź), 1 replika
  backendu na Railway (brak skalowania poziomego), synchroniczne
  parsowanie PDF/DOCX i base64 obrazów blokujące event loop, rate-limit
  60/min liczony per IP (biurowe NAT dzieli limit między wszystkich).
  **Oszacowana pojemność przed fixami: ok. 10-15 osób jednocześnie aktywnie
  piszących w czacie**, mimo docelowych 30-60 zarejestrowanych userów —
  głównym wąskim gardłem pula PG, potem pojedynczy proces Node, dopiero
  na końcu limity Anthropic.
  **Naprawione (easy fixy z kategorii krytyczne)**:
  - `pool.max` podniesiony do 20 (konfigurowalne przez `DB_POOL_MAX`) +
    `idleTimeoutMillis`/`connectionTimeoutMillis` w
    [db.js](../backend/src/config/db.js).
  - Dodany twardy limit `MAX_TOOL_ROUNDS = 8` w obu wariantach pętli
    tool-use w [pipeline.js](../backend/src/services/chatCore/pipeline.js)
    — po przekroczeniu rzuca błąd zamiast ciągnąć w nieskończoność.
  **Świadomie NIE zrobione**: zwiększenie liczby replik backendu na
  Railway (`.railway/railway.ts` `replicas: { sfo: 1 }`) — załączniki
  trzymane są na lokalnym dysku kontenera (`backend/uploads/`), więc 2+
  repliki bez współdzielonego storage (GCS/S3/Railway volume) losowo
  psułyby pobieranie/regenerację wiadomości z załącznikami w zależności,
  na którą instancję trafi request. Do zrobienia razem: migracja
  załączników na storage obiektowy + zwiększenie replik.
  Zweryfikowane lokalnie (`node --check` + import) i na Railway: redeploy
  przeszedł, status `Online`, `GET /health` → 200.
  **Pozostałe znaleziska z audytu, nie naprawione (do priorytetyzacji
  przy realnym ruchu)**: 4 wywołania Anthropic/wiadomość (architektoniczne,
  wymaga decyzji czy zmniejszać liczbę agentów bezpieczeństwa), rate-limit
  per-IP zamiast per-user, brak `trust proxy` w Expressie za Railway
  proxy, sekwencyjny insert chunków bazy wiedzy zamiast batch, brak
  whitelisty `mime_type` przy serwowaniu załączników.

- **P1 zrobione (2026-09-11): reszta znalezisk z audytu kodu (poza
  architektonicznym punktem 4 wywołań Anthropic — świadomie odłożony,
  wymaga decyzji produktowej).**
  - **Rate-limit per-user zamiast per-IP**: `keyGenerator` w
    [server.js](../backend/src/server.js) dekoduje JWT z nagłówka
    `Authorization` (`jwt.decode`, bez weryfikacji podpisu — wystarczy do
    kluczowania limitu) i używa `user:<sub>` jako klucza; fallback na
    `req.ip` dla żądań bez tokenu (np. `/auth/login`). Biurowy NAT już nie
    dzieli limitu między wszystkich userów za tym samym IP.
  - **`app.set('trust proxy', 1)`**: dodane w `server.js` przed `helmet()` —
    Railway/Cloud Run stoją za proxy, bez tego `req.ip` (i rate-limit
    keyGenerator) widziałby adres proxy zamiast klienta.
  - **Whitelist `mime_type` przy serwowaniu załączników**: naprawiony
    realny bug bezpieczeństwa (stored XSS) — `GET /chat/attachments/:id`
    ustawiał `Content-Type` wprost z `mime_type` zapisanym przy uploadzie
    (kontrolowanym przez klienta, multer bez `fileFilter`) i serwował z
    `Content-Disposition: inline`, więc upload pliku z `mimetype:
    text/html`/`image/svg+xml` renderowałby się jako HTML z JS w
    przeglądarce na tym samym originie co appka. Naprawione w
    [chat.routes.js](../backend/src/routes/chat.routes.js):
    `INLINE_SAFE_MIME_TYPES` (png/jpeg/gif/webp/plain/csv/markdown/json/pdf)
    — dla nie-whitelistowanych typów wymuszany
    `Content-Type: application/octet-stream` +
    `Content-Disposition: attachment` (wymuszone pobranie zamiast
    renderowania w przeglądarce).
  - **Batch insert chunków bazy wiedzy**: `indexDocument()` w
    [knowledgeStore.js](../backend/src/services/knowledge/knowledgeStore.js)
    robił `await query(...)` w pętli (N zapytań/round-tripów na jeden
    dokument) — zamieniony na jeden `INSERT ... VALUES ($1,$2,$3,$4),
    ($5,$6,$7,$8), ...` z dynamicznie budowaną listą placeholderów.
  Zweryfikowane: `node --check` na wszystkich trzech zmienionych plikach
  bez błędu; backend uruchomiony lokalnie (`PORT=8099 node src/server.js`)
  — start bez błędu, `GET /health` → 200 z nagłówkami `RateLimit-*`
  (`60;w=60`), potwierdzające że rate-limiter faktycznie działa.
  **Zweryfikowane end-to-end (2026-09-11)**, lokalnie przez curl (backend
  na `:8092` odpowiadający już uruchomionemu frontendowi na `:3000`):
  - **Whitelist `mime_type` (fix stored XSS)**: wysłano wiadomość z dwoma
    załącznikami — `test.txt` (whitelistowany) i `evil.svg` z
    `<script>`/`onload` (niewhitelistowany). `GET /chat/attachments/:id`
    dla `test.txt` zwrócił `Content-Type: text/plain` +
    `Content-Disposition: inline` jak oczekiwano; dla `evil.svg` —
    `Content-Type: application/octet-stream` +
    `Content-Disposition: attachment` — payload nie renderuje się w
    przeglądarce, wymusza pobranie. Fix działa zgodnie z opisem.
  - **Rate-limit per-user**: nagłówki `RateLimit-Limit`/`RateLimit-Remaining`
    obecne i dekrementujące się z kolejnymi requestami tego samego usera.
  - **Batch insert chunków wiedzy**: upload dokumentu do
    `POST /knowledge/documents` zatrzymał się na etapie generowania
    embeddingów (`Voyage embeddings request failed (401): Provided API key
    is invalid` — brak/nieważny klucz Voyage w lokalnym `.env`, ograniczenie
    środowiska, nie bug). Sam batch insert w `indexDocument()`
    ([knowledgeStore.js](../backend/src/services/knowledge/knowledgeStore.js))
    zweryfikowany przeglądem kodu: buduje `$1..$4N` placeholdery dynamicznie
    i wykonuje jeden `INSERT ... VALUES (...), (...), ...` — logika
    poprawna, ale realny insert wielu chunków nie został przepuszczony
    end-to-end z powodu brakującego klucza API. Do domknięcia: ustawić
    ważny `VOYAGE_API_KEY` lokalnie i powtórzyć test.

- **P1 zrobione (2026-09-11): storage abstraction dla załączników — local
  disk / GCS przełączany env-em, przygotowany pod zwiększenie replik.**
  [attachmentStore.js](../backend/src/services/attachments/attachmentStore.js)
  przepisany na dwa backendy sterowane `STORAGE_BACKEND`: `local` (domyślny,
  dokładnie zachowanie sprzed zmiany — dysk kontenera) albo `gcs` (Google
  Cloud Storage, przez `@google-cloud/storage` — zależność była już w
  `package.json`/`node_modules`, nieużywana). Interfejs modułu
  (`saveAttachmentFile`/`readAttachmentFile`/`deleteAttachmentFile`/
  `saveKnowledgeFile`) się nie zmienił — `storagePath` jest opaque dla
  wywołujących (potwierdzone grepem: [chat.routes.js](../backend/src/routes/chat.routes.js),
  [knowledge.routes.js](../backend/src/routes/knowledge.routes.js),
  [pipeline.js](../backend/src/services/chatCore/pipeline.js) tylko
  przekazują `storage_path` z powrotem, nie parsują go) — więc **żaden inny
  plik nie wymagał zmian**. W trybie `gcs` `storagePath` to `gs://<bucket>/<key>`
  URI. Dodane zmienne env: `STORAGE_BACKEND` (domyślnie `local`),
  `GCS_BUCKET_NAME` (dokumentacja w `backend/.env.example`). Auth do GCS przez
  `GOOGLE_APPLICATION_CREDENTIALS` (wzorem `bigqueryServer.js`) — ADC/plik
  klucza service accounta.
  **Railway** ([railway.ts](../.railway/railway.ts)): `backend.replicas`
  celowo **zostawione na 1** — zwiększenie do 2+ jest bezpieczne dopiero gdy
  `STORAGE_BACKEND=gcs` faktycznie działa z realnym bucketem (inaczej 2
  repliki z `local` losowo gubiłyby załączniki, dokładnie problem opisany w
  poprzednim wpisie audytu). Dodano komentarz w configu i placeholder
  `STORAGE_BACKEND: "local"`.
  **Zweryfikowane lokalnie**: `node --check` na zmienionym pliku bez błędu;
  realny test round-trip (`saveAttachmentFile` → `readAttachmentFile` →
  `deleteAttachmentFile`) z `STORAGE_BACKEND=local` (domyślny) — zapis,
  odczyt (`hello` zwrócone poprawnie) i usunięcie pliku z dysku działają
  identycznie jak przed zmianą.
  **Niezweryfikowane end-to-end**: ścieżka `STORAGE_BACKEND=gcs` — brak
  projektu GCP i bucketu (ten sam blocker co reszta zadań GCP w tym planie,
  patrz „Jeszcze do zweryfikowania”). Gdy projekt GCP z bucketem powstanie:
  ustawić `GCP_PROJECT_ID`/`GCS_BUCKET_NAME`/`GOOGLE_APPLICATION_CREDENTIALS`
  jako sekrety na serwisie `backend` na Railway, przełączyć
  `STORAGE_BACKEND` na `"gcs"` w `railway.ts`, dopiero potem podnieść
  `replicas.sfo` do 2+, i przetestować upload→pobranie→regenerację
  wiadomości z załącznikiem pod publicznym URL.

- **TODO (na przyszłość, nie ruszać teraz): brakujący `VOYAGE_API_KEY`
  blokuje całą funkcję RAG bazy wiedzy (2026-09-11).** Baza wiedzy
  (`POST /knowledge/documents` + wyszukiwanie w czacie) używa Voyage AI do
  embeddingów ([embeddings.js](../backend/src/services/knowledge/embeddings.js),
  model `voyage-3-lite`) — bez ważnego klucza indeksowanie dokumentów
  i wyszukiwanie w bazie wiedzy nie działa wcale, ani lokalnie, ani
  (prawdopodobnie) na Railway. Brak klucza w `.env.example` i w lokalnym
  `.env`. **Zanim ktokolwiek zakłada nowe konto na voyageai.com**: najpierw
  sprawdzić `railway variables --service backend | grep -i voyage` — jeśli
  funkcja bazy wiedzy miała już działać w produkcji, klucz może już
  istnieć jako sekret na Railway i wystarczy go skopiować lokalnie. Dopiero
  jeśli go tam nie ma, założyć konto na firmowy (nie prywatny) e-mail.
  Do zrobienia: (1) sprawdzić Railway, (2) jeśli brak — założyć klucz,
  (3) dodać `VOYAGE_API_KEY=` do `backend/.env.example` jako dokumentację,
  (4) powtórzyć test e2e indeksowania dokumentu wiedzy (patrz notatka wyżej
  o audycie z 2026-09-11 — batch insert w `indexDocument()` już
  zweryfikowany kodem, brakuje tylko przepuszczenia z realnym kluczem).

## Priorytety (kolejność realizacji)

Historyczne P0-P2 (pre-check, eksporty, agent wycieku, kod deployu GCP) —
zrobione, patrz „Status weryfikacji MVP”. Poniżej aktualna kolejność na
**2026-09-11**, po prototypie na Railway i audycie kodu:

1. **P0 — Ustawić `ANTHROPIC_API_KEY` na Railway (`backend`)** — jedyny
   brakujący element, żeby prototyp online realnie odpowiadał w czacie.
   Blokowane: czeka na klucz od użytkownika (patrz „Prototyp na Railway”
   wyżej — jak go zdobyć: console.anthropic.com → Settings → API Keys).
   Gdy będzie: `railway variables --service backend --set
   ANTHROPIC_API_KEY=...`, potem pełny test end-to-end (login → czat →
   realna odpowiedź) pod publicznym URL.
2. ~~P1 — Reszta znalezisk z audytu kodu (rate-limit per-user, trust
   proxy, batch insert chunków wiedzy, whitelist mime_type załączników)~~
   — zrobione 2026-09-11, patrz „Status weryfikacji MVP”. Jedyny punkt z
   audytu świadomie nieruszony: 4 wywołania Anthropic na wiadomość
   (architektoniczne, wymaga decyzji czy ograniczać liczbę agentów
   bezpieczeństwa).
3. ~~P1 — Migracja załączników na storage obiektowy (GCS/S3) +
   zwiększenie replik backendu na Railway~~ — kod zrobiony 2026-09-11
   (storage abstraction `local`/`gcs` w `attachmentStore.js`), patrz
   „Status weryfikacji MVP”. **Zwiększenie replik nadal odłożone** — czeka
   na realny projekt GCP + bucket, żeby przełączyć `STORAGE_BACKEND=gcs` i
   dopiero wtedy bezpiecznie podnieść `replicas.sfo` w `railway.ts`.
4. **P2 — Deploy na GCP (Cloud Run + Cloud SQL + Secret Manager)** —
   kod/config gotowy, patrz „Status weryfikacji MVP”; realny deploy
   niezweryfikowany, czeka na projekt GCP (patrz „Jeszcze do
   zweryfikowania”). Niżej priorytet niż wcześniej, bo Railway już działa
   jako realny, tańszy prototyp — GCP deploy ma sens dopiero gdy firma
   zdecyduje się na tę platformę na stałe.
5. **Na koniec (gdy projekt GCP z danymi powstanie) — pełna e2e weryfikacja
   `/analiza-bigquery` z realnym BigQuery** — kod gotowy, świadomie
   odłożone do momentu gdy będzie dostępny projekt GCP z danymi kampanii/
   sprzedaży (patrz „Jeszcze do zweryfikowania”).

## Do zrobienia / backlog (agenci bezpieczeństwa danych)

- [x] **Agent pre-check przed wywołaniem API (hard block)** — zrobione
  (`backend/src/services/security/sensitiveDataPrecheck.js`), patrz „Status
  weryfikacji MVP”.
- [x] **Agent wykrywający niepewne/nieoczywiste sytuacje wycieku danych** —
  zrobione (`backend/src/services/security/uncertainLeakAgent.js`), patrz
  „Status weryfikacji MVP”.

## Otwarte pytania do rozstrzygnięcia przed startem kodowania (do ustalenia z szefem)

- Dokładny model(e) do porównania (np. Claude Sonnet vs Haiku, czy tylko jeden model na start?).
- Budżet/limit kosztów na fazę testową i okres trwania porównania (np. 4–8 tygodni).
- Czy panel admina/metryk ma być widoczny dla wszystkich, czy tylko dla managerów.
- Stack (do potwierdzenia/aktualizacji):

  **Frontend**
  - Next.js 15 (App Router), TypeScript, React 18
  - Tailwind CSS 3 do stylów, `lucide-react` na ikony, `clsx` do warunkowych klas
  - Czat renderowany przez `react-markdown` + `remark-gfm` (LLM odpowiada w markdownie, front go parsuje na ładne bloki, listy, tabele)
  - `swr` do odpytywania backendu (fetch + cache + revalidate)
  - Build produkcyjny w trybie `standalone` (Next generuje samodzielny serwer node, bez potrzeby całego `node_modules` w obrazie)

  **Backend**
  - Node.js + Express jako API
  - `@anthropic-ai/sdk` — bezpośrednie wywołania Claude (Messages API), backend trzyma klucz API i orkiestruje rozmowę, front nigdy nie ma dostępu do klucza
  - PostgreSQL (`pg`) — trzyma historię rozmów (`chat_messages`), użytkowników, sesje
  - Middleware bezpieczeństwa: `helmet`, `cors`, `express-rate-limit`
  - `jsonwebtoken` do auth (JWT w cookie/headerze)
  - `winston` do logowania
  - Dodatkowo: integracje z zewnętrznymi API danych (BigQuery, Google Ads API, DV360) — LLM w trakcie rozmowy może dociągać dane z tych źródeł (np. przez function calling / tool use w Anthropic SDK) i odpowiadać na ich podstawie

  **Przepływ typowego zapytania**
  1. User pisze w czacie (Next.js front) → request do `/api/chat` na backendzie
  2. Backend dokłada system prompt + historię z Postgresa + ewentualnie dane z BigQuery/Ads API
  3. Wywołanie Claude przez `@anthropic-ai/sdk` (z tool use, jeśli LLM ma sam odpytać dane)
  4. Odpowiedź zapisywana do bazy i zwracana do frontu jako markdown
  5. Front renderuje przez `react-markdown`

  **Deployment**
  - Osobne Dockerfile dla frontendu i backendu (multi-stage build), każdy jako osobny kontener
  - Hostowane na GCP Cloud Run (uwaga: Cloud Run z `minScale=0` usypia instancję — jeśli potrzebujesz cronów/tła, rób to przez Cloud Scheduler, nie `setInterval`/`setTimeout` w kodzie, bo umiera w nocy)
  - Sekrety (klucze API, connection stringi) przez GCP Secret Manager, nie w `.env` w repo
