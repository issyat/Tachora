from __future__ import annotations

from .domain.models import SolveRequest, SolveResponse
from .solver.cpsat import CPSATSolver


class SchedulerService:
    """Application service coordinating the CP-SAT solver."""

    def __init__(self) -> None:
        self._solver = CPSATSolver()

    def generate_schedule(self, request: SolveRequest) -> SolveResponse:
        return self._solver.solve(request)


scheduler_service = SchedulerService()
