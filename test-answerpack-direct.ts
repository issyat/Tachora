/**
 * Direct test of AnswerPack data fetching
 */

import { fetchAnswerPack } from './src/server/copilot/data/answer-pack';

async function testAnswerPackDirect() {
  console.log("🔍 Testing AnswerPack data fetching directly...");
  
  try {
    const result = await fetchAnswerPack({
      managerId: 'user_3329TDaGk7PRFLRGGcebxRgCqey',
      storeId: 'store_1', // Replace with actual store ID
      isoWeek: '2025-W43',
      includeOtherStores: false,
    });
    
    console.log("✅ AnswerPack result:");
    console.log("Scope:", result.scope);
    console.log("Record counts:", result.recordCounts);
    console.log("Sources:", result.sources);
    
    console.log("\n📊 Unassigned shifts:");
    if (result.unassignedByDay.length === 0) {
      console.log("   No unassigned shifts found");
    } else {
      result.unassignedByDay.forEach(u => {
        console.log(`   ${u.day} ${u.startTime}-${u.endTime} ${u.workTypeName}: ${u.unassigned} positions needed`);
      });
      
      const totalUnassigned = result.unassignedByDay.reduce((sum, u) => sum + u.unassigned, 0);
      console.log(`   Total unassigned positions: ${totalUnassigned}`);
    }
    
    console.log("\n📋 Templates:");
    if (result.templates.length === 0) {
      console.log("   No templates found");
    } else {
      result.templates.forEach(t => {
        console.log(`   ${t.workTypeName} ${t.startTime}-${t.endTime}, capacity: ${t.capacity}, days: ${t.days.join(',')}`);
      });
    }
    
    console.log("\n📝 Assignments:");
    console.log(`   Total: ${result.assignments.length}`);
    const unassignedAssignments = result.assignments.filter(a => !a.employeeId);
    console.log(`   Unassigned: ${unassignedAssignments.length}`);
    
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testAnswerPackDirect();