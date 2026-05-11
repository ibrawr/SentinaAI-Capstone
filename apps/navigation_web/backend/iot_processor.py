"""
Processes IoT telemetry from venue sensors and converts it into hall-level
crowd density data for pathfinding adjustments.
"""

import json
import csv
from typing import Dict, List, Optional
from datetime import datetime
from collections import defaultdict


class IoTProcessor:
    """Process IoT telemetry data and convert to crowd density metrics"""
    
    def __init__(self):
        self.hall_data: Dict[str, Dict] = defaultdict(lambda: {
            'occupancy_count': 0,
            'occupancy_rate': 0.0,
            'temperature': 22.0,
            'humidity': 50.0,
            'co2': 400.0,
            'noise': 40.0,
            'last_update': None
        })
        
        self.hall_capacities = {
            'HZA01': 450, 'HZA02': 400, 'HZA03': 350, 'HZA04': 350, 'HZA05': 300, 'HZA06': 300,
            'HZB01': 500, 'HZB02': 450, 'HZB03': 400, 'HZB04': 400, 'HZB05': 350, 'HZB06': 350, 'HZB07': 300, 'HZB08': 300,
            'HZC01': 450, 'HZC02': 400, 'HZC03': 350, 'HZC04': 350, 'HZC05': 300, 'HZC06': 300,
            'HZD01': 500, 'HZD02': 450, 'HZD03': 400, 'HZD04': 400, 'HZD05': 350, 'HZD06': 350,
        }
    
    def process_csv_row(self, row: Dict) -> Optional[str]:
        """
        Process a single CSV row and update hall data
        Returns hall_id if updated, None otherwise
        """
        hall_id = row.get('hallId')
        if not hall_id:
            return None
        
        reading_type = row.get('readingType')
        timestamp = row.get('timestamp')
        
        try:
            values = json.loads(row.get('values_json', '{}'))
        except:
            return None
        
        if reading_type == 'occupancy':
            self.hall_data[hall_id]['occupancy_count'] = values.get('occupancyCount', 0)
            self.hall_data[hall_id]['occupancy_rate'] = values.get('occupancyRate', 0.0)
            self.hall_data[hall_id]['last_update'] = timestamp
            
        elif reading_type == 'video_analytics':
            self.hall_data[hall_id]['occupancy_count'] = values.get('estimatedCount', 0)
            capacity = self.hall_capacities.get(hall_id, 400)
            self.hall_data[hall_id]['occupancy_rate'] = values.get('estimatedCount', 0) / capacity
            self.hall_data[hall_id]['last_update'] = timestamp
            
        elif reading_type == 'temp_humidity':
            self.hall_data[hall_id]['temperature'] = values.get('temperatureC', 22.0)
            self.hall_data[hall_id]['humidity'] = values.get('humidityPct', 50.0)
            
        elif reading_type == 'environment':
            self.hall_data[hall_id]['co2'] = values.get('co2ppm', 400.0)
            self.hall_data[hall_id]['noise'] = values.get('noiseDb', 40.0)
        
        return hall_id
    
    def process_jsonl_line(self, line: str) -> Optional[str]:
        """
        Process a single JSONL line and update hall data
        Returns hall_id if updated, None otherwise
        """
        try:
            data = json.loads(line)
        except:
            return None
        
        hall_id = data.get('hallId')
        if not hall_id:
            return None
        
        reading_type = data.get('readingType')
        timestamp = data.get('timestamp')
        values = data.get('values', {})
        
        if reading_type == 'occupancy':
            self.hall_data[hall_id]['occupancy_count'] = values.get('occupancyCount', 0)
            self.hall_data[hall_id]['occupancy_rate'] = values.get('occupancyRate', 0.0)
            self.hall_data[hall_id]['last_update'] = timestamp
            
        elif reading_type == 'video_analytics':
            self.hall_data[hall_id]['occupancy_count'] = values.get('estimatedCount', 0)
            capacity = self.hall_capacities.get(hall_id, 400)
            self.hall_data[hall_id]['occupancy_rate'] = values.get('estimatedCount', 0) / capacity
            self.hall_data[hall_id]['last_update'] = timestamp
            
        elif reading_type == 'temp_humidity':
            self.hall_data[hall_id]['temperature'] = values.get('temperatureC', 22.0)
            self.hall_data[hall_id]['humidity'] = values.get('humidityPct', 50.0)
            
        elif reading_type == 'environment':
            self.hall_data[hall_id]['co2'] = values.get('co2ppm', 400.0)
            self.hall_data[hall_id]['noise'] = values.get('noiseDb', 40.0)
        
        return hall_id
    
    def get_crowd_density_weights(self) -> Dict[str, float]:
        """
        Convert hall occupancy data to crowd density weights (0.0 - 1.0)
        Used for pathfinding edge weight adjustments
        """
        weights = {}
        
        for hall_id, data in self.hall_data.items():
            density = min(1.0, max(0.0, data['occupancy_rate']))
            
            if data['co2'] > 800:
                density = min(1.0, density * 1.1)
            if data['noise'] > 65:
                density = min(1.0, density * 1.1)
            
            weights[hall_id] = density
        
        return weights
    
    def get_hall_stats(self, hall_id: str) -> Dict:
        """Get current stats for a specific hall"""
        return self.hall_data.get(hall_id, {})
    
    def get_all_hall_stats(self) -> Dict[str, Dict]:
        """Get stats for all halls"""
        return dict(self.hall_data)


def load_telemetry_csv(filepath: str, processor: IoTProcessor, limit: int = 1000):
    """Load telemetry data from CSV file"""
    updated_halls = set()
    
    with open(filepath, 'r') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if limit and i >= limit:
                break
            hall_id = processor.process_csv_row(row)
            if hall_id:
                updated_halls.add(hall_id)
    
    print(f"Loaded {len(updated_halls)} halls from CSV")
    return processor.get_crowd_density_weights()


def load_telemetry_jsonl(filepath: str, processor: IoTProcessor, limit: int = 1000):
    """Load telemetry data from JSONL file"""
    updated_halls = set()
    
    with open(filepath, 'r') as f:
        for i, line in enumerate(f):
            if limit and i >= limit:
                break
            hall_id = processor.process_jsonl_line(line)
            if hall_id:
                updated_halls.add(hall_id)
    
    print(f"Loaded {len(updated_halls)} halls from JSONL")
    return processor.get_crowd_density_weights()


if __name__ == '__main__':
    processor = IoTProcessor()
    
    weights = load_telemetry_csv('telemetry_stream_hall_v3_2.csv', processor, limit=5000)
    
    print("\n=== Hall Crowd Density Weights ===")
    for hall_id in sorted(weights.keys()):
        print(f"{hall_id}: {weights[hall_id]:.3f} (crowd: {processor.get_hall_stats(hall_id)['occupancy_count']} people)")