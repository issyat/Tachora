#!/usr/bin/env python3

"""
Direct test of the CP-SAT solver to verify overlap prevention
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'services', 'scheduler'))

from app.domain.models import (
    Employee, Shift, SolveRequest, SolveOptions, Weekday, AvailabilitySlot
)
from app.solver.cpsat import CPSATSolver

def test_overlap_prevention():
    print("🧪 Testing CP-SAT solver overlap prevention...\n")
    
    # Create test employee (Alice)
    alice = Employee(
        id="alice-123",
        name="Alice Johnson",
        home_store_id="downtown-brussels",
        role_ids=["cashier-id", "manager-id"],
        role_names=["Cashier", "Manager"],
        contract_type="FULL_TIME",
        weekly_minutes_target=2400,  # 40 hours
        can_work_across_stores=False,
        availability=[
            # Available Monday 7:00-18:00
            AvailabilitySlot(
                day=Weekday.MON,
                start_minute=7*60,  # 7:00
                end_minute=18*60,   # 18:00
                is_off=False
            )
        ]
    )
    
    # Create overlapping shifts
    cashier_shift = Shift(
        id="cashier-shift-mon",
        store_id="downtown-brussels",
        day=Weekday.MON,
        start_minute=8*60,   # 8:00
        end_minute=16*60,    # 16:00
        capacity=1,
        work_type_id="cashier-id",
        role="Cashier"
    )
    
    manager_shift = Shift(
        id="manager-shift-mon", 
        store_id="downtown-brussels",
        day=Weekday.MON,
        start_minute=9*60,   # 9:00 (overlaps with cashier shift!)
        end_minute=17*60,    # 17:00
        capacity=1,
        work_type_id="manager-id",
        role="Manager"
    )
    
    # Create solve request
    request = SolveRequest(
        store_id="downtown-brussels",
        iso_week="2024-W02",
        employees=[alice],
        shifts=[cashier_shift, manager_shift],
        locked_assignments=[],
        options=SolveOptions(
            allow_uncovered=True,
            solver_time_limit_seconds=10
        )
    )
    
    # Solve
    solver = CPSATSolver()
    response = solver.solve(request)
    
    print(f"📊 Solver Status: {response.metrics.status}")
    print(f"📊 Coverage: {response.metrics.coverage_ratio:.1%}")
    print(f"📊 Assignments: {len(response.assignments)}")
    print(f"⏱️  Solve Time: {response.metrics.solver_wall_time_ms}ms\n")
    
    # Check assignments
    alice_assignments = [a for a in response.assignments if a.employee_id == "alice-123"]
    
    print("📋 Alice's assignments:")
    for assignment in alice_assignments:
        start_time = f"{assignment.start_minute//60:02d}:{assignment.start_minute%60:02d}"
        end_time = f"{assignment.end_minute//60:02d}:{assignment.end_minute%60:02d}"
        shift = next(s for s in request.shifts if s.id == assignment.shift_id)
        print(f"  {assignment.day} {start_time}-{end_time} ({shift.role})")
    
    # Check for overlaps
    if len(alice_assignments) > 1:
        # Sort by start time
        alice_assignments.sort(key=lambda a: a.start_minute)
        
        overlap_found = False
        for i in range(len(alice_assignments) - 1):
            current = alice_assignments[i]
            next_assignment = alice_assignments[i + 1]
            
            if current.day == next_assignment.day and current.end_minute > next_assignment.start_minute:
                overlap_found = True
                print(f"\n❌ OVERLAP DETECTED!")
                print(f"   Shift 1: {current.start_minute//60:02d}:{current.start_minute%60:02d}-{current.end_minute//60:02d}:{current.end_minute%60:02d}")
                print(f"   Shift 2: {next_assignment.start_minute//60:02d}:{next_assignment.start_minute%60:02d}-{next_assignment.end_minute//60:02d}:{next_assignment.end_minute%60:02d}")
                print(f"   Overlap: {current.end_minute - next_assignment.start_minute} minutes")
        
        if not overlap_found:
            print("\n✅ No overlaps detected! Fix is working correctly.")
    elif len(alice_assignments) == 1:
        print("\n✅ Only one assignment - no overlaps possible.")
        print("   This suggests the solver correctly prevented the overlapping assignment.")
    else:
        print("\n⚠️  No assignments found - check if this is expected.")

if __name__ == "__main__":
    test_overlap_prevention()