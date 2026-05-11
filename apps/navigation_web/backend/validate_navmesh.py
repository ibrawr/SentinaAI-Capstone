"""
Validates a generated navigation mesh by checking connectivity, edge sanity,
and required pathfinding routes against the extracted venue geometry.
"""

import sys
import json
from pathlib import Path
from typing import Dict, List, Tuple

try:
    from navmesh_generator_FIXED import NavMeshGenerator
    from pathfinder import DijkstraPathfinder
except ImportError:
    print("ERROR: Required modules not found")
    print("  Need: navmesh_generator_FIXED.py, pathfinder.py")
    sys.exit(1)


def load_geometry(json_path: str) -> Dict:
    """Load geometry from JSON."""
    with open(json_path, 'r') as f:
        return json.load(f)


def point_in_poly(x: float, y: float, poly: List[List[float]]) -> bool:
    """Ray casting point-in-polygon."""
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = float(poly[i][0]), float(poly[i][1])
        xj, yj = float(poly[j][0]), float(poly[j][1])
        intersects = ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) + 1e-12) + xi)
        if intersects:
            inside = not inside
        j = i
    return inside


def check_graph_connectivity(navmesh: Dict) -> Tuple[bool, str]:
    """
    Check if all destination nodes are reachable from each other.
    
    Returns:
        (is_connected, message)
    """
    nodes = navmesh['nodes']
    edges = navmesh['edges']
    
    adj = {n['id']: [] for n in nodes}
    for e in edges:
        adj[e['from']].append(e['to'])
    
    destinations = [n for n in nodes if n.get('is_destination', False)]
    
    if len(destinations) < 2:
        return False, f"Only {len(destinations)} destination nodes found"
    
    start = destinations[0]['id']
    visited = set()
    stack = [start]
    visited.add(start)
    
    while stack:
        node_id = stack.pop()
        for neighbor in adj.get(node_id, []):
            if neighbor not in visited:
                visited.add(neighbor)
                stack.append(neighbor)
    
    unreachable = [n['id'] for n in destinations if n['id'] not in visited]
    
    if unreachable:
        return False, f"Unreachable destinations: {unreachable}"
    else:
        return True, f"All {len(destinations)} destinations reachable"


def check_edge_validity(navmesh: Dict, geometry: Dict, sample_points: int = 25) -> Tuple[int, List[Dict]]:
    """
    Check if edges cut through walls or halls.
    
    Returns:
        (num_violations, violation_list)
    """
    nodes_by_id = {n['id']: n for n in navmesh['nodes']}
    corridor_polys = [c['polygon'] for c in geometry['corridors']]
    hall_polys = [r['polygon'] for r in geometry['rooms']]
    
    violations = []
    
    for edge in navmesh['edges']:
        from_node = nodes_by_id.get(edge['from'])
        to_node = nodes_by_id.get(edge['to'])
        
        if not from_node or not to_node:
            continue
        
        if from_node['type'] == 'room' or to_node['type'] == 'room':
            continue
        
        fx, fy = from_node['position']['x'], from_node['position']['y']
        tx, ty = to_node['position']['x'], to_node['position']['y']
        
        for i in range(sample_points + 1):
            t = i / sample_points
            x = fx + (tx - fx) * t
            y = fy + (ty - fy) * t
            
            in_corridor = any(point_in_poly(x, y, poly) for poly in corridor_polys)
            in_hall = any(point_in_poly(x, y, poly) for poly in hall_polys)
            
            if not in_corridor or in_hall:
                violations.append({
                    'edge': f"{edge['from']} -> {edge['to']}",
                    'point': [x, y],
                    'reason': 'not in corridor' if not in_corridor else 'in hall'
                })
                break
    
    return len(violations), violations


def test_specific_paths(navmesh: Dict, test_cases: List[Tuple[str, str, str]]) -> Dict:
    """
    Test specific paths between named halls.
    
    Args:
        test_cases: List of (start_name, end_name, description) tuples
    
    Returns:
        Dict with test results
    """
    nodes = navmesh['nodes']
    pathfinder = DijkstraPathfinder(nodes, navmesh['edges'])
    
    name_to_id = {}
    for n in nodes:
        if n.get('type') == 'room':
            name_to_id[n.get('name', '').lower()] = n['id']
    
    results = []
    
    for start_name, end_name, description in test_cases:
        start_id = name_to_id.get(start_name.lower())
        end_id = name_to_id.get(end_name.lower())
        
        if not start_id or not end_id:
            results.append({
                'description': description,
                'status': 'SKIP',
                'reason': f"Hall not found: {start_name if not start_id else end_name}"
            })
            continue
        
        path = pathfinder.find_path(start_id, end_id)
        
        if path:
            distance = pathfinder.get_path_distance(path)
            results.append({
                'description': description,
                'status': 'PASS',
                'path_length': len(path),
                'distance_px': distance
            })
        else:
            results.append({
                'description': description,
                'status': 'FAIL',
                'reason': 'No path found'
            })
    
    return {
        'total': len(test_cases),
        'passed': sum(1 for r in results if r['status'] == 'PASS'),
        'failed': sum(1 for r in results if r['status'] == 'FAIL'),
        'skipped': sum(1 for r in results if r['status'] == 'SKIP'),
        'results': results
    }


