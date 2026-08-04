import { useState } from "react";
import { api, ApiRequestError } from "../api/client";
import type { BrokerConnectionStatus } from "../types";

interface ConnectScreenProps {
  brokers: BrokerConnectionStatus[];
  onBrokersChanged: (brokers: BrokerConnectionStatus[]) => void;
  onDone: () => void;
}

export function ConnectScreen({ brokers, onBrokersChanged, onDone }: ConnectScreenProps) {
  const [baseUrl, setBaseUrl] = useState("http://localhost:8080/SEMP");
  const [vpn, setVpn] = useState("default");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const hasBrokers = brokers.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const updated = await api.connect({
        baseUrl,
        vpn,
        username,
        password,
        label: label.trim() || undefined,
      });
      onBrokersChanged(updated);
      // Clear credentials/label so a second broker isn't accidentally
      // submitted with the first one's password; keep URL/VPN since a
      // mesh of brokers often shares a similar SEMP host pattern.
      setUsername("");
      setPassword("");
      setLabel("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Connection failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      const updated = await api.disconnectOne(id);
      onBrokersChanged(updated);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="screen">
      <div className="card">
        <p className="eyebrow">Message VPN connection</p>
        <h1>{hasBrokers ? "Manage Message VPN connections" : "Connect to Message VPN"}</h1>

        {hasBrokers && (
          <ul className="broker-list">
            {brokers.map((b) => (
              <li key={b.id}>
                <span>
                  {b.label}
                  <span className="hint"> — {b.vpn}</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(b.id)}
                  disabled={removingId === b.id}
                >
                  {removingId === b.id ? "..." : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleSubmit} className="connect-form">
          {!hasBrokers && (
            <p className="hint">
              SEMP v1 management endpoint, e.g. http://broker-host:8080/SEMP.
              A read-only user is enough - see permissions below. Connecting
              to several message VPNs (maybe across multiple brokers)? Add
              each one here - they'll all show up combined in the diagram,
              color-coded by message VPN.
            </p>
          )}
          <label>
            SEMP URL
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://broker-host:8080/SEMP"
              required
            />
          </label>
          <label>
            Message VPN
            <input value={vpn} onChange={(e) => setVpn(e.target.value)} required />
          </label>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label>
            Label (optional)
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={vpn || "e.g. EU-VPN"}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Connecting..." : hasBrokers ? "Add Message VPN" : "Connect \u2192"}
          </button>
        </form>

        {hasBrokers && (
          <button type="button" onClick={onDone}>
            {"View diagram"}
          </button>
        )}

        <p className="hint">
          Credentials are kept server-side for this session only - never
          stored in the browser.
        </p>
      </div>
    </div>
  );
}
