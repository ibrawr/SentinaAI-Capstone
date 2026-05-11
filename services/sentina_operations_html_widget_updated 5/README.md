# Senti role-based assistant widget

This package contains the current SentinaAI floating assistant prototype with a FastAPI backend, dataset-driven analytics, guided form flows, saved views, and role-aware UI labels.

## Modules in this package

The same widget shell supports three assistant modes:
- **Senti Operations**
- **Senti Sustainability**
- **Senti Exhibitor**

The role controls the assistant name, the primary actions, the form logic, and the response flow.

## What is included

### Frontend
- floating launcher and light-theme assistant shell
- role-aware launcher, page title, and assistant header
- conversational workflow layout with separate user selections and assistant responses
- saved view workflow with validation states and tab-based recall
- consistent KPI-to-chart spacing across chart cards
- multi-series chart rendering with distinct line colors
- chart legends, tooltip hover states, and table fallback blocks
- contextual follow-up chips instead of repeating the same action everywhere

### Backend
- FastAPI API for widget bootstrap, actions, saved views, and logs
- CSV-backed analytics prototype using the included datasets
- assignment-based exhibitor scoping
- event-aware sustainability event overview logic
- structured responses for summary cards, chart cards, and table cards

## Role-specific behavior

### Operations
Primary actions:
- Overview
- Occupancy
- Crowd Flow
- Trends
- Hall Performance

### Sustainability
Primary actions:
- Overview
- Energy
- Comfort
- By Event Overview
- Efficiency & Carbon

Notes:
- **By Event Overview** is computed from the sustainability dataset and the events mapping file.
- The response uses only metrics supported by the dataset.
- Single-event and multi-event ranges render differently so the output stays honest to the data.

### Exhibitor
Primary actions:
- Overview
- Traffic Context
- Engagement
- Operating Environment
- Performance
- Comparison

Notes:
- exhibitor scope is assignment-based, not free-form
- date selection is bounded to the assigned event window
- comparison is intentional and exhibitor-specific, not repeated on every result card
- comparison baselines are event-aware only

## Data files used in this prototype

Operations and sustainability:
- `data/sentina_sust_full_15min_with_events_mapped (1).csv`
- `data/Venue Dataset.csv`

Exhibitor:
- `data/event_exhibitor_booth_assignments.csv`
- `data/events.csv`
- `data/exhibitors.csv`
- `data/syn_zone_metrics_15mins.csv`

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

## Demo URLs

```text
http://127.0.0.1:8000/?role=OPERATIONS&user_id=u1&user_name=Rumaisa
http://127.0.0.1:8000/?role=SUSTAINABILITY&user_id=u2&user_name=Rumaisa
http://127.0.0.1:8000/?role=EXHIBITOR&user_id=EXH0215&user_name=Lumina
```

## Main endpoints
- `GET /assistant/widget/bootstrap`
- `GET /assistant/widget/flow-config`
- `POST /assistant/widget/action`
- `POST /assistant/widget/save-view`
- `GET /assistant/widget/saved-views`
- `DELETE /assistant/widget/saved-views/{view_id}?user_id=...`
- `GET /assistant/widget/context`
- `GET /assistant/widget/help`
- `GET /admin/ai/logs`

## Frontend handoff notes
- the assistant name is provided by bootstrap and should be treated as display text
- chart cards can include `table_rows` for fallback or supporting detail tables
- exhibitor comparison is a dedicated analysis path, not a generic add-on everywhere
- sustainability `By Event Overview` uses event-level aggregation from the dataset, not a renamed placeholder
- saved views remain in-memory in this prototype repository layer

## Quick implementation notes
- operations and sustainability allow comparison add-on responses when a comparison period is selected
- exhibitor comparison runs as its own analysis instead of auto-appending duplicate comparison cards
- the frontend can safely key off `analysis_type`, `title`, `response_type`, `data.kpis`, `data.series`, `data.rows`, and `data.table_rows`
