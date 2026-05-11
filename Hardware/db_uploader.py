"""
Handles uploading processed hall analytics data to the interval_metrics table.

This file builds a complete analytics record from basic hall inputs such as
timestamp, people count, temperature, and humidity. It calculates occupancy,
comfort, congestion, energy, carbon, and sustainability values, then inserts
the final result into the PostgreSQL analytics database.
"""

import psycopg2
from datetime import datetime
import json
import math
DB_HOST = "34.18.41.72"
DB_PORT = 5432
DB_NAME = "sentina_analytics"
DB_USER = "sentina_app"
DB_PASSWORD = "Sentina.123"

# Fixed hall metadata
HALL_CAPACITY = 4
THRESHOLD = 3
VENUE_ROLE = "testHall"
NODE_ID = "EDGEHT01"
X_COORD = 10.0
Y_COORD = 10.0


def get_connection():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )


def estimate_outdoor_temp_c(dt):
    """
    Simple realistic UAE-style outdoor temperature estimate
    when live internet weather is not available.
    """
    monthly_base = {
        1: 22.0, 2: 23.0, 3: 26.0, 4: 31.0,
        5: 35.0, 6: 38.0, 7: 40.0, 8: 40.0,
        9: 37.0, 10: 33.0, 11: 28.0, 12: 24.0
    }

    base = monthly_base.get(dt.month, 30.0)

    hour = dt.hour + dt.minute / 60.0

    # Warmest around mid-afternoon, coolest near early morning
    daily_wave = 4.0 * math.sin(((hour - 8) / 24.0) * 2.0 * math.pi)

    estimated = base + daily_wave
    return round(estimated, 1)


def get_crowd_density_class(occupancy):
    if occupancy <= 2:
        return "low"
    elif occupancy == 3:
        return "medium"
    else:
        return "high"


def get_temp_comfort_score(indoor_temp_c):
    # Ideal indoor temp around 24°C
    score = 100.0 - (abs(indoor_temp_c - 24.0) * 8.0)
    return round(max(0.0, min(100.0, score)), 3)


def get_humidity_comfort_score(humidity_pct):
    # Ideal humidity around 50%
    score = 100.0 - (abs(humidity_pct - 50.0) * 2.0)
    return round(max(0.0, min(100.0, score)), 3)


def get_crowd_comfort_penalty(current_occupancy):
    # Small hall, so crowding matters quickly
    penalty = current_occupancy * 10.0
    return round(min(40.0, penalty), 3)


def get_comfort_index(temp_score, humidity_score, crowd_penalty):
    comfort = ((temp_score + humidity_score) / 2.0) - (crowd_penalty * 0.5)
    return round(max(0.0, min(100.0, comfort)), 3)


def get_comfort_status(comfort_index):
    return "acceptable" if comfort_index >= 60.0 else "uncomfortable"


def get_hvac_energy_kwh(current_occupancy, indoor_temp_c, outdoor_temp_c, humidity_pct):
    # Simple demo-friendly estimate
    base = 0.8
    occupancy_load = current_occupancy * 0.25
    temp_load = abs(indoor_temp_c - 24.0) * 0.35
    outdoor_load = max(0.0, outdoor_temp_c - indoor_temp_c) * 0.08
    humidity_load = max(0.0, humidity_pct - 50.0) * 0.05

    energy = base + occupancy_load + temp_load + outdoor_load + humidity_load
    return round(energy, 3)


def get_carbon_kg_co2(hvac_energy_kwh):
    # Simple factor for demo
    carbon = hvac_energy_kwh * 0.42
    return round(carbon, 3)


def get_energy_efficiency_score(hvac_energy_kwh, current_occupancy):
    score = 100.0 - (hvac_energy_kwh * 6.0) - (max(0, current_occupancy - THRESHOLD) * 8.0)
    return round(max(0.0, min(100.0, score)), 3)


def get_sustainability_status(score):
    if score >= 80.0:
        return "green"
    elif score >= 60.0:
        return "amber"
    else:
        return "red"


def get_flow_congestion_index(current_occupancy):
    value = current_occupancy / HALL_CAPACITY
    return round(value, 3)


def get_queue_length_class(is_queue):
    return "short" if is_queue else "0"


def get_recommended_action(is_overcrowded, comfort_status):
    if is_overcrowded:
        return "limit entry"
    if comfort_status == "uncomfortable":
        return "check hvac"
    return "none"


