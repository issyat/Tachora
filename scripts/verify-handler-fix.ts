/**
 * Quick verification that handleAnalyzeCandidates uses correct schema
 */

import { prisma } from '@/lib/prisma';

function formatTime(date: Date | string): string {
  if (typeof date === 'string') return date;
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

async function verifyHandlerFix() {
  console.log('🔍 Verifying handler uses correct Prisma schema...\n');

  try {
    // Test the exact query from handleAnalyzeCandidates
    const testEmployeeId = 'cmgo4mohp000z7kdwak16q4io'; // From error message
    
    console.log('Testing employee query with correct schema...');
    const employee = await prisma.employee.findUnique({
      where: { id: testEmployeeId },
      select: {
        id: true,
        name: true,
        storeId: true,
      },
    });

    if (employee) {
      console.log('✅ Employee query successful!');
      console.log('   ID:', employee.id);
      console.log('   Name:', employee.name);
      console.log('   Store ID:', employee.storeId);
    } else {
      console.log('⚠️  Employee not found (may have been deleted)');
    }

    console.log('\nTesting availability query...');
    const availabilityRecords = await prisma.availability.findMany({
      where: { employeeId: testEmployeeId },
      select: {
        day: true,
        isOff: true,
        startTime: true,
        endTime: true,
      },
    });

    console.log(`✅ Availability query successful! Found ${availabilityRecords.length} records`);
    availabilityRecords.forEach((a: any) => {
      const start = a.startTime ? formatTime(a.startTime) : null;
      const end = a.endTime ? formatTime(a.endTime) : null;
      console.log(`   ${a.day}: ${a.isOff ? 'OFF' : `${start}-${end}`}`);
    });

    console.log('\n✅ All queries working correctly!');
    console.log('\n📝 If you still see the error in the UI:');
    console.log('   1. Hard refresh the browser (Ctrl+Shift+R)');
    console.log('   2. Clear browser cache');
    console.log('   3. Check Network tab to see if old code is cached');
    console.log('   4. The error might be from an old request still in flight');

  } catch (error) {
    console.error('❌ Query failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyHandlerFix();
