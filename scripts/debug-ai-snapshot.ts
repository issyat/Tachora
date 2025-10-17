import { buildScheduleFacts } from "../src/server/schedule/facts-builder";

async function main() {
  const storeId = "cmgo4mnx100027kdwdsqz7xyl";
  const weekId = "2025-W42";
  const managerId = "cm3rz958z0003q6jbks6k0ixz"; // Replace with actual manager ID

  console.log("Building schedule facts...\n");

  const facts = await buildScheduleFacts({
    managerId,
    storeId,
    weekId,
  });

  console.log(`=== Schedule Facts Summary ===`);
  console.log(`Store: ${facts.snapshot.storeName}`);
  console.log(`Week: ${facts.snapshot.isoWeek}`);
  console.log(`\nEmployees: ${facts.snapshot.employees.length}`);
  console.log(`Assignments: ${facts.snapshot.assignments.length}`);
  console.log(`Open Shifts: ${facts.snapshot.openShifts.length}`);

  // Check assignments for Security
  const securityAssignments = facts.snapshot.assignments.filter(a =>
    a.workTypeName.toLowerCase().includes('security')
  );

  console.log(`\n=== Security in assignments[] ===`);
  console.log(`Total Security assignments: ${securityAssignments.length}`);
  securityAssignments.forEach(a => {
    console.log(`  ${a.day}: ${a.start}-${a.end}, Employee: ${a.employeeName || 'NONE'}, EmployeeId: ${a.employeeId || 'null'}`);
  });

  // Check open shifts for Security
  const securityOpenShifts = facts.snapshot.openShifts.filter(s =>
    s.workTypeName.toLowerCase().includes('security')
  );

  console.log(`\n=== Security in openShifts[] ===`);
  console.log(`Total Security open shifts: ${securityOpenShifts.length}`);
  securityOpenShifts.forEach(s => {
    console.log(`  ${s.day}: ${s.start}-${s.end}, ${s.workTypeName}`);
  });

  // Check minimal snapshot
  const minimalSnapshot = facts.minimalSnapshot;
  if (minimalSnapshot) {
    console.log(`\n=== Minimal Snapshot (sent to LLM) ===`);
    console.log(`Employees: ${minimalSnapshot.employees.length}`);
    console.log(`Assignments: ${minimalSnapshot.assignments.length}`);
    console.log(`Open Shifts: ${minimalSnapshot.openShifts.length}`);

    const minSecurityOpen = minimalSnapshot.openShifts.filter(s =>
      s.workTypeName.toLowerCase().includes('security')
    );
    console.log(`\nSecurity in minimalSnapshot.openShifts: ${minSecurityOpen.length}`);
    minSecurityOpen.forEach(s => {
      console.log(`  ${s.day}: ${s.start}-${s.end}`);
    });

    const minSecurityAssignments = minimalSnapshot.assignments.filter(a =>
      a.workTypeName.toLowerCase().includes('security')
    );
    console.log(`\nSecurity in minimalSnapshot.assignments: ${minSecurityAssignments.length}`);
    minSecurityAssignments.forEach(a => {
      console.log(`  ${a.day}: EmployeeId=${a.employeeId || 'null'}`);
    });
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
