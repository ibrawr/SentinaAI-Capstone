"""test_emqx.py — Integration tests for EMQX mTLS setup (NFR-26, NFR-27, NFR-28)

Simulates IoT device connections using paho-mqtt + Python ssl.
No physical devices needed — this script IS the device.

Prerequisites:
    pip install paho-mqtt        # or: pip install -r scripts/requirements-test.txt
    bash scripts/gen_certs.sh --server
    bash scripts/gen_certs.sh --client sensor-HZA01-occ
    bash scripts/gen_certs.sh --client edge-node
    bash scripts/gen_certs.sh --client sentina-backend
    docker compose up -d         # EMQX must be running

Run:
    cd services/mqtt-broker
    python scripts/test_emqx.py

    # Verbose (show each test and result):
    python scripts/test_emqx.py -v

What is tested:
    NFR-28 T1 — Plain-text port 1883 is refused
    NFR-26 T2 — Anonymous TLS connection (no cert) is rejected
    NFR-26 T3 — Device with valid CA-signed cert connects successfully
    NFR-27 T4 — Device publishes to its own topic (allowed)
    NFR-27 T5 — Device cannot publish to another device's topic (denied)
    NFR-27 T6 — Device cannot subscribe to all-devices wildcard (denied)
    NFR-27 T7 — Device cannot subscribe to privileged aggregated/# topic (denied)
    NFR-27 T8 — Edge-node can subscribe to all device topics (allowed)
    NFR-27 T9 — Edge-node can publish aggregated metrics (allowed)
"""

from __future__ import annotations

import argparse
import os
import socket
import ssl
import sys
import time
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("ERROR: paho-mqtt not installed.")
    print("  pip install paho-mqtt")
    sys.exit(1)

# ── Configuration ─────────────────────────────────────────────────────────────

BROKER_HOST = os.environ.get("EMQX_HOST", "localhost")
BROKER_PORT_TLS = int(os.environ.get("EMQX_TLS_PORT", "8883"))
BROKER_PORT_PLAIN = int(os.environ.get("EMQX_PLAIN_PORT", "1883"))

CERTS_DIR = Path(__file__).resolve().parent.parent / "certs"
CA_CERT   = CERTS_DIR / "ca.crt"

# Cert pairs: (cert_file, key_file, expected_mqtt_username)
DEVICE_ID    = "sensor-HZA01-occ"
EDGE_ID      = "edge-node"
BACKEND_ID   = "sentina-backend"
OTHER_DEV_ID = "sensor-HZB03-temp"   # a second device, to test cross-device ACL

CONNECT_TIMEOUT = 5   # seconds to wait for connection result

ANSI_GREEN  = "\033[92m"
ANSI_RED    = "\033[91m"
ANSI_YELLOW = "\033[93m"
ANSI_RESET  = "\033[0m"

verbose = False


# ── Result tracking ───────────────────────────────────────────────────────────

@dataclass
class TestResult:
    name: str
    passed: bool
    detail: str = ""

results: list[TestResult] = []


def record(name: str, passed: bool, detail: str = "") -> bool:
    results.append(TestResult(name, passed, detail))
    if verbose or not passed:
        status = f"{ANSI_GREEN}PASS{ANSI_RESET}" if passed else f"{ANSI_RED}FAIL{ANSI_RESET}"
        print(f"  [{status}] {name}")
        if detail:
            print(f"         {detail}")
    return passed


# ── Low-level helpers ─────────────────────────────────────────────────────────

def _cert_path(identity: str) -> tuple[Path, Path]:
    """Return (cert_file, key_file) for an identity, or raise if missing."""
    crt = CERTS_DIR / f"{identity}.crt"
    key = CERTS_DIR / f"{identity}.key"
    if not crt.exists():
        raise FileNotFoundError(
            f"Client cert not found: {crt}\n"
            f"  Generate it with: bash scripts/gen_certs.sh --client {identity}"
        )
    return crt, key


def _make_ssl_context(client_cert: Optional[Path] = None,
                      client_key: Optional[Path] = None,
                      verify_server: bool = True) -> ssl.SSLContext:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    if verify_server:
        ctx.check_hostname = False   # CN is mqtt.sentinai.local; tests connect to localhost
        ctx.verify_mode = ssl.CERT_REQUIRED
        ctx.load_verify_locations(cafile=str(CA_CERT))
    else:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    if client_cert and client_key:
        ctx.load_cert_chain(certfile=str(client_cert), keyfile=str(client_key))
    return ctx


@dataclass
class _ConnectOutcome:
    """Thread-safe container for MQTT connection callback results."""
    connected: bool = False
    rc: int = -1
    event: threading.Event = field(default_factory=threading.Event)
    pub_ack: threading.Event = field(default_factory=threading.Event)
    sub_granted: Optional[list] = None
    sub_event: threading.Event = field(default_factory=threading.Event)


