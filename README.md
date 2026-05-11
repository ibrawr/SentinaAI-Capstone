# SentinaAI

> ### Live Demo: [https://dashboard-frontend-976861260438.me-central1.run.app/](https://dashboard-frontend-976861260438.me-central1.run.app/)
> Login credentials are provided in the final submission document.

**SentinaAI** is a full-stack edge–cloud platform for real-time IoT monitoring, AI-powered anomaly detection, and operational management of large-scale venues such as convention centers. It combines live telemetry ingestion, behavioral analytics, role-based dashboards, crowd-aware navigation, and a 3D digital twin to provide complete operational visibility and rapid response capabilities.

> **Academic context:** Developed as part of CSIT321 at the University of Wollongong in Dubai. The scope and design extend beyond standard coursework requirements to explore real-world system design and deployment.

---

## Accessing the Platform (for Evaluators & Professors)

There are two ways to access the project:

**IMPORTANT NOTE: The data used for simulation ranges between 24/12/2025 and 25/01/2026. Features like the reports will generate insights within these ranges only.**

### Option 1: Live Hosted Demo (no setup required)

The platform is deployed on GCP Cloud Run and accessible directly in a browser:

**https://dashboard-frontend-976861260438.me-central1.run.app/**

No installation or account setup needed. Login credentials and any additional instructions are provided in the final submission document.

### Option 2: Clone the Repository

To review the source code or run the project locally:

1. Clone the repository:
   ```bash
   git clone https://github.com/42zzzz/SentinaAI.git
   cd SentinaAI
   ```
