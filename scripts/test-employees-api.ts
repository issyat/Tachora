/**
 * Test Employees API endpoints
 */

async function testEmployeesAPI() {
  console.log('🧪 Testing Employees API...\n');

  try {
    // First get setup to find a store
    console.log('📡 Getting setup data...');
    const setupResponse = await fetch('http://localhost:3000/api/setup');
    
    if (!setupResponse.ok) {
      console.log(`❌ Setup API failed: ${setupResponse.status}`);
      return;
    }

    const setupData = await setupResponse.json();
    const store = setupData.store;
    
    if (!store) {
      console.log('❌ No store found. Create a store first.');
      return;
    }

    console.log(`✅ Found store: ${store.name} (${store.id})`);

    // Test GET employees
    console.log(`\n📡 Testing GET /api/employees?storeId=${store.id}...`);
    const getResponse = await fetch(`http://localhost:3000/api/employees?storeId=${store.id}`);
    
    if (!getResponse.ok) {
      console.log(`❌ GET employees failed: ${getResponse.status}`);
      const errorText = await getResponse.text();
      console.log(`Error: ${errorText}`);
      return;
    }

    const employeesData = await getResponse.json();
    console.log(`✅ GET employees success`);
    console.log(`   Found ${employeesData.employees?.length || 0} employees`);
    
    if (employeesData.employees && employeesData.employees.length > 0) {
      const firstEmployee = employeesData.employees[0];
      console.log(`   First employee: ${firstEmployee.name} (${firstEmployee.id})`);
      console.log(`   Availability slots: ${firstEmployee.availability?.length || 0}`);
      console.log(`   Role IDs: ${firstEmployee.roleIds?.length || 0}`);
    }

    console.log('\n🎉 Employees API tests completed successfully!');

  } catch (error) {
    console.error('❌ API test failed:', error);
  }
}

// Only run if this is the main module
if (require.main === module) {
  testEmployeesAPI();
}