from __future__ import annotations
import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Any, Optional, Set

@dataclass
class EventStore:
    events_by_id: Dict[str, Dict[str, Any]]
    assignments_by_hall: Dict[str, List[Dict[str, Any]]]
    halls_by_event: Dict[str, Set[str]]

    @staticmethod
    def _read_csv(path: Path) -> List[Dict[str, Any]]:
        with path.open("r", encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))

    @classmethod
    def load(cls, base_dir: Path) -> "EventStore":
        # base_dir should be convention_navmesh/data/events
        events_path = base_dir / "events.csv"
        assign_path = base_dir / "event_exhibitor_booth_assignments.csv"

        events_rows = cls._read_csv(events_path)
        assign_rows = cls._read_csv(assign_path)

        events_by_id = {r["eventId"]: r for r in events_rows}

        assignments_by_hall: Dict[str, List[Dict[str, Any]]] = {}
        halls_by_event: Dict[str, Set[str]] = {}

        for r in assign_rows:
            hall = (r.get("hallName") or "").strip()
            eid = (r.get("eventId") or "").strip()
            if not hall or not eid:
                continue

            assignments_by_hall.setdefault(hall, []).append(r)
            halls_by_event.setdefault(eid, set()).add(hall)

        return cls(events_by_id=events_by_id,
                   assignments_by_hall=assignments_by_hall,
                   halls_by_event=halls_by_event)

    def list_events(self) -> List[Dict[str, Any]]:
        return list(self.events_by_id.values())

    def events_for_hall(self, hall_name: str) -> List[Dict[str, Any]]:
        rows = self.assignments_by_hall.get(hall_name, [])
        event_ids = sorted({r["eventId"] for r in rows if r.get("eventId")})
        out = []
        for eid in event_ids:
            ev = self.events_by_id.get(eid)
            if ev:
                out.append(ev)
        return out

    def exhibitors_for_hall_event(self, hall_name: str, event_id: str) -> List[Dict[str, Any]]:
        rows = self.assignments_by_hall.get(hall_name, [])
        return [r for r in rows if r.get("eventId") == event_id]
