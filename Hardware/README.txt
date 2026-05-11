Sentina Test Hall Setup

Files:
- peoplecount_pi.py
- dht_reader.py
- init_csv.py
- db_uploader.py
- sentina_monitor.py
- requirements.txt

Run on Raspberry Pi:

1. Open terminal in the folder
2. Install packages:
   pip3 install -r requirements.txt --break-system-packages
3. Make sure ultralytics is already installed
4. Make sure picamera2 is installed
5. Set DB environment variables
6. Run:
   python3 sentina_monitor.py

Output:
- hall_data.csv
- CSV rows are also uploaded to sentina_telemetry