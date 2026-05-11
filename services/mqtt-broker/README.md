# EMQX MQTT Broker

EMQX 5.8 broker with mTLS authentication and per-device topic ACLs for SentinaAI IoT sensors.

**Security model:**
- Every client must present a TLS certificate signed by the project CA (NFR-26)
- The certificate CN becomes the client's MQTT username, used in ACL rules (NFR-27)
- Only port 8883 (TLS) is exposed — plain-text ports 1883 and 8083 are disabled (NFR-28)

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose)
- Bash (WSL Ubuntu on Windows, or macOS/Linux terminal)
- Python 3.9+ with `paho-mqtt`

On a fresh Ubuntu WSL install, `pip` is not available by default. Install it first, then install the test dependency:

```bash
sudo apt update && sudo apt install python3-pip -y
pip3 install paho-mqtt
```

---

## Setup

### 1. Generate TLS certificates

Run from the `services/mqtt-broker/` directory in a **Bash** shell (WSL on Windows):

```bash
bash scripts/gen_certs.sh --server
bash scripts/gen_certs.sh --client sensor-HZA01-occ
bash scripts/gen_certs.sh --client edge-node
bash scripts/gen_certs.sh --client sentina-backend
```

This creates `certs/` with:
- `ca.crt` / `ca.key` — the project Certificate Authority
- `server.crt` / `server.key` — the broker's TLS certificate
- `<id>.crt` / `<id>.key` — a client certificate per identity

> Certificates are git-ignored and must never be committed.

### 2. Start the broker

```bash
docker compose up -d
```

Wait ~15 seconds for EMQX to finish initialising, then verify it's healthy:

```bash
docker exec sentina-emqx emqx ping   # should print: pong
```

### 3. Run integration tests

```bash
python3 scripts/test_emqx.py -v
```

All 9 tests should pass:

```
NFR-28 T1 — Port 1883 is closed (plain-text disabled)      PASS
NFR-26 T2 — Anonymous TLS connection is rejected            PASS
NFR-26 T3 — Device with valid cert connects                 PASS
NFR-27 T4 — Device publishes to own topic (allowed)         PASS
NFR-27 T5 — Device publish to other device's topic denied   PASS
NFR-27 T6 — Device subscribe to all-devices wildcard denied PASS
NFR-27 T7 — Device subscribe to aggregated/# denied         PASS
NFR-27 T8 — Edge-node subscribes to all device topics       PASS
NFR-27 T9 — Edge-node publishes aggregated metrics          PASS
```

#### How the tests prove the broker is correctly configured

These are real integration tests — every test opens an actual TCP/TLS connection to the live EMQX container. Nothing is mocked.

| Test | What actually happens on the wire |
|------|----------------------------------|
| T1 | A raw TCP socket is opened to port 1883. The test passes only if the connection is **actively refused** by the OS. |
| T2 | A TLS handshake is attempted with **no client certificate**. EMQX must reject the handshake — if it connects, the test fails. |
| T3 | A TLS connection is made using the `sensor-HZA01-occ` cert. EMQX verifies it was signed by the project CA and admits the client. |
| T4 | The sensor publishes a real MQTT message to its own topic. The test waits for a **PUBACK** from the broker confirming acceptance. |
| T5 | The sensor tries to publish to **another device's topic**. EMQX sends back error code `0x87 Not Authorized` and forcibly disconnects the client. The test passes only if **no PUBACK arrives**. |
| T6 | The sensor tries to subscribe to `sentina/devices/#` (all devices). EMQX denies with an error SUBACK or disconnects. The test passes only if the subscription is **not granted**. |
| T7 | Same as T6, but for the privileged `sentina/aggregated/#` topic. |
| T8 | The `edge-node` identity subscribes to `sentina/devices/#`. This time the broker **must grant** it — the test fails if denied. |
| T9 | The `edge-node` publishes to `sentina/aggregated/HZA01/occupancy` and waits for a PUBACK. |

