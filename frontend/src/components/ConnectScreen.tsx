import { useRef, useState } from "react";
import { api, ApiRequestError } from "../api/client";
import { parseBrokerConfig, serializeBrokerConfig } from "../lib/brokerConfig";
import type { BrokerConfigEntry } from "../lib/brokerConfig";
import type { BrokerConnectionStatus } from "../types";

interface ConnectScreenProps {
  brokers: BrokerConnectionStatus[];
  onBrokersChanged: (brokers: BrokerConnectionStatus[]) => void;
  /**
   * The credentials used to add each currently-connected broker, keyed by
   * connection id - kept in memory in the browser tab only (never sent
   * anywhere, never persisted) so "Export config" can save all of them, not
   * just whatever happens to be in the form right now. Lifted up to App so
   * it survives navigating away from this screen and back.
   */
  brokerConfigs: Map<string, BrokerConfigEntry>;
  onBrokerConfigsChanged: (configs: Map<string, BrokerConfigEntry>) => void;
  onDone: () => void;
}

export function ConnectScreen({
  brokers,
  onBrokersChanged,
  brokerConfigs,
  onBrokerConfigsChanged,
  onDone,
}: ConnectScreenProps) {
  const [baseUrl, setBaseUrl] = useState("http://localhost:8080");
  const [vpn, setVpn] = useState("default");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasBrokers = brokers.length > 0;
  const exportableCount = brokers.filter((b) => brokerConfigs.has(b.id)).length;

  /** Id of the one entry in `updated` that wasn't in `previous` yet. */
  function findNewId(
    previous: BrokerConnectionStatus[],
    updated: BrokerConnectionStatus[],
  ): string | undefined {
    const previousIds = new Set(previous.map((b) => b.id));
    return updated.find((b) => !previousIds.has(b.id))?.id;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const entry: BrokerConfigEntry = {
        baseUrl,
        vpn,
        username,
        password,
        label: label.trim() || undefined,
      };
      const updated = await api.connect(entry);
      onBrokersChanged(updated);
      const newId = findNewId(brokers, updated);
      if (newId) {
        onBrokerConfigsChanged(new Map(brokerConfigs).set(newId, entry));
      }
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
      if (brokerConfigs.has(id)) {
        const next = new Map(brokerConfigs);
        next.delete(id);
        onBrokerConfigsChanged(next);
      }
    } finally {
      setRemovingId(null);
    }
  }

  function handleExport() {
    const entries = brokers
      .map((b) => brokerConfigs.get(b.id))
      .filter((entry): entry is BrokerConfigEntry => entry !== undefined);
    const yamlText = serializeBrokerConfig(entries);
    const blob = new Blob([yamlText], { type: "application/x-yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "broker-config.yaml";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file later
    if (!file) return;

    setError(null);
    setImporting(true);
    try {
      const entries = parseBrokerConfig(await file.text());
      let updated = brokers;
      let configs = brokerConfigs;
      const failed: string[] = [];
      for (const entry of entries) {
        try {
          const previous = updated;
          updated = await api.connect(entry);
          const newId = findNewId(previous, updated);
          if (newId) {
            configs = new Map(configs).set(newId, entry);
          }
        } catch (err) {
          failed.push(
            `${entry.label || entry.vpn}: ${err instanceof ApiRequestError ? err.message : "Connection failed"}`,
          );
        }
      }
      onBrokersChanged(updated);
      onBrokerConfigsChanged(configs);
      if (failed.length > 0) {
        setError(`Some connections from the imported file failed: ${failed.join("; ")}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import config file");
    } finally {
      setImporting(false);
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
              The broker's SEMP management host, e.g. http://broker-host:8080
              (SEMP v2 - no path needed). A read-only user is enough.
              Connecting to several message VPNs (maybe across multiple
              brokers)? Add each one here - they'll all show up combined in
              the diagram, color-coded by message VPN.
            </p>
          )}
          <label>
            SEMP host
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://broker-host:8080"
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
            {submitting ? "Connecting..." : hasBrokers ? "Add Message VPN" : "Connect"}
          </button>
        </form>

        <div className="config-file-actions">
          <button type="button" onClick={handleExport} disabled={exportableCount === 0}>
            Export config
          </button>
          <button type="button" onClick={handleImportClick} disabled={importing}>
            {importing ? "Importing..." : "Import config"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml,application/x-yaml,text/yaml"
            onChange={handleImportFile}
            hidden
          />
        </div>
        <p className="hint">
          Export saves every connection added in this browser tab
          {exportableCount > 0 ? ` (${exportableCount} of ${brokers.length})` : ""} as one YAML
          file, including passwords in clear text - it never leaves your
          machine, but store it as carefully as the passwords themselves.
          {hasBrokers && exportableCount < brokers.length && (
            <> Connections from before a page reload aren't included - remove and re-add them to export them too.</>
          )}
        </p>

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
