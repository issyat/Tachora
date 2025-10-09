import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

async function testStoreDeletion() {
  console.log('🧪 Testing store deletion functionality...');

  // Get current stores
  const stores = await prisma.store.findMany({
    include: {
      employees: true,
      schedules: true,
      shiftTemplates: true,
      workTypes: true,
    },
  });

  console.log(`📊 Found ${stores.length} stores`);

  for (const store of stores) {
    console.log(`\n🏪 Store: ${store.name}`);
    console.log(`  - Employees: ${store.employees.length}`);
    console.log(`  - Schedules: ${store.schedules.length}`);
    console.log(`  - Shift Templates: ${store.shiftTemplates.length}`);
    console.log(`  - Work Types: ${store.workTypes.length}`);

    const hasData = store.employees.length > 0 || 
                   store.schedules.length > 0 || 
                   store.shiftTemplates.length > 0 || 
                   store.workTypes.length > 0;

    if (hasData) {
      console.log(`  ❌ Cannot delete - has data`);
    } else {
      console.log(`  ✅ Can be deleted - no data`);
    }
  }

  // Create a test store that can be deleted
  console.log('\n🔧 Creating test store for deletion...');
  
  const manager = await prisma.user.findFirst();
  if (!manager) {
    console.error('❌ No manager found');
    return;
  }

  const testStore = await prisma.store.create({
    data: {
      name: 'Test Store for Deletion',
      city: 'Brussels',
      country: 'BE',
      address: 'Test Address 123',
      managerId: manager.id,
      openingTime: new Date('1970-01-01T09:00:00Z'),
      closingTime: new Date('1970-01-01T18:00:00Z'),
    },
  });

  console.log(`✅ Created test store: ${testStore.name} (ID: ${testStore.id})`);

  // Test deletion
  console.log('\n🗑️ Testing deletion...');
  
  try {
    await prisma.store.delete({
      where: { id: testStore.id },
    });
    console.log('✅ Store deleted successfully!');
  } catch (error) {
    console.error('❌ Deletion failed:', error);
  }

  // Verify deletion
  const deletedStore = await prisma.store.findUnique({
    where: { id: testStore.id },
  });

  if (!deletedStore) {
    console.log('✅ Verification passed - store no longer exists');
  } else {
    console.log('❌ Verification failed - store still exists');
  }

  console.log('\n🎉 Store deletion test completed!');
}

testStoreDeletion()
  .catch((e) => {
    console.error('❌ Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });