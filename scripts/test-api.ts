/**
 * Test API endpoints to verify multi-store functionality
 */

async function testSetupAPI() {
  console.log('🧪 Testing Setup API...\n');

  try {
    // Test default setup (should return first store)
    console.log('📡 Testing /api/setup (default)...');
    const defaultResponse = await fetch('http://localhost:3000/api/setup');
    
    if (!defaultResponse.ok) {
      console.log(`❌ Default API failed: ${defaultResponse.status}`);
      return;
    }

    const defaultData = await defaultResponse.json();
    console.log(`✅ Default API success`);
    console.log(`   Stores available: ${defaultData.stores?.length || 0}`);
    console.log(`   Current store: ${defaultData.store?.name || 'None'}`);
    console.log(`   Employees: ${defaultData.employees?.length || 0}`);
    console.log(`   Shift templates: ${defaultData.shiftTemplates?.length || 0}`);
    console.log(`   Work types: ${defaultData.workTypes?.length || 0}`);

    if (defaultData.stores && defaultData.stores.length > 1) {
      const secondStore = defaultData.stores[1];
      console.log(`\n📡 Testing /api/setup?storeId=${secondStore.id}...`);
      
      const storeResponse = await fetch(`http://localhost:3000/api/setup?storeId=${secondStore.id}`);
      
      if (!storeResponse.ok) {
        console.log(`❌ Store-specific API failed: ${storeResponse.status}`);
        return;
      }

      const storeData = await storeResponse.json();
      console.log(`✅ Store-specific API success`);
      console.log(`   Current store: ${storeData.store?.name || 'None'}`);
      console.log(`   Employees: ${storeData.employees?.length || 0}`);
      
      // Check for cross-store employees
      const crossStoreEmployees = storeData.employees?.filter((emp: any) => 
        emp.storeId !== secondStore.id
      ) || [];
      
      console.log(`   Cross-store employees: ${crossStoreEmployees.length}`);
      
      if (crossStoreEmployees.length > 0) {
        console.log(`   Cross-store employee names: ${crossStoreEmployees.map((emp: any) => emp.name).join(', ')}`);
      }
    }

    console.log('\n🎉 API tests completed successfully!');

  } catch (error) {
    console.error('❌ API test failed:', error);
  }
}

// Only run if this is the main module
if (require.main === module) {
  testSetupAPI();
}