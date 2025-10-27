# Clerk Webhook Setup Guide 🔗

This guide will help you set up Clerk webhooks to automatically sync user deletions between Clerk and your Supabase database.

## 🎯 **Why This Is Important:**

When you delete a user from Clerk dashboard, their data remains in your Supabase database. This webhook ensures:
- ✅ **Complete user deletion** from both systems
- ✅ **Data consistency** between Clerk and Supabase  
- ✅ **GDPR compliance** for user data deletion
- ✅ **Automatic cleanup** of stores, employees, schedules

## 🚀 **Setup Steps (5 minutes):**

### 1. **Create Webhook in Clerk Dashboard**
1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Select your application
3. Go to **Webhooks** in the sidebar
4. Click **"Add Endpoint"**

### 2. **Configure Webhook Endpoint**
- **Endpoint URL**: `https://yourdomain.com/api/webhooks/clerk`
  - For development: `http://localhost:3000/api/webhooks/clerk`
  - For production: `https://your-app-domain.com/api/webhooks/clerk`

### 3. **Select Events to Subscribe To**
Check these events:
- ✅ **user.created** (ensures user exists in database)
- ✅ **user.deleted** (triggers cleanup when user is deleted)

### 4. **Get Webhook Secret**
1. After creating the webhook, copy the **Signing Secret**
2. It starts with `whsec_`

### 5. **Update Environment Variables**
Add to your `.env` file:
```
CLERK_WEBHOOK_SECRET="whsec_your_actual_secret_here"
```

### 6. **Deploy and Test**
1. Deploy your app with the webhook endpoint
2. Test by deleting a test user from Clerk dashboard
3. Check that all their data is removed from Supabase

## 🧪 **Testing the Webhook:**

### **Create Test User:**
1. Sign up a new test account
2. Create some stores/employees
3. Verify data exists in Supabase

### **Delete Test User:**
1. Go to Clerk Dashboard → Users
2. Find the test user
3. Click **Delete User**
4. Check Supabase - all data should be gone!

## 🔧 **What Gets Deleted:**

When a user is deleted from Clerk, the webhook automatically removes:
- ✅ **User record**
- ✅ **All stores** owned by the user
- ✅ **All employees** in those stores
- ✅ **All schedules** and assignments
- ✅ **All work types** and shift templates
- ✅ **All availability** records
- ✅ **All chat/advisor** data

## 🛡️ **Security Features:**

- ✅ **Webhook signature verification** (using Clerk's signing secret)
- ✅ **Proper error handling** and logging
- ✅ **Cascade deletion** respecting foreign key constraints
- ✅ **Transaction safety** for data integrity

## 🚨 **Important Notes:**

### **For Development:**
- Use ngrok or similar to expose localhost for webhook testing
- Example: `ngrok http 3000` → use the ngrok URL in Clerk

### **For Production:**
- Use your actual domain URL
- Ensure HTTPS is enabled
- Monitor webhook logs for any failures

## 🎉 **Result:**

Once configured, user deletion will be **completely automated**:
1. **Admin deletes user** from Clerk dashboard
2. **Webhook triggers** automatically  
3. **All user data** removed from Supabase
4. **Complete cleanup** - no orphaned data!

**Perfect for GDPR compliance and data management!** 🎯

---

## 🔍 **Troubleshooting:**

### **Webhook not triggering:**
- Check the endpoint URL is correct
- Verify webhook secret in .env
- Check server logs for errors

### **Partial data deletion:**
- Check foreign key constraints
- Review deletion order in webhook code
- Check Supabase logs for constraint violations

### **Webhook verification failing:**
- Ensure CLERK_WEBHOOK_SECRET is correct
- Check that svix package is installed
- Verify webhook signature format