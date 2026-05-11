"""
Handles creation of the local CSV file used to store hall monitoring data.

This file checks whether the CSV file already exists and, if needed, creates it
with the required column headers for timestamps, hall details, device IDs,
people counts, temperature, and humidity readings.
"""

import csv
import os

CSV_FILE = "hall_data.csv"


def ensure_csv_exists():
    if not os.path.exists(CSV_FILE):
        with open(CSV_FILE, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "timestamp",
                "hallId",
                "hallName",
                "zoneId",
                "edgeId",
                "cameraDeviceId",
                "envDeviceId",
                "peopleCount",
                "temperatureC",
                "humidityPct"
            ])