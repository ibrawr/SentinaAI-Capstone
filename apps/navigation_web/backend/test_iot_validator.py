import math
import unittest

from iot_validator import (
    _scan_for_banned_keys,
    sanitize_sensor_data,
    validate_iot_payload,
)


class TestBannedKeyScanner(unittest.TestCase):
    """Direct tests on the recursive scanner."""

    def test_image_key_rejected(self):
        ok, reason = _scan_for_banned_keys({"image": "data"})
        self.assertFalse(ok)
        self.assertIn("image", reason)

    def test_frame_key_rejected(self):
        ok, reason = _scan_for_banned_keys({"frame": "base64string"})
        self.assertFalse(ok)

    def test_base64_key_rejected(self):
        ok, reason = _scan_for_banned_keys({"base64": "abc123"})
        self.assertFalse(ok)

    def test_snapshot_key_rejected(self):
        ok, reason = _scan_for_banned_keys({"snapshot": "abc"})
        self.assertFalse(ok)

    def test_data_uri_value_rejected(self):
        ok, reason = _scan_for_banned_keys({"photo_url": "data:image/png;base64,abc"})
        self.assertFalse(ok)
        self.assertIn("data-URI", reason)

    def test_data_uri_jpeg_value_rejected(self):
        ok, reason = _scan_for_banned_keys({"src": "data:image/jpeg;base64,/9j/"})
        self.assertFalse(ok)

    def test_face_id_camel_rejected(self):
        ok, reason = _scan_for_banned_keys({"faceId": "abc-123"})
        self.assertFalse(ok)
        self.assertIn("face", reason)

    def test_face_id_underscore_rejected(self):
        ok, reason = _scan_for_banned_keys({"face_id": "abc-123"})
        self.assertFalse(ok)

    def test_faces_list_rejected(self):
        ok, reason = _scan_for_banned_keys({"faces": [{"id": 1}]})
        self.assertFalse(ok)

    def test_person_id_rejected(self):
        ok, reason = _scan_for_banned_keys({"person_id": "p42"})
        self.assertFalse(ok)

    def test_email_rejected(self):
        ok, reason = _scan_for_banned_keys({"email": "user@example.com"})
        self.assertFalse(ok)
        self.assertIn("PII", reason)

    def test_name_rejected(self):
        ok, reason = _scan_for_banned_keys({"name": "John Doe"})
        self.assertFalse(ok)

    def test_mac_address_rejected(self):
        ok, reason = _scan_for_banned_keys({"mac": "AA:BB:CC:DD:EE:FF"})
        self.assertFalse(ok)

    def test_lat_rejected(self):
        ok, reason = _scan_for_banned_keys({"lat": 25.2})
        self.assertFalse(ok)

    def test_lon_rejected(self):
        ok, reason = _scan_for_banned_keys({"lon": 55.3})
        self.assertFalse(ok)

    def test_ip_address_rejected(self):
        ok, reason = _scan_for_banned_keys({"ip": "192.168.1.1"})
        self.assertFalse(ok)

    def test_nested_pii_in_metadata_rejected(self):
        payload = {"sensor_data": {"room_0": 0.4}, "metadata": {"email": "x@y.com"}}
        ok, reason = _scan_for_banned_keys(payload)
        self.assertFalse(ok)

    def test_nested_image_in_values_rejected(self):
        payload = {"values": {"count": 10, "frame": "abc"}}
        ok, reason = _scan_for_banned_keys(payload)
        self.assertFalse(ok)

    def test_deeply_nested_pii_rejected(self):
        payload = {"a": {"b": {"c": {"name": "Alice"}}}}
        ok, reason = _scan_for_banned_keys(payload)
        self.assertFalse(ok)

    def test_large_string_rejected(self):
        big = "A" * 1025
        ok, reason = _scan_for_banned_keys({"data": big})
        self.assertFalse(ok)
        self.assertIn("large string", reason)

    def test_exactly_max_string_accepted(self):
        ok, reason = _scan_for_banned_keys({"note": "B" * 1024})
        self.assertTrue(ok)

    def test_clean_numeric_payload_accepted(self):
        ok, reason = _scan_for_banned_keys({"occupancyCount": 150, "occupancyRate": 0.33})
        self.assertTrue(ok)
        self.assertEqual(reason, "")

    def test_clean_nested_telemetry_accepted(self):
        ok, reason = _scan_for_banned_keys(
            {"hallId": "HZA01", "readingType": "occupancy", "values": {"occupancyRate": 0.5}}
        )
        self.assertTrue(ok)
        self.assertEqual(reason, "")


