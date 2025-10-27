// Test the magic link availability system
const BASE_URL = 'http://localhost:3000';

async function testAvailabilityMagicLinks() {
  console.log('🧪 Testing Magic Link Availability System\n');

  try {
    // First, we need to get a store ID from the setup
    console.log('1. Getting store information...');
    const setupResponse = await fetch(`${BASE_URL}/api/setup`, {
      headers: {
        'Cookie': 'your-auth-cookie-here' // You'll need to get this from browser
      }
    });

    if (!setupResponse.ok) {
      console.log('❌ Need to be logged in to test. Please:');
      console.log('   1. Start the dev server: npm run dev');
      console.log('   2. Login to the app in your browser');
      console.log('   3. Copy the auth cookie and update this test');
      return;
    }

    const setupData = await setupResponse.json();
    const storeId = setupData.store?.id;

    if (!storeId) {
      console.log('❌ No store found. Please complete the store setup first.');
      return;
    }

    console.log(`✅ Found store: ${setupData.store.name} (${storeId})`);

    // Test generating availability request links
    console.log('\n2. Testing availability request generation...');
    const requestResponse = await fetch(`${BASE_URL}/api/availability/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'your-auth-cookie-here'
      },
      body: JSON.stringify({ storeId })
    });

    const requestData = await requestResponse.json();

    if (!requestResponse.ok) {
      console.log(`❌ Request failed: ${requestData.error}`);
      if (requestData.details) {
        console.log(`   Details: ${requestData.details}`);
      }
      return;
    }

    console.log(`✅ Generated ${requestData.tokens?.length || 0} magic links`);
    
    if (requestData.tokens && requestData.tokens.length > 0) {
      const firstToken = requestData.tokens[0];
      console.log(`   Example link: ${firstToken.magicLink}`);
      
      // Test validating the token
      console.log('\n3. Testing token validation...');
      const validateResponse = await fetch(`${BASE_URL}/api/availability/validate?token=${firstToken.token}`);
      const validateData = await validateResponse.json();

      if (validateResponse.ok) {
        console.log(`✅ Token valid for employee: ${validateData.employee.name}`);
        console.log(`   Store: ${validateData.employee.store.name}`);
        console.log(`   Contract: ${validateData.employee.contractType}`);
      } else {
        console.log(`❌ Token validation failed: ${validateData.error}`);
      }

      // Test submitting availability (example data)
      console.log('\n4. Testing availability submission...');
      const testAvailability = [
        { day: 'MON', isOff: false, startTime: '09:00', endTime: '17:00' },
        { day: 'TUE', isOff: false, startTime: '10:00', endTime: '18:00' },
        { day: 'WED', isOff: true },
        { day: 'THU', isOff: false, startTime: '09:00', endTime: '17:00' },
        { day: 'FRI', isOff: false, startTime: '09:00', endTime: '17:00' },
        { day: 'SAT', isOff: true },
        { day: 'SUN', isOff: true }
      ];

      const submitResponse = await fetch(`${BASE_URL}/api/availability/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: firstToken.token,
          availability: testAvailability
        })
      });

      const submitData = await submitResponse.json();

      if (submitResponse.ok) {
        console.log(`✅ Availability submitted successfully for ${submitData.employee.name}`);
        console.log(`   Store: ${submitData.employee.store}`);
      } else {
        console.log(`❌ Availability submission failed: ${submitData.error}`);
      }

      // Test that token is now used
      console.log('\n5. Testing token reuse prevention...');
      const reuseResponse = await fetch(`${BASE_URL}/api/availability/validate?token=${firstToken.token}`);
      const reuseData = await reuseResponse.json();

      if (!reuseResponse.ok && reuseData.error.includes('already been used')) {
        console.log('✅ Token correctly marked as used - prevents reuse');
      } else {
        console.log('❌ Token reuse prevention not working properly');
      }
    } else {
      console.log('ℹ️  No Student or Flexi employees found to test with');
      console.log('   To test fully, add some employees with:');
      console.log('   - Contract type: STUDENT or FLEXI_JOB');
      console.log('   - Email address filled in');
    }

    console.log('\n🎉 Magic Link Availability System Test Complete!');
    console.log('\n📋 To test the full user experience:');
    console.log('1. Add Student/Flexi employees with email addresses');
    console.log('2. Click "Request Availability" button in the schedule page');
    console.log('3. Copy one of the generated magic links');
    console.log('4. Open the link in an incognito window');
    console.log('5. Fill out the availability form');
    console.log('6. Check that the availability is saved in the system');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testAvailabilityMagicLinks();