def _try_connect_tls(
    client_id: str,
    cert_identity: Optional[str],
    timeout: float = CONNECT_TIMEOUT,
) -> tuple[bool, int, Optional[mqtt.Client]]:
    """
    Attempt a TLS MQTT connection.

    Returns (connected: bool, return_code: int, client_or_None).
    If connected=True, caller MUST call client.disconnect().
    """
    outcome = _ConnectOutcome()

    # paho-mqtt 2.x requires callback_api_version; fall back gracefully for 1.x
    try:
        client = mqtt.Client(
            client_id=client_id,
            protocol=mqtt.MQTTv5,
            callback_api_version=mqtt.CallbackAPIVersion.VERSION1,
        )
    except (TypeError, AttributeError):
        client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv5)

    if cert_identity:
        crt, key = _cert_path(cert_identity)
        ssl_ctx = _make_ssl_context(client_cert=crt, client_key=key)
        # Explicitly set MQTT username = cert CN so ACL ${username} rules work.
        # This is the MQTT-level identity; peer_cert_as_username = cn would do
        # the same automatically, but we set it here as well for reliability.
        client.username_pw_set(cert_identity)
    else:
        # Anonymous — no client cert
        ssl_ctx = _make_ssl_context()

    client.tls_set_context(ssl_ctx)

    def on_connect(c, userdata, flags, rc, props=None):
        outcome.rc = rc
        outcome.connected = (rc == 0)
        outcome.event.set()

    def on_connect_fail(c, userdata):
        outcome.rc = -1
        outcome.connected = False
        outcome.event.set()

    client.on_connect      = on_connect
    client.on_connect_fail = on_connect_fail

    try:
        client.connect(BROKER_HOST, BROKER_PORT_TLS, keepalive=10)
    except (OSError, ssl.SSLError) as e:
        return False, -1, None

    client.loop_start()
    outcome.event.wait(timeout=timeout)
    client.loop_stop()

    if outcome.connected:
        return True, outcome.rc, client
    return False, outcome.rc, None


def _publish_and_check(
    client: mqtt.Client,
    topic: str,
    payload: str,
    timeout: float = 3.0,
) -> bool:
    """
    Publish a message with QoS 1 and wait for PUBACK.
    Returns True if PUBACK received (publish accepted by broker).
    With EMQX deny_action = disconnect, a denied publish triggers disconnect.
    """
    ack_received = threading.Event()
    disconnected = threading.Event()

    original_on_disconnect = client.on_disconnect

    def on_pub(c, userdata, mid):
        ack_received.set()

    def on_disconnect(c, userdata, rc, props=None):
        disconnected.set()
        if original_on_disconnect:
            original_on_disconnect(c, userdata, rc)

    client.on_publish    = on_pub
    client.on_disconnect = on_disconnect

    client.loop_start()
    client.publish(topic, payload, qos=1)
    # Wait for either ack or disconnect
    got_ack = ack_received.wait(timeout=timeout)
    # EMQX sends PUBACK(0x87 Not Authorized) then immediately DISCONNECT.
    # Give the DISCONNECT packet time to arrive before stopping the loop.
    if got_ack:
        disconnected.wait(timeout=1.0)
    client.loop_stop()

    # Restore original handler
    client.on_disconnect = original_on_disconnect
    return got_ack and not disconnected.is_set()


def _subscribe_and_check(
    client: mqtt.Client,
    topic: str,
    timeout: float = 3.0,
) -> bool:
    """
    Subscribe to a topic and wait for SUBACK.
    Returns True if broker granted the subscription (return code != 128).
    EMQX returns rc=128 (or disconnects with deny_action=disconnect) for denied subs.
    """
    sub_result: list = []
    sub_event  = threading.Event()
    disconnected = threading.Event()

    original_on_disconnect = client.on_disconnect

    def on_subscribe(c, userdata, mid, granted_qos, props=None):
        sub_result.extend(granted_qos if isinstance(granted_qos, (list, tuple)) else [granted_qos])
        sub_event.set()

    def on_disconnect(c, userdata, rc, props=None):
        disconnected.set()
        if original_on_disconnect:
            original_on_disconnect(c, userdata, rc)

    client.on_subscribe  = on_subscribe
    client.on_disconnect = on_disconnect

    client.loop_start()
    client.subscribe(topic, qos=1)
    sub_received = sub_event.wait(timeout=timeout)
    # EMQX may send SUBACK(0x87) then DISCONNECT — give the DISCONNECT time to arrive.
    if sub_received:
        disconnected.wait(timeout=1.0)
    client.loop_stop()

    client.on_disconnect = original_on_disconnect

    if disconnected.is_set():
        return False   # broker disconnected us (deny_action=disconnect)
    if not sub_result:
        return False   # no SUBACK received
    # In MQTTv5 paho-mqtt passes ReasonCode objects, not plain ints.
    # Success codes are 0x00-0x02 (QoS 0/1/2 granted); anything >= 0x80 is an error.
    rc = sub_result[0]
    rc_int = rc.value if hasattr(rc, "value") else int(rc)
    return rc_int < 0x80


