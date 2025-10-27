/**
 * Script to set up cross-store employees for testing
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function setupCrossStoreEmployees() {
  console.log("🔧 Setting up cross-store employees for testing...");
  
  try {
    // 1. First, let's see current employees
    const employees = await prisma.employee.findMany({
      select: {
        id: true,
        name: true,
        canWorkAcrossStores: true,
        storeId: true,
      },
    });
    
    console.log("📋 Current employees:");
    employees.forEach(emp => {
      console.log(`   - ${emp.name}: canWorkAcrossStores = ${emp.canWorkAcrossStores}`);
    });
    
    // 2. Update some employees to allow cross-store work
    const employeesToUpdate = ['Alice Johnson', 'Bob Smith', 'Frank Miller'];
    
    console.log(`\n🔄 Updating employees to allow cross-store work: ${employeesToUpdate.join(', ')}`);
    
    for (const employeeName of employeesToUpdate) {
      const result = await prisma.employee.updateMany({
        where: { name: employeeName },
        data: { canWorkAcrossStores: true },
      });
      
      if (result.count > 0) {
        console.log(`   ✅ Updated ${employeeName} to canWorkAcrossStores = true`);
      } else {
        console.log(`   ❌ Could not find employee: ${employeeName}`);
      }
    }
    
    // 3. Check if we have multiple stores
    const stores = await prisma.store.findMany({
      select: {
        id: true,
        name: true,
        managerId: true,
      },
    });
    
    console.log(`\n🏪 Available stores: ${stores.length}`);
    stores.forEach(store => {
      console.log(`   - ${store.name} (${store.id})`);
    });
    
    if (stores.length < 2) {
      console.log("\n⚠️  WARNING: Only 1 store found. Cross-store functionality requires multiple stores.");
      console.log("   Consider creating another store for the same manager to test cross-store assignments.");
    }
    
    // 4. Verify the changes
    console.log("\n📊 Updated employee status:");
    const updatedEmployees = await prisma.employee.findMany({
      where: {
        name: { in: employeesToUpdate },
      },
      select: {
        id: true,
        name: true,
        canWorkAcrossStores: true,
        storeId: true,
      },
    });
    
    updatedEmployees.forEach(emp => {
      console.log(`   - ${emp.name}: canWorkAcrossStores = ${emp.canWorkAcrossStores}`);
    });
    
    console.log("\n✅ Cross-store employee setup complete!");
    console.log("\n🧪 Next steps:");
    console.log("1. If you have multiple stores, create some assignments for these employees at other stores");
    console.log("2. Test the weekly target question again");
    console.log("3. The LLM should now include cross-store hours in the analysis");
    
  } catch (error) {
    console.error("❌ Error setting up cross-store employees:", error);
  } finally {
    await prisma.$disconnect();
  }
}

setupCrossStoreEmployees();