import "dotenv/config";

/**
 * All secrets/config come exclusively from env vars.
 * Local: .env (gitignored). Prod: GCP Secret Manager -> env-mounted (Cloud Run).
 * Fails hard at startup if a required value is missing - fail fast instead
 * of limping along with broken config in the background.
 */

export interface AppConfig {
  port: number;
  sempMinRequestIntervalMs: number;
  app: {
    username: string | null;
    passwordHash: string | null;
    sessionSecret: string;
  };
  loginRequired: boolean;
  isProduction: boolean;
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Pure function taking env as a parameter (rather than reading
 * `process.env` internally) so it's trivially testable with any env
 * combination, instead of only ever reflecting whatever happens to be set
 * in the real process when the module loads.
 *
 * Deployment model: this app runs as one instance per customer/workshop
 * (Docker at the customer's site, or on a host controlled by the trainer) -
 * NOT as a central multi-tenant SaaS. Because of that:
 *
 * - Broker credentials (SEMP_*) are NOT env vars. They're entered at
 *   runtime via the "Connect to Broker" screen and live exclusively in the
 *   server-side session store (see semp/connectionStore.ts). Never in a
 *   client cookie, never on disk.
 * - The app login (access gate for the tool itself) is OPTIONAL: set via
 *   APP_USERNAME + APP_PASSWORD_HASH. Leave both empty -> "workshop mode"
 *   with no login (the customer's network boundary is then the access
 *   control). SESSION_SECRET is always required regardless of login mode,
 *   because the session (which also carries the broker connection) must
 *   always be signed.
 */
export function buildConfig(env: NodeJS.ProcessEnv): AppConfig {
  const username = env.APP_USERNAME ?? null;
  const passwordHash = env.APP_PASSWORD_HASH ?? null;

  return {
    port: Number(env.PORT ?? 4000),
    // Solace recommends <=10 SEMP requests/s - see throttle() in semp/client.ts
    sempMinRequestIntervalMs: Number(env.SEMP_MIN_REQUEST_INTERVAL_MS ?? 200),
    app: {
      username,
      // bcrypt hash, NEVER a plaintext password. Generate with: node scripts/hash-password.mjs
      passwordHash,
      sessionSecret: requireEnv(env, "SESSION_SECRET"),
    },
    loginRequired: Boolean(username && passwordHash),
    isProduction: env.NODE_ENV === "production",
  };
}

/** Fail fast on a half-configured login setup instead of silently falling back to "no login". */
export function assertValidConfig(cfg: AppConfig): void {
  const hasUsername = Boolean(cfg.app.username);
  const hasHash = Boolean(cfg.app.passwordHash);
  if (hasUsername !== hasHash) {
    throw new Error(
      "APP_USERNAME and APP_PASSWORD_HASH must both be set (or both unset for workshop mode without login).",
    );
  }
}

export const config = buildConfig(process.env);
