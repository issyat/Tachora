/**
 * Debug Alice Johnson's data directly from database
 */

import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

async function debugAliceInDB() {
  console.log('🔍 Checking Alice Johnson directly in database...\n');

  try {
    // Find Alice Johnson
    const alice = await prisma.employee.findFirst({
      where: { name: 'Alice Johnson' },
      include: {
        availability: true,
        store: true,
        roles: {
          include: { workType: true }
        }
      }
    });

    if (!alice) {
      console.log('❌ Alice Johnson not found in database');
      
      // List all employees
      const allEmployees = await prisma.employee.findMany({
        select: { id: true, name: true, email: true }
      });
      console.log('Available employees:', allEmployees);
      return;
    }

    console.log('✅ Found Alice Johnson in database:');
    console.log(`   ID: ${alice.id}`);
    console.log(`   Name: ${alice.name}`);
    console.log(`   Email: ${alice.email}`);
    console.log(`   Store: ${alice.store.name} (${alice.store.id})`);
    console.log(`   Can work across stores: ${alice.canWorkAcrossStores}`);
    console.log(`   Weekly target: ${alice.weeklyMinutesTarget} minutes`);
    
    console.log('\n📅 Raw availability data:');
    alice.availability.forEach((avail) => {
      console.log(`   ${avail.day}:`);
      console.log(`     isOff: ${avail.isOff}`);
      console.log(`     startTime: ${avail.startTime}`);
      console.log(`     endTime: ${avail.endTime}`);
    });

    // Check specifically Monday
    const mondayAvail = alice.availability.find(avail => avail.day === 'MON');
    if (mondayAvail) {
      console.log('\n🔍 Monday availability analysis:');
      console.log(`   Is off: ${mondayAvail.isOff}`);
      console.log(`   Start time (raw): ${mondayAvail.startTime}`);
      console.log(`   End time (raw): ${mondayAvail.endTime}`);
      
      if (mondayAvail.startTime) {
        const startHour = mondayAvail.startTime.getHours();
        const startMinute = mondayAvail.startTime.getMinutes();
        const startMinutes = startHour * 60 + startMinute;
        console.log(`   Start time (parsed): ${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`);
        console.log(`   Start minutes: ${startMinutes}`);
        console.log(`   Expected 08:00 = 480 minutes`);
        
        if (startMinutes === 480) {
          console.log('✅ Alice should be available from 08:00');
        } else {
          console.log(`❌ Alice starts at ${startMinutes} minutes (not 480)`);
        }
      }
    }

    console.log('\n🏷️ Work types:');
    alice.roles.forEach((role) => {
      if (role.workType) {
        console.log(`   - ${role.workType.name} (${role.workType.id})`);
      }
    });

  } catch (error) {
    console.error('❌ Database error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Only run if this is the main module
if (require.main === module) {
  debugAliceInDB();
}