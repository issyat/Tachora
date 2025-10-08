from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..domain.models import SolveRequest, SolveResponse
from ..service import scheduler_service

router = APIRouter(prefix="/v1", tags=["schedule"])


@router.post("/solve", response_model=SolveResponse)
async def solve_schedule(request: SolveRequest) -> SolveResponse:
    try:
        return scheduler_service.generate_schedule(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - safety net
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Solver failed: {exc}") from exc


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
