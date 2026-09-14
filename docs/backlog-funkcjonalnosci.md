# Backlog funkcjonalności — porównanie do Claude.ai (2026-09-11)

Lista braków zidentyfikowana przy porównaniu salesmore-llm do Claude.ai/Claude
Code, do wykorzystania przy planowaniu kolejnych priorytetów w
`docs/plan-mvp.md`.

## Must-have (realna potrzeba specjalistów)

1. **RAG / baza wiedzy nad dokumentami firmowymi** — ⏳ **w trakcie
   implementacji** (patrz sekcja "Status implementacji RAG" poniżej).
   Wcześniej: pliki tekstowe tylko wklejane inline (limit 20k znaków),
   nieindeksowane, nietrwałe między konwersacjami.
2. **Zarządzanie użytkownikami w UI** — brak CRUD userów w panelu admina;
   rejestracja tylko admin-only przez skrypt/endpoint, bez interfejsu. Przy
   30–60 osobach onboarding/offboarding/zmiana ról będzie bolało bez tego.
3. **Więcej narzędzi/MCP z żywymi danymi** — obecnie tylko BigQuery.
   `/analiza-konkurencji` działa bez dostępu do aktualnego internetu — realna
   przydatność dla marketingu/sprzedaży wymagałaby web search jako tool.

## Nice-to-have (niekrytyczne na start)

- Wybór modelu przez użytkownika (Sonnet vs Haiku) — u nas to decyzja
  kosztowa/administracyjna, nie potrzeba specjalisty.
- Code execution / sandbox — nieistotne dla zespołu marketingu/sprzedaży.
- SSO — ważne przy skalowaniu poza jedną firmę lub wymogu IT, nie na MVP.
- Współdzielone "spaces"/projekty między specjalistami (współpraca nad tym
  samym wątkiem).

## Mocne strony ponad Claude.ai (już zrobione, nie dotykać bez powodu)

- Dwuwarstwowy agent bezpieczeństwa: hard-block precheck (PII/AI
  Act/prompt injection) + uncertain leak agent z panelem review dla
  manager/admin.
- Export PPTX/XLSX z realnymi danymi kosztu i jakości do raportowania
  kierownictwu.
- Panel artefaktów (jak w Claude.ai) dla treści marketingowych z komend.

## Status implementacji RAG (must-have #1)

Plan zapisany w `.claude/plans/reactive-finding-dijkstra.md` (sesja lokalna,
może nie przetrwać czyszczenia — kluczowe decyzje i stan poniżej).

**Zatwierdzone decyzje:**
- Embeddingi: **Voyage AI** (`voyage-3-lite`), Anthropic nie ma własnego API do embeddingów.
- Retrieval: **tool use** — nowy tool `search_knowledge_base`, Claude sam decyduje kiedy szukać (niższy koszt niż wstrzykiwanie kontekstu w każdej wiadomości).
- Uprawnienia: tylko **manager/admin** wgrywają/usuwają dokumenty (`requireRole('manager','admin')`, wzorem metryk).

