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

## Priorytety (kolejność realizacji)

1. ~~**P0 — Agent pre-check hard-block przed wywołaniem API**~~ — zrobione,
   patrz „Status weryfikacji MVP”.
2. ~~**P1 — Eksporty PPTX/XLSX z realnymi danymi**~~ — zrobione, patrz
   „Status weryfikacji MVP”.
3. ~~**P1 — Agent wykrywający niepewne sytuacje wycieku danych + zgłaszanie
   z kontekstem**~~ — zrobione, patrz „Status weryfikacji MVP”.
4. ~~**P2 — Deploy na GCP (Cloud Run + Cloud SQL + Secret Manager)**~~ —
   kod/config gotowy, patrz „Status weryfikacji MVP”; realny deploy
   niezweryfikowany, czeka na projekt GCP (patrz „Jeszcze do
   zweryfikowania”).
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
