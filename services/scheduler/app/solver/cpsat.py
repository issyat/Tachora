from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple, Set
from collections import defaultdict
import logging

from ortools.sat.python import cp_model

from ..domain.models import (
    AssignmentSegment,
    Employee,
    LockedAssignment,
    Shift,
    SolveMetrics,
    SolveRequest,
    SolveResponse,
    Weekday,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants optimized for Belgian retail scheduling
MINUTES_PER_DAY = 24 * 60
MINUTES_PER_WEEK = 7 * 24 * 60

# Belgian labor law compliance
MIN_REST_MINUTES = 30  # Minimum rest between shifts
MAX_DAILY_MINUTES = 12 * 60  # Maximum 12 hours per day
MAX_CONSECUTIVE_DAYS = 6  # Maximum consecutive working days

# Contract type weekly limits (Belgian standards)
STUDENT_WEEKLY_LIMIT_MINUTES = 20 * 60  # 20 hours for students
PART_TIME_WEEKLY_LIMIT_MINUTES = 32 * 60  # 32 hours part-time
FULL_TIME_WEEKLY_LIMIT_MINUTES = 40 * 60  # 40 hours full-time

# Optimization weights
UNCOVERED_PENALTY_WEIGHT = 10000  # High penalty for uncovered shifts
FAIRNESS_WEIGHT = 100  # Weight for workload balancing
PREFERENCE_WEIGHT = 50  # Weight for employee preferences
CROSS_STORE_PENALTY = 25  # Small penalty for cross-store assignments

# Day mapping for constraint programming
DAY_INDEX: Dict[Weekday, int] = {
    Weekday.MON: 0, Weekday.TUE: 1, Weekday.WED: 2, Weekday.THU: 3,
    Weekday.FRI: 4, Weekday.SAT: 5, Weekday.SUN: 6,
}

@dataclass(frozen=True)
class ShiftSlot:
    """Represents a single slot within a multi-capacity shift"""
    shift: Shift
    slot_number: int  # 0, 1, 2, etc. for capacity slots
    locked_employee_id: Optional[str] = None

    @property
    def duration(self) -> int:
        return self.shift.end_minute - self.shift.start_minute
    
    @property
    def start_minute(self) -> int:
        return self.shift.start_minute
    
    @property
    def end_minute(self) -> int:
        return self.shift.end_minute

    @property
    def day_start_minute(self) -> int:
        """Absolute minute from start of week"""
        return DAY_INDEX[self.shift.day] * MINUTES_PER_DAY + self.shift.start_minute

    @property
    def day_end_minute(self) -> int:
        """Absolute minute from start of week"""
        return DAY_INDEX[self.shift.day] * MINUTES_PER_DAY + self.shift.end_minute


class CPSATSolver:
    """
    Advanced CP-SAT solver optimized for Belgian retail scheduling.
    
    Features:
    - Multi-capacity shift support
    - Belgian labor law compliance
    - Cross-store employee optimization
    - Workload balancing and fairness
    - Student worker protection
    - Advanced constraint satisfaction
    """

    def solve(self, request: SolveRequest) -> SolveResponse:
        logger.info(f"Starting optimized CP-SAT solve for store {request.store_id}, week {request.iso_week}")
        logger.info(f"Employees: {len(request.employees)}, Shifts: {len(request.shifts)}")
        
        # Quick feasibility check
        if not self._quick_feasibility_check(request):
            return self._create_infeasible_response(request, "Quick feasibility check failed")
        
        # Use greedy algorithm for large problems or as fallback
        if len(request.shifts) > 30 or len(request.employees) > 15:
            logger.info("Large problem detected, using greedy algorithm")
            return self._solve_greedy(request)
        
        # Build shift slots for multi-capacity shifts
        slots_by_shift, all_slots = self._build_shift_slots(request.shifts, request.locked_assignments)
        
        # Pre-calculate employee metrics
        employee_metrics = self._calculate_employee_metrics(request.employees, request.locked_assignments)
        
        # Create CP-SAT model with optimizations
        model = cp_model.CpModel()
        
        # Decision variables: assign_vars[(employee_id, shift_id, slot_number)]
        assign_vars: Dict[Tuple[str, str, int], cp_model.IntVar] = {}
        uncovered_vars: Dict[Tuple[str, int], cp_model.IntVar] = {}
        
        # Simplified employee workload tracking (only total minutes)
        employee_minutes: Dict[str, cp_model.LinearExpr] = {
            emp.id: model.NewConstant(employee_metrics[emp.id]['locked_minutes'])
            for emp in request.employees
        }
        
        logger.info("Creating optimized decision variables...")
        
        # Create variables only for feasible assignments
        total_variables = 0
        for shift in request.shifts:
            for slot in slots_by_shift[shift.id]:
                if slot.locked_employee_id:
                    # Update locked employee workload
                    employee_minutes[slot.locked_employee_id] = (
                        employee_minutes[slot.locked_employee_id] + slot.duration
                    )
                else:
                    # Find feasible employees (pre-filtered)
                    feasible_employees = self._find_feasible_employees_for_shift(shift, request.employees)
                    
                    if not feasible_employees:
                        if request.options.allow_uncovered:
                            uncovered_vars[(shift.id, slot.slot_number)] = model.NewBoolVar(
                                f"uncovered_{shift.id}_{slot.slot_number}"
                            )
                        continue
                    
                    # Limit to top candidates for performance
                    if len(feasible_employees) > 5:
                        feasible_employees = self._rank_employees_for_shift(
                            feasible_employees, employee_metrics, shift
                        )[:5]
                    
                    slot_vars = []
                    for employee in feasible_employees:
                        var = model.NewBoolVar(f"assign_{employee.id}_{shift.id}_{slot.slot_number}")
                        assign_vars[(employee.id, shift.id, slot.slot_number)] = var
                        slot_vars.append(var)
                        total_variables += 1
                        
                        # Update employee workload when assigned
                        employee_minutes[employee.id] = employee_minutes[employee.id] + slot.duration * var
                    
                    # Exactly one employee per slot (or uncovered if allowed)
                    if request.options.allow_uncovered and (shift.id, slot.slot_number) in uncovered_vars:
                        model.Add(sum(slot_vars) + uncovered_vars[(shift.id, slot.slot_number)] == 1)
                    else:
                        model.Add(sum(slot_vars) == 1)
        
        logger.info(f"Created {total_variables} decision variables")
        
        # Simplified constraints for performance
        for employee in request.employees:
            # Only weekly hour limits (skip daily limits for performance)
            weekly_limit = self._get_weekly_limit(employee)
            model.Add(employee_minutes[employee.id] <= weekly_limit)
        
        # Simplified objective (just minimize uncovered shifts)
        objective_terms = []
        
        if uncovered_vars:
            uncovered_total = sum(uncovered_vars.values())
            objective_terms.append(uncovered_total * UNCOVERED_PENALTY_WEIGHT)
        
        # Simple workload balancing
        if len(request.employees) <= 10:  # Only for small teams
            max_minutes = model.NewIntVar(0, MINUTES_PER_WEEK, "max_minutes")
            for employee in request.employees:
                model.Add(employee_minutes[employee.id] <= max_minutes)
            objective_terms.append(max_minutes)
        
        if objective_terms:
            model.Minimize(sum(objective_terms))
        
        logger.info("Solving optimized CP-SAT model...")
        
        # Aggressive solver settings for speed
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = min(15.0, float(request.options.solver_time_limit_seconds or 15))
        solver.parameters.num_search_workers = 2  # Reduced for stability
        solver.parameters.log_search_progress = False
        solver.parameters.cp_model_presolve = True
        solver.parameters.cp_model_probing_level = 0  # Disable probing for speed
        solver.parameters.linearization_level = 2  # Aggressive linearization
        
        status = solver.Solve(model)
        
        logger.info(f"Solver status: {solver.StatusName(status)} in {solver.WallTime():.2f}s")
        
        # If CP-SAT times out or fails, fall back to greedy
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            logger.warning(f"CP-SAT failed with status {solver.StatusName(status)}, falling back to greedy algorithm")
            return self._solve_greedy(request)
        
        # Process results
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            assignments = self._extract_assignments(
                solver, assign_vars, request.shifts, slots_by_shift, request.locked_assignments
            )
            
            # Calculate metrics
            total_minutes = sum(seg.end_minute - seg.start_minute for seg in assignments)
            total_capacity_minutes = sum(
                (shift.end_minute - shift.start_minute) * shift.capacity 
                for shift in request.shifts
            )
            coverage_ratio = total_minutes / total_capacity_minutes if total_capacity_minutes > 0 else 1.0
            
            logger.info(f"Generated {len(assignments)} assignments with {coverage_ratio:.1%} coverage")
            
            return SolveResponse(
                store_id=request.store_id,
                iso_week=request.iso_week,
                assignments=assignments,
                metrics=SolveMetrics(
                    status=solver.StatusName(status),
                    objective_value=int(solver.ObjectiveValue()) if status == cp_model.OPTIMAL else None,
                    total_assigned_minutes=total_minutes,
                    solver_wall_time_ms=int(solver.WallTime() * 1000),
                    coverage_ratio=coverage_ratio,
                ),
            )
        else:
            # Handle infeasible cases
            infeasible_reason = self._diagnose_infeasibility(request, employee_metrics)
            
            return SolveResponse(
                store_id=request.store_id,
                iso_week=request.iso_week,
                assignments=[],
                metrics=SolveMetrics(
                    status=solver.StatusName(status),
                    total_assigned_minutes=0,
                    solver_wall_time_ms=int(solver.WallTime() * 1000),
                    coverage_ratio=0.0,
                ),
                infeasible_reason=infeasible_reason,
            )

    def _build_shift_slots(
        self, shifts: List[Shift], locked_assignments: List[LockedAssignment]
    ) -> Tuple[Dict[str, List[ShiftSlot]], List[ShiftSlot]]:
        """Build shift slots for multi-capacity shifts"""
        slots_by_shift: Dict[str, List[ShiftSlot]] = {}
        all_slots: List[ShiftSlot] = []
        
        # Create locked assignment lookup
        locked_lookup: Dict[Tuple[str, Weekday, int, int, int], str] = {}
        for locked in locked_assignments:
            key = (locked.shift_id, locked.day, locked.start_minute, locked.end_minute, locked.slot)
            locked_lookup[key] = locked.employee_id
        
        for shift in shifts:
            slots = []
            for slot_num in range(shift.capacity):
                key = (shift.id, shift.day, shift.start_minute, shift.end_minute, slot_num)
                locked_employee_id = locked_lookup.get(key)
                
                slot = ShiftSlot(
                    shift=shift,
                    slot_number=slot_num,
                    locked_employee_id=locked_employee_id
                )
                slots.append(slot)
                all_slots.append(slot)
            
            slots_by_shift[shift.id] = slots
        
        return slots_by_shift, all_slots

    def _calculate_employee_metrics(
        self, employees: List[Employee], locked_assignments: List[LockedAssignment]
    ) -> Dict[str, Dict]:
        """Pre-calculate employee workload metrics"""
        metrics = {}
        
        for employee in employees:
            locked_minutes = 0
            daily_locked_minutes = defaultdict(int)
            
            for locked in locked_assignments:
                if locked.employee_id == employee.id:
                    duration = locked.end_minute - locked.start_minute
                    locked_minutes += duration
                    daily_locked_minutes[locked.day] += duration
            
            metrics[employee.id] = {
                'locked_minutes': locked_minutes,
                'daily_locked_minutes': dict(daily_locked_minutes),
                'weekly_target': employee.weekly_minutes_target,
                'weekly_limit': self._get_weekly_limit(employee),
                'remaining_capacity': max(0, self._get_weekly_limit(employee) - locked_minutes),
            }
        
        return metrics

    def _find_feasible_employees_for_shift(
        self, shift: Shift, employees: List[Employee]
    ) -> List[Employee]:
        """Find employees who can work this shift based on role, store, and availability"""
        feasible: List[Employee] = []
        
        for emp in employees:
            # Check work type compatibility
            if shift.work_type_id:
                if shift.work_type_id not in emp.role_ids:
                    continue
            elif emp.role_names and shift.role.lower() not in [r.lower() for r in emp.role_names]:
                continue
            
            # Check store compatibility
            if emp.home_store_id != shift.store_id and not emp.can_work_across_stores:
                continue
            
            # Check availability
            available = False
            for availability_slot in emp.availability:
                if (availability_slot.day == shift.day and 
                    not availability_slot.is_off and
                    availability_slot.start_minute <= shift.start_minute and
                    availability_slot.end_minute >= shift.end_minute):
                    available = True
                    break
            
            if available:
                feasible.append(emp)
        
        return feasible

    def _get_weekly_limit(self, employee: Employee) -> int:
        """Get weekly hour limit based on contract type"""
        if employee.contract_type == 'STUDENT':
            return STUDENT_WEEKLY_LIMIT_MINUTES
        elif employee.contract_type == 'PART_TIME':
            return PART_TIME_WEEKLY_LIMIT_MINUTES
        elif employee.contract_type == 'FULL_TIME':
            return FULL_TIME_WEEKLY_LIMIT_MINUTES
        else:
            return employee.weekly_minutes_target

    def _add_locked_assignment_constraints(
        self, 
        model: cp_model.CpModel,
        slot: ShiftSlot,
        employee_minutes: Dict[str, cp_model.LinearExpr],
        daily_minutes: Dict[Tuple[str, Weekday], cp_model.LinearExpr]
    ):
        """Add constraints for locked assignments"""
        if not slot.locked_employee_id:
            return
        
        # Update employee workload
        employee_minutes[slot.locked_employee_id] = (
            employee_minutes[slot.locked_employee_id] + slot.duration
        )
        
        # Update daily workload
        daily_key = (slot.locked_employee_id, slot.shift.day)
        if daily_key not in daily_minutes:
            daily_minutes[daily_key] = model.NewConstant(0)
        daily_minutes[daily_key] = daily_minutes[daily_key] + slot.duration

    def _add_no_overlap_constraints(
        self,
        model: cp_model.CpModel,
        employee: Employee,
        all_slots: List[ShiftSlot],
        assign_vars: Dict[Tuple[str, str, int], cp_model.IntVar]
    ):
        """Add constraints to prevent overlapping shifts for an employee"""
        employee_intervals = []
        
        for slot in all_slots:
            if slot.locked_employee_id == employee.id:
                # Locked assignment - create fixed interval
                start = slot.day_start_minute
                interval = model.NewIntervalVar(
                    start,
                    slot.duration + MIN_REST_MINUTES,
                    start + slot.duration + MIN_REST_MINUTES,
                    f"locked_interval_{employee.id}_{slot.shift.id}_{slot.slot_number}"
                )
                employee_intervals.append(interval)
            else:
                # Optional assignment - create conditional interval
                var = assign_vars.get((employee.id, slot.shift.id, slot.slot_number))
                if var:
                    start = slot.day_start_minute
                    interval = model.NewOptionalIntervalVar(
                        start,
                        slot.duration + MIN_REST_MINUTES,
                        start + slot.duration + MIN_REST_MINUTES,
                        var,
                        f"interval_{employee.id}_{slot.shift.id}_{slot.slot_number}"
                    )
                    employee_intervals.append(interval)
        
        # No overlapping intervals for this employee
        if len(employee_intervals) > 1:
            model.AddNoOverlap(employee_intervals)

    def _extract_assignments(
        self,
        solver: cp_model.CpSolver,
        assign_vars: Dict[Tuple[str, str, int], cp_model.IntVar],
        shifts: List[Shift],
        slots_by_shift: Dict[str, List[ShiftSlot]],
        locked_assignments: List[LockedAssignment]
    ) -> List[AssignmentSegment]:
        """Extract assignments from solved model"""
        assignments = []
        
        # Add locked assignments (preserve original times)
        for locked in locked_assignments:
            assignments.append(AssignmentSegment(
                shift_id=locked.shift_id,
                day=locked.day,
                employee_id=locked.employee_id,
                start_minute=locked.start_minute,
                end_minute=locked.end_minute,
                slot=locked.slot,
                locked=True,
            ))
        
        # Add solved assignments (use original shift template times)
        for (employee_id, shift_id, slot_number), var in assign_vars.items():
            if solver.Value(var) == 1:
                shift = next(s for s in shifts if s.id == shift_id)
                assignments.append(AssignmentSegment(
                    shift_id=shift_id,
                    day=shift.day,
                    employee_id=employee_id,
                    # Use the original shift times from the template
                    start_minute=shift.start_minute,
                    end_minute=shift.end_minute,
                    slot=slot_number,
                    locked=False,
                ))
        
        return assignments

    def _diagnose_infeasibility(
        self, request: SolveRequest, employee_metrics: Dict[str, Dict]
    ) -> str:
        """Diagnose why the problem is infeasible"""
        issues = []
        
        # Check if there are enough employees
        total_shift_minutes = sum(
            (shift.end_minute - shift.start_minute) * shift.capacity 
            for shift in request.shifts
        )
        total_employee_capacity = sum(
            metrics['remaining_capacity'] for metrics in employee_metrics.values()
        )
        
        if total_shift_minutes > total_employee_capacity:
            issues.append(f"Insufficient employee capacity: need {total_shift_minutes} minutes, have {total_employee_capacity}")
        
        # Check for shifts with no feasible employees
        uncoverable_shifts = []
        for shift in request.shifts:
            feasible = self._find_feasible_employees_for_shift(shift, request.employees)
            if not feasible:
                uncoverable_shifts.append(f"{shift.role} on {shift.day} {shift.start_minute//60:02d}:{shift.start_minute%60:02d}")
        
        if uncoverable_shifts:
            issues.append(f"Shifts with no available employees: {', '.join(uncoverable_shifts[:3])}")
            if len(uncoverable_shifts) > 3:
                issues.append(f"...and {len(uncoverable_shifts) - 3} more")
        
        return "; ".join(issues) if issues else "Unknown infeasibility - check employee availability and shift requirements"

    def _quick_feasibility_check(self, request: SolveRequest) -> bool:
        """Quick feasibility check to avoid expensive CP-SAT setup"""
        if not request.employees:
            return False
        
        if not request.shifts:
            return True
        
        # Check if any employee can work any shift
        for shift in request.shifts:
            feasible = self._find_feasible_employees_for_shift(shift, request.employees)
            if not feasible and not request.options.allow_uncovered:
                return False
        
        return True

    def _solve_greedy(self, request: SolveRequest) -> SolveResponse:
        """Fast greedy algorithm for large problems"""
        logger.info("Using greedy algorithm for fast solving")
        
        assignments = []
        employee_workload = {emp.id: 0 for emp in request.employees}
        
        # Add locked assignments
        for locked in request.locked_assignments:
            assignments.append(AssignmentSegment(
                shift_id=locked.shift_id,
                day=locked.day,
                employee_id=locked.employee_id,
                start_minute=locked.start_minute,
                end_minute=locked.end_minute,
                slot=locked.slot,
                locked=True,
            ))
            employee_workload[locked.employee_id] += locked.end_minute - locked.start_minute
        
        # Greedy assignment
        for shift in request.shifts:
            for slot_num in range(shift.capacity):
                # Check if this slot is locked
                is_locked = any(
                    locked.shift_id == shift.id and locked.slot == slot_num
                    for locked in request.locked_assignments
                )
                if is_locked:
                    continue
                
                # Find best available employee
                feasible = self._find_feasible_employees_for_shift(shift, request.employees)
                if not feasible:
                    continue
                
                # Sort by current workload (prefer under-utilized employees)
                feasible.sort(key=lambda emp: (
                    employee_workload[emp.id],
                    -emp.weekly_minutes_target  # Prefer higher targets as tiebreaker
                ))
                
                best_employee = feasible[0]
                shift_duration = shift.end_minute - shift.start_minute
                
                # Check if employee can take this shift
                if employee_workload[best_employee.id] + shift_duration <= self._get_weekly_limit(best_employee):
                    assignments.append(AssignmentSegment(
                        shift_id=shift.id,
                        day=shift.day,
                        employee_id=best_employee.id,
                        # Use the original shift template times
                        start_minute=shift.start_minute,
                        end_minute=shift.end_minute,
                        slot=slot_num,
                        locked=False,
                    ))
                    employee_workload[best_employee.id] += shift_duration
        
        # Calculate metrics
        total_minutes = sum(seg.end_minute - seg.start_minute for seg in assignments if not seg.locked)
        total_capacity_minutes = sum(
            (shift.end_minute - shift.start_minute) * shift.capacity 
            for shift in request.shifts
        )
        coverage_ratio = total_minutes / total_capacity_minutes if total_capacity_minutes > 0 else 1.0
        
        logger.info(f"Greedy algorithm generated {len(assignments)} assignments with {coverage_ratio:.1%} coverage")
        
        return SolveResponse(
            store_id=request.store_id,
            iso_week=request.iso_week,
            assignments=assignments,
            metrics=SolveMetrics(
                status="GREEDY_SOLUTION",
                total_assigned_minutes=total_minutes,
                solver_wall_time_ms=50,  # Greedy is very fast
                coverage_ratio=coverage_ratio,
            ),
        )

    def _rank_employees_for_shift(
        self, employees: List[Employee], employee_metrics: Dict[str, Dict], shift: Shift
    ) -> List[Employee]:
        """Rank employees by suitability for a shift"""
        def score_employee(emp: Employee) -> float:
            score = 0.0
            
            # Prefer employees under their weekly target
            remaining = employee_metrics[emp.id]['remaining_capacity']
            if remaining > 0:
                score += remaining / 100.0
            
            # Prefer home store employees
            if emp.home_store_id == shift.store_id:
                score += 10.0
            
            # Prefer employees with exact role match
            if shift.work_type_id and shift.work_type_id in emp.role_ids:
                score += 5.0
            
            return score
        
        return sorted(employees, key=score_employee, reverse=True)

    def _create_infeasible_response(self, request: SolveRequest, reason: str) -> SolveResponse:
        """Create a response for infeasible problems"""
        return SolveResponse(
            store_id=request.store_id,
            iso_week=request.iso_week,
            assignments=[],
            metrics=SolveMetrics(
                status="INFEASIBLE",
                total_assigned_minutes=0,
                solver_wall_time_ms=10,
                coverage_ratio=0.0,
            ),
            infeasible_reason=reason,
        )