class TestSanitizeSensorData(unittest.TestCase):
    """Tests for numeric-only extraction and clamping."""

    def test_valid_rates_pass_through(self):
        result = sanitize_sensor_data({"room_0": 0.3, "room_1": 0.7})
        self.assertAlmostEqual(result["room_0"], 0.3)
        self.assertAlmostEqual(result["room_1"], 0.7)

    def test_string_value_dropped(self):
        result = sanitize_sensor_data({"room_0": "high", "room_1": 0.5})
        self.assertNotIn("room_0", result)
        self.assertIn("room_1", result)

    def test_none_value_dropped(self):
        result = sanitize_sensor_data({"room_0": None})
        self.assertEqual(result, {})

    def test_rate_above_one_clamped_to_one(self):
        result = sanitize_sensor_data({"room_0": 1.5})
        self.assertEqual(result["room_0"], 1.0)

    def test_negative_rate_clamped_to_zero(self):
        result = sanitize_sensor_data({"room_0": -0.2})
        self.assertEqual(result["room_0"], 0.0)

    def test_nan_dropped(self):
        result = sanitize_sensor_data({"room_0": float("nan")})
        self.assertEqual(result, {})

    def test_inf_dropped(self):
        result = sanitize_sensor_data({"room_0": float("inf")})
        self.assertEqual(result, {})

    def test_neg_inf_dropped(self):
        result = sanitize_sensor_data({"room_0": float("-inf")})
        self.assertEqual(result, {})

    def test_non_string_key_dropped(self):
        result = sanitize_sensor_data({123: 0.5})
        self.assertEqual(result, {})

    def test_empty_input(self):
        result = sanitize_sensor_data({})
        self.assertEqual(result, {})

    def test_integer_value_accepted_as_float(self):
        result = sanitize_sensor_data({"room_0": 1})
        self.assertAlmostEqual(result["room_0"], 1.0)

    def test_zero_accepted(self):
        result = sanitize_sensor_data({"room_0": 0})
        self.assertAlmostEqual(result["room_0"], 0.0)


class TestValidateIotPayload(unittest.TestCase):
    """Integration tests for the main validation entry point."""

    def test_valid_sensor_data_envelope(self):
        """Backward compat: {"sensor_data": {...}}"""
        ok, error, data = validate_iot_payload({"sensor_data": {"room_0": 0.4, "room_1": 0.6}})
        self.assertTrue(ok)
        self.assertEqual(error, "")
        self.assertAlmostEqual(data["room_0"], 0.4)

    def test_direct_mapping_backward_compat(self):
        """Legacy: {"room_0": 0.3} without envelope — still accepted."""
        ok, error, data = validate_iot_payload({"room_0": 0.3, "room_1": 0.7})
        self.assertTrue(ok)
        self.assertAlmostEqual(data["room_0"], 0.3)

    def test_image_key_rejected(self):
        ok, error, data = validate_iot_payload({"sensor_data": {"room_0": 0.4}, "image": "abc"})
        self.assertFalse(ok)
        self.assertIn("image", error)
        self.assertEqual(data, {})

    def test_face_id_rejected(self):
        ok, error, data = validate_iot_payload({"sensor_data": {"room_0": 0.4}, "faceId": "x"})
        self.assertFalse(ok)
        self.assertEqual(data, {})

    def test_email_rejected(self):
        ok, error, data = validate_iot_payload({"sensor_data": {"room_0": 0.4}, "email": "a@b.c"})
        self.assertFalse(ok)
        self.assertEqual(data, {})

    def test_mac_address_nested_rejected(self):
        ok, error, data = validate_iot_payload(
            {"sensor_data": {"room_0": 0.5}, "device": {"mac": "AA:BB:CC"}}
        )
        self.assertFalse(ok)
        self.assertEqual(data, {})

    def test_data_uri_in_sensor_values_rejected(self):
        ok, error, data = validate_iot_payload(
            {"sensor_data": {"room_0": "data:image/png;base64,abc"}}
        )
        self.assertFalse(ok)

    def test_non_dict_payload_rejected(self):
        ok, error, data = validate_iot_payload([1, 2, 3])
        self.assertFalse(ok)
        self.assertIn("JSON object", error)

    def test_null_payload_rejected(self):
        ok, error, data = validate_iot_payload(None)
        self.assertFalse(ok)

    def test_string_payload_rejected(self):
        ok, error, data = validate_iot_payload("room_0=0.5")
        self.assertFalse(ok)

    def test_non_numeric_sensor_values_stripped(self):
        ok, error, data = validate_iot_payload(
            {"sensor_data": {"room_0": "high", "room_1": 0.5}}
        )
        self.assertTrue(ok)
        self.assertNotIn("room_0", data)
        self.assertIn("room_1", data)

    def test_extra_envelope_keys_ignored_not_rejected(self):
        """Extra top-level keys that are not banned should not block the request."""
        ok, error, data = validate_iot_payload(
            {"sensor_data": {"room_0": 0.3}, "requestId": "abc-123", "version": 2}
        )
        self.assertTrue(ok)
        self.assertAlmostEqual(data["room_0"], 0.3)

    def test_empty_sensor_data_returns_empty(self):
        ok, error, data = validate_iot_payload({"sensor_data": {}})
        self.assertTrue(ok)
        self.assertEqual(data, {})


if __name__ == "__main__":
    unittest.main(verbosity=2)