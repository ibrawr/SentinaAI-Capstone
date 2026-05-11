from dotenv import load_dotenv
load_dotenv()

import os
import io
import json
from typing import Dict, List, Optional, Tuple, cast

import numpy as np
import pandas as pd
import torch
import torch.nn as nn

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse

from openpyxl import Workbook
from openpyxl.utils.dataframe import dataframe_to_rows
from openpyxl.worksheet.worksheet import Worksheet

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

"""
Exhibitor analytics API for loading model artifacts, resolving exhibitor booth context,
running catchment and competitive-density inference, and exporting XLSX reports.
"""

CONFIG = None
SCALER = None
MODEL = None
DF_RAW = None
HALLNAME_TO_ROOM = None
ROOM_TO_HALL = None
A_NORM = None
A_NORM_T = None
ROOMS_DF = None

CORE_ENGINE: Optional[Engine] = None
ANALYTICS_ENGINE: Optional[Engine] = None


def _bool_env(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "y")


CORE_DATABASE_URL = os.getenv("CORE_DATABASE_URL", "")
ANALYTICS_DATABASE_URL = os.getenv("ANALYTICS_DATABASE_URL", "")

CORE_PGSSL = _bool_env("CORE_PGSSL", "false")
ANALYTICS_PGSSL = _bool_env("ANALYTICS_PGSSL", "false")


def _mk_engine(url: str, use_ssl: bool) -> Engine:
    if not url:
        raise RuntimeError("Missing DB URL env var.")
    connect_args = {"sslmode": "require"} if use_ssl else {}
    return create_engine(url, pool_pre_ping=True, connect_args=connect_args)


try:
    import joblib
    _HAS_JOBLIB = True
except Exception:
    _HAS_JOBLIB = False


def require_loaded():
    global CONFIG, MODEL, DF_RAW, HALLNAME_TO_ROOM, ROOM_TO_HALL, A_NORM_T, A_NORM
    if (
        CONFIG is None or MODEL is None or DF_RAW is None or
        HALLNAME_TO_ROOM is None or ROOM_TO_HALL is None or
        A_NORM_T is None or A_NORM is None
    ):
        raise HTTPException(status_code=500, detail="Server not initialized (artifacts not loaded).")


def _cfg() -> dict:
    require_loaded()
    return cast(dict, CONFIG)


def _model() -> nn.Module:
    require_loaded()
    return cast(nn.Module, MODEL)


def _df() -> pd.DataFrame:
    require_loaded()
    return cast(pd.DataFrame, DF_RAW)


def _hall_to_room() -> Dict[str, str]:
    require_loaded()
    return cast(Dict[str, str], HALLNAME_TO_ROOM)


def _room_to_hall() -> Dict[str, str]:
    require_loaded()
    return cast(Dict[str, str], ROOM_TO_HALL)


def _a_norm() -> np.ndarray:
    require_loaded()
    return cast(np.ndarray, A_NORM)


def _a_norm_t() -> torch.Tensor:
    require_loaded()
    return cast(torch.Tensor, A_NORM_T)


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

ART_DIR = os.path.join(ROOT_DIR, "artifacts_st")
DATA_DIR = os.path.join(ROOT_DIR, "data")
GRAPH_DIR = os.path.join(ROOT_DIR, "graph")

MODEL_PATH = os.path.join(ART_DIR, "model.pt")
CFG_PATH = os.path.join(ART_DIR, "config.json")
SCALER_PATH = os.path.join(ART_DIR, "scaler.pkl")

DATA_CSV = os.path.join(DATA_DIR, "syn_zone_metrics_15mins.csv")
NAV_JSON = os.path.join(GRAPH_DIR, "edgeweights.json")

BASE_BUCKET_MINUTES = 15
ALLOWED_INTERVALS = [15, 30, 60, 120]
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

