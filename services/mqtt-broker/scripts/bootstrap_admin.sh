#!/usr/bin/env bash
# bootstrap_admin.sh — Set EMQX dashboard admin password via REST API
#
# Run ONCE after the first "docker compose up -d" to replace the default
# password with something specific to your deployment.
#
# Usage:
#   cd services/mqtt-broker
#   bash scripts/bootstrap_admin.sh
#
# Requirements: curl (pre-installed on most systems)

set -euo pipefail

EMQX_HOST="${EMQX_HOST:-localhost}"
EMQX_API_PORT="${EMQX_API_PORT:-18083}"
API="http://${EMQX_HOST}:${EMQX_API_PORT}/api/v5"

OLD_PASSWORD="${OLD_PASSWORD:-SentinaAdmin_CHANGEME!}"
NEW_PASSWORD="${NEW_PASSWORD:-}"   # set via env var to avoid shell history

if [[ -z "$NEW_PASSWORD" ]]; then
    echo "Enter a new EMQX dashboard password:"
    read -rs NEW_PASSWORD
    echo
fi

echo "==> Waiting for EMQX API to become available..."
for i in $(seq 1 30); do
    if curl -sf "$API/status" >/dev/null 2>&1; then
        break
    fi
    sleep 2
done

echo "==> Changing admin password..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "$API/users/admin" \
    -u "admin:${OLD_PASSWORD}" \
    -H "Content-Type: application/json" \
    -d "{\"password\": \"${NEW_PASSWORD}\"}" \
)

if [[ "$HTTP_CODE" == "200" ]]; then
    echo "Password changed successfully."
    echo "Dashboard: http://${EMQX_HOST}:${EMQX_API_PORT}"
else
    echo "Failed (HTTP $HTTP_CODE). Old password may already be changed."
    echo "Log in to the dashboard manually: http://${EMQX_HOST}:${EMQX_API_PORT}"
fi
