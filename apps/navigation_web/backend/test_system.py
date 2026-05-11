import json

from svg_parser import SVGParser
from coordinate_transformer import CoordinateTransformer, extract_geojson_bounds
from navmesh_generator import NavMeshGenerator
from pathfinder import DijkstraPathfinder


def _print_header(title: str) -> None:
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)


def test_svg_parsing(svg_path: str):
    parser = SVGParser(svg_path)
    data = parser.extract_all()

    print(f"SVG dimensions: {data['dimensions']['width']} x {data['dimensions']['height']}")
    print(f"Rooms extracted: {len(data['rooms'])}")
    print(f"Corridors extracted: {len(data['corridors'])}")

    if data['rooms']:
        r = data['rooms'][0]
        print("Sample room")
        print(f"  Name: {r.get('name')}")
        print(f"  Center: ({r['center']['x']:.1f}, {r['center']['y']:.1f})")

    return data


def test_coordinate_transformer(svg_w: float, svg_h: float):
    _print_header("2. Coordinate transformer")

    geojson_str = (
        '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},'
        '"geometry":{"coordinates":[[[55.28514167811778,25.221544615013386],'
        '[55.285686028545314,25.22123340829775],[55.28616814714442,25.221948974483112],'
        '[55.28827305653181,25.220899043260104],[55.29181204995919,25.225541532185503],'
        '[55.29026162371224,25.227136599916307],[55.2890019971085,25.226140196693052],'
        '[55.28699133263294,25.22713370705307],[55.28514635183484,25.224359979970103],'
        '[55.28401929803499,25.22246726320094],[55.285294274281426,25.22176237175553],'
        '[55.28514167811778,25.221544615013386]]],"type":"Polygon"}}]}'
    )
    bounds = extract_geojson_bounds(json.loads(geojson_str))

    transformer = CoordinateTransformer(svg_dimensions=(svg_w, svg_h), geojson_bounds=bounds)
    pt = (1000, 1000)
    meters = transformer.svg_to_meters(*pt)

    print(f"meters_per_pixel: {transformer.meters_per_pixel:.4f}")
    print(f"Example svg->meters for {pt}: ({meters[0]:.2f}, {meters[1]:.2f})")


def test_navmesh(rooms, corridors, entrances=None):
    _print_header("3. Navmesh generation")
    gen = NavMeshGenerator(rooms=rooms, corridors=corridors, entrances=entrances or [])
    nm = gen.generate()
    print(f"Nodes: {len(nm['nodes'])}")
    print(f"Edges: {len(nm['edges'])}")
    print(f"Selectable destinations: {len(nm['rooms_metadata'])}")
    return nm


def test_pathfinding(navmesh):
    _print_header("4. Dijkstra pathfinding")
    pf = DijkstraPathfinder(navmesh['nodes'], navmesh['edges'])
    rooms = [r['id'] for r in navmesh['rooms_metadata']]
    if len(rooms) < 2:
        print("Not enough selectable locations to test pathfinding")
        return
    start, end = rooms[0], rooms[-1]
    path = pf.find_path(start, end)
    print(f"Start: {start} -> End: {end}")
    print(f"Path length (nodes): {len(path) if path else 0}")
    if path:
        print(f"Distance (pixels): {pf.get_path_distance(path):.2f}")


if __name__ == "__main__":
    svg_path = "../convention_map.svg"
    data = test_svg_parsing(svg_path)
    test_coordinate_transformer(data['dimensions']['width'], data['dimensions']['height'])
    navmesh = test_navmesh(data['rooms'], data['corridors'], data.get('entrances', []))
    test_pathfinding(navmesh)