EXHIBITOR_PROFILE: Dict[str, Dict[str, str]] = {
    "EXH_1": {"name": "Exhibitor 1", "boothId": "B001", "hallName": "SouthHall1"},
}


class GCNLayer(nn.Module):
    def __init__(self, in_dim, out_dim):
        super().__init__()
        self.lin = nn.Linear(in_dim, out_dim)

    def forward(self, X, A_norm):
        AX = torch.matmul(A_norm, X)
        return torch.relu(self.lin(AX))


class STGCN_LSTM(nn.Module):
    def __init__(self, in_feat, gcn_hidden=32, lstm_hidden=32, gcn_layers=2, dropout=0.1):
        super().__init__()
        self.gcn_layers = nn.ModuleList()
        dims = [in_feat] + [gcn_hidden] * gcn_layers
        for i in range(gcn_layers):
            self.gcn_layers.append(GCNLayer(dims[i], dims[i+1]))

        self.dropout = nn.Dropout(dropout)

        self.lstm = nn.LSTM(
            input_size=gcn_hidden,
            hidden_size=lstm_hidden,
            num_layers=1,
            batch_first=True
        )
        self.out = nn.Linear(lstm_hidden, 1)

    def forward(self, X_seq, A_norm):
        B, K, N, F = X_seq.shape

        gcn_outs = []
        for t in range(K):
            Xt = X_seq[:, t, :, :]
            H = Xt
            for layer in self.gcn_layers:
                H = layer(H, A_norm)
                H = self.dropout(H)
            gcn_outs.append(H)

        H_seq = torch.stack(gcn_outs, dim=1)
        H_seq = H_seq.permute(0, 2, 1, 3).contiguous()
        H_seq = H_seq.view(B * N, K, -1)

        lstm_out, _ = self.lstm(H_seq)
        last = lstm_out[:, -1, :]
        y_hat = self.out(last).view(B, N)
        return torch.sigmoid(y_hat)


app = FastAPI(title="Exhibitor AI (Dynamic Inference)", version="1.0")


def _require_file(path: str, label: str):
    if not os.path.exists(path):
        raise RuntimeError(f"Missing {label}: {path}")


def load_config():
    _require_file(CFG_PATH, "config.json")
    with open(CFG_PATH, "r") as f:
        return json.load(f)


def load_scaler():
    if os.path.exists(SCALER_PATH) and _HAS_JOBLIB:
        return joblib.load(SCALER_PATH)
    return None


def norm_hall(s: str) -> str:
    return str(s).strip()


def _compute_is_weekend(df: pd.DataFrame) -> pd.DataFrame:
    if "day_of_week" not in df.columns:
        df["is_weekend"] = 0
        return df

    dow = df["day_of_week"]
    dow_num = pd.to_numeric(dow, errors="coerce")

    if dow_num.notna().any():
        if float(dow_num.min()) == 0.0:
            df["is_weekend"] = dow_num.isin([5, 6]).astype(int)
        else:
            df["is_weekend"] = dow_num.isin([6, 7]).astype(int)
    else:
        df["is_weekend"] = dow.astype(str).str.lower().isin(
            ["sat", "saturday", "sun", "sunday"]
        ).astype(int)

    return df


def load_raw_data() -> pd.DataFrame:
    """
    Loads interval metrics from sentina_analytics.interval_metrics.
    Falls back to CSV if ANALYTICS_ENGINE is None.
    """
    if ANALYTICS_ENGINE is None:
        _require_file(DATA_CSV, "syn_zone_metrics_15mins.csv")
        df = pd.read_csv(DATA_CSV)
        if "bucket_ts" not in df.columns or "eventId" not in df.columns or "hallName" not in df.columns:
            raise RuntimeError("CSV must contain bucket_ts, eventId, hallName.")
        df["bucket_ts"] = pd.to_datetime(df["bucket_ts"], errors="coerce", utc=True)
        df = df.dropna(subset=["bucket_ts"]).sort_values(["eventId", "hallName", "bucket_ts"])
        return df

    q = """
        SELECT
          ts AS bucket_ts,
          event_id AS "eventId",
          hall_name AS "hallName",
          occupancy_ratio AS "occupancyRatio",
          inflow_count AS "inflowCount",
          outflow_count AS "outflowCount",
          flow_congestion_index AS "flowCongestionIndex",
          is_event AS "isEvent",
          hour_of_day AS "hour",
          day_of_week
        FROM interval_metrics
        ORDER BY event_id, hall_name, ts;
    """
    df = pd.read_sql(q, ANALYTICS_ENGINE)

    df["bucket_ts"] = pd.to_datetime(df["bucket_ts"], errors="coerce", utc=True)
    df = df.dropna(subset=["bucket_ts"])

    df["hallName"] = df["hallName"].astype(str).map(norm_hall)
    df = _compute_is_weekend(df)

    df = df.sort_values(["eventId", "hallName", "bucket_ts"])
    return df


def load_navmesh_and_build_mappings():
    _require_file(NAV_JSON, "edgeweights.json")
    with open(NAV_JSON, "r") as f:
        nav = json.load(f)

    nodes = nav.get("nodes", [])
    edges = nav.get("edges", [])
    nodes_df = pd.DataFrame(nodes)

    if nodes_df.empty or "type" not in nodes_df.columns:
        raise RuntimeError("edgeweights.json nodes must include 'type'.")

    rooms_df = nodes_df[nodes_df["type"] == "room"].copy()
    if rooms_df.empty:
        raise RuntimeError("No rooms found in edgeweights.json (type=='room').")

    if "name" not in rooms_df.columns or "id" not in rooms_df.columns:
        raise RuntimeError("rooms_df must include columns 'name' and 'id'.")

    hallname_to_room = dict(zip(rooms_df["name"], rooms_df["id"]))
    room_to_hall = {v: k for k, v in hallname_to_room.items()}

    room_ids = rooms_df["id"].tolist()
    room_id_to_idx = {rid: i for i, rid in enumerate(room_ids)}
    N = len(room_ids)

    room_to_corridors = {rid: set() for rid in room_ids}
    corridor_to_rooms: Dict[str, set] = {}

    for e in edges:
        u, v = e.get("from"), e.get("to")
        if not isinstance(u, str) or not isinstance(v, str):
            continue
        if u.startswith("room_") and v.startswith("corridor_") and u in room_to_corridors:
            room_to_corridors[u].add(v)
            corridor_to_rooms.setdefault(v, set()).add(u)
        if u.startswith("corridor_") and v.startswith("room_") and v in room_to_corridors:
            room_to_corridors[v].add(u)
            corridor_to_rooms.setdefault(u, set()).add(v)

    A = np.zeros((N, N), dtype=np.float32)

    for _, linked_rooms in corridor_to_rooms.items():
        linked_rooms = list(linked_rooms)
        for i in range(len(linked_rooms)):
            for j in range(i + 1, len(linked_rooms)):
                r1, r2 = linked_rooms[i], linked_rooms[j]
                if r1 in room_id_to_idx and r2 in room_id_to_idx:
                    a, b = room_id_to_idx[r1], room_id_to_idx[r2]
                    A[a, b] = 1.0
                    A[b, a] = 1.0

    A = A + np.eye(N, dtype=np.float32)

    deg = A.sum(axis=1)
    D_inv_sqrt = np.diag(1.0 / np.sqrt(deg + 1e-6))
    A_norm = D_inv_sqrt @ A @ D_inv_sqrt

    return rooms_df, hallname_to_room, room_to_hall, A_norm, room_ids


def build_model_from_artifact(config: dict) -> nn.Module:
    _require_file(MODEL_PATH, "model.pt")
    ckpt = torch.load(MODEL_PATH, map_location="cpu")
    state = ckpt.get("model_state_dict", None)
    if state is None:
        raise RuntimeError("model.pt missing 'model_state_dict'.")

    in_feat = len(config["feature_cols"])
    model = STGCN_LSTM(in_feat=in_feat)
    model.load_state_dict(state, strict=True)
    model.to(DEVICE)
    model.eval()
    return model


def resolve_exhibitor(exhibitor_id: str, event_id: Optional[str] = None) -> Dict[str, str]:
    """
    Returns: {name, boothId, hallName, eventId}
    Uses sentina_core:
      booth_assignments, booths, halls, exhibitors
    """
    if CORE_ENGINE is None:
        prof = EXHIBITOR_PROFILE.get(exhibitor_id)
        if not prof:
            raise HTTPException(status_code=404, detail="Unknown exhibitorId (demo mapping missing).")
        return {"name": prof["name"], "boothId": prof["boothId"], "hallName": prof["hallName"], "eventId": ""}

    if event_id:
        q = text("""
            SELECT
              ba.event_id,
              ba.booth_id,
              e.exhibitor_name,
              h.hall_name
            FROM booth_assignments ba
            JOIN booths b
              ON b.booth_id = ba.booth_id AND b.event_id = ba.event_id
            JOIN halls h
              ON h.hall_id = b.hall_id
            JOIN exhibitors e
              ON e.exhibitor_id = ba.exhibitor_id
            WHERE ba.exhibitor_id = :exhibitor_id
              AND ba.event_id = :event_id
              AND ba.status = 'active'
            LIMIT 1;
        """)
        params = {"exhibitor_id": exhibitor_id, "event_id": event_id}
    else:
        q = text("""
            SELECT
              ba.event_id,
              ba.booth_id,
              e.exhibitor_name,
              h.hall_name
            FROM booth_assignments ba
            JOIN booths b
              ON b.booth_id = ba.booth_id AND b.event_id = ba.event_id
            JOIN halls h
              ON h.hall_id = b.hall_id
            JOIN exhibitors e
              ON e.exhibitor_id = ba.exhibitor_id
            WHERE ba.exhibitor_id = :exhibitor_id
              AND ba.status = 'active'
            ORDER BY ba.assigned_at DESC
            LIMIT 1;
        """)
        params = {"exhibitor_id": exhibitor_id}

    with CORE_ENGINE.connect() as conn:
        row = conn.execute(q, params).mappings().fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="No active booth assignment found for exhibitor.")

    return {
        "name": str(row["exhibitor_name"]),
        "boothId": str(row["booth_id"]),
        "hallName": norm_hall(row["hall_name"]),
        "eventId": str(row["event_id"]),
    }


def parse_time(s: Optional[str]) -> Optional[pd.Timestamp]:
    if s is None:
        return None
    s = str(s).strip()
    if s == "":
        return None
    try:
        return pd.to_datetime(s, utc=True)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {s}")