2. Follow the [Quick Start](#quick-start) guide below.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Running Each Service](#running-each-service)
5. [Environment Variables](#environment-variables)
6. [Running Tests](#running-tests)
7. [Deployment (GCP Cloud Run)](#deployment-gcp-cloud-run)
8. [User Guide](#user-guide)
   - [Logging In](#logging-in)
   - [Operations Manager](#operations-manager)
   - [SOC Analyst](#soc-analyst)
   - [Sustainability Manager](#sustainability-manager)
   - [Exhibitor](#exhibitor)
   - [Admin](#admin)
   - [Navigation Web](#navigation-web)
   - [Digital Twin](#digital-twin)

---

## Architecture Overview

| Component | Purpose | Tech | Default Port |
|-----------|---------|------|-------------|
| **Main Dashboard Frontend** | Role-based web UI | React 18, Vite | 5173 |
| **Main Dashboard Backend** | API gateway, auth, data aggregation | Node.js, Express | 8080 |
| **Digital Twin** | 3D venue visualization | React 18, Three.js | 5175 |
| **Navigation Web** | 2D floor-plan navigation with crowd routing | Flask, PixiJS | 5000 |
| **AI Detection Service** | IoT anomaly detection | FastAPI, scikit-learn | 8000 |
| **Exhibitor AI Pipeline** | Exhibitor visitor analytics | FastAPI, PyTorch | 8001 |
| **Report Export Service** | PDF/Excel report generation | FastAPI, pdfkit | 8082 |
| **MQTT Broker** | Secure IoT device messaging (mTLS) | EMQX 5.8, Docker | 8883 (TLS) |

**Data flow:**
```
IoT Edge Devices → MQTT Broker (EMQX) → Navigation/AI Services → Main Dashboard Backend → Frontend
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20.19 or later (22 LTS recommended) |
| npm | 9 or later |
| Python | 3.11 or later |
| pip | latest |
| Docker & Docker Compose | latest (MQTT broker only) |

> **Windows note:** Node.js must be installed via the **official installer** from [nodejs.org](https://nodejs.org) so that `npm` is added to the system PATH. Installing via NVM for Windows or other user-scoped methods may cause the `postinstall` script to fail with `'npm' is not recognized` because child processes don't inherit the user PATH. If you hit this error, either reinstall Node.js from nodejs.org, or run each install step manually (see below).

> **Python launcher note:** The dev scripts try `py` first (Windows Python Launcher), then fall back to `python` automatically. No manual config needed. If both fail, ensure Python 3.11+ is installed and on your PATH (`python --version` should work in a new terminal).

---

## Quick Start

The fastest way to run the full platform is via the root `npm run dev` script, which starts the backend, frontend, and digital twin concurrently.

```bash
# 1. Install all dependencies (JS + Python)
cd "apps/main dashboard"
npm install

# 2. Configure environment (see Environment Variables section)
#    Edit apps/main dashboard/backend/.env

# 3. Launch
npm run dev
```

Open **http://localhost:5173** in your browser.

> **If `npm install` fails on Windows** with `'npm' is not recognized`, run the steps manually instead:
> ```powershell
> cd "apps/main dashboard"
> npm install --ignore-scripts
> npm install --prefix frontend
> npm install --prefix backend
> npm install --prefix ../digital_twin_web
> pip install -r ../navigation_web/requirements.txt
> pip install -r ../../services/ai-detection/requirements.txt
> pip install -r ../../services/exhibitor-ai-pipeline/requirements.txt
> pip install -r ../../services/Report_export/requirements.txt
> pip install -r "../../services/sentina_operations_html_widget_updated 5/requirements.txt"
> ```

> **If AI features return 500 errors** (AI Simulator, anomaly detection), the AI Detection service may not have started. Run it manually in a separate terminal:
> ```bash
> cd services/ai-detection
> pip install -r requirements.txt
> uvicorn app:app --host 0.0.0.0 --port 8000
> ```

> **If the Assistant panel doesn't load**, the Assistant service may not have started. Run it manually in a separate terminal:
> ```bash
> cd "services/sentina_operations_html_widget_updated 5"
> pip install -r requirements.txt
> uvicorn main:app --reload --port 8002
> ```

> Both issues can happen if `py`/`python` wasn't on PATH when `npm run dev` launched the background processes.

---

## Running Each Service

### Main Dashboard (Backend + Frontend + Digital Twin)

```bash
cd "apps/main dashboard"
npm run dev
```

This runs three processes in parallel:
- **Backend** → http://localhost:8080
- **Frontend** → http://localhost:5173
- **Digital Twin** → http://localhost:5175

To run them individually:

```bash
# Backend only
cd "apps/main dashboard/backend"
npm run dev

# Frontend only
cd "apps/main dashboard/frontend"
npm run dev

# Digital Twin only
cd apps/digital_twin_web
npm run dev
```

---

### Navigation Web (Flask)

```bash
cd apps/navigation_web/backend
pip install -r ../requirements.txt
python app.py
# → http://localhost:5000
```

---

### AI Detection Service (FastAPI)

```bash
cd services/ai-detection
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
# → http://localhost:8000
```

---

### Exhibitor AI Pipeline (FastAPI)

```bash
cd services/exhibitor-ai-pipeline
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8001
# → http://localhost:8001
```

Requires `CORE_DATABASE_URL` and `ANALYTICS_DATABASE_URL` set in the environment (see below).

---

### Report Export Service (FastAPI)

```bash
cd services/Report_export
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8082
# → http://localhost:8082
```

---

### MQTT Broker (Docker, EMQX 5.8)

```bash
cd services/mqtt-broker

# Generate TLS certificates
bash scripts/gen_certs.sh --server
bash scripts/gen_certs.sh --client sensor-HZA01-occ
bash scripts/gen_certs.sh --client edge-node
bash scripts/gen_certs.sh --client sentina-backend

# Start the broker
docker compose up -d

# Verify
docker exec sentina-emqx emqx ping

# Run integration tests
python3 scripts/test_emqx.py -v
```

EMQX dashboard: **http://localhost:18083** (default credentials in `docker-compose.yml`; change before production use).

> See `services/mqtt-broker/README.md` and `services/mqtt-broker/DOCKER_PRIMER.md` for detailed setup and Docker basics.

---

## Environment Variables

### Main Dashboard Backend `apps/main dashboard/backend/.env`

| Variable | Description | Example |
|----------|-------------|---------|
| `CORE_DATABASE_URL` | PostgreSQL connection (core schema) | `postgresql://user:pass@host:5432/sentina_core` |
| `ANALYTICS_DATABASE_URL` | PostgreSQL connection (analytics schema) | `postgresql://user:pass@host:5432/sentina_analytics` |
| `SUSTAINABILITY_DATABASE_URL` | PostgreSQL connection (sustainability schema) | `postgresql://user:pass@host:5432/sentina_sustainability` |
| `CORE_PGSSL` | Enable SSL for core DB | `true` |
| `ANALYTICS_PGSSL` | Enable SSL for analytics DB | `true` |
| `SUSTAINABILITY_PGSSL` | Enable SSL for sustainability DB | `true` |
| `PORT` | Backend HTTP port | `8080` |
| `JWT_SECRET` | Secret for signing JWT tokens | *(change this)* |
| `NAVMESH_BASE_URL` | URL of the Navigation Web service | `http://127.0.0.1:5000` |
| `AI_SERVICE_URL` | URL of the AI Detection service | `http://127.0.0.1:8000` |
| `EXHIBITOR_AI_SERVICE_URL` | URL of the Exhibitor AI service | `http://127.0.0.1:8001` |

### Main Dashboard Frontend `apps/main dashboard/frontend/.env`

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API base URL | `http://localhost:8080` |

### Exhibitor AI Pipeline `services/exhibitor-ai-pipeline/.env`

| Variable | Description |
|----------|-------------|
| `CORE_DATABASE_URL` | PostgreSQL connection (core) |
| `ANALYTICS_DATABASE_URL` | PostgreSQL connection (analytics) |
| `CORE_PGSSL` | Enable SSL |
| `ANALYTICS_PGSSL` | Enable SSL |

---

## Running Tests

### IoT Validator unit tests (Python unittest)

```bash
cd apps/navigation_web/backend
python -m unittest test_iot_validator -v
```

### MQTT Broker integration tests

```bash
cd services/mqtt-broker
python3 scripts/test_emqx.py -v
```

---

## Deployment (GCP Cloud Run)

A PowerShell deployment script is provided at the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

This builds Docker images for all services and deploys them to **GCP Cloud Run** in the `me-central1` region under project `sentina-ai-486321`. Each service has a corresponding `Dockerfile`.

---

## User Guide

### Logging In

1. Open the frontend URL (default: **http://localhost:5173**).
2. Enter your **email** and **password**.
3. Enter the **6-digit TOTP code** from your authenticator app (Google Authenticator, Authy, etc.).
4. You are redirected to your role's dashboard automatically.

**Default demo credentials** are configured in `apps/main dashboard/backend/routes/auth.js`.

---

### Role Overview

| Role | Dashboard URL | Purpose |
|------|--------------|---------|
| **Super Admin** | `/admin` | User management, system settings, audit logs |
| **Operations Manager** | `/operations` | Venue operations, devices, events, alerts |
| **SOC Analyst** | `/soc` | Security monitoring, threat analysis, logs |
| **Sustainability Manager** | `/sustainability` | Energy, carbon, environmental monitoring |
| **Exhibitor** | `/exhibitor` | Booth visitor analytics and engagement metrics |

---

### Operations Manager

The Operations Manager dashboard provides complete venue operational visibility.

**Dashboard**  Overview of key metrics: live occupancy, active device count, open alerts, and energy consumption. Includes device health bars and alert trend charts.

**Devices**  Real-time device list with status indicators, location, and live telemetry values. Filter by status or location.

**Events**  Schedule and track venue events. View attendee counts, timelines, and event details.

**Exhibitors & Booths**  Manage exhibitor profiles, booth assignments, and traffic patterns.

**Alerts**  Operations-scoped alerts filtered by severity (critical / warning / info) and status (new / acknowledged / resolved). Includes AI-generated anomaly alerts with recommended actions.

**Navigation Map**  Interactive 2D floor plan with:
- Select a **Start Room** and **End Room** from the dropdowns, then click **Find Optimal Path** to compute the shortest route with turn-by-turn steps and distance.
- Toggle **Avoid Crowded Areas** to route visitors around congested zones.
- Toggle **Show Heatmap** to overlay live occupancy heat (green = low, orange = moderate, red = high).

**Digital Twin**  Embedded 3D view of the venue (see [Digital Twin](#digital-twin) section below).

**Reports**  Create, save, and export custom reports. Select date ranges, metrics, and zones.

---

### SOC Analyst

The SOC (Security Operations Center) dashboard focuses on security event monitoring.

**Dashboard**  Security KPIs: active alerts, monitored zones, device status.

**Alerts**  Security-domain alerts with filtering by severity, zone, and time range.

**Analytics**  Incident trends, threat pattern analysis, anomaly detection results.

**Logs**  Access logs, system event logs, and full audit trail.

**Reports**  Security incident reports and compliance documentation.

---

### Sustainability Manager

**Dashboard**  Carbon emissions score, energy efficiency index, HVAC optimization status, and comfort index.

**Energy**  Per-hall energy consumption charts, historical trends, top energy consumers, and efficiency benchmarks.

**Environmental**  Carbon footprint tracking, air quality metrics (temperature, humidity, CO₂), and emissions assessment.

**Hall Details**  Drill into individual halls for occupancy-vs-energy analysis.

**Alerts**  Sustainability alerts: energy waste, equipment efficiency warnings, threshold breaches.

**Reports**  Carbon reports, energy audits, and sustainability compliance documentation.

---

### Exhibitor

**Dashboard**  Booth KPIs: visitor density, confidence score, engagement metrics, daily visitor count, and peak hours.

**Heatmap**  Visual traffic heatmap of the booth area showing visitor concentration and dwell zones.

**Analytics**  Visitor behavior analysis: dwell time, repeat visitors, engagement confidence scoring.

**Reports**  Booth-specific visitor reports and ROI analysis.

---

### Admin

Access via the **Super Admin** role at `/admin`.

**User Management**
- Click **Add User** to create a new account. Enter name, email, password, and assign a role.
- Click the edit icon on any row to modify a user's details or role.
- Use the status toggle to activate or deactivate accounts without deleting them.

**Support Tickets**  View and manage help desk tickets submitted by users. Track status (open / resolved).

**Audit Logs**  Review a timestamped log of all authentication events and critical actions.

---

### Navigation Web

The Navigation Web is a standalone app at **http://localhost:5000** (also embedded in role dashboards).

1. **Select rooms**  Choose a Start Room and End Room from the dropdowns.
2. **Find path**  Click **Find Optimal Path**. The shortest route is drawn on the map with distance in metres and step-by-step turn instructions.
3. **Crowd awareness**  Enable **Avoid Crowded Areas** to automatically route around halls with high occupancy.
4. **Heatmap**  Enable **Show Heatmap** to see a live colour overlay (green → orange → red) showing current occupancy levels across all halls.
5. **Demo mode**  Click **Demo Congestion** to simulate a busy venue scenario for testing.

The **Live Telemetry** panel (bottom-right) shows the current IoT connection status, average occupancy, peak occupancy, and a list of crowded halls.

---

### Digital Twin

The Digital Twin provides a real-time 3D view of the venue, accessible from any role dashboard or directly at **http://localhost:5175**.

**View controls**
- Use mouse to **orbit** (left-drag), **pan** (right-drag), and **zoom** (scroll).
- Click **Reset View** to return to the default camera position.
- Use the **All Halls / Individual Hall** selector to focus on a specific area.

**Layers**
- **Occupancy**  Colours each hall by current occupancy (green = low, orange = moderate, red = high).
- **Energy**  Colours each hall by current energy consumption.

**Simulation modes**

| Mode | Description |
|------|-------------|
| **Live** | Streams real telemetry data in real time |
| **History** | Replays historical data; use the time slider to scrub through past periods |
| **Sandbox** | Inject custom sensor values manually for testing and demonstrations |
| **Forecast** | Shows AI-generated occupancy and energy predictions; select the forecast horizon in hours |
