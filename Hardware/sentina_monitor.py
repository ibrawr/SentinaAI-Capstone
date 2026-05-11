"""
Runs the Raspberry Pi hall monitoring workflow for people counting, environmental
reading, CSV logging, and database upload.

This file coordinates the camera feed, YOLO-based people detection, DHT22 sensor
reading, local CSV storage, and analytics database upload for the test hall. It
also displays the live monitoring window with hall, count, temperature, and
humidity information.
"""

import csv
import time
from datetime import datetime

import cv2

from peoplecount_pi import init_camera, capture_frame, detect_people
from dht_reader import get_dht_reading
from init_csv import ensure_csv_exists
from db_uploader import upload_interval_metrics

HALL_ID = "HT01"
HALL_NAME = "Test Hall"
ZONE_ID = "zoneT"
EDGE_ID = "EDGEHT01"
CAMERA_DEVICE_ID = "CAMHT01"
ENV_DEVICE_ID = "ENVHT01"

SAVE_INTERVAL_SECONDS = 900
SKIP_FRAMES = 3

CSV_FILE = "hall_data.csv"


def save_row(people_count, temperature, humidity):
    timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with open(CSV_FILE, "a", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            timestamp_str,
            HALL_ID,
            HALL_NAME,
            ZONE_ID,
            EDGE_ID,
            CAMERA_DEVICE_ID,
            ENV_DEVICE_ID,
            people_count if people_count is not None else "",
            temperature if temperature is not None else "",
            humidity if humidity is not None else ""
        ])

    return timestamp_str


def main():
    ensure_csv_exists()
    print("CSV ready")

    picam2 = init_camera()
    print("Camera initialized")

    cv2.namedWindow("Sentina Test Hall Monitor", cv2.WINDOW_NORMAL)

    print("Running Sentina Test Hall monitor.")
    print("Press 'q' in the camera window to quit.")

    last_save_time = time.time() - SAVE_INTERVAL_SECONDS
    frame_counter = 0

    latest_temp = None
    latest_humidity = None

    last_people_count = 0
    last_raw_count = 0
    last_annotated_frame = None

    try:
        while True:
            frame = capture_frame(picam2)

            if frame is None:
                print("Error: Could not read frame.")
                break

            frame_counter += 1

            if frame_counter % SKIP_FRAMES == 0 or last_annotated_frame is None:
                people_count, raw_count, annotated_frame = detect_people(frame)

                if annotated_frame is not None:
                    last_people_count = people_count if people_count is not None else last_people_count
                    last_raw_count = raw_count if raw_count is not None else last_raw_count
                    last_annotated_frame = annotated_frame
            else:
                last_annotated_frame = frame.copy()

                cv2.putText(
                    last_annotated_frame,
                    f"People in frame: {last_people_count}",
                    (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.9,
                    (0, 0, 255),
                    2
                )

                cv2.putText(
                    last_annotated_frame,
                    f"Raw count: {last_raw_count}",
                    (20, 75),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (255, 0, 0),
                    2
                )

            temperature, humidity = get_dht_reading()

            if temperature is not None:
                latest_temp = temperature
            if humidity is not None:
                latest_humidity = humidity

            cv2.putText(
                last_annotated_frame,
                f"Hall: {HALL_NAME}",
                (20, 115),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 255),
                2
            )

            cv2.putText(
                last_annotated_frame,
                f"Temp: {latest_temp if latest_temp is not None else 'N/A'} C",
                (20, 150),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 0, 0),
                2
            )

            cv2.putText(
                last_annotated_frame,
                f"Humidity: {latest_humidity if latest_humidity is not None else 'N/A'} %",
                (20, 185),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 0, 0),
                2
            )

            cv2.putText(
                last_annotated_frame,
                f"YOLO every {SKIP_FRAMES} frames",
                (20, 220),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (200, 200, 0),
                2
            )

            now = time.time()
            if now - last_save_time >= SAVE_INTERVAL_SECONDS:
                timestamp_str = save_row(last_people_count, latest_temp, latest_humidity)

                print(
                    f"Saved row | People={last_people_count}, Temp={latest_temp}, Humidity={latest_humidity}"
                )

                success, msg = upload_interval_metrics(
                    timestamp_str=timestamp_str,
                    zone_id=ZONE_ID,
                    hall_id=HALL_ID,
                    hall_name=HALL_NAME,
                    people_count=last_people_count,
                    temperature=latest_temp,
                    humidity=latest_humidity
                )

                if success:
                    print("DB upload success")
                else:
                    print(msg)

                last_save_time = now

            cv2.imshow("Sentina Test Hall Monitor", last_annotated_frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                print("Quitting...")
                break

    except KeyboardInterrupt:
        print("\nStopped by keyboard interrupt.")

    finally:
        try:
            cv2.destroyAllWindows()
        except Exception:
            pass

        try:
            picam2.stop()
        except Exception:
            pass


if __name__ == "__main__":
    main()