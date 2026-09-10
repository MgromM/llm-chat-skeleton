# Deploy na GCP (Cloud Run + Cloud SQL + Secret Manager)

Ten dokument to checklist krok po kroku do jednorazowego wdrożenia
`salesmore-llm` na GCP. Kod deploy (Dockerfile, `deploy/deploy.sh`) jest
gotowy — poniższe kroki to rzeczy, które trzeba zrobić ręcznie w konsoli/CLI
GCP zanim skrypt zadziała.

## 0. Wymagania wstępne

- Projekt GCP z włączonym billingiem.
- `gcloud` CLI zainstalowane i zalogowane: `gcloud auth login`.
- `gcloud config set project <PROJECT_ID>`.

## 1. Włącz potrzebne API

```bash
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

## 2. Utwórz repozytorium obrazów (Artifact Registry)

```bash
gcloud artifacts repositories create salesmore-llm \
  --repository-format=docker --location=europe-central2
```

## 3. Utwórz instancję Cloud SQL (Postgres)

```bash
gcloud sql instances create salesmore-llm-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=europe-central2

gcloud sql databases create salesmore_llm --instance=salesmore-llm-db
gcloud sql users set-password postgres --instance=salesmore-llm-db \
  --password='<ustaw-silne-haslo>'
```

Zapisz identyfikator instancji w formacie `PROJECT_ID:REGION:INSTANCE` —
to jest `CLOUDSQL_INSTANCE` używany dalej.

Uruchom migracje raz, lokalnie, przez [Cloud SQL Auth
Proxy](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy):

```bash
cloud-sql-proxy <PROJECT_ID>:<REGION>:salesmore-llm-db &
DATABASE_URL='postgres://postgres:<haslo>@127.0.0.1:5432/salesmore_llm' \
  npm --prefix backend run migrate
```

## 4. Wrzuć sekrety do Secret Manager

Na Cloud Run backend łączy się z Cloud SQL przez unix socket, więc
`DATABASE_URL` na produkcji ma inny format niż lokalnie:

```bash
echo -n 'twoj-klucz-anthropic' | gcloud secrets create anthropic-api-key --data-file=-
echo -n "$(openssl rand -base64 32)" | gcloud secrets create jwt-secret --data-file=-
echo -n 'postgres://postgres:<haslo>@/salesmore_llm?host=/cloudsql/<PROJECT_ID>:<REGION>:salesmore-llm-db' \
  | gcloud secrets create database-url --data-file=-
```

Nadaj kontu Cloud Run service agent dostęp do sekretów (jednorazowo, po
pierwszym `gcloud run deploy` GCP tworzy domyślne konto
`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`):

```bash
for s in anthropic-api-key jwt-secret database-url; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

## 5. Wdróż

### Opcja A — ręcznie, skryptem (pierwsze wdrożenie / debug)

```bash
PROJECT_ID=<twoj-project-id> \
REGION=europe-central2 \
CLOUDSQL_INSTANCE=<PROJECT_ID>:<REGION>:salesmore-llm-db \
  ./deploy/deploy.sh
```

Skrypt: buduje oba obrazy przez Cloud Build (nie wymaga lokalnego Dockera),
wdraża backend (podłączony do Cloud SQL, sekrety z Secret Manager), potem
frontend wskazujący na realny URL backendu.

### Opcja B — automatycznie, CI/CD (docelowy sposób, wzorem projektu Sigma)

Po pierwszym ręcznym wdrożeniu (Opcja A) kolejne deploye robi
`.github/workflows/deploy.yml` przy każdym pushu do `main` (z wyjątkiem
zmian tylko w `docs/**`/`*.md`), albo ręcznie z zakładki Actions
(`workflow_dispatch`). Pipeline: `test` (npm ci + build frontendu jako
smoke test) → `deploy-backend` → `deploy-frontend` (buduje obraz, pushuje
do Artifact Registry, `gcloud run deploy`). `concurrency` serializuje
deploye, żeby dwa szybkie merge'e się nie wyścigały.

Auth do GCP jest przez **Workload Identity Federation** — bez pliku klucza
JSON service accounta w GitHub Secrets. Jednorazowy setup w GCP:

```bash
gcloud iam workload-identity-pools create "github-pool" \
  --project="${PROJECT_ID}" --location="global" \
  --display-name="GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="${PROJECT_ID}" --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Actions Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='salesandmore/salesmore-LLM-mvp'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

gcloud iam service-accounts create "github-deployer" \
  --project="${PROJECT_ID}" --display-name="GitHub Actions deployer"

# Pozwól GitHub Actions z tego repo podszyć się pod ten service account
gcloud iam service-accounts add-iam-policy-binding \
  "github-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github-pool/attribute.repository/salesandmore/salesmore-LLM-mvp"

# Uprawnienia service accounta do deployu
for role in roles/run.admin roles/artifactregistry.writer \
  roles/iam.serviceAccountUser roles/secretmanager.secretAccessor \
  roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:github-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="$role"
done
```

Potem w GitHub → repo Settings → Secrets and variables → Actions dodaj:

- `GCP_PROJECT_ID` — id projektu GCP,
- `GCP_WORKLOAD_IDENTITY_PROVIDER` — pełna ścieżka providera, format
  `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github-pool/providers/github-provider`,
- `GCP_SERVICE_ACCOUNT` — `github-deployer@<PROJECT_ID>.iam.gserviceaccount.com`,
- `CLOUDSQL_INSTANCE` — `<PROJECT_ID>:europe-central2:salesmore-llm-db`.

**Nauka od projektu Sigma (2 incydenty produkcyjne):** Cloud Run z
`min-instances 0` usypia instancję między requestami — jeśli w przyszłości
dojdą zadania w tle (np. cykliczne odświeżanie danych BigQuery), nigdy nie
implementować ich jako `setInterval`/`setTimeout` w kodzie backendu, bo
usypianie je zabija w nocy. Zamiast tego: **Cloud Scheduler** budzący
dedykowany endpoint HTTP.

## 6. Zweryfikuj

- `curl https://<backend-url>/health` → `{"status":"ok"}`.
- Zaloguj się we frontendzie, wyślij wiadomość w czacie, sprawdź że
  odpowiedź wraca i branding się zgadza (patrz plan-mvp.md, sekcja
  „Weryfikacja”, punkty 1–4).
- `GET /metrics/costs` jako admin → dane z realnej bazy Cloud SQL.

## Znane ograniczenia / do rewizji później

- Backend jest wdrożony z `--allow-unauthenticated` na poziomie Cloud Run —
  bezpieczeństwo endpointów opiera się wyłącznie na własnym JWT auth
  aplikacji, nie na IAM. Jeśli firma zechce odciąć backend od świata
  zewnętrznego na poziomie sieci, trzeba przejść na Cloud Run
  service-to-service auth (frontend dołącza identity token do requestów w
  `next.config.mjs` rewrites) — świadomie pominięte w MVP, żeby nie
  komplikować pierwszego wdrożenia.
- Skrypt `deploy/deploy.sh` i cały ten dokument są **niezweryfikowane
  end-to-end** — projekt GCP z danymi jeszcze nie istnieje (patrz
  `docs/plan-mvp.md`, „Jeszcze do zweryfikowania”). Pierwsze uruchomienie
  tego dokumentu jest jednocześnie pierwszą realną weryfikacją.
- `db-f1-micro` i brak `minScale` na Cloud Run to najtańsza konfiguracja do
  testów pilotażowych — do podniesienia przed produkcyjnym użyciem przez
  30–60 osób jednocześnie.
