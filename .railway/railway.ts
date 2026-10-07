import { defineRailway, project, service, postgres, github, ref } from "railway/iac";

// WyślijRakietę ops tool — Postgres + backend + frontend on Railway.
// Ollama itself is NOT hosted here: it keeps running on the operator's own
// Mac (free), reached by the backend through a Cloudflare tunnel whose URL
// is set as OLLAMA_BASE_URL below. See handoff.md for the full rationale.
export default defineRailway((ctx) => {
  const db = postgres("postgres");

  const backend = service("backend", {
    source: github("MgromM/llm-chat-skeleton", { rootDirectory: "backend", branch: "main" }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    env: {
      NODE_ENV: "production",
      USE_LOCAL_SECRETS: "true",
      DATABASE_URL: db.env.DATABASE_URL,
      JWT_SECRET: { generator: "secret" },
      CORS_ALLOWED_ORIGINS: "https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}",
      FRONTEND_URL: "https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}",
      GOOGLE_OAUTH_REDIRECT_URL: "https://${{backend.RAILWAY_PUBLIC_DOMAIN}}/auth/google/callback",
      GOOGLE_OAUTH_CLIENT_ID: "",
      GOOGLE_OAUTH_CLIENT_SECRET: "",
      ALLOWED_EMAIL_DOMAIN: "",
      // Temporary: app is fully open (shared admin account, no real login)
      // so friends can get in without a Google OAuth client. Flip to
      // "false" and fill in the Google vars above to require real login.
      DISABLE_AUTH: "true",
      OLLAMA_BASE_URL: "https://comedy-him-own-sagem.trycloudflare.com",
      OLLAMA_MODEL: "llama3.2:3b",
      PRECHECK_ENABLED: "true",
      STORAGE_BACKEND: "local",
      CANTEEN_OCR_WEBHOOK_TOKEN: { generator: "secret" },
    },
  });

  const frontend = service("frontend", {
    source: github("MgromM/llm-chat-skeleton", { rootDirectory: "frontend", branch: "main" }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    env: {
      PORT: "3000",
      BACKEND_URL: "https://${{backend.RAILWAY_PUBLIC_DOMAIN}}",
      NEXT_PUBLIC_BACKEND_URL: "https://${{backend.RAILWAY_PUBLIC_DOMAIN}}",
      NEXT_PUBLIC_DISABLE_AUTH: "true",
    },
  });

  return project("wyslijrakiete-ops", {
    resources: [db, backend, frontend],
  });
});
