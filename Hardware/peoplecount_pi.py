"""
Handles camera setup, frame capture, and people detection using YOLO on the Raspberry Pi.

This file initializes the Pi camera, captures frames, and runs person detection
using a lightweight YOLO model. It applies basic smoothing to reduce jumpy count
changes and returns both the raw count and smoothed count with an annotated frame.
"""

import cv2
import time
from collections import deque
from ultralytics import YOLO
from picamera2 import Picamera2

model = YOLO("yolov8n.pt")

recent_counts = deque(maxlen=6)

CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
DETECT_WIDTH = 320
CONF_THRESHOLD = 0.5
MIN_BOX_AREA = 500


def init_camera():
    picam2 = Picamera2()
    config = picam2.create_preview_configuration(
        main={"size": (CAMERA_WIDTH, CAMERA_HEIGHT), "format": "RGB888"}
    )
    picam2.configure(config)
    picam2.start()
    time.sleep(2)
    return picam2


def capture_frame(picam2):
    frame = picam2.capture_array()
    if frame is None:
        return None
    return frame


def detect_people(frame):
    """
    Runs YOLO on a resized frame, draws boxes on the original frame,
    and returns:
      smoothed_count, raw_count, annotated_frame
    """
    if frame is None:
        return None, None, None

    display_frame = frame.copy()
    orig_h, orig_w = frame.shape[:2]

    scale = DETECT_WIDTH / orig_w
    detect_w = DETECT_WIDTH
    detect_h = int(orig_h * scale)

    detect_frame = cv2.resize(frame, (detect_w, detect_h))

    results = model(
        detect_frame,
        classes=[0],
        conf=CONF_THRESHOLD,
        imgsz=320,
        verbose=False
    )

    raw_count = 0

    if results and results[0].boxes is not None:
        boxes = results[0].boxes

        for box in boxes:
            conf = float(box.conf[0].item()) if box.conf is not None else 0.0
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

            box_w = x2 - x1
            box_h = y2 - y1
            box_area = box_w * box_h

            if box_area < MIN_BOX_AREA:
                continue

            raw_count += 1

            x1 = int(x1 / scale)
            y1 = int(y1 / scale)
            x2 = int(x2 / scale)
            y2 = int(y2 / scale)

            cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            label = f"Person {conf:.2f}"
            cv2.putText(
                display_frame,
                label,
                (x1, max(y1 - 10, 20)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (0, 255, 0),
                2
            )

    recent_counts.append(raw_count)
    smoothed_count = round(sum(recent_counts) / len(recent_counts)) if recent_counts else 0

    cv2.putText(
        display_frame,
        f"People in frame: {smoothed_count}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        (0, 0, 255),
        2
    )

    cv2.putText(
        display_frame,
        f"Raw count: {raw_count}",
        (20, 75),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255, 0, 0),
        2
    )

    return smoothed_count, raw_count, display_frame