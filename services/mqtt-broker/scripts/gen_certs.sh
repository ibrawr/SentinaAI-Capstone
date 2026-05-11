#!/usr/bin/env bash
# scripts/gen_certs.sh — Generate TLS certificates for EMQX mTLS (NFR-26, NFR-28)
#
# Creates:
#   certs/ca.key / ca.crt              — Self-signed Certificate Authority
#   certs/server.key / server.crt      — EMQX broker TLS certificate
#   certs/<ID>.key / <ID>.crt          — Client certificate for a device or service
#
# In production, replace the self-signed CA with certs from your PKI / cloud CA.
#
# Usage:
#   cd services/mqtt-broker
#
#   # Step 1: Create CA + broker cert (run ONCE)
#   bash scripts/gen_certs.sh --server
#
#   # Step 2: Issue a cert for each device or service account (run per device)
#   bash scripts/gen_certs.sh --client sensor-HZA01-occ
#   bash scripts/gen_certs.sh --client edge-node
#   bash scripts/gen_certs.sh --client sentina-backend
#
# The Common Name (CN) of the client cert becomes the MQTT username in EMQX
# (via peer_cert_as_username = cn in emqx.conf), so it MUST exactly match the
# username used in authz/acl.conf ACL rules.

set -euo pipefail

CERTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"
mkdir -p "$CERTS_DIR"

DAYS=825     # Max recommended by browsers; adjust to your security policy
CA_KEY="$CERTS_DIR/ca.key"
CA_CRT="$CERTS_DIR/ca.crt"

# ── Helpers ────────────────────────────────────────────────────────────────

# Write a minimal OpenSSL config file containing the given CN and return its
# path. Using -config instead of -subj avoids the Git Bash / MSYS path
# translator mangling "/CN=..." into "C:/Program Files/Git/CN=..." on Windows,
# while keeping normal path conversion active so file arguments still work.
_req_conf() {
    local cn="$1"
    local tmpf
    tmpf=$(mktemp)
    printf '[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=%s\nO=SentinaAI\nC=AE\n' "$cn" > "$tmpf"
    echo "$tmpf"
}

gen_ca() {
    echo "==> Generating Certificate Authority (CA)..."
    openssl genrsa -out "$CA_KEY" 4096
    local cfg; cfg=$(_req_conf "SentinaAI-MQTT-CA")
    openssl req -x509 -new -nodes -key "$CA_KEY" -sha256 -days $DAYS \
        -config "$cfg" \
        -out "$CA_CRT"
    rm -f "$cfg"
    chmod 600 "$CA_KEY"
    echo "    CA written to: $CERTS_DIR/ca.{key,crt}"
}

gen_server_cert() {
    echo "==> Generating EMQX broker server certificate..."
    openssl genrsa -out "$CERTS_DIR/server.key" 2048
    local cfg; cfg=$(_req_conf "mqtt.sentinai.local")
    openssl req -new -key "$CERTS_DIR/server.key" \
        -config "$cfg" \
        -out "$CERTS_DIR/server.csr"
    rm -f "$cfg"
    openssl x509 -req \
        -in "$CERTS_DIR/server.csr" \
        -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial \
        -out "$CERTS_DIR/server.crt" \
        -days $DAYS -sha256
    rm "$CERTS_DIR/server.csr"
    chmod 600 "$CERTS_DIR/server.key"
    echo "    Broker cert written to: $CERTS_DIR/server.{key,crt}"
}

gen_client_cert() {
    local ID="$1"
    echo "==> Issuing client certificate for: '$ID'"
    echo "    (MQTT username in EMQX will be: $ID)"
    openssl genrsa -out "$CERTS_DIR/${ID}.key" 2048
    local cfg; cfg=$(_req_conf "$ID")
    openssl req -new -key "$CERTS_DIR/${ID}.key" \
        -config "$cfg" \
        -out "$CERTS_DIR/${ID}.csr"
    rm -f "$cfg"
    openssl x509 -req \
        -in "$CERTS_DIR/${ID}.csr" \
        -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial \
        -out "$CERTS_DIR/${ID}.crt" \
        -days $DAYS -sha256
    rm "$CERTS_DIR/${ID}.csr"
    chmod 600 "$CERTS_DIR/${ID}.key"
    echo "    Client cert written to: $CERTS_DIR/${ID}.{key,crt}"
    echo ""
    echo "    Distribute to device/service:"
    echo "      ${ID}.key   <- private key  (keep secret, never share)"
    echo "      ${ID}.crt   <- public cert  (install on device)"
    echo "      ca.crt      <- trust anchor (install on device)"
}

# ── Argument parsing ────────────────────────────────────────────────────────

if [[ $# -eq 0 ]]; then
    echo "Usage:"
    echo "  bash scripts/gen_certs.sh --server                  # Generate CA + server cert"
    echo "  bash scripts/gen_certs.sh --client <DEVICE_ID>      # Issue a client cert"
    echo ""
    echo "Examples:"
    echo "  bash scripts/gen_certs.sh --server"
    echo "  bash scripts/gen_certs.sh --client sensor-HZA01-occ"
    echo "  bash scripts/gen_certs.sh --client edge-node"
    echo "  bash scripts/gen_certs.sh --client sentina-backend"
    exit 1
fi

case "$1" in
    --server)
        if [[ -f "$CA_KEY" ]]; then
            echo "CA already exists at $CA_KEY — skipping CA generation."
            echo "Delete certs/ to regenerate from scratch."
        else
            gen_ca
        fi
        gen_server_cert
        echo ""
        echo "Done. Start EMQX with: docker compose up -d"
        ;;
    --client)
        if [[ $# -lt 2 || -z "${2:-}" ]]; then
            echo "Error: --client requires a device ID argument."
            echo "  bash scripts/gen_certs.sh --client sensor-HZA01-occ"
            exit 1
        fi
        if [[ ! -f "$CA_KEY" ]]; then
            echo "Error: CA not found. Run --server first."
            exit 1
        fi
        gen_client_cert "$2"
        ;;
    *)
        echo "Unknown argument: $1"
        echo "Use --server or --client <ID>"
        exit 1
        ;;
esac