# ── Individual tests ──────────────────────────────────────────────────────────

def test_plain_port_closed():
    """NFR-28 T1: Plain-text port 1883 must be closed."""
    name = "NFR-28 T1: Port 1883 is closed (plain-text disabled)"
    try:
        with socket.create_connection((BROKER_HOST, BROKER_PORT_PLAIN), timeout=3):
            record(name, False, f"Port {BROKER_PORT_PLAIN} accepted a TCP connection — plain-text is OPEN!")
    except (ConnectionRefusedError, OSError):
        record(name, True, f"Port {BROKER_PORT_PLAIN} correctly refused connection")


def test_anonymous_tls_rejected():
    """NFR-26 T2: TLS connection WITHOUT a client cert must be rejected."""
    name = "NFR-26 T2: Anonymous TLS connection (no client cert) is rejected"
    connected, rc, client = _try_connect_tls("anon-test", cert_identity=None)
    if client:
        client.disconnect()
    record(name, not connected, f"rc={rc}")


def test_valid_device_connects():
    """NFR-26 T3: Device with valid CA-signed cert connects successfully."""
    name = "NFR-26 T3: Device with valid cert connects"
    connected, rc, client = _try_connect_tls(f"test-{DEVICE_ID}", cert_identity=DEVICE_ID)
    if client:
        client.disconnect()
    record(name, connected, f"rc={rc}")
    return connected


def test_device_publishes_own_topic():
    """NFR-27 T4: Device may publish to its own sentina/devices/<CN>/# topic."""
    name = "NFR-27 T4: Device publishes to own topic (allowed)"
    connected, _, client = _try_connect_tls(f"pub-{DEVICE_ID}", cert_identity=DEVICE_ID)
    if not connected or client is None:
        record(name, False, "Could not connect — skipping (depends on T3)")
        return
    topic = f"sentina/devices/{DEVICE_ID}/occupancy"
    ok = _publish_and_check(client, topic, '{"occupancyCount":42,"occupancyRate":0.35}')
    client.disconnect()
    record(name, ok, f"topic={topic}")


def test_device_cannot_publish_to_other_device():
    """NFR-27 T5: Device must NOT be able to publish to another device's topic."""
    name = "NFR-27 T5: Device publish to other device's topic is denied"
    connected, _, client = _try_connect_tls(f"xpub-{DEVICE_ID}", cert_identity=DEVICE_ID)
    if not connected or client is None:
        record(name, False, "Could not connect — skipping (depends on T3)")
        return
    foreign_topic = f"sentina/devices/{OTHER_DEV_ID}/occupancy"
    # With deny_action=disconnect, the broker disconnects — so publish will NOT be acked
    ok = _publish_and_check(client, foreign_topic, "spoof", timeout=3)
    if client:
        try:
            client.disconnect()
        except Exception:
            pass
    record(name, not ok, f"foreign topic={foreign_topic}")


def test_device_cannot_subscribe_wildcard():
    """NFR-27 T6: Device must NOT subscribe to sentina/devices/# (all devices)."""
    name = "NFR-27 T6: Device subscribe to sentina/devices/# wildcard is denied"
    connected, _, client = _try_connect_tls(f"wsub-{DEVICE_ID}", cert_identity=DEVICE_ID)
    if not connected or client is None:
        record(name, False, "Could not connect — skipping (depends on T3)")
        return
    ok = _subscribe_and_check(client, "sentina/devices/#")
    if client:
        try:
            client.disconnect()
        except Exception:
            pass
    record(name, not ok, "wildcard subscribe sentina/devices/#")


def test_device_cannot_subscribe_aggregated():
    """NFR-27 T7: Device must NOT subscribe to sentina/aggregated/# (privileged)."""
    name = "NFR-27 T7: Device subscribe to sentina/aggregated/# is denied"
    connected, _, client = _try_connect_tls(f"agsub-{DEVICE_ID}", cert_identity=DEVICE_ID)
    if not connected or client is None:
        record(name, False, "Could not connect — skipping (depends on T3)")
        return
    ok = _subscribe_and_check(client, "sentina/aggregated/#")
    if client:
        try:
            client.disconnect()
        except Exception:
            pass
    record(name, not ok, "privileged subscribe sentina/aggregated/#")


