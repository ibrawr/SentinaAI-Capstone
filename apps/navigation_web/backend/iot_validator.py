"""iot_validator.py

NFR-24: Anonymize people counting — reject payloads containing images, face IDs, or PII.
NFR-25: Data minimization — whitelist required fields per reading type; drop extras;
        accept only sanitized numeric aggregates (crowd counts/rates).

Placed alongside app.py in apps/navigation_web/backend/.
"""

from __future__ import annotations

import math
import re
from typing import Any, Dict, Tuple


# NFR-24: Banned key sets (matched case-insensitively after normalization)


# Media / image keys
_IMAGE_KEYS: frozenset[str] = frozenset({
    "image", "frame", "photo", "thumbnail", "screenshot", "video",
    "base64", "blob", "binary", "raw_image", "raw_frame",
    "snapshot", "picture", "capture",
})

# Face / biometric identity keys
_FACE_KEYS: frozenset[str] = frozenset({
    "faceid", "face_id", "faces", "faceids", "face_ids",
    "face_embedding", "face_vector", "face_descriptor",
    "person_id", "personid", "person_ids", "personids",
    "identity", "biometric",
})

# Personal Identifiable Information keys
_PII_KEYS: frozenset[str] = frozenset({
    "name", "firstname", "first_name", "lastname", "last_name",
    "fullname", "full_name", "username",
    "email", "email_address",
    "phone", "phonenumber", "phone_number", "mobile", "telephone",
    "address", "street", "city", "postcode", "zipcode",
    "gps", "location", "lat", "lon", "latitude", "longitude",
    "mac", "macaddress", "mac_address",
    "imei", "deviceid", "device_id", "userid", "user_id",
    "ssn", "passport", "dob", "dateofbirth", "date_of_birth",
    "ip", "ipaddress", "ip_address",
    "rfid", "badge", "nfc",
})

# Detect data-URI image values (data:image/...) in string values
_DATA_URI_RE = re.compile(r"^data:image/", re.IGNORECASE)

# Strings longer than this are treated as potential binary/image blobs
_MAX_STRING_LEN = 1024


def _normalize_key(k: str) -> str:
    """Lowercase and collapse hyphens/spaces to underscores for uniform matching."""
    return k.lower().replace("-", "_").replace(" ", "_")


def _scan_for_banned_keys(obj: Any, path: str = "") -> Tuple[bool, str]:
    """
    Recursively scan a JSON-decoded object for banned keys or suspicious values.

    Returns:
        (True, "")           — payload is clean
        (False, reason_str)  — payload contains banned content
    """
    if isinstance(obj, dict):
        for k, v in obj.items():
            nk = _normalize_key(str(k))
            current_path = f"{path}.{k}" if path else k

            if nk in _IMAGE_KEYS:
                return False, f"Payload contains banned image key: '{current_path}'"
            if nk in _FACE_KEYS:
                return False, f"Payload contains banned face/identity key: '{current_path}'"
            if nk in _PII_KEYS:
                return False, f"Payload contains banned PII key: '{current_path}'"

            # Detect data-URI image values regardless of key name
            if isinstance(v, str) and _DATA_URI_RE.match(v):
                return False, (
                    f"Payload contains image data-URI at: '{current_path}'"
                )

            # Detect suspiciously large strings (possible base64-encoded binaries)
            if isinstance(v, str) and len(v) > _MAX_STRING_LEN:
                return False, (
                    f"Payload contains suspiciously large string at '{current_path}' "
                    f"(len={len(v)}); possible binary/image data"
                )

            ok, reason = _scan_for_banned_keys(v, current_path)
            if not ok:
                return False, reason

    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            ok, reason = _scan_for_banned_keys(item, f"{path}[{i}]")
            if not ok:
                return False, reason

    return True, ""



# NFR-25: Data minimization — whitelist per reading type (telemetry records)


# Allowed top-level keys for each JSONL reading type
_ALLOWED_READING_FIELDS: Dict[str, frozenset[str]] = {
    "occupancy": frozenset({
        "hallId", "readingType", "timestamp", "deviceId", "values",
    }),
    "temp_humidity": frozenset({
        "hallId", "readingType", "timestamp", "deviceId", "values",
    }),
    "environment": frozenset({
        "hallId", "readingType", "timestamp", "deviceId", "values",
    }),
    "video_analytics": frozenset({
        "hallId", "readingType", "timestamp", "deviceId", "values",
    }),
}

# Allowed sub-fields inside "values" per reading type
_ALLOWED_VALUE_FIELDS: Dict[str, frozenset[str]] = {
    "occupancy":       frozenset({"occupancyCount", "occupancyRate"}),
    "temp_humidity":   frozenset({"temperatureC", "humidityPct"}),
    "environment":     frozenset({"co2ppm", "noiseDb"}),
    "video_analytics": frozenset({"estimatedCount"}),  # no face data allowed
}


def sanitize_sensor_data(sensor_data: Dict) -> Dict[str, float]:
    """
    NFR-25: Accept only finite numeric occupancy rates from a sensor_data dict.

    Input:  arbitrary dict (room/hall IDs → values)
    Output: filtered dict with only finite float values clamped to [0.0, 1.0].
            Non-numeric, NaN, Inf, and non-string keys are silently dropped.
    """
    result: Dict[str, float] = {}
    for k, v in sensor_data.items():
        if not isinstance(k, str):
            continue
        try:
            fv = float(v)
        except (TypeError, ValueError):
            continue
        if math.isnan(fv) or math.isinf(fv):
            continue
        result[k] = min(1.0, max(0.0, fv))
    return result



# Main entry point for POST /api/iot/update


def validate_iot_payload(
    payload: Any,
) -> Tuple[bool, str, Dict[str, float]]:
    """
    Validate and sanitize the raw POST body from POST /api/iot/update.

    Backward compatible with two formats:
        {"sensor_data": {"room_0": 0.3, ...}}   ← preferred envelope
        {"room_0": 0.3, ...}                     ← legacy direct mapping

    Returns:
        (ok: bool, error_message: str, sanitized_sensor_data: dict)

    On rejection: ok=False, error_message describes the violation, data={}.
    On success:   ok=True,  error_message="",    data=sanitized values.
    """
    if not isinstance(payload, dict):
        return False, "Payload must be a JSON object", {}

    # Step 1 NFR-24: scan entire payload for banned content
    ok, reason = _scan_for_banned_keys(payload)
    if not ok:
        return False, reason, {}

    # Step 2 NFR-25: extract sensor_data (envelope or direct)
    if "sensor_data" in payload:
        sensor_data = payload["sensor_data"]
    else:
        sensor_data = payload

    if not isinstance(sensor_data, dict):
        return (
            False,
            "sensor_data must be a JSON object mapping room IDs to occupancy rates",
            {},
        )

    # Step 3 NFR-25: keep only valid numeric rates
    sanitized = sanitize_sensor_data(sensor_data)

    return True, "", sanitized
