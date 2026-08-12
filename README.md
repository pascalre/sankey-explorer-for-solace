# Sankey Explorer for Solace

Visualizes which topic subscriptions map to which queues and topic endpoints
of a Solace broker - as a Sankey diagram. Data comes live via SEMP v1
(Legacy SEMP, XML/RPC).

## Architecture

```
Browser (React + d3-sankey)
      │  fetch, same-origin, session cookie
      ▼
Express backend (Node/TS)
      │  SEMP v1 (Basic Auth, XML/RPC)
      ▼
Solace broker (management port, usually :8080)
```

**Deployment model:** one instance per customer/workshop (Docker, self-hosted
or on a Solace broker host) - not a central multi-tenant SaaS. Because of that:

- **Broker credentials are entered at runtime in the UI** (the "Connect to
  Broker" screen), not as deploy config. They live exclusively server-side
  in memory, per session, never in the client or on disk - except when the
  user explicitly chooses to save them (see below).
- **App login is optional** (`APP_USERNAME` + `APP_PASSWORD_HASH`). Leave
  both empty and the tool runs in "workshop mode" with no login - the
  customer's network boundary is then the access control.

## Features

- **Save/import connection config as YAML.** On the Connect screen, "Save
  config as file" downloads the current form (SEMP URL, VPN, username,
  password, label) as a `.yaml` file, and "Import config" reads one back and
  connects to every broker it lists. Handy for re-using a connection or
  distributing a multi-broker mesh setup without retyping it each time. The
  file contains the password in clear text and never touches the server -
  it's generated and read entirely in the browser - but treat it like the
  password itself once it's on disk. Format:
  ```yaml
  brokers:
    - baseUrl: http://broker-host:8080/SEMP
      vpn: default
      username: ro-user
      password: secret
      label: EU-Broker   # optional
  ```
- **Multiple broker connections at once.** Add several brokers on the
  Connect screen (e.g. a mesh of brokers) - all of them get queried and
  combined into one diagram. Each broker gets its own color; endpoints
  are colored by broker once 2+ are connected (falls back to the
  queue/topic-endpoint type coloring with just one). Same-named endpoints
  across different brokers are automatically disambiguated
  (`Queue: orders-q (EU-Broker)` vs `Queue: orders-q (US-Broker)`).
- Topic subscriptions are split along `/` into a hierarchy of prefix nodes
  in the diagram (e.g. `acme/sales/orders/>` becomes a chain of nodes).
  Sort order is switchable (topic name / endpoint name / owner).
- Click any node OR the connecting link to filter down to only the
  relevant subtree: clicking/hovering a queue shows just its
  subscriptions, a topic shows just the queues/topic-endpoints it
  reaches. A "Back to overview" button resets the filter. Hovering
  highlights the whole affected flow with a gradient.
- Endpoint owner (if the broker reports one) shows below the endpoint label.
- Colors follow the Solace Brand Book 2025 v3.0 (primary/secondary palette,
  dark-mode reference) - see comments in `frontend/src/index.css` for the
  exact source pages.

## Setup (local)

```bash
# Backend
cd backend
cp .env.example .env
# Set SESSION_SECRET, e.g.: openssl rand -hex 32
# Only set APP_USERNAME/APP_PASSWORD_HASH if you want a login:
npm run hash-password
npm install
npm run dev          # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api -> :4000
```

Open the frontend in dev mode, enter broker URL/VPN/credentials in the
"Connect" screen. No broker handy? Rebuild the mock from the smoke test
(see `backend/src/__tests__` for the assumed reply structure).

## Deployment (container)

```bash
docker build -t sankey-explorer .
docker run -p 4000:4000 \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  sankey-explorer
```

One Node process serves the API (`/api/*`) and the built frontend from the
same origin. `/healthz` for liveness probes.

## Grafana path (later, not built yet)

`GET /api/sankey-edges` returns flat `{source, target, value}` rows - exactly
the format a generic Grafana datasource plugin like **Infinity** or **JSON
API** can consume, combined with the **Sankey panel** community plugin. No
custom plugin needed as long as Grafana + those two community plugins are
already available.

## Quality

Both `backend/` and `frontend/` have the same three commands:

```bash
npm run lint       # oxlint
npm test           # vitest
npx vitest run --coverage   # enforces >=70% lines/statements/functions, >=60% branches
```

Backend also has `npm run typecheck` (checks `vitest.config.ts`/`tsconfig.check.json`
too, not just `src/` - the plain `tsc`/`npm run build` command only checks
`src/` since that's all that ends up in `dist/`).

## Known open items

- **SEMP v1 reply structure unverified against a real broker.** The
  assumptions live in `backend/src/semp/queries.ts` (comment at the top of
  the file) - if they don't match, touch only that file; the rest of the
  app only knows the normalized `EndpointInfo[]`.
- `express-session` runs with `MemoryStore` - fine for 1 process/customer.
  For multiple instances behind a load balancer: switch to an external
  store (Redis), see the TODO in `backend/src/semp/connectionStore.ts`.
- No GitHub Actions Dependabot config, no SAST (semgrep) - deferred for the
  current Tier 1 scope, see the rigor ladder in the
  senior-engineering-partner skill for the promotion triggers.
