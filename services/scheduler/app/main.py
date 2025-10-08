from __future__ import annotations

import logging

from fastapi import FastAPI

from .api.routes import router as schedule_router

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Scheduler Solver Service", version="0.1.0")
app.include_router(schedule_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "scheduler-solver", "status": "ready"}
