from pathlib import Path


def setup_data_folder():
    """Create the data folder and show the required telemetry files."""
    backend_dir = Path(__file__).resolve().parent
    project_root = backend_dir.parent
    data_dir = project_root / "data"

    data_dir.mkdir(exist_ok=True)
    print(f"Created data directory: {data_dir}")

    files_to_copy = [
        "telemetry_stream_hall_v3_2.csv",
        "telemetry_stream_hall_v3_1.jsonl",
        "Live_Telemetry_Simulator_Hall_UPDATED_HVAC_1.ipynb"
    ]

    print("\nPlease copy the following files to the data folder:")
    print(f"  Location: {data_dir}")
    print("\nFiles needed:")
    for filename in files_to_copy:
        print(f"  - {filename}")

    print("\nAlternatively, run these commands:")
    print(f"  mkdir -p {data_dir}")
    for filename in files_to_copy:
        print(f"  cp /path/to/{filename} {data_dir}/")

    print("\n" + "=" * 60)
    print("QUICK SETUP:")
    print("=" * 60)
    print(f"1. Copy your uploaded files to: {data_dir}")
    print("2. Rename them to match:")
    print("   - telemetry_stream_hall_v3__2_.csv → telemetry_stream_hall_v3_2.csv")
    print("   - telemetry_stream_hall_v3__1_.jsonl → telemetry_stream_hall_v3_1.jsonl")
    print("   - Live_Telemetry_Simulator_Hall_UPDATED_HVAC__1_.ipynb → Live_Telemetry_Simulator_Hall_UPDATED_HVAC_1.ipynb")
    print("3. Restart Flask: python app.py")


if __name__ == '__main__':
    setup_data_folder()
