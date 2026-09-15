#!/usr/bin/env bash
# Deploy salesmore-llm (backend + frontend) to Cloud Run.
#
# Wymaga wcześniej ręcznie (patrz docs/deploy-gcp.md):
#   - projektu GCP z włączonym billingiem i API: run, sqladmin, secretmanager,
#     artifactregistry, cloudbuild
#   - instancji Cloud SQL Postgres
#   - sekretów w Secret Manager: anthropic-api-key, jwt-secret, database-url
#   - `gcloud auth login` + `gcloud config set project <PROJECT_ID>`
#
# Użycie:
#   PROJECT_ID=... REGION=... CLOUDSQL_INSTANCE=project:region:instance \
#     ./deploy/deploy.sh

set -euo pipefail

: "${PROJECT_ID:?Ustaw PROJECT_ID}"
: "${REGION:=europe-central2}"
: "${CLOUDSQL_INSTANCE:?Ustaw CLOUDSQL_INSTANCE (format project:region:instance)}"

BACKEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/salesmore-llm/backend"
FRONTEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/salesmore-llm/frontend"

echo "== Buduję i wypycham obraz backendu =="
gcloud builds submit backend --tag "${BACKEND_IMAGE}" --project "${PROJECT_ID}"

echo "== Wdrażam backend na Cloud Run =="
gcloud run deploy salesmore-llm-backend \
  --image "${BACKEND_IMAGE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --platform managed \
  --port 8080 \
  --add-cloudsql-instances "${CLOUDSQL_INSTANCE}" \
  --set-env-vars "NODE_ENV=production,USE_LOCAL_SECRETS=false,GCP_PROJECT_ID=${PROJECT_ID},CHAT_MODEL=claude-sonnet-5,JUDGE_MODEL=claude-haiku-4-5-20251001,PRECHECK_ENABLED=true,PRECHECK_MODEL=claude-haiku-4-5-20251001" \
  --set-secrets "ANTHROPIC_API_KEY=anthropic-api-key:latest,JWT_SECRET=jwt-secret:latest,DATABASE_URL=database-url:latest" \
  --allow-unauthenticated

BACKEND_URL="$(gcloud run services describe salesmore-llm-backend \
  --project "${PROJECT_ID}" --region "${REGION}" --format 'value(status.url)')"
echo "Backend URL: ${BACKEND_URL}"

echo "== Buduję i wypycham obraz frontendu =="
# Frontend build needs BACKEND_URL as a build arg (Next.js /api/* rewrite
# destination and, crucially, NEXT_PUBLIC_BACKEND_URL for the client-side SSE
# calls) — plain `--tag` doesn't pass build args, so use the explicit config.
gcloud builds submit frontend \
  --config frontend/cloudbuild.yaml \
  --substitutions "_BACKEND_URL=${BACKEND_URL},_IMAGE=${FRONTEND_IMAGE}" \
  --project "${PROJECT_ID}"

echo "== Wdrażam frontend na Cloud Run =="
gcloud run deploy salesmore-llm-frontend \
  --image "${FRONTEND_IMAGE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --platform managed \
  --port 3000 \
  --set-env-vars "NODE_ENV=production,BACKEND_URL=${BACKEND_URL}" \
  --allow-unauthenticated

echo "== Gotowe =="
gcloud run services list --project "${PROJECT_ID}" --region "${REGION}"
