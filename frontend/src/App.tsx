import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiRequestError } from "./api/client";
import { LoginScreen } from "./components/LoginScreen";
import { ConnectScreen } from "./components/ConnectScreen";
import { SankeyChart } from "./components/SankeyChart";
import { toSankeyEdges } from "./lib/toSankeyEdges";
import { buildEndpointOwners } from "./lib/buildEndpointOwners";
import { buildBrokerColorPalette, buildEndpointBrokerColors } from "./lib/buildEndpointBrokerColors";
import { buildEndpointBrokerLabels } from "./lib/buildEndpointBrokerLabels";
import { buildEndpointVpnHost } from "./lib/buildEndpointVpnHost";
import type { BrokerConnectionStatus, EndpointInfo, SessionInfo } from "./types";
import "./index.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "login" }
  | { kind: "connect" }
  | { kind: "ready"; endpoints: EndpointInfo[] };

function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const s = await api.getSession();
      setSession(s);
      if (s.authRequired && !s.authenticated) {
        setView({ kind: "login" });
      } else if (s.brokers.length === 0) {
        setView({ kind: "connect" });
      } else {
        await loadEndpoints();
      }
    } catch (err) {
      setView({
        kind: "error",
        message: err instanceof ApiRequestError ? err.message : "Could not reach the server",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEndpoints = useCallback(async () => {
    setView({ kind: "loading" });
    try {
      const endpoints = await api.getEndpoints();
      setView({ kind: "ready", endpoints });
    } catch (err) {
      setView({
        kind: "error",
        message: err instanceof ApiRequestError ? err.message : "Failed to load endpoints",
      });
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  function handleBrokersChanged(brokers: BrokerConnectionStatus[]) {
    setSession((prev) =>
      prev ? { ...prev, brokers } : { authRequired: false, authenticated: true, brokers },
    );
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const endpoints = await api.getEndpoints();
      setView({ kind: "ready", endpoints });
    } catch (err) {
      setRefreshError(
        err instanceof ApiRequestError ? err.message : "Refresh failed",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleLogout() {
    await api.logout();
    await loadSession();
  }

  async function handleDisconnectAll() {
    await api.disconnectAll();
    setSession((prev) => (prev ? { ...prev, brokers: [] } : prev));
    setView({ kind: "connect" });
  }

  const brokerColors = useMemo(
    () => buildBrokerColorPalette((session?.brokers ?? []).map((b) => b.label)),
    [session?.brokers],
  );

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="eyebrow">Sankey Explorer for Solace</h1>
        <div className="topbar-actions">
          {session && session.brokers.length > 0 && (
            <>
              <div className="broker-badges">
                {session.brokers.map((b) => (
                  <span
                    key={b.id}
                    className="badge broker-badge"
                    style={{ borderColor: brokerColors.get(b.label) }}
                  >
                    <span
                      className="broker-badge-dot"
                      style={{ background: brokerColors.get(b.label) }}
                    />
                    {b.label}
                  </span>
                ))}
              </div>
              <button onClick={() => setView({ kind: "connect" })}>
                Manage Message VPNs
              </button>
              <button onClick={handleRefresh} disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button onClick={handleDisconnectAll}>Disconnect all Message VPNs</button>
            </>
          )}
          {session?.authRequired && session.authenticated && (
            <button onClick={handleLogout}>Logout</button>
          )}
        </div>
      </header>

      <main>
        {view.kind === "loading" && <p className="hint">Loading...</p>}
        {view.kind === "error" && (
          <div className="screen">
            <div className="card">
              <p className="error">{view.message}</p>
              <button onClick={loadSession}>Try again</button>
            </div>
          </div>
        )}
        {view.kind === "login" && <LoginScreen onLoggedIn={loadSession} />}
        {view.kind === "connect" && (
          <ConnectScreen
            brokers={session?.brokers ?? []}
            onBrokersChanged={handleBrokersChanged}
            onDone={loadEndpoints}
          />
        )}
        {view.kind === "ready" && (
          <div className="ready-view">
            {refreshError && <p className="error banner">{refreshError}</p>}
            <SankeyChart
              edges={toSankeyEdges(view.endpoints)}
              endpointOwners={buildEndpointOwners(view.endpoints)}
              endpointBrokerColors={buildEndpointBrokerColors(view.endpoints)}
              endpointBrokerLabels={buildEndpointBrokerLabels(view.endpoints)}
              endpointVpnHost={buildEndpointVpnHost(view.endpoints)}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