def print_validation_report(geometry: Dict, navmesh: Dict):
    """Print comprehensive validation report."""
    print("\n" + "="*70)
    print("NAVIGATION MESH VALIDATION REPORT")
    print("="*70)
    
    print("\n1. BASIC STATISTICS")
    print("-" * 70)
    print(f"  Nodes:          {len(navmesh['nodes'])}")
    print(f"    - Rooms:      {sum(1 for n in navmesh['nodes'] if n['type'] == 'room')}")
    print(f"    - Corridors:  {sum(1 for n in navmesh['nodes'] if n['type'] == 'corridor')}")
    print(f"    - Doors:      {sum(1 for n in navmesh['nodes'] if n['type'] == 'door')}")
    print(f"    - Entrance:   {sum(1 for n in navmesh['nodes'] if n['type'] == 'entrance')}")
    print(f"  Edges:          {len(navmesh['edges']) // 2} bidirectional pairs")
    print(f"  Corridors:      {len(geometry['corridors'])} unified polygon(s)")
    
    print("\n2. GRAPH CONNECTIVITY")
    print("-" * 70)
    is_connected, msg = check_graph_connectivity(navmesh)
    if is_connected:
        print(f"  ✓ {msg}")
    else:
        print(f"  ✗ {msg}")
    
    print("\n3. EDGE VALIDITY (Sanity Check)")
    print("-" * 70)
    num_violations, violations = check_edge_validity(navmesh, geometry, sample_points=25)
    
    if num_violations == 0:
        print(f"  ✓ All edges valid (no wall/hall penetration)")
    else:
        print(f"  ✗ Found {num_violations} invalid edges:")
        for i, v in enumerate(violations[:10], 1):
            print(f"     {i}. {v['edge']}")
            print(f"        Point: ({v['point'][0]:.1f}, {v['point'][1]:.1f})")
            print(f"        Reason: {v['reason']}")
        if len(violations) > 10:
            print(f"     ... and {len(violations) - 10} more")
    
    print("\n4. PATH VALIDATION (Required Test Cases)")
    print("-" * 70)
    
    test_cases = [
        ("East Hall 4", "Hall 10", "East Hall 4 → Hall 10"),
        ("East Hall 4", "Hall 6", "East Hall 4 → Hall 6"),
        ("South Hall 1", "Hall 3", "South Hall 1 → Hall 3"),
        ("North Hall 1", "Hall 9", "North Hall 1 → Hall 9"),
    ]
    
    path_results = test_specific_paths(navmesh, test_cases)
    
    for r in path_results['results']:
        status_icon = "✓" if r['status'] == 'PASS' else "✗" if r['status'] == 'FAIL' else "○"
        print(f"  {status_icon} {r['description']}")
        
        if r['status'] == 'PASS':
            print(f"     Path: {r['path_length']} nodes, {r['distance_px']:.1f} px")
        elif r['status'] == 'FAIL':
            print(f"     Reason: {r['reason']}")
        elif r['status'] == 'SKIP':
            print(f"     Reason: {r['reason']}")
    
    print(f"\n  Summary: {path_results['passed']}/{path_results['total']} passed")
    
    print("\n" + "="*70)
    print("OVERALL VERDICT")
    print("="*70)
    
    all_pass = (
        is_connected and
        num_violations == 0 and
        path_results['passed'] == path_results['total']
    )
    
    if all_pass:
        print("  ✓✓✓ PASS - Navigation mesh is VALID")
        print("  Ready for production use!")
    else:
        print("  ✗✗✗ FAIL - Navigation mesh has issues")
        print("  Review errors above and fix geometry/algorithm")
    
    print("="*70 + "\n")
    
    return all_pass


def main():
    if len(sys.argv) < 2:
        print("Usage: python validate_navmesh.py <geometry_json>")
        print("Example: python validate_navmesh.py geometry_fixed.json")
        sys.exit(1)
    
    geometry_path = sys.argv[1]
    
    if not Path(geometry_path).exists():
        print(f"ERROR: File not found: {geometry_path}")
        sys.exit(1)
    
    print("Loading geometry...")
    geometry = load_geometry(geometry_path)
    
    print("Generating navigation mesh...")
    generator = NavMeshGenerator(
        rooms=geometry['rooms'],
        corridors=geometry['corridors'],
        corridor_step_px=12,
        spur_prune_px=30.0
    )
    navmesh = generator.generate()
    
    all_pass = print_validation_report(geometry, navmesh)
    
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()