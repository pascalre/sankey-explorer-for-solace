#!/usr/bin/env bash
set -euo pipefail

# Seeds a local Solace PubSub+ broker with a small retail-domain example
# (queues + topic subscriptions, incl. a couple of wildcards) so the Sankey
# Explorer has something nice to show - e.g. for a README screenshot.
#
# Uses the SEMP v2 CONFIG API (NOT the read-only v2/monitor API the app
# itself uses) - this is a one-off admin/provisioning script you run
# directly against the broker, independent of the app.
#
# Usage:
#   BROKER_HOST=http://localhost:8080 VPN=default ADMIN_USER=admin ADMIN_PASSWORD=admin \
#     ./scripts/seed-demo-broker.sh
# All of the above are optional - the defaults match a stock Solace
# PubSub+ Standard eval Docker image.

BROKER_HOST="${BROKER_HOST:-http://localhost:8080}"
VPN="${VPN:-default}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}"

CONFIG_BASE="${BROKER_HOST}/SEMP/v2/config/msgVpns/${VPN}"

# POSTs a JSON body and prints a one-line summary. Doesn't abort the script
# on failure (set -e is deliberately bypassed here) - e.g. re-running this
# script just logs "already exists" (422) for everything instead of dying
# halfway through, so it's safe to run more than once.
semp_post() {
  local path="$1" body="$2"
  local status
  status=$(curl -s -o /tmp/semp-seed-response.json -w "%{http_code}" \
    -u "${ADMIN_USER}:${ADMIN_PASSWORD}" \
    -H "Content-Type: application/json" \
    -X POST "${CONFIG_BASE}${path}" \
    -d "${body}")
  if [[ "${status}" == "200" || "${status}" == "201" ]]; then
    echo "OK    ${path} <- ${body}"
  else
    local reason
    reason=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('meta',{}).get('error',{}).get('description','?'))" \
      < /tmp/semp-seed-response.json 2>/dev/null || echo "HTTP ${status}")
    echo "SKIP  ${path} <- ${body}  (${reason})"
  fi
}

create_queue() {
  local name="$1" owner="$2"
  semp_post "/queues" "{\"queueName\":\"${name}\",\"owner\":\"${owner}\"}"
}

add_queue_subscription() {
  local queue="$1" topic="$2"
  semp_post "/queues/${queue}/subscriptions" "{\"subscriptionTopic\":\"${topic}\"}"
}

create_topic_endpoint() {
  local name="$1" owner="$2"
  semp_post "/topicEndpoints" "{\"topicEndpointName\":\"${name}\",\"owner\":\"${owner}\"}"
}

add_topic_endpoint_subscription() {
  local te="$1" topic="$2"
  # EXPERIMENTAL / unverified (see backend/src/semp/queries.ts) - queues and
  # topic-endpoints are assumed to work the same way here. If this comes
  # back 404/"not allowed", it means topic-endpoints DON'T take a static
  # subscription via config - a client has to BIND to the topic-endpoint
  # with the desired topic instead (e.g. via "Try Me!" in PubSub+ Manager:
  # pick "Topic Endpoint" as the destination type, enter the TE name and
  # the topic you want it bound to, then connect). Please report back
  # either way so the assumption in queries.ts can be confirmed/fixed.
  semp_post "/topicEndpoints/${te}/subscriptions" "{\"subscriptionTopic\":\"${topic}\"}"
}

echo "== Queues =="
create_queue order-processing-q order-service
add_queue_subscription order-processing-q "retail/orders/created"

create_queue order-cancellation-q order-service
add_queue_subscription order-cancellation-q "retail/orders/cancelled"

# Broad wildcard - also covers the two queues above AND the topic-endpoint
# below, even though none of them share a subscription string with it.
# That's the "wildcard subscription coverage" feature: click
# "retail/orders/created" in the diagram and this queue shows up too.
create_queue all-orders-audit-q audit-service
add_queue_subscription all-orders-audit-q "retail/orders/>"

create_queue inventory-sync-q inventory-service
add_queue_subscription inventory-sync-q "retail/inventory/updated"

create_queue low-stock-alert-q inventory-service
add_queue_subscription low-stock-alert-q "retail/inventory/low-stock"

# One queue, two subscriptions - shows fan-in from two different topics
# into the same endpoint.
create_queue shipping-q shipping-service
add_queue_subscription shipping-q "retail/shipping/dispatched"
add_queue_subscription shipping-q "retail/shipping/delivered"

create_queue returns-processing-q returns-service
add_queue_subscription returns-processing-q "retail/returns/requested"

echo "== Topic Endpoints =="
create_topic_endpoint te-order-notifications notification-service
add_topic_endpoint_subscription te-order-notifications "retail/orders/created"

create_topic_endpoint te-returns-dashboard dashboard-service
add_topic_endpoint_subscription te-returns-dashboard "retail/returns/approved"

cat <<'EOF'

Done. Open the Sankey Explorer, connect to this broker/VPN, and you should
see queues + topic-endpoints fanning out from a "retail" topic hierarchy,
including one wildcard ("retail/orders/>") that also covers two other
endpoints' more specific topics.

Optional, for a "Direct Subscriber" (yellow) node too: open PubSub+ Manager
-> your VPN -> "Try Me!" -> Subscriber tab -> subscribe to a topic like
"retail/shipping/>" and leave it connected. That's a live client
subscription, which can't be provisioned via SEMP config (it only exists
while the client is connected) - "Try Me!" is the quickest way to get one.
EOF