The "deny" tests (T5, T6, T7) are the most important: they only pass when the broker **actively rejects** the operation. A misconfigured broker that allowed everything would flip all three to FAIL.

**To verify the tests are real, watch the broker logs while they run:**

```bash
# Terminal 1 — live broker log
docker logs -f sentina-emqx

# Terminal 2 — run the tests
python3 scripts/test_emqx.py -v
```

You will see each connection attempt, TLS handshake, and rejection appear in the broker log in real time.

**To prove the deny tests catch misconfigurations**, you can temporarily break the ACL and watch them fail:

```bash
# Bring the broker down so you can safely edit authz/acl.conf,
# then restart and re-run — T5/T6/T7 will flip to FAIL.
docker compose down
# (edit authz/acl.conf to allow everything)
docker compose up -d
python3 scripts/test_emqx.py -v
# Restore acl.conf and restart when done
```

### 4. Change the dashboard password

Open [http://localhost:18083](http://localhost:18083) and log in with `admin` / `SentinaAdmin_CHANGEME!`.
Change the password immediately on first login.

> In production, also update `EMQX_NODE__COOKIE` and `EMQX_DASHBOARD__DEFAULT_PASSWORD` in `docker-compose.yml` and restrict the dashboard port to loopback (`127.0.0.1:18083:18083`).

---

## Adding a new device

```bash
# 1. Generate a client certificate — the CN becomes the device's MQTT username
bash scripts/gen_certs.sh --client sensor-HZB03-temp

# 2. Copy files to the device
scp certs/ca.crt          user@device:/etc/sentina/
scp certs/sensor-HZB03-temp.crt  user@device:/etc/sentina/
scp certs/sensor-HZB03-temp.key  user@device:/etc/sentina/   # use scp or a secrets manager
```

The device's certificate CN (`sensor-HZB03-temp`) is automatically used as its MQTT username.
ACL rules already allow any `sensor-*` client to publish to `sentina/devices/<its-own-CN>/#` — no ACL changes needed for new devices.

---

## Distributing TLS Certificates

| File | Safe to share? | Where it goes |
|------|---------------|---------------|
| `ca.crt` | Yes | Install on **every** device and service as the trust anchor |
| `<id>.crt` | Yes | Install on the **specific** device or service |
| `<id>.key` | **No** | Never share over email or Slack — copy via `scp`, a secrets manager (Vault, AWS Secrets Manager), or a USB drive |

---

## Topic namespace

| Topic pattern | Who publishes | Who subscribes |
|---------------|--------------|----------------|
| `sentina/devices/<device-CN>/<reading>` | That device only | `edge-node` |
| `sentina/commands/<device-CN>/<cmd>` | `edge-node`, `sentina-backend` | That device only |
| `sentina/aggregated/<hall-id>/<metric>` | `edge-node` | `sentina-backend` |
| `sentina/alerts/<hall-id>` | `edge-node` | `sentina-backend` |

---

## Troubleshooting

**Tests fail with "Could not connect"**
- Check the broker is running: `docker compose ps`
- Check EMQX is healthy: `docker exec sentina-emqx emqx ping`
- Confirm certificates exist in `certs/` and were generated with the correct CN

**`paho-mqtt not installed`**
```bash
pip install paho-mqtt
```

**T5/T6/T7 fail (ACL not enforced)**
- Verify the custom ACL file is being loaded (not the built-in default):
  ```bash
  docker exec sentina-emqx emqx eval \
    'Sources = emqx_authz:lookup(file), io:format("~p~n", [maps:get(rules, maps:get(annotations, Sources))]).'
  ```
  The output should show your custom rules (edge-node, sentina-backend, etc.), not `{allow,all,all,[['#']]}`.
- If it shows the default rules, ensure the volume mount in `docker-compose.yml` targets `/opt/emqx/etc/acl.conf` and restart: `docker compose down && docker compose up -d`

**Container won't start**
```bash
docker compose logs broker
```
