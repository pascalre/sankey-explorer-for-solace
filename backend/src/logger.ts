/**
 * Minimal server-side logging - plain stdout/stderr, no library. This is a
 * single-process-per-customer/workshop tool (see README "Deployment
 * model"), so there's no central log aggregation to ship to yet; the goal
 * here is just to make `docker logs <container>` (or the terminal, when
 * running locally with `npm run dev`) useful when a broker connection
 * fails - which is otherwise completely invisible (the HTTP response to
 * the Connect screen is deliberately generic so it doesn't leak internal
 * detail to whoever's using the tool, but that same detail needs to go
 * SOMEWHERE for whoever's operating it to debug).
 *
 * NEVER pass a password (or anything else secret) into these - there's no
 * redaction here, by design: callers are expected to only log the
 * non-secret fields (baseUrl, vpn, username, label) plus the error.
 */

function timestamp(): string {
  return new Date().toISOString();
}

export function logInfo(message: string): void {
  console.log(`[${timestamp()}] ${message}`);
}

export function logError(message: string, err?: unknown): void {
  const detail = err instanceof Error ? (err.stack ?? err.message) : err;
  console.error(`[${timestamp()}] ${message}`, ...(detail !== undefined ? [detail] : []));
}
