import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== DATABASE OVERVIEW ===\n");

  // Get all stores
  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      managerId: true,
    },
  });

  console.log(`📍 STORES (${stores.length}):`);
  stores.forEach((store, i) => {
    console.log(`  ${i + 1}. ${store.name}`);
    console.log(`     ID: ${store.id}`);
    console.log(`     Manager ID: ${store.managerId}\n`);
  });

  // Get employees
  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      name: true,
      storeId: true,
      roles: {
        include: {
          workType: true,
        },
      },
    },
  });

  console.log(`\n👥 EMPLOYEES (${employees.length}):`);
  employees.forEach((emp, i) => {
    const roles = emp.roles.map(r => r.workType?.name).filter(Boolean).join(', ');
    console.log(`  ${i + 1}. ${emp.name} - Roles: ${roles}`);
  });

  // Get shift templates
  const templates = await prisma.shiftTemplate.findMany({
    include: {
      workType: true,
    },
  });

  console.log(`\n📅 SHIFT TEMPLATES (${templates.length}):`);
  const templatesByWorkType = templates.reduce((acc, t) => {
    const name = t.workType?.name || 'Unknown';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(templatesByWorkType).forEach(([workType, count]) => {
    console.log(`  • ${workType}: ${count} templates`);
  });

  // Check for Security templates specifically
  const securityTemplates = templates.filter(t => 
    t.workType?.name.toLowerCase().includes('security')
  );

  console.log(`\n🔒 SECURITY TEMPLATES (${securityTemplates.length}):`);
  securityTemplates.forEach((t, i) => {
    const days = Object.entries(t.days as Record<string, boolean>)
      .filter(([_, active]) => active)
      .map(([day]) => day)
      .join(', ');
    console.log(`  ${i + 1}. ${t.startTime.toISOString().substr(11, 5)}-${t.endTime.toISOString().substr(11, 5)}`);
    console.log(`     Days: ${days}`);
    console.log(`     Store: ${t.storeId}`);
  });

  // Check schedules
  const schedules = await prisma.schedule.findMany({
    select: {
      id: true,
      isoWeek: true,
      storeId: true,
      _count: {
        select: {
          assignments: true,
        },
      },
    },
  });

  console.log(`\n📊 SCHEDULES (${schedules.length}):`);
  schedules.forEach((s, i) => {
    console.log(`  ${i + 1}. Week ${s.isoWeek} - ${s._count.assignments} assignments`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
