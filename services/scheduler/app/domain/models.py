from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, validator


class Weekday(str, Enum):
    MON = "MON"
    TUE = "TUE"
    WED = "WED"
    THU = "THU"
    FRI = "FRI"
    SAT = "SAT"
    SUN = "SUN"

    @classmethod
    def from_iso_index(cls, index: int) -> "Weekday":
        members = [cls.MON, cls.TUE, cls.WED, cls.THU, cls.FRI, cls.SAT, cls.SUN]
        return members[index % 7]


class AvailabilitySlot(BaseModel):
    day: Weekday
    is_off: bool = False
    start_minute: int = Field(..., ge=0, le=24 * 60)
    end_minute: int = Field(..., ge=0, le=24 * 60)

    @validator("end_minute")
    def validate_range(cls, v: int, values):  # type: ignore[override]
        start = values.get("start_minute")
        is_off = values.get("is_off", False)
        if not is_off and start is not None and v <= start:
            raise ValueError("end_minute must be greater than start_minute for working slots")
        return v


class Employee(BaseModel):
    id: str
    name: str
    home_store_id: str
    can_work_across_stores: bool
    contract_type: str
    weekly_minutes_target: int = Field(..., ge=0, le=60 * 80)
    role_ids: List[str]
    role_names: List[str]
    availability: List[AvailabilitySlot]


class Shift(BaseModel):
    id: str
    role: str
    day: Weekday
    start_minute: int = Field(..., ge=0, le=24 * 60)
    end_minute: int = Field(..., ge=0, le=24 * 60)
    capacity: int = Field(1, ge=1, le=10)  # Number of employees needed for this shift
    store_id: str
    work_type_id: Optional[str] = None

    @validator("end_minute")
    def validate_range(cls, v: int, values):  # type: ignore[override]
        start = values.get("start_minute")
        if start is not None and v <= start:
            raise ValueError("Shift end must be after start")
        return v


class LockedAssignment(BaseModel):
    employee_id: str
    shift_id: str
    day: Weekday
    start_minute: int
    end_minute: int
    slot: int = 0  # Slot number within the shift


class SolveOptions(BaseModel):
    slot_size_minutes: int = Field(15, ge=5, le=120)
    solver_time_limit_seconds: Optional[int] = Field(15, ge=1)
    allow_uncovered: bool = False
    stint_start_penalty: int = Field(50, ge=0)


class SolveRequest(BaseModel):
    store_id: str
    iso_week: str
    shifts: List[Shift]
    employees: List[Employee]
    locked_assignments: List[LockedAssignment] = []
    options: SolveOptions = SolveOptions()


class AssignmentSegment(BaseModel):
    shift_id: str
    day: Weekday
    employee_id: str
    start_minute: int
    end_minute: int
    slot: int = 0  # Slot number within the shift (0, 1, 2, etc.)
    locked: bool = False


class SolveMetrics(BaseModel):
    status: str
    objective_value: Optional[int] = None
    total_assigned_minutes: int
    solver_wall_time_ms: Optional[int]
    coverage_ratio: float


class SolveResponse(BaseModel):
    store_id: str
    iso_week: str
    assignments: List[AssignmentSegment]
    metrics: SolveMetrics
    infeasible_reason: Optional[str] = None
    uncovered_segments: List[AssignmentSegment] = []