**Zrobione i zweryfikowane lokalnie:**
- Migracja `backend/src/db/migrations/006_knowledge_base.sql` — `CREATE EXTENSION vector`, tabele `knowledge_documents`/`knowledge_chunks` (embedding `vector(512)`, indeks `hnsw`). **Zweryfikowane**: `npm run migrate` przeszło lokalnie po doinstalowaniu `pgvector` przez Homebrew (`brew install pgvector`) — **do zrobienia identycznie na serwerze produkcyjnym/Cloud SQL/Railway przed deployem**, inaczej `CREATE EXTENSION vector` się wywali.
- Nowe zależności w `backend/package.json`: `pdf-parse`, `mammoth`, `pgvector` (npm helper do serializacji wektorów dla `pg`, nie sam silnik bazy).
- `backend/src/services/knowledge/textExtraction.js` — ekstrakcja tekstu z txt/csv/md/json (passthrough) + PDF (`pdf-parse`) + DOCX (`mammoth`).
- `backend/src/services/knowledge/chunking.js` — chunking po granicach paragrafów, ~1200 znaków, 150 overlap.
- `backend/src/services/knowledge/embeddings.js` — `embedTexts`/`embedQuery` przez `fetch` do Voyage API (`VOYAGE_API_KEY` przez `getSecret`, ten sam wzorzec co `ANTHROPIC_API_KEY`).
- `backend/src/services/knowledge/knowledgeStore.js` — `createDocument`, `indexDocument`, `listDocuments`, `deleteDocument`, `searchKnowledge` (pgvector `<=>` cosine distance).
- `backend/src/services/mcp/knowledgeServer.js` — tool `search_knowledge_base` wzorem `bigqueryServer.js`.
- **Naprawiony bug przy dodawaniu drugiego tool**: `pipeline.js` wcześniej zakładał jeden tool (`TOOLS = [bigQueryTool]`) bez realnego routingu po `toolUse.name`. Dodano `runTool(toolUse)` z routingiem `query_bigquery`/`search_knowledge_base`, zastosowane w obu pętlach (`runToolLoop` i `runToolLoopStreaming`).
- `backend/src/routes/knowledge.routes.js` — `GET/POST /knowledge/documents` (POST tylko manager/admin), `DELETE /knowledge/documents/:id` (tylko manager/admin), zamontowane w `server.js`.
- `attachmentStore.js` — dodano `saveKnowledgeFile` (osobny podkatalog `uploads/knowledge/`, ten sam limit 8MB co attachmenty czatu).
- Frontend: `admin/page.tsx` — nowa sekcja "Baza wiedzy" (lista dokumentów, upload, usuwanie), nowe funkcje w `lib/api.ts` (`listKnowledgeDocuments`, `uploadKnowledgeDocument`, `deleteKnowledgeDocument`). **Zweryfikowane**: `tsc --noEmit` przechodzi bez błędów.
- Backend: `node --check` na wszystkich nowych/zmienionych plikach — składnia OK.

**Jeszcze do zrobienia (blokada: brak klucza VOYAGE_API_KEY w tej sesji):**
- [ ] Dodać `VOYAGE_API_KEY` do `backend/.env` (rejestracja na voyageai.com, `USE_LOCAL_SECRETS=true` już ustawione lokalnie).
- [ ] Realny test end-to-end: upload dokumentu testowego przez panel admina → sprawdzić wiersz w `knowledge_documents` i N wierszy w `knowledge_chunks` z niepustym `embedding`.
- [ ] W czacie zadać pytanie wymagające wiedzy z dokumentu → sprawdzić że Claude wywołał `search_knowledge_base` i odpowiedź zawiera poprawne dane.
- [ ] Zadać pytanie niezwiązane z bazą wiedzy → sprawdzić że Claude NIE wywołuje toola (brak zbędnego kosztu embeddingu).
- [ ] Usunąć dokument jako admin → sprawdzić cascade delete chunks + usunięcie pliku z dysku; sprawdzić że user bez roli manager/admin dostaje 403.
- [ ] Dopisać `VOYAGE_API_KEY` do sekcji sekretów w `docs/deploy-gcp.md` i do listy GitHub Secrets w `.github/workflows/deploy.yml` (obok `anthropic-api-key`/`jwt-secret`/`database-url`).
- [ ] Zweryfikować `CREATE EXTENSION vector` na docelowym Postgresie (Cloud SQL/Railway) — pgvector musi być dostępny jako rozszerzenie na hostowanej instancji, nie tylko lokalnie.
- [ ] Po pełnej weryfikacji: zaktualizować `docs/plan-mvp.md` (status weryfikacji + backlog), tak jak inne zakończone priorytety.

**Wznowienie pracy:** przy następnej sesji poszukać/przywołać plan
`.claude/plans/reactive-finding-dijkstra.md` (jeśli istnieje) albo od razu
kontynuować od checklisty "Jeszcze do zrobienia" powyżej — kod jest już
napisany i przechodzi testy składni/typów, brakuje tylko klucza API i
realnej weryfikacji end-to-end.
