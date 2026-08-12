import { parse, stringify } from "yaml";

/** One broker connection as entered on the Connect screen. */
export interface BrokerConfigEntry {
  baseUrl: string;
  vpn: string;
  username: string;
  password: string;
  label?: string;
}

/**
 * Serializes one or more broker connections to a YAML document the user can
 * save to disk and re-import later.
 *
 * NOTE: this intentionally includes the password in plain text - the file
 * only ever exists locally on the user's machine (never sent anywhere by
 * this app), mirroring how the credentials themselves are handled. Callers
 * should still warn users to store the file securely.
 */
export function serializeBrokerConfig(entries: BrokerConfigEntry[]): string {
  return stringify({ brokers: entries });
}

/**
 * Parses a YAML document produced by `serializeBrokerConfig` (or hand-written
 * in the same shape) back into a list of broker connections.
 *
 * Throws a descriptive `Error` if the document isn't valid YAML or doesn't
 * match the expected `{ brokers: [...] }` shape.
 */
export function parseBrokerConfig(yamlText: string): BrokerConfigEntry[] {
  let parsed: unknown;
  try {
    parsed = parse(yamlText);
  } catch {
    throw new Error("Not a valid YAML file");
  }

  if (typeof parsed !== "object" || parsed === null || !("brokers" in parsed)) {
    throw new Error("YAML must have a top-level 'brokers' list");
  }

  const brokers = (parsed as { brokers: unknown }).brokers;
  if (!Array.isArray(brokers) || brokers.length === 0) {
    throw new Error("'brokers' must be a non-empty list");
  }

  return brokers.map((entry, index) => validateEntry(entry, index));
}

function validateEntry(entry: unknown, index: number): BrokerConfigEntry {
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`brokers[${index}] must be an object`);
  }
  const e = entry as Record<string, unknown>;

  for (const field of ["baseUrl", "vpn", "username", "password"] as const) {
    if (typeof e[field] !== "string" || e[field] === "") {
      throw new Error(`brokers[${index}].${field} must be a non-empty string`);
    }
  }
  if (e.label !== undefined && typeof e.label !== "string") {
    throw new Error(`brokers[${index}].label must be a string`);
  }

  return {
    baseUrl: e.baseUrl as string,
    vpn: e.vpn as string,
    username: e.username as string,
    password: e.password as string,
    label: (e.label as string | undefined) || undefined,
  };
}
