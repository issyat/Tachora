# Scheduler Solver Microservice

This FastAPI application wraps an OR-Tools CP-SAT model that builds store schedules based on
employee availability, weekly hour limits, and shift coverage requirements.

## Layout

```
services/scheduler/
├─ app/
│  ├─ api/          # FastAPI routers and request handling
│  ├─ domain/       # Pydantic models and domain entities
│  ├─ solver/       # CP-SAT model builder
│  ├─ service.py    # Application service façade
│  └─ main.py       # FastAPI entry-point
└─ requirements.txt  # Python dependencies
```

## Running locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r services/scheduler/requirements.txt
uvicorn services.scheduler.app.main:app --reload
```

The solver endpoint is exposed at `POST /v1/solve` and accepts a payload matching
`domain.models.SolveRequest`. A minimal example:

```json
{
  "store_id": "store-123",
  "iso_week": "2024-W21",
  "options": { "slot_size_minutes": 15, "solver_time_limit_seconds": 10 },
  "employees": [
    {
      "id": "emp-1",
      "name": "Alice",
      "weekly_minutes_target": 2400,
      "availability": [
        { "day": "MON", "start_minute": 540, "end_minute": 1020, "is_off": false }
      ]
    }
  ],
  "shifts": [
    { "id": "shift-1", "role": "Seller", "day": "MON", "start_minute": 540, "end_minute": 1020 }
  ]
}
```

The response includes aggregated assignment segments, coverage metrics, and uncovered windows (if allowed).
