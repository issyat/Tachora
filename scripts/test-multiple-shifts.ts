import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

async function testMultipleShifts() {
  console.log('🧪 Testing multiple identical shift templates...');

  // Get the Downtown Brussels store
  const store = await prisma.store.findFirst({
    where: { name: 'Downtown Brussels' },
    include: {
      workTypes: true,
    },
  });

  if (!store) {
    console.error('❌ Store not found');
    return;
  }

  const cashierType = store.workTypes.find(wt => wt.name === 'Cashier');
  if (!cashierType) {
    console.error('❌ Cashier work type not found');
    return;
  }

  console.log('🏪 Store:', store.name);
  console.log('💼 Cashier work type ID:', cashierType.id);

  // Create 3 identical shift templates
  console.log('📝 Creating 3 identical shift templates...');
  
  const templates = [];
  for (let i = 1; i <= 3; i++) {
    const template = await prisma.shiftTemplate.create({
      data: {
        storeId: store.id,
        workTypeId: cashierType.id,
        days: { MON: true, TUE: false, WED: false, THU: false, FRI: false, SAT: false, SUN: false },
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T17:00:00Z'),
      },
    });
    templates.push(template);
    console.log(`  ✅ Template ${i} created: ${template.id}`);
  }

  // Check how many templates we have for Monday Cashier 9-17
  const mondayTemplates = await prisma.shiftTemplate.findMany({
    where: {
      storeId: store.id,
      workTypeId: cashierType.id,
      days: { path: ['MON'], equals: true },
    },
    include: {
      workType: true,
    },
  });

  console.log(`\n📊 Found ${mondayTemplates.length} Monday Cashier templates:`);
  mondayTemplates.forEach((template, index) => {
    console.log(`  ${index + 1}. ID: ${template.id}, Work Type: ${template.workType?.name}`);
  });

  if (mondayTemplates.length >= 3) {
    console.log('✅ Multiple identical shift templates created successfully!');
    console.log('🎯 These should appear as 3 separate blocks in the schedule timeline.');
  } else {
    console.log('❌ Not enough templates found');
  }

  // Clean up - remove the test templates
  console.log('\n🧹 Cleaning up test templates...');
  for (const template of templates) {
    await prisma.shiftTemplate.delete({
      where: { id: template.id },
    });
  }
  console.log('✅ Cleanup completed');
}

testMultipleShifts()
  .catch((e) => {
    console.error('❌ Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });