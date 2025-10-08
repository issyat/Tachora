/**
 * Check Alice Johnson's availability in the database
 */

async function checkAliceAvailability() {
  console.log('🔍 Checking Alice Johnson\'s availability...\n');

  try {
    // First get setup to find Alice
    console.log('📡 Getting setup data...');
    const setupResponse = await fetch('http://localhost:3000/api/setup');
    
    if (!setupResponse.ok) {
      console.log(`❌ Setup API failed: ${setupResponse.status}`);
      return;
    }

    const setupData = await setupResponse.json();
    const employees = setupData.employees || [];
    
    const alice = employees.find((emp: any) => emp.name === 'Alice Johnson');
    
    if (!alice) {
      console.log('❌ Alice Johnson not found in employees');
      console.log('Available employees:', employees.map((emp: any) => emp.name));
      return;
    }

    console.log('✅ Found Alice Johnson:');
    console.log(`   ID: ${alice.id}`);
    console.log(`   Email: ${alice.email}`);
    console.log(`   Store ID: ${alice.storeId}`);
    console.log(`   Can work across stores: ${alice.canWorkAcrossStores}`);
    
    console.log('\n📅 Availability:');
    alice.availability.forEach((avail: any) => {
      if (avail.isOff) {
        console.log(`   ${avail.day}: OFF`);
      } else {
        console.log(`   ${avail.day}: ${avail.startTime} - ${avail.endTime}`);
      }
    });

    // Check specifically Monday
    const mondayAvail = alice.availability.find((avail: any) => avail.day === 'MON');
    if (mondayAvail) {
      console.log('\n🔍 Monday availability details:');
      console.log(`   Is off: ${mondayAvail.isOff}`);
      console.log(`   Start time: ${mondayAvail.startTime}`);
      console.log(`   End time: ${mondayAvail.endTime}`);
      
      if (!mondayAvail.isOff && mondayAvail.startTime === '08:00') {
        console.log('✅ Alice should be available from 08:00 on Monday');
      } else {
        console.log('❌ Alice is NOT available from 08:00 on Monday');
      }
    }

  } catch (error) {
    console.error('❌ Error checking availability:', error);
  }
}

// Only run if this is the main module
if (require.main === module) {
  checkAliceAvailability();
}