def test_edge_subscribes_all_devices():
    """NFR-27 T8: Edge-node may subscribe to sentina/devices/# (all device data)."""
    name = "NFR-27 T8: Edge-node subscribes to sentina/devices/# (allowed)"
    crt = CERTS_DIR / f"{EDGE_ID}.crt"
    if not crt.exists():
        record(name, False, f"No cert for edge-node. Run: bash scripts/gen_certs.sh --client {EDGE_ID}")
        return
    connected, _, client = _try_connect_tls(f"edge-sub", cert_identity=EDGE_ID)
    if not connected or client is None:
        record(name, False, "Edge-node could not connect")
        return
    ok = _subscribe_and_check(client, "sentina/devices/#")
    client.disconnect()
    record(name, ok, "subscribe sentina/devices/#")


def test_edge_publishes_aggregated():
    """NFR-27 T9: Edge-node may publish to sentina/aggregated/#."""
    name = "NFR-27 T9: Edge-node publishes to sentina/aggregated/# (allowed)"
    crt = CERTS_DIR / f"{EDGE_ID}.crt"
    if not crt.exists():
        record(name, False, f"No cert for edge-node. Run: bash scripts/gen_certs.sh --client {EDGE_ID}")
        return
    connected, _, client = _try_connect_tls(f"edge-pub", cert_identity=EDGE_ID)
    if not connected or client is None:
        record(name, False, "Edge-node could not connect")
        return
    ok = _publish_and_check(client, "sentina/aggregated/HZA01/occupancy",
                            '{"avgOccupancyRate":0.42}')
    client.disconnect()
    record(name, ok, "publish sentina/aggregated/HZA01/occupancy")


# ── Pre-flight checks ─────────────────────────────────────────────────────────

def preflight() -> bool:
    ok = True
    if not CA_CERT.exists():
        print(f"{ANSI_RED}[ERROR]{ANSI_RESET} CA cert not found: {CA_CERT}")
        print("  Run: bash scripts/gen_certs.sh --server")
        ok = False
    device_crt = CERTS_DIR / f"{DEVICE_ID}.crt"
    if not device_crt.exists():
        print(f"{ANSI_YELLOW}[WARN]{ANSI_RESET}  Device cert not found: {device_crt}")
        print(f"  Run: bash scripts/gen_certs.sh --client {DEVICE_ID}")
        print(f"  Tests T3-T7 will be skipped.")
    # Check broker is reachable on TLS port
    try:
        with socket.create_connection((BROKER_HOST, BROKER_PORT_TLS), timeout=5):
            pass
    except (ConnectionRefusedError, OSError):
        print(f"{ANSI_RED}[ERROR]{ANSI_RESET} EMQX not reachable at {BROKER_HOST}:{BROKER_PORT_TLS}")
        print("  Start it with: docker compose up -d")
        ok = False
    return ok


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    global verbose, BROKER_HOST, BROKER_PORT_TLS, BROKER_PORT_PLAIN
    parser = argparse.ArgumentParser(description="EMQX mTLS integration tests")
    parser.add_argument("-v", "--verbose", action="store_true",
                        help="Show all test results, not just failures")
    parser.add_argument("--host", default=BROKER_HOST, help="Broker host (default: localhost)")
    parser.add_argument("--tls-port", type=int, default=BROKER_PORT_TLS)
    parser.add_argument("--plain-port", type=int, default=BROKER_PORT_PLAIN)
    args = parser.parse_args()
    BROKER_HOST      = args.host
    BROKER_PORT_TLS  = args.tls_port
    BROKER_PORT_PLAIN= args.plain_port
    verbose          = args.verbose

    print(f"\nEMQX mTLS Integration Tests")
    print(f"Broker: {BROKER_HOST}  TLS:{BROKER_PORT_TLS}  plain:{BROKER_PORT_PLAIN}")
    print(f"Certs:  {CERTS_DIR}")
    print("-" * 60)

    if not preflight():
        sys.exit(2)

    print()
    test_plain_port_closed()
    test_anonymous_tls_rejected()
    test_valid_device_connects()
    test_device_publishes_own_topic()
    test_device_cannot_publish_to_other_device()
    test_device_cannot_subscribe_wildcard()
    test_device_cannot_subscribe_aggregated()
    test_edge_subscribes_all_devices()
    test_edge_publishes_aggregated()

    passed = sum(1 for r in results if r.passed)
    total  = len(results)
    print()
    print("-" * 60)
    if passed == total:
        print(f"{ANSI_GREEN}All {total} tests passed.{ANSI_RESET}")
        sys.exit(0)
    else:
        print(f"{ANSI_RED}{total - passed} of {total} tests FAILED:{ANSI_RESET}")
        for r in results:
            if not r.passed:
                print(f"  - {r.name}")
                if r.detail:
                    print(f"    {r.detail}")
        sys.exit(1)


if __name__ == "__main__":
    main()
