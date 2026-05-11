# SentinaAI Assistant Intent Catalog

## Operations intents

### ops_live_overview
Purpose: Show a live venue-wide snapshot for operations.
Example queries:
- Live overview
- What's happening live?
- Current venue status

### ops_current_occupancy
Purpose: Show current occupancy for a hall or zone.
Example queries:
- What is the occupancy in Hall 1?
- Is Hall 2 crowded?
- How many people are in Hall 3?

### ops_overcrowded_areas
Purpose: List halls that are overcrowded or busiest right now.
Example queries:
- Which hall is busiest?
- Which area is busiest?
- Show overcrowded areas

### ops_compare_periods
Purpose: Compare current occupancy with yesterday.
Example queries:
- Compare Hall 1 with yesterday
- Compare with yesterday
- Hall 2 vs yesterday

### ops_trend_occupancy
Purpose: Show occupancy trend over time.
Example queries:
- Show occupancy trend for Hall 1
- Show trend instead
- How did it change?

### ops_peak_time
Purpose: Return peak occupancy time for the selected hall.
Example queries:
- Which time was peak?
- What time was busiest?
- Peak time for Hall 1

### ops_change_focus
Purpose: Change current hall focus within the assistant session.
Example queries:
- Show only Hall 2
- Switch to Hall 3
- Focus on Hall 1

### ops_hall_ranking
Purpose: Return the top-ranked hall by occupancy.
Example queries:
- Which hall is highest?
- Which hall has the highest occupancy?
- Highest occupancy hall

### ops_top_busiest_halls
Purpose: Return the top N busiest halls.
Example queries:
- Top 3 busiest halls
- Top halls
- Top 2 halls

### ops_summarize_view
Purpose: Summarize the current operations context.
Example queries:
- Summarize that
- Summarise that

## Supported follow-ups
- Compare with yesterday
- Show trend instead
- Which time was peak?
- Summarize that
- Show only Hall 2

## Current non-operations intents
The codebase also includes baseline handlers for:
- SOC
- Exhibitor
- Sustainability

These remain modular and can be expanded later while preserving the same request/response contract.
