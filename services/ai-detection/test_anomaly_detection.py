# services/ai-detection/test_anomaly_detection.py
#
# Unit tests for the AI anomaly detection pipeline.
# Covers TC-ANOM-01, TC-ANOM-02, TC-ANOM-03
#
# Run:
#   cd services/ai-detection
#   python -m unittest test_anomaly_detection -v

import unittest
from fastapi.testclient import TestClient
from app import app, sust_rule_status, sust_action_from_status, run_ai_pipeline

client = TestClient(app)

# ---------------------------------------------------------------------------
# TC-ANOM-01: End-to-End Detection and Classification Pipeline
# FR-49, FR-50, FR-51, FR-52, FR-57
# ---------------------------------------------------------------------------

class TestEndToEndDetectionPipeline(unittest.TestCase):
    """
    TC-ANOM-01 — Verify that the system detects and classifies anomalies
    end-to-end: traffic spike → security classification, temperature/environmental
    deviation → operational-environmental classification, and that alerts surface
    on the venue-status endpoint (digital twin data source).
    """

    def test_traffic_spike_classified_as_security(self):
        """
        FR-50, FR-51 — Injecting high occupancy + high CO2 via simulate-prediction
        must return isAnomaly=True and aiAction='dispatchSecurity'.
        Threshold: occupancy >= 90%, co2 >= 1400 ppm.
        """
        resp = client.post("/api/simulate-prediction", json={
            "hall_id": "HZC01",
            "occupancy": 92,
            "co2": 1450
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "success")

        # Primary hall update must be first in updates list
        primary = data["updates"][0]
        self.assertEqual(primary["hall_id"], "HZC01")
        self.assertTrue(primary["isAnomaly"], "Traffic spike should trigger isAnomaly=True")
        self.assertEqual(primary["aiAction"], "dispatchSecurity",
                         f"Expected 'dispatchSecurity', got '{primary['aiAction']}'")

    def test_venue_status_reflects_anomaly_after_spike(self):
        """
        FR-49, FR-52 — After a spike injection, GET /api/venue-status must return
        at least one hall with isAnomaly=True, confirming the detection is visible
        on the dashboard/SOC data feed.
        """
        # Inject spike first
        client.post("/api/simulate-prediction", json={
            "hall_id": "HZC01",
            "occupancy": 92,
            "co2": 1450
        })

        resp = client.get("/api/venue-status")
        self.assertEqual(resp.status_code, 200)
        halls = resp.json()["data"]
        self.assertTrue(len(halls) > 0, "venue-status must return hall data")

        anomalous = [h for h in halls if h["isAnomaly"]]
        self.assertTrue(len(anomalous) > 0,
                        "At least one hall must show isAnomaly=True after spike injection")

    def test_normal_traffic_produces_no_anomaly(self):
        """
        FR-50 — Low occupancy and low CO2 via simulate-prediction must return
        isAnomaly=False, confirming the pipeline does not over-alert on normal traffic.
        """
        resp = client.post("/api/simulate-prediction", json={
            "hall_id": "HZD01",
            "occupancy": 40,
            "co2": 550
        })
        self.assertEqual(resp.status_code, 200)
        primary = resp.json()["updates"][0]
        self.assertFalse(primary["isAnomaly"],
                         "Normal traffic should not trigger an anomaly")
        self.assertEqual(primary["aiAction"], "none",
                         f"Expected 'none', got '{primary['aiAction']}'")

    def test_environmental_deviation_classified_as_operational_outlier(self):
        """
        FR-51 — Low efficiency + high carbon must be classified as a RED
        sustainability status with an operational action (scheduleMaintenance,
        reduceHVACLoad, or optimizeSetpoints), matching the 'operational-environmental
        outlier' category described in TC-ANOM-01.
        """
        resp = client.post("/api/infer-sustainability", json={
            "hall_id": "HZA01",
            "energyEfficiencyScore": 48,
            "carbonKgCO2": 65,
            "hvacEnergyKWh": 30
        })
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["sustainabilityStatus"], "red",
                         "Low efficiency + high carbon must produce RED status")
        self.assertIn(body["aiAction"],
                      ["scheduleMaintenance", "reduceHVACLoad", "optimizeSetpoints"],
                      f"Unexpected action: {body['aiAction']}")
        self.assertTrue(body["isAnomaly"])

    def test_normal_environment_classified_as_green(self):
        """
        FR-51 — All metrics within healthy range must produce GREEN status and
        aiAction='none', confirming the classifier does not produce false positives
        on normal environmental readings.
        """
        resp = client.post("/api/infer-sustainability", json={
            "hall_id": "HZA02",
            "energyEfficiencyScore": 85,
            "carbonKgCO2": 20,
            "hvacEnergyKWh": 20
        })
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["sustainabilityStatus"], "green")
        self.assertEqual(body["aiAction"], "none")
        self.assertFalse(body["isAnomaly"])

    def test_response_schema_contains_required_alert_fields(self):
        """
        FR-52 — The infer-action response must contain hall_id, aiAction, and
        isAnomaly fields so that the dashboard and SOC interface can consume
        and display the alert.
        """
        resp = client.post("/api/infer-action", json={
            "hall_id": "HZB01",
            "occupancyRatio": 0.70,
            "co2": 800.0,
            "flowCongestionIndex": 0.5
        })
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        for key in ("hall_id", "aiAction", "isAnomaly"):
            self.assertIn(key, body, f"Missing required field '{key}' in response")

    def test_venue_status_response_schema(self):
        """
        FR-49, FR-52 — Every hall entry in /api/venue-status must expose the
        fields needed for continuous monitoring and dashboard display.
        """
        resp = client.get("/api/venue-status")
        self.assertEqual(resp.status_code, 200)
        halls = resp.json()["data"]
        self.assertTrue(len(halls) > 0)
        required_keys = {"hall_id", "hallName", "capacity", "currentOccupancy",
                         "occupancyRatio", "co2", "aiAction", "isAnomaly"}
        for hall in halls:
            missing = required_keys - set(hall.keys())
            self.assertEqual(missing, set(),
                             f"Hall {hall.get('hall_id')} missing keys: {missing}")


