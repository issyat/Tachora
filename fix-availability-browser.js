// Run this in the browser console on the /schedule page to fix employee availability

async function fixEmployeeAvailability() {
  try {
    console.log('🔧 Fixing employee availability...');
    
    const response = await fetch('/api/debug/fix-availability', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Success:', result);
      console.log('🔄 Refreshing page...');
      window.location.reload();
    } else {
      console.error('❌ Failed:', response.status, response.statusText);
      const error = await response.text();
      console.error('Error details:', error);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the fix
fixEmployeeAvailability();