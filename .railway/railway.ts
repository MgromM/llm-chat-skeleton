import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

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
      // Values set directly on the service via `railway variables set` (not
      // tracked here) so secrets never land in git. preserve() tells
      // `railway config apply` "this variable exists, leave its value
      // alone" — omitting it entirely reads as "delete this variable" and
      // config apply would wipe it out.
      JWT_SECRET: preserve(),
      CORS_ALLOWED_ORIGINS: preserve(),
      FRONTEND_URL: preserve(),
      GOOGLE_OAUTH_CLIENT_ID: preserve(),
      GOOGLE_OAUTH_CLIENT_SECRET: preserve(),
      GOOGLE_OAUTH_REDIRECT_URL: preserve(),
      // ANTHROPIC_API_KEY, GCS_BUCKET_NAME, GOOGLE_APPLICATION_CREDENTIALS
      // (or its JSON) are documented here for when they get set, but aren't
      // currently live on the service, so they're not preserve()'d.
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
      // Streaming chat calls (lib/api.ts) go straight to the backend from the
      // browser, bypassing the Next.js /api/* rewrite — so this needs the
      // backend's PUBLIC domain, not the private one above. It's also a
      // NEXT_PUBLIC_* var, which Next.js inlines into the client bundle at
      // build time, so the Dockerfile forwards it as a build arg. Already
      // set correctly on the live service; preserve() just stops
      // `config apply` from deleting it.
      NEXT_PUBLIC_BACKEND_URL: preserve(),
    },
  });

  return project("salesmore-llm", {
    resources: [Postgres, postgresVolume, backend, frontend],
  });
});
