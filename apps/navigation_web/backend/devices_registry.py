# Device registry used by the backend navigation and device status endpoints.

DEVICES_REGISTRY = [
    # North Zone
    {"id": "PC_NH1_01",    "type": "people_counter",  "label": "Entry Counter",    "hallId": "NorthHall1", "svgX": 810,  "svgY": 400, "telemetryKey": "HZA01_PC01",  "status": "online"},
    {"id": "ENV_NH1_01",   "type": "environmental",   "label": "Env Sensor A",     "hallId": "NorthHall1", "svgX": 845,  "svgY": 440, "telemetryKey": "HZA01_ENV01", "status": "online"},
    {"id": "PC_NH2_01",    "type": "people_counter",  "label": "North Entry",      "hallId": "NorthHall2", "svgX": 812,  "svgY": 520, "telemetryKey": "HZA02_PC01",  "status": "online"},
    {"id": "CROWD_NH2_01", "type": "crowd_sensor",    "label": "Crowd Camera",     "hallId": "NorthHall2", "svgX": 840,  "svgY": 590, "telemetryKey": "HZA02_CS01",  "status": "online"},
    {"id": "ENV_NH2_01",   "type": "environmental",   "label": "CO2 Monitor",      "hallId": "NorthHall2", "svgX": 820,  "svgY": 660, "telemetryKey": "HZA02_ENV01", "status": "warning"},
    {"id": "PC_NH3_01",    "type": "people_counter",  "label": "Exit Counter",     "hallId": "NorthHall3", "svgX": 815,  "svgY": 715, "telemetryKey": "HZA03_PC01",  "status": "online"},
    {"id": "GW_NH3_01",    "type": "gateway",         "label": "LoRa Gateway",     "hallId": "NorthHall3", "svgX": 850,  "svgY": 780, "telemetryKey": "HZA03_GW01",  "status": "online"},
    {"id": "ENV_NH4_01",   "type": "environmental",   "label": "Corridor Env",     "hallId": "NorthHall4", "svgX": 742,  "svgY": 560, "telemetryKey": "HZA04_ENV01", "status": "online"},
    {"id": "PC_NH4_01",    "type": "people_counter",  "label": "Corridor Counter", "hallId": "NorthHall4", "svgX": 748,  "svgY": 700, "telemetryKey": "HZA04_PC01",  "status": "online"},
    {"id": "ENV_NH5_01",   "type": "environmental",   "label": "West Env",         "hallId": "NorthHall5", "svgX": 650,  "svgY": 450, "telemetryKey": "HZA05_ENV01", "status": "online"},
    {"id": "GW_NH5_01",    "type": "gateway",         "label": "West Gateway",     "hallId": "NorthHall5", "svgX": 675,  "svgY": 510, "telemetryKey": "HZA05_GW01",  "status": "online"},
    {"id": "PC_NH6_01",    "type": "people_counter",  "label": "Lobby Counter",    "hallId": "NorthHall6", "svgX": 800,  "svgY": 282, "telemetryKey": "HZA06_PC01",  "status": "online"},
    {"id": "ENV_NH6_01",   "type": "environmental",   "label": "Lobby Env",        "hallId": "NorthHall6", "svgX": 870,  "svgY": 282, "telemetryKey": "HZA06_ENV01", "status": "offline"},

    # East Zone
    {"id": "PC_EH1_01",    "type": "people_counter",  "label": "E1 Entry",         "hallId": "EastHall1",  "svgX": 1025, "svgY": 265, "telemetryKey": "HZB01_PC01",  "status": "online"},
    {"id": "ENV_EH1_01",   "type": "environmental",   "label": "E1 Air Quality",   "hallId": "EastHall1",  "svgX": 1055, "svgY": 305, "telemetryKey": "HZB01_ENV01", "status": "online"},
    {"id": "PC_EH2_01",    "type": "people_counter",  "label": "E2 Counter",       "hallId": "EastHall2",  "svgX": 1115, "svgY": 265, "telemetryKey": "HZB02_PC01",  "status": "online"},
    {"id": "CROWD_EH2_01", "type": "crowd_sensor",    "label": "E2 Crowd Sensor",  "hallId": "EastHall2",  "svgX": 1145, "svgY": 305, "telemetryKey": "HZB02_CS01",  "status": "warning"},
    {"id": "PC_EH3_01",    "type": "people_counter",  "label": "E3 Entry A",       "hallId": "EastHall3",  "svgX": 1210, "svgY": 268, "telemetryKey": "HZB03_PC01",  "status": "online"},
    {"id": "PC_EH3_02",    "type": "people_counter",  "label": "E3 Entry B",       "hallId": "EastHall3",  "svgX": 1330, "svgY": 268, "telemetryKey": "HZB03_PC02",  "status": "online"},
    {"id": "GW_EH3_01",    "type": "gateway",         "label": "E3 Gateway",       "hallId": "EastHall3",  "svgX": 1270, "svgY": 305, "telemetryKey": "HZB03_GW01",  "status": "online"},
    {"id": "ENV_EH3_01",   "type": "environmental",   "label": "E3 CO2",           "hallId": "EastHall3",  "svgX": 1240, "svgY": 305, "telemetryKey": "HZB03_ENV01", "status": "online"},
    {"id": "PC_EH4_01",    "type": "people_counter",  "label": "E4 Counter",       "hallId": "EastHall4",  "svgX": 1405, "svgY": 262, "telemetryKey": "HZB04_PC01",  "status": "online"},
    {"id": "CROWD_EH4_01", "type": "crowd_sensor",    "label": "E4 Overhead",      "hallId": "EastHall4",  "svgX": 1475, "svgY": 292, "telemetryKey": "HZB04_CS01",  "status": "online"},
    {"id": "ENV_EH4_01",   "type": "environmental",   "label": "E4 Env",           "hallId": "EastHall4",  "svgX": 1535, "svgY": 262, "telemetryKey": "HZB04_ENV01", "status": "offline"},
    {"id": "PC_H7_01",     "type": "people_counter",  "label": "H7 Counter",       "hallId": "Hall7",      "svgX": 1095, "svgY": 405, "telemetryKey": "HZB05_PC01",  "status": "online"},
    {"id": "ENV_H7_01",    "type": "environmental",   "label": "H7 Env",           "hallId": "Hall7",      "svgX": 1145, "svgY": 445, "telemetryKey": "HZB05_ENV01", "status": "online"},
    {"id": "PC_H8_01",     "type": "people_counter",  "label": "H8 Counter",       "hallId": "Hall8",      "svgX": 1218, "svgY": 405, "telemetryKey": "HZB06_PC01",  "status": "online"},
    {"id": "ENV_H8_01",    "type": "environmental",   "label": "H8 Env",           "hallId": "Hall8",      "svgX": 1258, "svgY": 450, "telemetryKey": "HZB06_ENV01", "status": "warning"},
    {"id": "GW_H9_01",     "type": "gateway",         "label": "East Gateway Hub", "hallId": "Hall9",      "svgX": 1345, "svgY": 415, "telemetryKey": "HZB07_GW01",  "status": "online"},
    {"id": "CROWD_H9_01",  "type": "crowd_sensor",    "label": "H9 Crowd",         "hallId": "Hall9",      "svgX": 1390, "svgY": 450, "telemetryKey": "HZB07_CS01",  "status": "online"},
    {"id": "PC_H10_01",    "type": "people_counter",  "label": "H10 Counter",      "hallId": "Hall10",     "svgX": 1468, "svgY": 408, "telemetryKey": "HZB08_PC01",  "status": "online"},
    {"id": "ENV_H10_01",   "type": "environmental",   "label": "H10 CO2",          "hallId": "Hall10",     "svgX": 1510, "svgY": 448, "telemetryKey": "HZB08_ENV01", "status": "online"},

    # South Zone
    {"id": "PC_SH1_01",    "type": "people_counter",  "label": "S1 Counter",       "hallId": "SouthHall1", "svgX": 1475, "svgY": 560, "telemetryKey": "HZC01_PC01",  "status": "online"},
    {"id": "ENV_SH1_01",   "type": "environmental",   "label": "S1 Env",           "hallId": "SouthHall1", "svgX": 1530, "svgY": 600, "telemetryKey": "HZC01_ENV01", "status": "online"},
    {"id": "PC_SH2_01",    "type": "people_counter",  "label": "S2 Entry A",       "hallId": "SouthHall2", "svgX": 1630, "svgY": 600, "telemetryKey": "HZC02_PC01",  "status": "online"},
    {"id": "CROWD_SH2_01", "type": "crowd_sensor",    "label": "S2 Crowd",         "hallId": "SouthHall2", "svgX": 1700, "svgY": 635, "telemetryKey": "HZC02_CS01",  "status": "online"},
    {"id": "GW_SH2_01",    "type": "gateway",         "label": "South Gateway",    "hallId": "SouthHall2", "svgX": 1760, "svgY": 670, "telemetryKey": "HZC02_GW01",  "status": "online"},
    {"id": "PC_SH3_01",    "type": "people_counter",  "label": "S3 Counter",       "hallId": "SouthHall3", "svgX": 1822, "svgY": 645, "telemetryKey": "HZC03_PC01",  "status": "online"},
    {"id": "ENV_SH3_01",   "type": "environmental",   "label": "S3 Air",           "hallId": "SouthHall3", "svgX": 1870, "svgY": 695, "telemetryKey": "HZC03_ENV01", "status": "warning"},
    {"id": "PC_SH4_01",    "type": "people_counter",  "label": "S4 Counter",       "hallId": "SouthHall4", "svgX": 1432, "svgY": 695, "telemetryKey": "HZC04_PC01",  "status": "online"},
    {"id": "ENV_SH4_01",   "type": "environmental",   "label": "S4 Env",           "hallId": "SouthHall4", "svgX": 1490, "svgY": 740, "telemetryKey": "HZC04_ENV01", "status": "online"},
    {"id": "PC_SH5_01",    "type": "people_counter",  "label": "S5 Entry",         "hallId": "SouthHall5", "svgX": 1595, "svgY": 742, "telemetryKey": "HZC05_PC01",  "status": "online"},
    {"id": "CROWD_SH5_01", "type": "crowd_sensor",    "label": "S5 Overhead",      "hallId": "SouthHall5", "svgX": 1665, "svgY": 775, "telemetryKey": "HZC05_CS01",  "status": "online"},
    {"id": "ENV_SH5_01",   "type": "environmental",   "label": "S5 Air Quality",   "hallId": "SouthHall5", "svgX": 1730, "svgY": 810, "telemetryKey": "HZC05_ENV01", "status": "online"},
    {"id": "GW_SH6_01",    "type": "gateway",         "label": "SE Gateway",       "hallId": "SouthHall6", "svgX": 1800, "svgY": 790, "telemetryKey": "HZC06_GW01",  "status": "online"},
    {"id": "PC_SH6_01",    "type": "people_counter",  "label": "S6 Counter",       "hallId": "SouthHall6", "svgX": 1840, "svgY": 835, "telemetryKey": "HZC06_PC01",  "status": "offline"},

    # Central Zone
    {"id": "PC_H1_01",     "type": "people_counter",  "label": "Central Counter",  "hallId": "Hall1",      "svgX": 968,  "svgY": 740, "telemetryKey": "HZD01_PC01",  "status": "online"},
    {"id": "ENV_H1_01",    "type": "environmental",   "label": "Central Env",      "hallId": "Hall1",      "svgX": 1015, "svgY": 780, "telemetryKey": "HZD01_ENV01", "status": "online"},
    {"id": "GW_H2_01",     "type": "gateway",         "label": "Central Gateway",  "hallId": "Hall2",      "svgX": 1072, "svgY": 610, "telemetryKey": "HZD02_GW01",  "status": "online"},
    {"id": "ENV_H2_01",    "type": "environmental",   "label": "Corridor CO2",     "hallId": "Hall2",      "svgX": 1078, "svgY": 700, "telemetryKey": "HZD02_ENV01", "status": "online"},
    {"id": "PC_H3_01",     "type": "people_counter",  "label": "H3 Counter",       "hallId": "Hall3",      "svgX": 970,  "svgY": 628, "telemetryKey": "HZD03_PC01",  "status": "online"},
    {"id": "CROWD_H3_01",  "type": "crowd_sensor",    "label": "H3 Overhead",      "hallId": "Hall3",      "svgX": 1018, "svgY": 668, "telemetryKey": "HZD03_CS01",  "status": "online"},
    {"id": "ENV_H4_01",    "type": "environmental",   "label": "H4 Air",           "hallId": "Hall4",      "svgX": 975,  "svgY": 522, "telemetryKey": "HZD04_ENV01", "status": "online"},
    {"id": "PC_H4_01",     "type": "people_counter",  "label": "H4 Counter",       "hallId": "Hall4",      "svgX": 1028, "svgY": 560, "telemetryKey": "HZD04_PC01",  "status": "warning"},
    {"id": "ENV_H5_01",    "type": "environmental",   "label": "H5 Sensor",        "hallId": "Hall5",      "svgX": 995,  "svgY": 458, "telemetryKey": "HZD05_ENV01", "status": "online"},
    {"id": "GW_H6_01",     "type": "gateway",         "label": "Hub Gateway",      "hallId": "Hall6",      "svgX": 1015, "svgY": 385, "telemetryKey": "HZD06_GW01",  "status": "online"},
]

# Populated at runtime when MQTT integration is active.
# Keys are device IDs and values contain the latest device telemetry snapshot.
device_telemetry: dict = {}
