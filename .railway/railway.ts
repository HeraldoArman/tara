import {
  bucket,
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  ref,
  service,
} from "railway/iac";

// Singapore is the initial pilot region. A bucket's region is immutable.
const region = "asia-southeast1-eqsg3a";
const serverWatch = ["/apps/server/**"];
const source = () => github("HeraldoArman/tara", { branch: "main" });

export default defineRailway((ctx) => {
  // railway@3.16.0 pins its postgres helper to postgres-ssl:18.
  const database = postgres("postgres", { region });
  const evidence = bucket("evidence", { region: "sin" });
  const sharedServer = {
    DATABASE_URL: database.env.DATABASE_URL,
    ENVIRONMENT: "production",
    EVIDENCE_BACKEND: "s3",
    LIVEKIT_AGENT_NAME: `tara-agent-${ctx.environment}`,
    LIVEKIT_API_KEY: preserve(),
    LIVEKIT_API_SECRET: preserve(),
    LIVEKIT_URL: preserve(),
    S3_ACCESS_KEY_ID: ref(evidence, "ACCESS_KEY_ID"),
    S3_BUCKET: ref(evidence, "BUCKET"),
    S3_ENDPOINT_URL: ref(evidence, "ENDPOINT"),
    S3_REGION: ref(evidence, "REGION"),
    S3_SECRET_ACCESS_KEY: ref(evidence, "SECRET_ACCESS_KEY"),
  };
  const api = service("api", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/server/Dockerfile",
      watchPatterns: serverWatch,
    },
    deploy: {
      preDeployTimeoutSeconds: 300,
      restartPolicyMaxRetries: 5,
    },
    env: {
      ...sharedServer,
      ADDITIONAL_APP_ORIGINS: preserve(),
      APP_ORIGIN: preserve(),
      COOKIE_SECURE: "true",
      JWT_EXPIRE_HOURS: "8",
      JWT_ISSUER: "tara",
      JWT_SECRET: preserve(),
      PORT: "8000",
      SOP_MODEL: "gpt-4.1",
      SOP_OPENAI_API_KEY: preserve(),
    },
    healthcheck: "/health/ready",
    healthcheckTimeout: 120,
    preDeploy: "alembic upgrade head",
    replicas: { [region]: 1 },
    source: source(),
    start:
      // biome-ignore lint/suspicious/noTemplateCurlyInString: The container shell expands PORT.
      "sh -c 'exec uvicorn tara_server.api.main:app --host 0.0.0.0 --port \"${PORT:-8000}\"'",
  });
  const worker = service("worker", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/server/Dockerfile",
      watchPatterns: serverWatch,
    },
    deploy: {
      drainingSeconds: 300,
      restartPolicyMaxRetries: 5,
    },
    env: {
      ...sharedServer,
      OPENAI_API_KEY: preserve(),
      REALTIME_MODEL: "gpt-realtime-2.1",
      SERVICE_ROLE: "worker",
      VISION_MODEL: "gpt-4.1",
      WEB_SEARCH_API_KEY: preserve(),
    },
    replicas: { [region]: 1 },
    source: source(),
    start: "python -m tara_server.agent.worker start",
  });
  const web = service("web", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/web/Dockerfile",
      watchPatterns: [
        "/apps/web/**",
        "/packages/**",
        "/package.json",
        "/bun.lock",
        "/nx.json",
      ],
    },
    deploy: {
      restartPolicyMaxRetries: 5,
    },
    domains: [{ domain: "tara.heraldoarman.com", port: 3001 }],
    env: {
      ADDITIONAL_APP_ORIGINS: preserve(),
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Railway expands the private service reference.
      API_INTERNAL_URL: "http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8000",
      APP_ORIGIN: preserve(),
      NEXT_PUBLIC_LIVEKIT_URL: preserve(),
      NODE_ENV: "production",
      PORT: "3001",
    },
    healthcheck: "/health",
    healthcheckTimeout: 120,
    replicas: { [region]: 1 },
    source: source(),
    start: "node --import varlock/auto-load server.js",
  });
  return project("tara", { resources: [database, evidence, api, worker, web] });
});
