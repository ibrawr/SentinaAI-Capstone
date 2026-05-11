# Senti assistant widget guide

## Roles covered
- Senti Operations
- Senti Sustainability
- Senti Exhibitor

## What each role focuses on

### Operations
- Overview
- Occupancy
- Crowd Flow
- Trends
- Hall Performance

### Sustainability
- Overview
- Energy
- Comfort
- By Event Overview
- Efficiency & Carbon

### Exhibitor
- Overview
- Traffic Context
- Engagement
- Operating Environment
- Performance
- Comparison

## Guided flow rules
- operations and sustainability can use full venue or zone/hall scope
- exhibitor scope is assignment-based and locked to the assigned event and booth
- exhibitor date filters are bounded to the assigned event window
- comparison for exhibitors is a dedicated action rather than a repeated follow-up everywhere
- results render as KPI cards, summary cards, tables, or charts instead of raw JSON
- chart cards may also return a supporting table when the response needs ranked rows or a chart fallback

## Sustainability event overview
`By Event Overview` computes event-level metrics from the dataset and mapped event metadata.

It can show:
- event name
- event window
- interval count
- total HVAC energy
- total carbon
- average efficiency
- average comfort
- average occupancy and occupancy ratio
- total inflow and outflow
- net flow
- overcrowded share
- queue share
- event share of selected energy

## Save this view
Saved views preserve:
- intent
- selected metric
- scope
- filters
- time range
- generated result payload

## Frontend handoff structure
- AssistantLauncher
- AssistantWidget
- AssistantHeader
- MessageList
- AssistantBubble
- UserBubble
- ActionChips
- SelectionCard
- FilterFormCard
- KpiCard
- TableCard
- ChartCard
- FollowUpActions
- HelpCard
