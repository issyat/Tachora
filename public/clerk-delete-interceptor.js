// Intercept Clerk's network requests for user deletion
(function() {
  console.log('🔧 Clerk network interceptor loaded');
  
  // Store original fetch
  const originalFetch = window.fetch;
  
  // Override fetch to intercept Clerk API calls
  window.fetch = async function(...args) {
    const [url, options] = args;
    
    // Check if this is a Clerk user deletion request
    if (url && typeof url === 'string' && url.includes('/users/') && 
        options && options.method === 'DELETE') {
      console.log('🗑️ Intercepted Clerk user deletion request:', url);
      
      try {
        // First delete from our database
        console.log('🗑️ Cleaning up database first...');
        const dbResponse = await originalFetch('/api/user/delete-current', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (dbResponse.ok) {
          const result = await dbResponse.json();
          console.log('✅ Database cleanup successful:', result);
          
          // Now proceed with original Clerk deletion
          console.log('🗑️ Proceeding with Clerk deletion...');
          return await originalFetch.apply(this, args);
        } else {
          console.error('❌ Database cleanup failed');
          throw new Error('Failed to delete from database');
        }
      } catch (error) {
        console.error('❌ Database cleanup failed:', error);
        // Still proceed with Clerk deletion to avoid breaking the flow
        return await originalFetch.apply(this, args);
      }
    }
    
    // For all other requests, use original fetch
    return await originalFetch.apply(this, args);
  };
  
  console.log('✅ Network interceptor ready');
})();