def upload_interval_metrics(timestamp_str, zone_id, hall_id, hall_name, people_count, temperature, humidity):
    conn = None
    cur = None

    try:
        ts = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")

        current_occupancy = int(people_count) if people_count is not None else 0
        indoor_temp_c = float(temperature) if temperature is not None else 24.0
        humidity_pct = float(humidity) if humidity is not None else 50.0

        day_of_week = ts.strftime("%A")
        is_holiday = False
        is_weekend = day_of_week in ["Saturday", "Sunday"]

        event_id = None
        is_event = False

        hall_capacity = HALL_CAPACITY
        threshold = THRESHOLD

        is_overcrowded = current_occupancy >= 5
        occupancy_ratio = round(current_occupancy / hall_capacity, 3)

        crowd_density_class = get_crowd_density_class(current_occupancy)

        inflow_count = None
        outflow_count = None
        flow_congestion_index = get_flow_congestion_index(current_occupancy)

        is_queue = current_occupancy >= threshold
        queue_length_class = get_queue_length_class(is_queue)

        outdoor_temp_c = estimate_outdoor_temp_c(ts)

        temp_comfort_score = get_temp_comfort_score(indoor_temp_c)
        humidity_comfort_score = get_humidity_comfort_score(humidity_pct)
        crowd_comfort_penalty = get_crowd_comfort_penalty(current_occupancy)
        comfort_index = get_comfort_index(
            temp_comfort_score,
            humidity_comfort_score,
            crowd_comfort_penalty
        )
        comfort_status = get_comfort_status(comfort_index)

        hvac_energy_kwh = get_hvac_energy_kwh(
            current_occupancy,
            indoor_temp_c,
            outdoor_temp_c,
            humidity_pct
        )
        carbon_kg_co2 = get_carbon_kg_co2(hvac_energy_kwh)
        energy_efficiency_score = get_energy_efficiency_score(
            hvac_energy_kwh,
            current_occupancy
        )
        sustainability_status = get_sustainability_status(energy_efficiency_score)

        recommended_action = get_recommended_action(is_overcrowded, comfort_status)

        hour_of_day = ts.hour
        day_of_year = int(ts.strftime("%j"))
        density_score = round(occupancy_ratio * 100.0, 3)
        engagement_truth = None

        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO interval_metrics (
                ts,
                day_of_week,
                is_holiday,
                zone_id,
                hall_id,
                hall_name,
                event_id,
                is_event,
                hall_capacity,
                current_occupancy,
                threshold,
                is_overcrowded,
                occupancy_ratio,
                crowd_density_class,
                inflow_count,
                outflow_count,
                flow_congestion_index,
                is_queue,
                queue_length_class,
                recommended_action,
                hour_of_day,
                day_of_year,
                outdoor_temp_c,
                humidity_pct,
                indoor_temp_c,
                temp_comfort_score,
                humidity_comfort_score,
                crowd_comfort_penalty,
                comfort_index,
                comfort_status,
                hvac_energy_kwh,
                carbon_kg_co2,
                energy_efficiency_score,
                sustainability_status,
                venue_role,
                x_coord,
                y_coord,
                node_id,
                density_score,
                is_weekend,
                engagement_truth
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            """,
            (
                ts,
                day_of_week,
                is_holiday,
                zone_id,
                hall_id,
                hall_name,
                event_id,
                is_event,
                hall_capacity,
                current_occupancy,
                threshold,
                is_overcrowded,
                occupancy_ratio,
                crowd_density_class,
                inflow_count,
                outflow_count,
                flow_congestion_index,
                is_queue,
                queue_length_class,
                recommended_action,
                hour_of_day,
                day_of_year,
                outdoor_temp_c,
                humidity_pct,
                indoor_temp_c,
                temp_comfort_score,
                humidity_comfort_score,
                crowd_comfort_penalty,
                comfort_index,
                comfort_status,
                hvac_energy_kwh,
                carbon_kg_co2,
                energy_efficiency_score,
                sustainability_status,
                VENUE_ROLE,
                X_COORD,
                Y_COORD,
                NODE_ID,
                density_score,
                is_weekend,
                engagement_truth
            )
        )

        conn.commit()
        return True, "Upload successful"

    except Exception as e:
        if conn:
            conn.rollback()
        return False, f"Upload failed: {e}"

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()