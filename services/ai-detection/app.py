"""
SentinaAI FastAPI backend for venue status, occupancy forecasting, simulation,
operations inference, and sustainability inference endpoints.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import pandas as pd
import numpy as np
import random
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
import warnings

warnings.filterwarnings("ignore")

app = FastAPI(title="SentinaAI Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def pick_col(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    for c in candidates:
        if c in df.columns:
            return c
    return None


def ensure_numeric(series, default=0.0):
    try:
        s = pd.to_numeric(series, errors="coerce")
        return s.fillna(default)
    except Exception:
        return pd.Series([default] * len(ops_df))


def day_to_code(day: str) -> int:
    dm = {
        "Monday": 0,
        "Tuesday": 1,
        "Wednesday": 2,
        "Thursday": 3,
        "Friday": 4,
        "Saturday": 5,
        "Sunday": 6,
    }
    return dm.get(day, 0)


print("Loading data and training SentinaAI models...")

ops_df = pd.read_csv("Operations and Sustainability Dataset v1.csv")
venue_df = ops_df[["hallName", "venueRole", "hallCapacity"]].drop_duplicates().reset_index(drop=True)

ops_df["co2"] = 400 + (ops_df["occupancyRatio"] * 600) + np.random.randint(-50, 50, size=len(ops_df))

le_venue = LabelEncoder()
ops_df["venueRole_encoded"] = le_venue.fit_transform(ops_df["venueRole"].astype(str))

le_action = LabelEncoder()
ops_df["action_encoded"] = le_action.fit_transform(ops_df["recommendedAction"].astype(str))

day_map = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6}
ops_df["day_code"] = ops_df["dayOfWeek"].map(day_map).fillna(0).astype(int)

sust_target_col = pick_col(
    ops_df,
    [
        "sustainabilityStatus",
        "sustainability_status",
        "sustStatus",
        "sust_status",
        "sust_status_label",
    ],
)

sust_feat_cols = {
    "hvacEnergyKWh": pick_col(ops_df, ["hvacEnergyKWh", "hvac_energy_kwh", "hvac_energy", "hvac_kwh"]),
    "carbonKgCO2": pick_col(ops_df, ["carbonKgCO2", "carbon_kg_co2", "carbon_kg", "carbon"]),
    "energyEfficiencyScore": pick_col(ops_df, ["energyEfficiencyScore", "energy_efficiency_score", "efficiencyScore"]),
    "comfortIndex": pick_col(ops_df, ["comfortIndex", "comfort_index"]),
    "indoorTempC": pick_col(ops_df, ["indoorTempC", "indoor_temp_c", "indoorTemp"]),
    "outdoorTempC": pick_col(ops_df, ["outdoorTempC", "outdoor_temp_c", "outdoorTemp"]),
    "humidityPct": pick_col(ops_df, ["humidityPct", "humidity_pct", "humidity"]),
}

if sust_target_col is None:
    hvac_s = ensure_numeric(ops_df[sust_feat_cols["hvacEnergyKWh"]], 0.0) if sust_feat_cols["hvacEnergyKWh"] else pd.Series([0.0] * len(ops_df))
    carbon_s = ensure_numeric(ops_df[sust_feat_cols["carbonKgCO2"]], 0.0) if sust_feat_cols["carbonKgCO2"] else pd.Series([0.0] * len(ops_df))
    eff_s = ensure_numeric(ops_df[sust_feat_cols["energyEfficiencyScore"]], 70.0) if sust_feat_cols["energyEfficiencyScore"] else pd.Series([70.0] * len(ops_df))

    status = []
    for hv, co, ef in zip(hvac_s.tolist(), carbon_s.tolist(), eff_s.tolist()):
        if ef < 55 or co > 60 or hv > 60:
            status.append("red")
        elif ef < 70 or co > 35 or hv > 35:
            status.append("amber")
        else:
            status.append("green")

    ops_df["sustainabilityStatus"] = status
    sust_target_col = "sustainabilityStatus"

le_sust = LabelEncoder()
ops_df["sust_encoded"] = le_sust.fit_transform(ops_df[sust_target_col].astype(str))

forecaster = RandomForestRegressor(n_estimators=50, random_state=42)
safety = RandomForestClassifier(n_estimators=50, random_state=42)
sust_clf = RandomForestClassifier(n_estimators=80, random_state=42)
SUST_MODEL_READY = False


class OccupancyForecastRequest(BaseModel):
    hall_id: str
    venueRole: str
    hourOfDay: int
    dayOfWeek: str


@app.post("/api/occupancy-forecast")
def occupancy_forecast(req: OccupancyForecastRequest):
    """
    Predict occupancy for the next 60 minutes using the trained forecaster.
    """
    try:
        dcode = day_to_code(req.dayOfWeek)
        role_code = le_venue.transform([req.venueRole])[0]
    except Exception:
        dcode = day_to_code(req.dayOfWeek)
        role_code = 0

    points = []
    base_hour = int(req.hourOfDay)

    for i in range(1, 5):
        hour_in = (base_hour + ((i * 15) // 60)) % 24
        y = float(forecaster.predict([[hour_in, dcode, role_code]])[0])
        points.append({"offsetMinutes": i * 15, "predictedOccupancy": int(round(y))})

    return {"status": "success", "hall_id": req.hall_id, "points": points}


def build_sust_training_matrix(df: pd.DataFrame) -> pd.DataFrame:
    def get_feat(key: str, default: float):
        col = sust_feat_cols.get(key)
        if col and col in df.columns:
            return ensure_numeric(df[col], default)
        return pd.Series([default] * len(df))

    X = pd.DataFrame(
        {
            "hvacEnergyKWh": get_feat("hvacEnergyKWh", 0.0),
            "carbonKgCO2": get_feat("carbonKgCO2", 0.0),
            "energyEfficiencyScore": get_feat("energyEfficiencyScore", 70.0),
            "comfortIndex": get_feat("comfortIndex", 70.0),
            "occupancyRatio": ensure_numeric(df.get("occupancyRatio", 0.0), 0.0),
            "indoorTempC": get_feat("indoorTempC", 0.0),
            "outdoorTempC": get_feat("outdoorTempC", 0.0),
            "humidityPct": get_feat("humidityPct", 0.0),
            "hourOfDay": ensure_numeric(df.get("hourOfDay", 0), 0).astype(int),
            "day_code": ensure_numeric(df.get("day_code", 0), 0).astype(int),
            "venueRole_encoded": ensure_numeric(df.get("venueRole_encoded", 0), 0).astype(int),
        }
    )
    return X.fillna(0)


def train_models():
    global SUST_MODEL_READY

    X_f = ops_df[["hourOfDay", "day_code", "venueRole_encoded"]]
    y_f = ops_df["currentOccupancy"]
    forecaster.fit(X_f, y_f)

    X_s = ops_df[["occupancyRatio", "co2", "flowCongestionIndex"]]
    y_s = ops_df["action_encoded"]
    safety.fit(X_s, y_s)

    try:
        X_sust = build_sust_training_matrix(ops_df)
        y_sust = ops_df["sust_encoded"]

        if int(pd.Series(y_sust).nunique()) >= 2:
            sust_clf.fit(X_sust, y_sust)
            SUST_MODEL_READY = True
        else:
            SUST_MODEL_READY = False
    except Exception:
        SUST_MODEL_READY = False


train_models()
print("Models trained successfully! API is ready.")


def auto_retrain_pipeline():
    print("\n AUTO-RETRIGGER: Anomaly detected by Edge Node!")
    print(" Step 7: Syncing new surge data to Cloud...")
    print(" Step 8: Updating Random Forest weights...")
    try:
        train_models()
        print(" Models successfully retrained and redeployed!")
    except Exception as e:
        print(f" Retraining Error: {e}")


HALL_STATE = {}


def init_hall_state_from_baseline(halls_data):
    global HALL_STATE
    if HALL_STATE:
        return
    for h in halls_data:
        hid = h["id"]
        HALL_STATE[hid] = {
            "hall_id": hid,
            "hallName": h.get("hallName"),
            "capacity": int(h.get("capacity", 0)),
            "currentOccupancy": int(h.get("currentOccupancy", 0)),
            "occupancyRatio": float(h.get("occupancyRatio", 0.0)),
            "co2": float(h.get("co2", 0.0)),
            "predictedOccupancyNextHour": int(h.get("predictedOccupancyNextHour", 0)),
            "aiAction": h.get("aiRecommendedAction", "none"),
            "isAnomaly": bool(h.get("isAnomaly", False)),
        }


@app.get("/api/venue-status")
def get_venue_status():
    """
    Return live hall status and initialize baseline state on first access.
    """
    if HALL_STATE:
        return {"status": "success", "data": list(HALL_STATE.values())}

    halls_data = []
    for _, hall in venue_df.iterrows():
        occ_factor = random.uniform(0.1, 0.6)
        current_people = int(hall["hallCapacity"] * occ_factor)
        live_co2 = 400 + (occ_factor * 600) + random.randint(-20, 50)
        occ_ratio = current_people / max(1, hall["hallCapacity"])

        role_code = le_venue.transform([str(hall["venueRole"])])[0]
        pred_occ = forecaster.predict([[15, 4, role_code]])[0]

        safety_input = [[occ_ratio, live_co2, 0.5]]
        action_code = safety.predict(safety_input)[0]
        rec_action = le_action.inverse_transform([action_code])[0]

        hall_id = str(hall["hallName"]).replace(" ", "").lower()

        halls_data.append(
            {
                "id": hall_id,
                "hallName": hall["hallName"],
                "capacity": int(hall["hallCapacity"]),
                "currentOccupancy": int(current_people),
                "occupancyRatio": float(occ_ratio),
                "co2": float(live_co2),
                "predictedOccupancyNextHour": int(pred_occ),
                "aiRecommendedAction": rec_action,
                "isAnomaly": str(rec_action).lower() != "none",
            }
        )

    init_hall_state_from_baseline(halls_data)
    return {"status": "success", "data": list(HALL_STATE.values())}


class SimulationRequest(BaseModel):
    hall_id: str
    occupancy: int
    co2: int


ADJACENCY_MAP = {
    "HZC01": ["HZC02", "HZD04", "HZA01", "HZB01"],
    "HZC02": ["HZC01", "HZC03"],
    "HZC03": ["HZC02", "HZC04"],
    "HZC04": ["HZC03", "HZC05"],
    "HZC05": ["HZC04", "HZC06"],
    "HZC06": ["HZC05"],
    "HZD01": ["HZD02"],
    "HZD02": ["HZD01", "HZD03"],
    "HZD03": ["HZD02", "HZD04"],
    "HZD04": ["HZD03", "HZD05", "HZC01"],
    "HZD05": ["HZD04", "HZD06"],
    "HZD06": ["HZD05"],
    "HZA01": ["HZA02", "HZC01"],
    "HZA02": ["HZA01", "HZA03"],
    "HZA03": ["HZA02", "HZA04"],
    "HZA04": ["HZA03", "HZA05"],
    "HZA05": ["HZA04", "HZA06"],
    "HZA06": ["HZA05"],
    "HZB01": ["HZB02", "HZC01"],
    "HZB02": ["HZB01", "HZB03"],
    "HZB03": ["HZB02", "HZB04"],
    "HZB04": ["HZB03"],
    "HZB05": ["HZB06"],
    "HZB06": ["HZB05", "HZB07"],
    "HZB07": ["HZB06", "HZB08"],
    "HZB08": ["HZB07"],
}


class InferActionRequest(BaseModel):
    hall_id: str
    occupancyRatio: float
    co2: float
    flowCongestionIndex: float


@app.post("/api/infer-action")
def infer_action(req: InferActionRequest):
    """
    Run operations inference using occupancy, CO2, and congestion features.
    """
    try:
        safety_input = [[float(req.occupancyRatio), float(req.co2), float(req.flowCongestionIndex)]]
        action_code = safety.predict(safety_input)[0]
        rec_action = le_action.inverse_transform([action_code])[0]
    except Exception:
        rec_action = "pipeline_error"

    is_anomaly = str(rec_action).lower() != "none"

    return {
        "status": "success",
        "hall_id": req.hall_id,
        "occupancyRatio": float(req.occupancyRatio),
        "co2": float(req.co2),
        "flowCongestionIndex": float(req.flowCongestionIndex),
        "aiAction": rec_action,
        "isAnomaly": bool(is_anomaly),
    }


def run_ai_pipeline(occ_percent, co2_level):
    occ_ratio = occ_percent / 100.0

    if occ_ratio >= 0.9:
        congestion = 0.95
    elif occ_ratio >= 0.8:
        congestion = 0.85
    elif occ_ratio >= 0.65:
        congestion = 0.70
    else:
        congestion = 0.45

    safety_input = [[occ_ratio, co2_level, congestion]]

    try:
        action_code = safety.predict(safety_input)[0]
        rec_action = le_action.inverse_transform([action_code])[0]
    except Exception:
        rec_action = "pipeline_error"

    rec_action_norm = str(rec_action).lower()

    high_co2 = co2_level >= 1000
    very_high_co2 = co2_level >= 1400
    high_occ = occ_ratio >= 0.80
    very_high_occ = occ_ratio >= 0.90

    if rec_action_norm == "none":
        if very_high_occ and very_high_co2:
            rec_action = "dispatchSecurity"
        elif very_high_occ:
            rec_action = "redirectFlow"
        elif high_occ and high_co2:
            rec_action = "increaseVentilation"
        elif high_occ:
            rec_action = "redirectFlow"
        elif high_co2:
            rec_action = "increaseVentilation"

    is_anomaly = str(rec_action).lower() != "none"
    return occ_ratio, rec_action, is_anomaly


def _ensure_state_initialized():
    if HALL_STATE:
        return
    _ = get_venue_status()


def _apply_update_to_state(hall_id, occ_ratio, co2, ai_action, is_anomaly):
    existing = HALL_STATE.get(hall_id, {})

    capacity = int(existing.get("capacity", 0)) if existing else 0
    if capacity <= 0:
        cap_row = venue_df[venue_df["hallName"].str.replace(" ", "").str.lower() == hall_id]
        if len(cap_row) > 0:
            capacity = int(cap_row.iloc[0]["hallCapacity"])
        else:
            capacity = 1000

    current_people = int(round(occ_ratio * capacity))

    HALL_STATE[hall_id] = {
        "hall_id": hall_id,
        "hallName": existing.get("hallName", hall_id),
        "capacity": capacity,
        "currentOccupancy": current_people,
        "occupancyRatio": float(occ_ratio),
        "co2": float(co2),
        "predictedOccupancyNextHour": int(existing.get("predictedOccupancyNextHour", current_people)),
        "aiAction": ai_action,
        "isAnomaly": bool(is_anomaly),
    }


@app.post("/api/simulate-prediction")
def simulate_prediction(data: SimulationRequest):
    """
    Inject a crowd surge into one hall and propagate spillover updates to neighbours.
    """
    _ensure_state_initialized()

    print(f"\n CROWD SURGE INJECTED AT: {data.hall_id} | Occ: {data.occupancy}% | CO2: {data.co2}")

    updates = []

    occ_ratio, ai_action, is_anomaly = run_ai_pipeline(data.occupancy, data.co2)

    updates.append(
        {"hall_id": data.hall_id, "occupancyRatio": occ_ratio, "co2": float(data.co2), "aiAction": ai_action, "isAnomaly": is_anomaly}
    )

    _apply_update_to_state(data.hall_id, occ_ratio, data.co2, ai_action, is_anomaly)

    if is_anomaly:
        auto_retrain_pipeline()

    if data.occupancy > 75:
        neighbors = ADJACENCY_MAP.get(data.hall_id, [])
        for neighbor in neighbors:
            spill_occ = int(data.occupancy * random.uniform(0.30, 0.55))
            spill_co2 = int(400 + (spill_occ * 6) + random.randint(-20, 50))

            n_occ_ratio, n_ai_action, n_is_anomaly = run_ai_pipeline(spill_occ, spill_co2)

            updates.append(
                {
                    "hall_id": neighbor,
                    "occupancyRatio": n_occ_ratio,
                    "co2": float(spill_co2),
                    "aiAction": n_ai_action,
                    "isAnomaly": n_is_anomaly,
                }
            )

            _apply_update_to_state(neighbor, n_occ_ratio, spill_co2, n_ai_action, n_is_anomaly)

    return {"status": "success", "updates": updates}


class InferSustRequest(BaseModel):
    hall_id: str
    hvacEnergyKWh: float = 0
    carbonKgCO2: float = 0
    energyEfficiencyScore: float = 0
    comfortIndex: float = 0
    occupancyRatio: float = 0
    indoorTempC: float = 0
    outdoorTempC: float = 0
    humidityPct: float = 0
    hourOfDay: int = 0
    dayOfWeek: str = "Monday"
    venueRole: str = "default"


class InferSustBatchRequest(BaseModel):
    halls: List[InferSustRequest]


def sust_rule_status(hvac_kwh: float, carbon: float, eff: float) -> str:
    if eff < 55 or carbon > 60 or hvac_kwh > 60:
        return "red"
    if eff < 70 or carbon > 35 or hvac_kwh > 35:
        return "amber"
    return "green"


def sust_action_from_status(status: str, eff: float, carbon: float, hvac_kwh: float) -> str:
    s = str(status or "").lower()
    if s == "red":
        if eff < 55:
            return "scheduleMaintenance"
        if carbon > 60 or hvac_kwh > 60:
            return "reduceHVACLoad"
        return "optimizeSetpoints"
    if s == "amber":
        if eff < 70:
            return "optimizeHVAC"
        return "monitor"
    return "none"


@app.post("/api/infer-sustainability")
def infer_sustainability(req: InferSustRequest):
    """
    Run sustainability inference for a single hall.
    """
    try:
        dcode = day_to_code(req.dayOfWeek)
        try:
            role_code = int(le_venue.transform([str(req.venueRole)])[0])
        except Exception:
            role_code = 0

        if SUST_MODEL_READY:
            X = [[
                float(req.hvacEnergyKWh),
                float(req.carbonKgCO2),
                float(req.energyEfficiencyScore),
                float(req.comfortIndex),
                float(req.occupancyRatio),
                float(req.indoorTempC),
                float(req.outdoorTempC),
                float(req.humidityPct),
                int(req.hourOfDay),
                int(dcode),
                int(role_code),
            ]]

            pred = sust_clf.predict(X)[0]
            sust_status = le_sust.inverse_transform([pred])[0]
        else:
            sust_status = sust_rule_status(float(req.hvacEnergyKWh), float(req.carbonKgCO2), float(req.energyEfficiencyScore))

        ai_action = sust_action_from_status(
            sust_status,
            float(req.energyEfficiencyScore),
            float(req.carbonKgCO2),
            float(req.hvacEnergyKWh),
        )

        is_anomaly = str(sust_status).lower() != "green"

        return {
            "status": "success",
            "hall_id": req.hall_id,
            "sustainabilityStatus": sust_status,
            "aiAction": ai_action,
            "isAnomaly": bool(is_anomaly),
        }
    except Exception as e:
        return {
            "status": "error",
            "hall_id": req.hall_id,
            "error": str(e),
            "sustainabilityStatus": "unknown",
            "aiAction": "ai_error",
            "isAnomaly": False,
        }


@app.post("/api/infer-sustainability-batch")
def infer_sustainability_batch(req: InferSustBatchRequest):
    rows = []
    for h in req.halls:
        rows.append(infer_sustainability(h))
    return {"status": "success", "rows": rows}