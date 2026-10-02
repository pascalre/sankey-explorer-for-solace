# Sankey Explorer for Solace

Visualizes which topic subscriptions map to which queues, topic endpoints,
and direct subscribers of a Solace broker - as a Sankey diagram. Data comes
live via SEMP v2 (RESTful JSON).

## Architecture

```
Browser (React + d3-sankey)
      │  fetch, same-origin, session cookie
      ▼
Express backend (Node/TS)
      │  SEMP v2 (Basic Auth, REST/JSON)
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

- **Export/import connection config as YAML.** On the Connect screen,
  "Export config" downloads the credentials of every broker currently added
  in this browser tab (SEMP host, VPN, username, password, label) as one
  `.yaml` file, and "Import config" reads one back and connects to every
  broker it lists. Handy for re-using a connection or distributing a
  multi-broker mesh setup without retyping it each time. The file contains
  passwords in clear text and never touches the server - it's generated and
  read entirely in the browser, and only remembers credentials for brokers
  added since the last page load - but treat it like the passwords
  themselves once it's on disk. Format:
  ```yaml
  brokers:
    - baseUrl: http://broker-host:8080
      vpn: default
      username: ro-user
      password: secret
      label: EU-Broker   # optional
  ```
- **Export the diagram as SVG.** "Export as SVG" in the diagram toolbar
  downloads the current view (respecting whatever filter/sort is active) as
  a standalone `.svg` file, e.g. to drop into a slide deck or doc.
- **Three endpoint types.** Besides queues and topic-endpoints, the diagram
  also shows **direct subscribers** - clients consuming straight off their
  own topic subscriptions, with no durable queue or topic-endpoint in
  between (SEMP v2 `GET .../clients/{clientName}/subscriptions`). Each type
  gets its own color (queue: green, topic-endpoint: orange, direct
  subscriber: yellow).
- **Multiple broker connections at once.** Add several brokers on the
  Connect screen (e.g. a mesh of brokers) - all of them get queried and
  combined into one diagram. Each broker gets its own color; endpoints
  are colored by broker once 2+ are connected (falls back to the
  per-type coloring with just one). Same-named endpoints across different
  brokers are automatically disambiguated
  (`Queue: orders-q (EU-Broker)` vs `Queue: orders-q (US-Broker)`).
- Topic subscriptions are split along `/` into a hierarchy of prefix nodes
  in the diagram (e.g. `acme/sales/orders/>` becomes a chain of nodes).
  Sort order is switchable (topic name / endpoint name / owner).
- **Wildcard subscriptions are shown as covering more specific topics
  elsewhere.** A subscription like `acme/sales/>` on one endpoint and
  `acme/sales/orders` on a completely different endpoint end up as two
  separate node chains in the hierarchy - but by Solace's own topic-matching
  rules, the `>` wildcard means that endpoint also receives every message
  the more specific subscription does. Clicking `acme/sales/orders` in the
  diagram now also shows the endpoint subscribed via the broader wildcard,
  not just the endpoint with the exact string. Implemented in
  `frontend/src/lib/subscriptionCovers.ts` +
  `addWildcardCoverageEdges.ts` (and mirrored in `backend/src/semp/` for the
  `/api/sankey-edges` Grafana path, so both stay consistent). This only
  affects what a *topic* click reveals - clicking the endpoint itself
  (e.g. the queue) still shows only its real, declared subscriptions, not
  every topic that happens to reach it via someone else's wildcard (see the
  `implied` edge flag in `frontend/src/lib/filterToRelevantSubgraph.ts`).
  **This whole behavior is optional** - the "View" control in the diagram
  toolbar switches between "Data flow (wildcard-aware)" (the above, default)
  and "Subscriptions (literal)", which shows only each endpoint's raw,
  individually declared subscriptions with no wildcard-coverage edges added
  at all.
- Click any node OR the connecting link to filter down to only the
  relevant subtree: clicking/hovering a queue shows just its
  subscriptions, a topic shows just the queues/topic-endpoints it
  reaches. A "Back to overview" button resets the filter. Hovering
  highlights the whole affected flow with a gradient.
- Endpoint owner (if the broker reports one) shows below the endpoint label.
- Colors follow the Solace Brand Book 2025 v3.0 (primary/secondary palette,
  dark-mode reference) - see comments in `frontend/src/index.css` for the
  exact source pages.

## Quickest way to run it

```bash
docker pull ghcr.io/pascalre/sankey-explorer-for-solace:latest
docker run -p 4000:4000 ghcr.io/pascalre/sankey-explorer-for-solace:latest
```

Then open http://localhost:4000. No required configuration at all - no env
vars, no `.env` file. `SESSION_SECRET` is optional (see "Zero required
config" below); leave `APP_USERNAME`/`APP_PASSWORD_HASH` unset too and the
tool runs in "workshop mode" with no login (see "Deployment model" above).
Broker URL/VPN/credentials are entered afterwards, in the browser, on the
"Connect to Message VPN" screen.

The image is built and published automatically by
`.github/workflows/docker-publish.yml` on every push to `master` (and on
version tags), for both `linux/amd64` and `linux/arm64` (e.g. Apple
Silicon).

If `docker pull` ever fails with `denied` even though the package looks
public: that's almost always a stale/expired `docker login ghcr.io` cached
on the machine doing the pull, not a visibility problem - `docker logout
ghcr.io` fixes it. Only if the package itself was genuinely created private
(depends on repo/org defaults) do you need the one-time fix: GitHub profile
→ Packages → this image → Package settings → Change visibility → Public.

### Zero required config

`SESSION_SECRET` doesn't need to be set: if you leave it out, the backend
generates a random one per process start (see `backend/src/config.ts`).
That's safe specifically because broker connections live only in memory
(`backend/src/semp/connectionStore.ts`) and don't survive a restart anyway,
secret or not. Set it explicitly only if you're running multiple replicas
behind a load balancer sharing one session store (which needs its own setup
too - see the TODO in `connectionStore.ts`).

## Build it yourself (container)

```bash
docker build -t sankey-explorer .
docker run -p 4000:4000 sankey-explorer
```

One Node process serves the API (`/api/*`) and the built frontend from the
same origin. `/healthz` for liveness probes.

## Local development

```bash
# Backend
cd backend
npm install
npm run dev          # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api -> :4000
```

No `.env` file needed to just try it - every backend env var is optional
(see "Zero required config" above; `backend/.env.example` documents all of
them, including the optional login and a custom port, if you want either).

Open the frontend in dev mode, enter the broker's SEMP host/VPN/credentials
in the "Connect" screen (just the host, e.g. `http://localhost:8080` - no
`/SEMP` path needed, the backend adds `/SEMP/v2/monitor/...` itself). No
broker handy? Rebuild the mock from the smoke test (see
`backend/src/__tests__` for the assumed reply structure).

### Demo data (for screenshots)

`scripts/seed-demo-broker.sh` provisions a small retail-domain example
(queues, topic subscriptions, a wildcard) on a local broker via the SEMP v2
CONFIG API, so there's something worth looking at without a real customer
broker handy:

```bash
BROKER_HOST=http://localhost:8080 VPN=default ADMIN_USER=admin ADMIN_PASSWORD=admin \
  ./scripts/seed-demo-broker.sh
```

Defaults match a stock Solace PubSub+ Standard eval Docker image. Safe to
re-run. See the script's own comments for how to add a "Direct Subscriber"
node too (via "Try Me!" in PubSub+ Manager - that one can't be provisioned
through SEMP, since it only exists while a client is actually connected).

## Troubleshooting a broker connection

The "Connect to Message VPN" screen deliberately shows a short, specific
error (e.g. "Could not connect: SEMP request failed (network): ...") rather
than a generic one, and the same detail plus the broker URL/VPN/username
(**never** the password) is always logged server-side - see
`backend/src/logger.ts`. Where those logs show up depends on how the backend
is running:

- **Container:** `docker logs <container>` (add `-f` to follow live).
- **Local dev (`npm run dev`):** printed directly to the terminal running
  the backend.

A failed connect logs a line like:

```
[2026-08-17T10:00:00.000Z] Connection attempt failed for http://customer-broker:8080 (vpn=default, username=ro-user) SempError: SEMP request failed: HTTP 401 Unauthorized
```

The message after `SempError:` is the actual cause - wrong credentials (401),
wrong VPN/unreachable host (network error, see `backend/src/semp/client.ts`),
or a non-2xx HTTP status from something in between (proxy, load balancer).
A successful connect logs a similar "Connected to ..." line. If the broker
accepts the connection (ping succeeds) but queries still fail once you're
past the Connect screen, look for the same detail logged against
`GET /api/endpoints` or `GET /api/sankey-edges` instead.

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

- **Topic-endpoint subscriptions unverified against a real broker.** Queue
  and direct-subscriber (client) subscriptions are confirmed against
  Solace's own SEMP v2 docs/examples; topic-endpoints are assumed to expose
  their subscription the same way (a `.../topicEndpoints/{name}/subscriptions`
  sub-resource). The assumption lives in `backend/src/semp/queries.ts`
  (comment at the top of the file) - if it doesn't match, touch only that
  file; the rest of the app only knows the normalized `EndpointInfo[]`.
- **SEMP v2's REST model means one extra HTTP request per queue/topic-endpoint/
  client** (to fetch each object's own `.../subscriptions`), since - unlike
  SEMP v1 - there's no way to embed a sub-collection into a parent list
  reply. Fine at workshop/demo scale; a VPN with thousands of queues or
  connected clients would want a concurrency limit added in
  `backend/src/semp/queries.ts`.
- `express-session` runs with `MemoryStore` - fine for 1 process/customer.
  For multiple instances behind a load balancer: switch to an external
  store (Redis), see the TODO in `backend/src/semp/connectionStore.ts`.
- No GitHub Actions Dependabot config, no SAST (semgrep) - deferred for the
  current Tier 1 scope, see the rigor ladder in the
  senior-engineering-partner skill for the promotion triggers.