# ---------------------------------------------------------------------------
# TC-ANOM-02: Automated Isolation Response and Digital Twin Visualization
# FR-55, FR-59, FR-75, FR-84
# ---------------------------------------------------------------------------

class TestIsolationResponseAndVisualization(unittest.TestCase):
    """
    TC-ANOM-02 — Verify that a simulated gateway compromise is detected,
    reflected in the digital twin data feed (venue-status), and that
    multi-layer detection (ML + rule-based spillover) is active.
    """

    def test_gateway_compromise_detected_in_simulation(self):
        """
        FR-55 — Simulating a high-severity compromise on a hub zone must
        produce isAnomaly=True in the response, confirming the detection
        layer processes the event.
        """
        resp = client.post("/api/simulate-prediction", json={
            "hall_id": "HZC01",
            "occupancy": 95,
            "co2": 1500
        })
        self.assertEqual(resp.status_code, 200)
        primary = resp.json()["updates"][0]
        self.assertTrue(primary["isAnomaly"])
        self.assertEqual(primary["aiAction"], "dispatchSecurity")

    def test_anomaly_visible_in_venue_status_after_compromise(self):
        """
        FR-57 — After simulating a compromise, the affected hall must appear
        as anomalous in /api/venue-status, which is the data source for the
        digital twin's real-time red highlight.
        """
        client.post("/api/simulate-prediction", json={
            "hall_id": "HZC01",
            "occupancy": 95,
            "co2": 1500
        })
        resp = client.get("/api/venue-status")
        halls = {h["hall_id"]: h for h in resp.json()["data"]}
        self.assertIn("HZC01", halls)
        self.assertTrue(halls["HZC01"]["isAnomaly"],
                        "Compromised hall must be marked isAnomaly=True in venue-status")

    def test_spillover_propagates_to_neighbor_halls(self):
        """
        FR-55 — When occupancy exceeds 75%, the simulation must propagate
        spillover to adjacent halls. HZC01 has 4 neighbors, so updates list
        must contain more than 1 entry.
        """
        resp = client.post("/api/simulate-prediction", json={
            "hall_id": "HZC01",
            "occupancy": 90,
            "co2": 1000
        })
        self.assertEqual(resp.status_code, 200)
        updates = resp.json()["updates"]
        self.assertGreater(len(updates), 1,
                           "Spillover should propagate anomaly to neighbor halls")

    def test_no_spillover_below_threshold(self):
        """
        FR-55 — When occupancy is below 75%, no spillover should occur.
        Updates list must contain exactly 1 entry (primary hall only).
        """
        resp = client.post("/api/simulate-prediction", json={
            "hall_id": "HZD01",
            "occupancy": 60,
            "co2": 500
        })
        self.assertEqual(resp.status_code, 200)
        updates = resp.json()["updates"]
        self.assertEqual(len(updates), 1,
                         "No spillover expected when occupancy < 75%")

    def test_batch_sustainability_returns_result_per_hall(self):
        """
        FR-55, FR-75 — Batch sustainability endpoint must return one result
        per submitted hall, providing dashboard-consumable data for all zones.
        """
        resp = client.post("/api/infer-sustainability-batch", json={
            "halls": [
                {"hall_id": "HZA01", "energyEfficiencyScore": 48, "carbonKgCO2": 65},
                {"hall_id": "HZA02", "energyEfficiencyScore": 65, "carbonKgCO2": 40},
                {"hall_id": "HZA03", "energyEfficiencyScore": 85, "carbonKgCO2": 20}
            ]
        })
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()["rows"]
        self.assertEqual(len(rows), 3, "Batch must return one result per input hall")
        for row in rows:
            self.assertIn("sustainabilityStatus", row)
            self.assertIn("aiAction", row)

    def test_simulate_prediction_response_includes_occupancy_and_co2(self):
        """
        FR-75 — Each update in simulate-prediction response must expose
        occupancyRatio and co2 so the digital twin can render gauges and
        heatmap values.
        """
        resp = client.post("/api/simulate-prediction", json={
            "hall_id": "HZB01",
            "occupancy": 80,
            "co2": 1100
        })
        update = resp.json()["updates"][0]
        self.assertIn("occupancyRatio", update)
        self.assertIn("co2", update)
        self.assertIsInstance(update["occupancyRatio"], float)
        self.assertIsInstance(update["co2"], float)


# ---------------------------------------------------------------------------
# TC-ANOM-03: Alert Management and Threshold Configuration
# FR-54, FR-58, FR-60
# ---------------------------------------------------------------------------

class TestAlertManagementAndThresholds(unittest.TestCase):
    """
    TC-ANOM-03 — Verify that threshold boundaries behave correctly (alerts
    trigger above threshold, not below) and that the simulation endpoint
    for scenario testing is functional.

    Note: sust_rule_status() and sust_action_from_status() are tested directly
    as unit functions to validate threshold boundaries deterministically,
    independent of ML model state.
    """

    # --- Threshold boundary tests (direct function calls, deterministic) ---

    def test_efficiency_below_55_is_red(self):
        """FR-54 — energyEfficiencyScore < 55 must produce RED status."""
        status = sust_rule_status(hvac_kwh=20, carbon=20, eff=54)
        self.assertEqual(status, "red")

    def test_efficiency_at_55_boundary_is_amber(self):
        """FR-54 — energyEfficiencyScore == 55 with normal carbon/hvac → AMBER."""
        status = sust_rule_status(hvac_kwh=20, carbon=20, eff=55)
        self.assertEqual(status, "amber")

    def test_efficiency_below_70_is_amber(self):
        """FR-54 — energyEfficiencyScore < 70 (but >= 55) must produce AMBER status."""
        status = sust_rule_status(hvac_kwh=20, carbon=20, eff=69)
        self.assertEqual(status, "amber")

    def test_efficiency_at_70_boundary_is_green(self):
        """FR-54 — energyEfficiencyScore == 70 with normal carbon/hvac → GREEN."""
        status = sust_rule_status(hvac_kwh=20, carbon=20, eff=70)
        self.assertEqual(status, "green")

    def test_carbon_above_60_is_red(self):
        """FR-54 — carbonKgCO2 > 60 must produce RED status."""
        status = sust_rule_status(hvac_kwh=20, carbon=61, eff=80)
        self.assertEqual(status, "red")

    def test_carbon_at_60_boundary_is_amber(self):
        """FR-54 — carbonKgCO2 == 60 with normal hvac/efficiency → AMBER."""
        status = sust_rule_status(hvac_kwh=20, carbon=60, eff=80)
        self.assertEqual(status, "amber")

    def test_hvac_above_60_is_red(self):
        """FR-54 — hvacEnergyKWh > 60 must produce RED status."""
        status = sust_rule_status(hvac_kwh=61, carbon=20, eff=80)
        self.assertEqual(status, "red")

    def test_all_metrics_normal_is_green(self):
        """FR-54 — All metrics within green range must produce GREEN with action 'none'."""
        status = sust_rule_status(hvac_kwh=20, carbon=20, eff=80)
        self.assertEqual(status, "green")
        action = sust_action_from_status(status, eff=80, carbon=20, hvac_kwh=20)
        self.assertEqual(action, "none")

    def test_red_low_efficiency_action_is_schedule_maintenance(self):
        """FR-54 — RED status caused by efficiency < 55 must produce scheduleMaintenance."""
        action = sust_action_from_status("red", eff=48, carbon=20, hvac_kwh=20)
        self.assertEqual(action, "scheduleMaintenance")

    def test_red_high_carbon_action_is_reduce_hvac_load(self):
        """FR-54 — RED status caused by high carbon (eff >= 55) must produce reduceHVACLoad."""
        action = sust_action_from_status("red", eff=60, carbon=65, hvac_kwh=20)
        self.assertEqual(action, "reduceHVACLoad")

    def test_amber_low_efficiency_action_is_optimize_hvac(self):
        """FR-54 — AMBER status caused by efficiency < 70 must produce optimizeHVAC."""
        action = sust_action_from_status("amber", eff=65, carbon=20, hvac_kwh=20)
        self.assertEqual(action, "optimizeHVAC")

    # --- Traffic spike threshold tests (run_ai_pipeline, deterministic hard rules) ---

    def test_traffic_below_threshold_no_security_alert(self):
        """
        FR-54 — Occupancy 85% with CO2 = 900 is below the dispatchSecurity
        threshold (occ >= 90% AND co2 >= 1400). Must not trigger dispatchSecurity.
        """
        _, ai_action, is_anomaly = run_ai_pipeline(occ_percent=85, co2_level=900)
        self.assertNotEqual(ai_action, "dispatchSecurity",
                            "Should not dispatch security below threshold")

    def test_traffic_above_threshold_triggers_security_alert(self):
        """
        FR-54 — Occupancy 92% with CO2 = 1450 exceeds both thresholds.
        Must return aiAction='dispatchSecurity' and isAnomaly=True.
        """
        _, ai_action, is_anomaly = run_ai_pipeline(occ_percent=92, co2_level=1450)
        self.assertEqual(ai_action, "dispatchSecurity")
        self.assertTrue(is_anomaly)

    def test_co2_only_triggers_ventilation_not_security(self):
        """
        FR-54 — High CO2 alone (>= 1000) without high occupancy must trigger
        increaseVentilation, not dispatchSecurity.
        """
        _, ai_action, _ = run_ai_pipeline(occ_percent=50, co2_level=1100)
        self.assertEqual(ai_action, "increaseVentilation")

    def test_normal_conditions_produce_no_alert(self):
        """
        FR-54 — Normal occupancy (40%) and low CO2 (550) must return
        aiAction='none' and isAnomaly=False.
        """
        _, ai_action, is_anomaly = run_ai_pipeline(occ_percent=40, co2_level=550)
        self.assertEqual(ai_action, "none")
        self.assertFalse(is_anomaly)

    # --- Simulation endpoint existence (FR-60) ---

    def test_simulate_prediction_endpoint_accessible(self):
        """
        FR-60 — The simulation endpoint must exist and return HTTP 200 with
        a valid JSON response containing an 'updates' list.
        """
        resp = client.post("/api/simulate-prediction", json={
            "hall_id": "HZA01",
            "occupancy": 85,
            "co2": 1200
        })
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["status"], "success")
        self.assertIn("updates", body)
        self.assertIsInstance(body["updates"], list)

    def test_simulate_prediction_returns_hall_id_and_anomaly_flag(self):
        """
        FR-60 — Each update entry in the simulation response must contain
        hall_id and isAnomaly so testers can validate detection performance.
        """
        resp = client.post("/api/simulate-prediction", json={
            "hall_id": "HZB01",
            "occupancy": 92,
            "co2": 1450
        })
        updates = resp.json()["updates"]
        for update in updates:
            self.assertIn("hall_id", update)
            self.assertIn("isAnomaly", update)
            self.assertIn("aiAction", update)

    def test_infer_sustainability_endpoint_accessible_for_scenario_testing(self):
        """
        FR-60 — The sustainability inference endpoint must be accessible for
        scenario injection (environmental anomaly simulation).
        """
        resp = client.post("/api/infer-sustainability", json={
            "hall_id": "HZC01",
            "energyEfficiencyScore": 48,
            "carbonKgCO2": 65,
            "hvacEnergyKWh": 30
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "success")


if __name__ == "__main__":
    unittest.main(verbosity=2)
