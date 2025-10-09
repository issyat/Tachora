import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

async function testCrossStoreSolver() {
  console.log('🧪 Testing cross-store solver logic...');

  // Get the stores and their work types
  const downtownStore = await prisma.store.findFirst({
    where: { name: 'Downtown Brussels' },
    include: { workTypes: true },
  });

  const antwerpStore = await prisma.store.findFirst({
    where: { name: 'Antwerp Central' },
    include: { workTypes: true },
  });

  if (!downtownStore || !antwerpStore) {
    console.error('❌ Stores not found');
    return;
  }

  // Get David (from Antwerp, can work cross-store)
  const david = await prisma.employee.findFirst({
    where: { name: 'David Van Der Berg' },
    include: {
      roles: {
        include: { workType: true },
      },
    },
  });

  if (!david) {
    console.error('❌ David not found');
    return;
  }

  console.log('🏪 Downtown Brussels Manager work type:', 
    downtownStore.workTypes.find(wt => wt.name === 'Manager')?.id);
  console.log('🏪 Antwerp Manager work type:', 
    antwerpStore.workTypes.find(wt => wt.name === 'Manager')?.id);
  
  console.log('👤 David work types:');
  david.roles.forEach(role => {
    console.log(`  - ${role.workType.name} (ID: ${role.workType.id})`);
  });

  console.log('🔍 Cross-store validation logic:');
  console.log('  - David home store:', david.storeId === antwerpStore.id ? 'Antwerp ✅' : 'Other ❌');
  console.log('  - Can work across stores:', david.canWorkAcrossStores ? '✅ YES' : '❌ NO');
  
  const downtownManagerType = downtownStore.workTypes.find(wt => wt.name === 'Manager');
  const davidWorkTypeNames = david.roles.map(r => r.workType.name.toLowerCase());
  
  console.log('  - Downtown needs Manager work type ID:', downtownManagerType?.id);
  console.log('  - David has work type IDs:', david.roles.map(r => r.workType.id));
  console.log('  - David has work type names:', davidWorkTypeNames);
  console.log('  - Can work Manager by name:', davidWorkTypeNames.includes('manager') ? '✅ YES' : '❌ NO');

  if (david.canWorkAcrossStores && davidWorkTypeNames.includes('manager')) {
    console.log('🎉 David should be able to work Manager shifts in Downtown Brussels!');
    console.log('💡 The CP-SAT solver should now assign him to the second Manager shift.');
  } else {
    console.log('❌ David cannot work cross-store Manager shifts');
  }
}

testCrossStoreSolver()
  .catch((e) => {
    console.error('❌ Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });