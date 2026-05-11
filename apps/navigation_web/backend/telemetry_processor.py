"""
Processes IoT sensor telemetry from a JSONL stream and aggregates hall
occupancy data for navigation routing updates.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional


class TelemetryProcessor:
    """Process IoT sensor streams and extract relevant navigation metrics."""
    
    def __init__(self):
        self.latest_occupancy: Dict[str, float] = {}
        self.hall_id_to_room_id: Dict[str, str] = {}
        self.last_update: Optional[datetime] = None
    
    def load_jsonl_stream(self, filepath: str | Path, max_records: int = 10000) -> None:
        """Load telemetry from a JSONL file using the most recent records."""
        filepath = Path(filepath)
        
        if not filepath.exists():
            raise FileNotFoundError(f"Telemetry file not found: {filepath}")
        
        with open(filepath, 'r') as f:
            lines = f.readlines()
        
        recent_lines = lines[-max_records:] if len(lines) > max_records else lines
        
        hall_readings: Dict[str, List[float]] = defaultdict(list)
        
        for line in recent_lines:
            try:
                record = json.loads(line.strip())
                
                if record.get('readingType') != 'occupancy':
                    continue
                
                hall_id = record.get('hallId')
                if not hall_id:
                    continue
                
                occupancy_rate = record.get('values', {}).get('occupancyRate')
                if occupancy_rate is not None:
                    hall_readings[hall_id].append(float(occupancy_rate))
                
                ts_str = record.get('timestamp')
                if ts_str:
                    try:
                        self.last_update = datetime.fromisoformat(ts_str.replace('+00:00', ''))
                    except:
                        pass
                        
            except json.JSONDecodeError:
                continue
        
        for hall_id, rates in hall_readings.items():
            self.latest_occupancy[hall_id] = sum(rates) / len(rates)
        
        print(f"Loaded telemetry: {len(self.latest_occupancy)} halls")
        if self.last_update:
            print(f"  Latest timestamp: {self.last_update}")
    
    def map_hall_ids_to_rooms(self, rooms_metadata: List[Dict]) -> None:
        """
        Create mapping from telemetry hall IDs (like HZA01) to room node IDs (like room_0).
        """
        self.hall_id_to_room_id.clear()

        def normalize_name(s: str) -> str:
            return "".join(ch for ch in (s or "").lower() if ch.isalnum())

        def hall_id_to_expected_name(hall_id: str) -> Optional[str]:
            """
            Best-effort mapping from telemetry hall IDs to human-readable hall names.

            Telemetry uses 26 hall codes:
              - HZA01..HZA06
              - HZB01..HZB08
              - HZC01..HZC06
              - HZD01..HZD06

            Default mapping:
              - HZA## -> North Hall ##
              - HZC## -> South Hall ##
              - HZB## -> Hall ##
              - HZD01..04 -> East Hall 1..4
              - HZD05..06 -> Hall 9..10
            """
            import re
            m = re.fullmatch(r"HZ([A-D])(\d{2})", (hall_id or "").strip().upper())
            if not m:
                return None
            zone = m.group(1)
            num = int(m.group(2))
            if zone == "A":
                return f"North Hall {num}"
            if zone == "C":
                return f"South Hall {num}"
            if zone == "B":
                return f"Hall {num}"
            if zone == "D":
                if num <= 4:
                    return f"East Hall {num}"
                return f"Hall {num + 4}"
            return None

        room_name_to_id = {}
        for room in rooms_metadata:
            rn = (room.get("name") or "").strip()
            room_name_to_id[normalize_name(rn)] = room["id"]
        
        for hall_id in list(self.latest_occupancy.keys()):
            expected = hall_id_to_expected_name(hall_id)
            if expected:
                rid = room_name_to_id.get(normalize_name(expected))
                if rid:
                    self.hall_id_to_room_id[hall_id] = rid

        for hall_id in list(self.latest_occupancy.keys()):
            if hall_id in self.hall_id_to_room_id:
                continue
            hall_norm = normalize_name(hall_id)
            for rn_norm, rid in room_name_to_id.items():
                if hall_norm == rn_norm:
                    self.hall_id_to_room_id[hall_id] = rid
                    break
            if hall_id in self.hall_id_to_room_id:
                continue
            for rn_norm, rid in room_name_to_id.items():
                if hall_norm and (hall_norm in rn_norm or rn_norm in hall_norm):
                    self.hall_id_to_room_id[hall_id] = rid
                    break
        
        print(f"Mapped {len(self.hall_id_to_room_id)} hall IDs to rooms")
        
        unmapped = set(self.latest_occupancy.keys()) - set(self.hall_id_to_room_id.keys())
        if unmapped:
            print(f"  Warning: {len(unmapped)} halls not mapped: {sorted(list(unmapped))[:5]}...")
    
    def get_sensor_data_for_navmesh(self) -> Dict[str, float]:
        """
        Get sensor data in the format expected by navmesh_generator.update_edge_weights_from_iot().
        """
        sensor_data: Dict[str, float] = {}
        
        for hall_id, occupancy_rate in self.latest_occupancy.items():
            room_id = self.hall_id_to_room_id.get(hall_id)
            if room_id:
                sensor_data[room_id] = occupancy_rate
        
        return sensor_data
    
    def get_summary(self) -> Dict:
        """Get summary statistics for display."""
        if not self.latest_occupancy:
            return {
                'total_halls': 0,
                'mapped_halls': 0,
                'avg_occupancy': 0.0,
                'max_occupancy': 0.0,
                'crowded_halls': []
            }
        
        occupancy_values = list(self.latest_occupancy.values())
        avg_occ = sum(occupancy_values) / len(occupancy_values)
        max_occ = max(occupancy_values)
        
        crowded = [
            {'hallId': hid, 'occupancy': occ}
            for hid, occ in self.latest_occupancy.items()
            if occ > 0.5
        ]
        crowded.sort(key=lambda x: x['occupancy'], reverse=True)
        
        return {
            'total_halls': len(self.latest_occupancy),
            'mapped_halls': len(self.hall_id_to_room_id),
            'avg_occupancy': round(avg_occ, 3),
            'max_occupancy': round(max_occ, 3),
            'crowded_halls': crowded[:5],
            'last_update': self.last_update.isoformat() if self.last_update else None
        }


if __name__ == '__main__':
    processor = TelemetryProcessor()
    
    test_file = Path('../telemetry_stream_hall_v3__1_.jsonl')
    if test_file.exists():
        processor.load_jsonl_stream(test_file)
        
        print("\nOccupancy by hall:")
        for hall_id, occ in sorted(processor.latest_occupancy.items())[:10]:
            print(f"  {hall_id}: {occ:.2%}")
        
        print("\nSummary:")
        summary = processor.get_summary()
        print(f"  Total halls: {summary['total_halls']}")
        print(f"  Avg occupancy: {summary['avg_occupancy']:.1%}")
        print(f"  Max occupancy: {summary['max_occupancy']:.1%}")
        
        if summary['crowded_halls']:
            print(f"\n  Most crowded halls:")
            for item in summary['crowded_halls']:
                print(f"    {item['hallId']}: {item['occupancy']:.1%}")
