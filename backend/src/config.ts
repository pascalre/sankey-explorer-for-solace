import "dotenv/config";
import { randomBytes } from "node:crypto";
import { logInfo } from "./logger.js";

/**
 * All config comes exclusively from env vars, all of it optional (see
 * buildConfig's doc comment) - this app is meant to run with zero required
 * configuration ("docker pull && docker run"). Local: .env (gitignored).
 * Prod: GCP Secret Manager -> env-mounted (Cloud Run), or just `docker run
 * -e ...` for the optional app login.
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
 *   control).
 * - SESSION_SECRET is NOT required: if unset, a random one is generated
 *   per process start. That's safe here specifically because sessions
 *   (and the broker connections they carry) already live only in memory
 *   (see semp/connectionStore.ts) - a restart drops them regardless of
 *   whether the secret is stable, so there's nothing to gain from
 *   requiring the operator to supply one up front. This is what makes
 *   "docker pull && docker run" work with zero required configuration.
 *   Set SESSION_SECRET explicitly only if you run multiple replicas behind
 *   a load balancer and need them to share one signing secret (that setup
 *   also needs an external session store - see the TODO in
 *   connectionStore.ts - a random per-process secret wouldn't help there
 *   anyway, since sessions wouldn't be shared across replicas either).
 */
export function buildConfig(env: NodeJS.ProcessEnv): AppConfig {
  const username = env.APP_USERNAME ?? null;
  const passwordHash = env.APP_PASSWORD_HASH ?? null;
  const sessionSecret = env.SESSION_SECRET?.trim() || generateEphemeralSecret();

  return {
    port: Number(env.PORT ?? 4000),
    // Solace recommends <=10 SEMP requests/s - see throttle() in semp/client.ts
    sempMinRequestIntervalMs: Number(env.SEMP_MIN_REQUEST_INTERVAL_MS ?? 200),
    app: {
      username,
      // bcrypt hash, NEVER a plaintext password. Generate with: node scripts/hash-password.mjs
      passwordHash,
      sessionSecret,
    },
    loginRequired: Boolean(username && passwordHash),
    isProduction: env.NODE_ENV === "production",
  };
}

function generateEphemeralSecret(): string {
  logInfo(
    "SESSION_SECRET not set - generated a random one for this process. " +
      "Sessions won't survive a restart (they don't anyway - see connectionStore.ts). " +
      "Set SESSION_SECRET yourself only if you run multiple replicas sharing one session store.",
  );
  return randomBytes(32).toString("hex");
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