def add_engagement_lag1(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "engagement_truth" in out.columns:
        out["engagement_lag1"] = (
            out.groupby(["eventId", "hallName"])["engagement_truth"]
            .shift(1)
            .fillna(0.0)
        )
    else:
        out["engagement_lag1"] = 0.0
    return out


def build_room_15m_table(df: pd.DataFrame, feature_cols: List[str]) -> pd.DataFrame:
    require_loaded()
    work = df.copy()
    work = add_engagement_lag1(work)

    work["hallName"] = work["hallName"].astype(str).map(norm_hall)

    work["room_id"] = work["hallName"].map(HALLNAME_TO_ROOM)
    work = work.dropna(subset=["room_id"])

    for c in feature_cols:
        if c in work.columns:
            work[c] = pd.to_numeric(work[c], errors="coerce").fillna(0.0)
        else:
            raise HTTPException(status_code=500, detail=f"Feature '{c}' missing from interval_metrics.")

    agg_map = {}
    for c in feature_cols:
        if "count" in c.lower():
            agg_map[c] = "sum"
        elif c in ["isEvent", "is_weekend"]:
            agg_map[c] = "max"
        else:
            agg_map[c] = "mean"

    room_15m = (
        work.groupby(["eventId", "bucket_ts", "room_id"], dropna=False)
        .agg(agg_map)
        .reset_index()
        .sort_values(["eventId", "bucket_ts", "room_id"])
    )
    return room_15m


def build_event_matrices(event_df: pd.DataFrame, room_ids_order: List[str], feature_cols: List[str]) -> Tuple[List[pd.Timestamp], Dict[pd.Timestamp, np.ndarray]]:
    event_df = event_df.sort_values(["bucket_ts", "room_id"])
    times = sorted(event_df["bucket_ts"].unique().tolist())

    room_to_idx = {rid: i for i, rid in enumerate(room_ids_order)}
    N = len(room_ids_order)
    F = len(feature_cols)

    X_by_time: Dict[pd.Timestamp, np.ndarray] = {}
    for t in times:
        gt = event_df[event_df["bucket_ts"] == t]
        X = np.zeros((N, F), dtype=np.float32)

        for _, r in gt.iterrows():
            rid = r["room_id"]
            idx = room_to_idx.get(rid, None)
            if idx is None:
                continue
            X[idx, :] = r[feature_cols].astype(np.float32).values

        X_by_time[t] = X

    return times, X_by_time


def make_sequences(times: List[pd.Timestamp], X_by_time: Dict[pd.Timestamp, np.ndarray], K: int) -> Tuple[np.ndarray, List[pd.Timestamp]]:
    require_loaded()
    if len(times) <= K:
        return np.zeros((0, K, 0, 0), dtype=np.float32), []

    seqs = []
    targets = []
    for i in range(K, len(times)):
        past = times[i - K: i]
        target_t = times[i]
        X_seq = np.stack([X_by_time[t] for t in past], axis=0)
        seqs.append(X_seq)
        targets.append(target_t)

    X_seqs = np.stack(seqs, axis=0).astype(np.float32)
    return X_seqs, targets


def enable_dropout_only(m: nn.Module):
    for module in m.modules():
        if isinstance(module, nn.Dropout):
            module.train()


@torch.no_grad()
def predict_with_mc_dropout(X: torch.Tensor, mc_passes: int = 15) -> Tuple[np.ndarray, np.ndarray]:
    require_loaded()
    MODEL.eval()
    enable_dropout_only(MODEL)

    preds = []
    for _ in range(mc_passes):
        y = MODEL(X, A_NORM_T)
        preds.append(y.detach().cpu().numpy())

    stack = np.stack(preds, axis=0)
    mean = stack.mean(axis=0)
    std = stack.std(axis=0)
    return mean, std


def aggregate_interval_matrix(y_times: List[pd.Timestamp], mat: np.ndarray, interval_minutes: int, agg: str = "mean") -> Tuple[List[str], np.ndarray]:
    require_loaded()

    if interval_minutes not in ALLOWED_INTERVALS:
        raise HTTPException(status_code=400, detail=f"intervalMinutes must be one of {ALLOWED_INTERVALS}.")

    if interval_minutes == BASE_BUCKET_MINUTES:
        y_labels = [pd.to_datetime(t).strftime("%Y-%m-%d %H:%M") for t in y_times]
        return y_labels, mat

    df = pd.DataFrame(mat)
    df["bucket_ts"] = pd.to_datetime(y_times, utc=True)
    df["bucket_group"] = df["bucket_ts"].dt.floor(f"{interval_minutes}min")

    val_cols = [c for c in df.columns if c not in ("bucket_ts", "bucket_group")]
    if agg == "mean":
        g = df.groupby("bucket_group")[val_cols].mean()
    elif agg == "max":
        g = df.groupby("bucket_group")[val_cols].max()
    else:
        raise HTTPException(status_code=400, detail="agg must be mean or max.")

    y_labels = [t.strftime("%Y-%m-%d %H:%M") for t in g.index.to_list()]
    out = g.values.astype(np.float32)
    return y_labels, out


def get_catchment_room_ids(center_room_id: str, k: int = 6) -> List[str]:
    require_loaded()
    room_ids = CONFIG["room_ids"]
    rid_to_idx = {rid: i for i, rid in enumerate(room_ids)}
    if center_room_id not in rid_to_idx:
        return [center_room_id]

    c = rid_to_idx[center_room_id]
    w = A_NORM[c].copy()
    order = np.argsort(-w)
    neighbors = [room_ids[i] for i in order if i != c][: max(0, k - 1)]
    return [center_room_id] + neighbors


def startup():
    global CONFIG, SCALER, MODEL, A_NORM, A_NORM_T, ROOMS_DF, HALLNAME_TO_ROOM, ROOM_TO_HALL, DF_RAW
    global CORE_ENGINE, ANALYTICS_ENGINE

    if CORE_DATABASE_URL:
        CORE_ENGINE = _mk_engine(CORE_DATABASE_URL, CORE_PGSSL)
    if ANALYTICS_DATABASE_URL:
        ANALYTICS_ENGINE = _mk_engine(ANALYTICS_DATABASE_URL, ANALYTICS_PGSSL)

    CONFIG = load_config()

    DF_RAW = load_raw_data()
    rooms_df, hall_to_room, room_to_hall, a_norm, nav_room_ids = load_navmesh_and_build_mappings()

    hall_to_room = {norm_hall(k): v for k, v in hall_to_room.items()}
    room_to_hall = {v: norm_hall(k) for v, k in room_to_hall.items()}

    ROOMS_DF = rooms_df
    HALLNAME_TO_ROOM = hall_to_room
    ROOM_TO_HALL = room_to_hall
    A_NORM = a_norm

    cfg_room_ids = CONFIG["room_ids"]
    if set(cfg_room_ids) != set(nav_room_ids):
        raise RuntimeError("Mismatch between config room_ids and navmesh room ids. They must match.")

    nav_idx = {rid: i for i, rid in enumerate(nav_room_ids)}
    cfg_idx = [nav_idx[rid] for rid in cfg_room_ids]
    A_NORM = A_NORM[np.ix_(cfg_idx, cfg_idx)].astype(np.float32)
    A_NORM_T = torch.tensor(A_NORM, dtype=torch.float32, device=DEVICE)

    SCALER = load_scaler()

    MODEL = build_model_from_artifact(CONFIG)

    print(f"[startup] Loaded. DEVICE={DEVICE}, rooms={len(cfg_room_ids)}, features={len(CONFIG['feature_cols'])}, K={CONFIG['K']}")


@app.on_event("startup")
def _on_startup():
    startup()


@app.get("/health")
def health():
    require_loaded()
    return {
        "ok": True,
        "device": DEVICE,
        "rooms": CONFIG["num_rooms"],
        "features": CONFIG["feature_cols"],
        "K": CONFIG["K"],
        "allowedIntervals": ALLOWED_INTERVALS,
    }


@app.get("/api/exhibitor/{exhibitorId}/catchment/heatmap")
def catchment_heatmap(
    exhibitorId: str,
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    intervalMinutes: int = Query(30),
    agg: str = Query("mean", pattern="^(mean|max)$"),
    catchmentK: int = Query(6, ge=1, le=26),
    mcPasses: int = Query(15, ge=5, le=50),
):
    require_loaded()

    prof = resolve_exhibitor(exhibitorId)
    hall_name = norm_hall(prof["hallName"])
    event_id = prof["eventId"]

    from_ts = parse_time(from_)
    to_ts = parse_time(to)

    df_ev = DF_RAW[DF_RAW["eventId"].astype(str) == str(event_id)].copy()

    if from_ts is not None:
        df_ev = df_ev[df_ev["bucket_ts"] >= (from_ts - pd.Timedelta(minutes=CONFIG["K"] * BASE_BUCKET_MINUTES))]
    if to_ts is not None:
        df_ev = df_ev[df_ev["bucket_ts"] <= to_ts]

    if df_ev.empty:
        raise HTTPException(status_code=404, detail=f"No interval_metrics for eventId={event_id} in requested range.")

    feature_cols = CONFIG["feature_cols"]
    room_15m = build_room_15m_table(df_ev, feature_cols=feature_cols)

    times, X_by_time = build_event_matrices(
        room_15m, room_ids_order=CONFIG["room_ids"], feature_cols=feature_cols
    )

    K = int(CONFIG["K"])
    X_seqs_np, target_times = make_sequences(times, X_by_time, K=K)
    if len(target_times) == 0:
        raise HTTPException(status_code=404, detail="Not enough history to produce predictions (increase time range).")

    if SCALER is not None:
        T, Kk, N, F = X_seqs_np.shape
        flat = X_seqs_np.reshape(-1, F)
        flat_scaled = SCALER.transform(flat)
        X_seqs_np = flat_scaled.reshape(T, Kk, N, F).astype(np.float32)

    X_t = torch.tensor(X_seqs_np, dtype=torch.float32, device=DEVICE)

    mean, std = predict_with_mc_dropout(X_t, mc_passes=mcPasses)

    pred_times = pd.to_datetime(target_times, utc=True)
    keep = np.ones(len(pred_times), dtype=bool)
    if from_ts is not None:
        keep &= (pred_times >= from_ts)
    if to_ts is not None:
        keep &= (pred_times <= to_ts)

    mean = mean[keep]
    std = std[keep]
    pred_times = pred_times[keep].tolist()

    if len(pred_times) == 0:
        raise HTTPException(status_code=404, detail="No prediction timestamps inside requested from/to.")

    if hall_name not in HALLNAME_TO_ROOM:
        raise HTTPException(status_code=404, detail=f"hallName '{hall_name}' not found in navmesh mapping.")

    center_room_id = HALLNAME_TO_ROOM[hall_name]
    catchment_room_ids = get_catchment_room_ids(center_room_id, k=catchmentK)

    rid_to_idx = {rid: i for i, rid in enumerate(CONFIG["room_ids"])}
    cols = [rid_to_idx[rid] for rid in catchment_room_ids if rid in rid_to_idx]
    if not cols:
        raise HTTPException(status_code=404, detail="Catchment rooms not found in config room_ids order.")

    heat = mean[:, cols]
    heat_std = std[:, cols]

    yLabels, heat_agg = aggregate_interval_matrix(pred_times, heat, interval_minutes=intervalMinutes, agg=agg)
    _, std_agg = aggregate_interval_matrix(pred_times, heat_std, interval_minutes=intervalMinutes, agg="mean")

    xLabels = [ROOM_TO_HALL.get(rid, rid) for rid in catchment_room_ids if rid in rid_to_idx]

    avg_std = float(np.mean(std_agg))
    confidence = float(np.clip(1.0 - (avg_std / 0.20), 0.0, 1.0))

    return {
        "meta": {
            "exhibitorId": exhibitorId,
            "boothId": prof.get("boothId"),
            "hallName": hall_name,
            "eventId": event_id,
            "intervalMinutes": intervalMinutes,
            "catchmentK": catchmentK,
            "mcPasses": mcPasses,
            "aiConfidence": {
                "score": confidence,
                "avgStd": avg_std,
                "meaning": "Uncertainty-based confidence from MC Dropout (not an accuracy %)."
            }
        },
        "xLabels": xLabels,
        "yLabels": yLabels,
        "matrix": heat_agg.astype(float).tolist()
    }


@app.get("/api/exhibitor/{exhibitorId}/competition/density")
def competitive_density(
    exhibitorId: str,
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    intervalMinutes: int = Query(30),
    catchmentK: int = Query(6, ge=1, le=26),
    mcPasses: int = Query(15, ge=5, le=50),
):
    heat = catchment_heatmap(
        exhibitorId=exhibitorId,
        from_=from_,
        to=to,
        intervalMinutes=intervalMinutes,
        agg="mean",
        catchmentK=catchmentK,
        mcPasses=mcPasses,
    )

    prof = resolve_exhibitor(exhibitorId)
    hall_name = norm_hall(prof["hallName"])

    xLabels = heat["xLabels"]
    yLabels = heat["yLabels"]
    mat = np.array(heat["matrix"], dtype=np.float32)

    if hall_name in xLabels and len(xLabels) > 1:
        center_idx = xLabels.index(hall_name)
        neighbor_cols = [i for i in range(len(xLabels)) if i != center_idx]
    else:
        neighbor_cols = list(range(len(xLabels)))

    scores = mat[:, neighbor_cols].mean(axis=1) if neighbor_cols else mat.mean(axis=1)

    def label(v: float) -> str:
        if v < 0.45:
            return "Low"
        if v < 0.65:
            return "Medium"
        return "High"

    series = []
    for i, ts in enumerate(yLabels):
        v = float(scores[i])
        series.append({
            "bucket_ts": ts,
            "competitive_density_score": round(v, 6),
            "competitive_density_label": label(v)
        })

    return {
        "meta": heat["meta"] | {
            "definition": "Mean predicted engagement of catchment neighbors (excluding exhibitor hall) at each time bucket."
        },
        "series": series
    }


@app.get("/api/exhibitor/{exhibitorId}/report/download")
def download_report_xlsx(
    exhibitorId: str,
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    intervalMinutes: int = Query(30),
    catchmentK: int = Query(6, ge=1, le=26),
    mcPasses: int = Query(15, ge=5, le=50),
):
    heat = catchment_heatmap(
        exhibitorId=exhibitorId,
        from_=from_,
        to=to,
        intervalMinutes=intervalMinutes,
        agg="mean",
        catchmentK=catchmentK,
        mcPasses=mcPasses,
    )
    density = competitive_density(
        exhibitorId=exhibitorId,
        from_=from_,
        to=to,
        intervalMinutes=intervalMinutes,
        catchmentK=catchmentK,
        mcPasses=mcPasses,
    )

    df1 = pd.DataFrame(heat["matrix"], columns=heat["xLabels"])
    df1.insert(0, "bucket_ts", heat["yLabels"])
    df2 = pd.DataFrame(density["series"])

    wb = Workbook()
    ws1 = cast(Worksheet, wb.active)
    ws1.title = "Catchment_Zones"

    meta = heat["meta"]
    ws1.append(["exhibitorId", meta["exhibitorId"]])
    ws1.append(["boothId", meta.get("boothId", "")])
    ws1.append(["hallName", meta["hallName"]])
    ws1.append(["eventId", meta["eventId"]])
    ws1.append(["intervalMinutes", meta["intervalMinutes"]])
    ws1.append(["catchmentK", meta["catchmentK"]])
    ws1.append(["mcPasses", meta["mcPasses"]])
    ws1.append(["aiConfidenceScore", meta["aiConfidence"]["score"]])
    ws1.append(["aiAvgStd", meta["aiConfidence"]["avgStd"]])
    ws1.append([])

    for r in dataframe_to_rows(df1, index=False, header=True):
        ws1.append(r)

    ws2: Worksheet = wb.create_sheet("Competitive_Density")
    ws2.append(["definition", density["meta"]["definition"]])
    ws2.append([])

    for r in dataframe_to_rows(df2, index=False, header=True):
        ws2.append(r)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"{exhibitorId}_{meta['eventId']}_report.xlsx"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers
    )