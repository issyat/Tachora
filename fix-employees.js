const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixEmployeeAvailability() {
  try {
    console.log('🔧 Fixing employee availability...');
    
    // Get all employees
    const employees = await prisma.employee.findMany({
      include: { availability: true }
    });
    
    console.log(`Found ${employees.length} employees`);
    
    for (const employee of employees) {
      console.log(`Fixing availability for: ${employee.name}`);
      
      // Delete existing availability
      await prisma.employeeAvailability.deleteMany({
        where: { employeeId: employee.id }
      });
      
      // Create correct availability (Mon-Fri available, weekends off)
      await prisma.employeeAvailability.createMany({
        data: [
          { employeeId: employee.id, day: 'MON', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
          { employeeId: employee.id, day: 'TUE', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
          { employeeId: employee.id, day: 'WED', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
          { employeeId: employee.id, day: 'THU', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
          { employeeId: employee.id, day: 'FRI', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
          { employeeId: employee.id, day: 'SAT', isOff: true, startTime: null, endTime: null },
          { employeeId: employee.id, day: 'SUN', isOff: true, startTime: null, endTime: null }
        ]
      });
    }
    
    console.log('✅ Fixed availability for all employees!');
    console.log('🔄 Now refresh your /schedule page - employees should appear in the sidebar');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixEmployeeAvailability();