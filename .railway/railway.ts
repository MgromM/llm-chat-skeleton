import { defineRailway, github, postgres, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const salesmoreLLMMvp = github("salesandmore/salesmore-LLM-mvp");

  const Postgres = postgres("Postgres", { region: "sfo" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", { allowOnlineResize: true, region: "sfo", sizeMB: 500 });

  const backend = service("backend", {
    source: { ...salesmoreLLMMvp, rootDirectory: "backend" },
    // Keep at 1 replica until STORAGE_BACKEND=gcs is actually set below with a
    // real bucket: with STORAGE_BACKEND=local (default), attachments live on
    // each instance's own disk, so 2+ replicas would randomly fail to serve
    // files uploaded to a different instance. Bump to 2+ only after GCS is live.
    replicas: { sfo: 1 },
    variables: {
      NODE_ENV: "production",
      USE_LOCAL_SECRETS: "true",
      DATABASE_URL: "${{Postgres.DATABASE_URL}}",
      // ANTHROPIC_API_KEY, JWT_SECRET, CORS_ALLOWED_ORIGINS, GCS_BUCKET_NAME,
      // GOOGLE_APPLICATION_CREDENTIALS (or its JSON) are set directly on the
      // service via `railway variables set` (not tracked here) so secrets
      // never land in git.
      CHAT_MODEL: "claude-sonnet-5",
      JUDGE_MODEL: "claude-haiku-4-5-20251001",
      PRECHECK_MODEL: "claude-haiku-4-5-20251001",
      LEAK_AGENT_MODEL: "claude-haiku-4-5-20251001",
      // Switch to "gcs" once GCP_PROJECT_ID/GCS_BUCKET_NAME + credentials are
      // set as secrets on this service, then bump replicas above.
      STORAGE_BACKEND: "local",
    },
  });

  const frontend = service("frontend", {
    source: { ...salesmoreLLMMvp, rootDirectory: "frontend" },
    replicas: { sfo: 1 },
    variables: {
      BACKEND_URL: "http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:${{backend.PORT}}",
    },
  });

  return project("salesmore-llm", {
    resources: [Postgres, postgresVolume, backend, frontend],
  });
});
