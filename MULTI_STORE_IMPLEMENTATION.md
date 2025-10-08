# Multi-Store Implementation Guide

## Overview

I've successfully implemented multi-store functionality for your Tachora scheduling application. The system now properly handles multiple stores per manager and cross-store employee management.

## What Was Implemented

### 🏪 **Multi-Store Support**

**API Updates:**
- **Setup API** (`/api/setup`): Now returns all stores and accepts `?storeId=` parameter
- **Store Selection**: Query specific store data while maintaining access to all stores
- **Cross-Store Employees**: Employees with `canWorkAcrossStores: true` appear in all stores

**Response Structure:**
```typescript
{
  stores: StoreResponse[],        // All manager's stores
  store: StoreResponse,           // Currently selected store
  employees: EmployeeResponse[],  // Store employees + cross-store employees
  shiftTemplates: ShiftTemplateResponse[],
  workTypes: WorkTypeResponse[],
  onboardingStep: OnboardingStep
}
```

### 🎯 **Store Selector Component**

**Features:**
- **Dropdown Interface**: Clean store selection with store names and cities
- **Visual Indicators**: Green dot for active store, different styling for selection
- **Auto-Hide**: Shows simple display when only one store exists
- **Responsive**: Works well on different screen sizes

**Usage:**
```typescript
<StoreSelector 
  stores={stores}
  currentStoreId={store?.id}
  onStoreChange={(storeId) => {
    setSelectedStoreId(storeId);
    refetch(storeId);
  }}
/>
```

### 👥 **Cross-Store Employee Management**

**Visual Indicators:**
- **Blue Background**: Cross-store employees have subtle blue background
- **Arrow Icon** (↗): Indicates employee is from another store
- **Store Badge**: Shows which store the employee belongs to
- **Cross-Store Badge**: Green badge for employees who can work across stores

**Functionality:**
- **Read-Only Access**: Cross-store employees can't be edited from other stores
- **Availability**: Cross-store employees' availability is shown for scheduling
- **Drag & Drop**: Can assign cross-store employees to shifts in any store

### 📱 **Updated User Interface**

**Schedule Page:**
- Store selector in header
- Cross-store employees clearly marked in availability panel
- Maintains all existing drag-and-drop functionality

**Employees Page:**
- Store selector integrated into page header
- Cross-store employees shown with visual indicators
- Edit/delete buttons only for store's own employees

## How It Works

### 1. **Store Selection Flow**
```
User opens app → API returns all stores → 
First store selected by default → 
User can switch stores via dropdown → 
Data refreshes for selected store
```

### 2. **Employee Visibility**
```
Store A Employees: Always visible in Store A
Store B Employees: Visible in Store A only if canWorkAcrossStores = true
Store A + Cross-Store: Can be scheduled in any store
```

### 3. **Data Fetching**
```
/api/setup → Returns Store A + Cross-store employees
/api/setup?storeId=B → Returns Store B + Cross-store employees
```

## Your Seed Data

With your current seed data, you have:

### **Stores:**
1. **Downtown Brussels** - 4 employees (Alice, Bob, Claire, David)
2. **Antwerp Central** - 2 employees (Emma, Frank)

### **Cross-Store Employees:**
- **Alice Johnson** (Cashier) - Can work across stores
- **Claire Davis** (Security) - Can work across stores  
- **Frank Miller** (Customer Service) - Can work across stores

### **Store-Specific Employees:**
- **Bob Smith** (Sales Lead) - Downtown Brussels only
- **David Wilson** (Stock Assistant) - Downtown Brussels only
- **Emma Brown** (Store Supervisor) - Antwerp Central only

## Testing the Implementation

### **Schedule Page:**
1. Navigate to `/schedule`
2. Use store selector to switch between stores
3. Notice different employees appear in availability panel
4. Cross-store employees show with blue background and ↗ icon
5. Drag cross-store employees to shifts - it works!

### **Employees Page:**
1. Navigate to `/schedule/employees`
2. Switch between stores using selector
3. See cross-store employees with "From: [Store Name]" badges
4. Notice edit/delete buttons only appear for store's own employees

### **API Testing:**
```bash
# Get Downtown Brussels data (default)
curl "/api/setup"

# Get Antwerp Central data specifically  
curl "/api/setup?storeId=cmgf9b6ur00037kzogwa2io65"
```

## Key Benefits

### ✅ **Seamless Experience**
- No breaking changes to existing functionality
- Intuitive store switching
- Clear visual indicators for cross-store employees

### ✅ **Proper Data Isolation**
- Each store's data is properly separated
- Cross-store employees appear where appropriate
- No accidental data mixing

### ✅ **Flexible Scheduling**
- Can assign cross-store employees to any store
- Maintains employee availability across stores
- Supports complex multi-location scheduling

### ✅ **Type Safety**
- All new functionality is fully typed
- Compile-time validation for store relationships
- Consistent API contracts

## Future Enhancements

The foundation is now in place for additional multi-store features:

1. **Store-Specific Roles**: Different work types per store
2. **Transfer Employees**: Move employees between stores
3. **Multi-Store Schedules**: View schedules across all stores
4. **Store Analytics**: Compare performance across locations
5. **Bulk Operations**: Manage multiple stores simultaneously

## Migration Notes

- **Existing Data**: All existing single-store setups continue to work
- **API Compatibility**: Original API calls still function (return first store)
- **UI Graceful**: Store selector hides when only one store exists
- **Performance**: Efficient queries with proper indexing

Your application now properly handles the multi-store scenario you described! You can see shifts and employees for each store separately, and cross-store employees are clearly indicated and available for scheduling across all locations.