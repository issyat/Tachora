import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

async function testCrossStoreAssignment() {
  console.log('🧪 Testing cross-store assignment for David...');

  // Get David (from Antwerp store)
  const david = await prisma.employee.findFirst({
    where: { name: 'David Van Der Berg' },
    include: {
      roles: {
        include: {
          workType: true,
        },
      },
      store: true,
    },
  });

  if (!david) {
    console.error('❌ David not found');
    return;
  }

  console.log('👤 David found:');
  console.log('  - Store:', david.store.name);
  console.log('  - Work types:', david.roles.map(r => `${r.workType.name} (ID: ${r.workType.id})`));

  // Get Downtown Brussels store and its Manager work type
  const downtownStore = await prisma.store.findFirst({
    where: { name: 'Downtown Brussels' },
    include: {
      workTypes: true,
    },
  });

  if (!downtownStore) {
    console.error('❌ Downtown Brussels store not found');
    return;
  }

  const downtownManagerType = downtownStore.workTypes.find(wt => wt.name === 'Manager');
  
  if (!downtownManagerType) {
    console.error('❌ Manager work type not found in Downtown Brussels');
    return;
  }

  console.log('🏪 Downtown Brussels Manager work type:');
  console.log('  - Name:', downtownManagerType.name);
  console.log('  - ID:', downtownManagerType.id);

  // Check if David's work types include Manager by name
  const davidWorkTypeNames = david.roles.map(r => r.workType.name.toLowerCase());
  const canWorkAsManager = davidWorkTypeNames.includes('manager');

  console.log('🔍 Cross-store validation:');
  console.log('  - David work type names:', davidWorkTypeNames);
  console.log('  - Required work type:', 'manager');
  console.log('  - Can work as Manager:', canWorkAsManager ? '✅ YES' : '❌ NO');

  if (canWorkAsManager) {
    console.log('🎉 David should be able to work Manager shifts in Downtown Brussels!');
  } else {
    console.log('❌ David cannot work Manager shifts - this needs to be fixed');
  }
}

testCrossStoreAssignment()
  .catch((e) => {
    console.error('❌ Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });