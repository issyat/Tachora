import { prisma } from "../src/lib/prisma";

async function main() {
  // Delete the manually created assignment
  const assignmentId = "cmgv8hii800017k9cnr8clr3f";
  
  const deleted = await prisma.assignment.delete({
    where: { id: assignmentId },
  });

  console.log("✅ Deleted manually created assignment:", deleted.id);
  console.log(`   Day: ${deleted.day}, Time: 14:00-19:00`);
  console.log("\nNow the system should find it automatically from templates!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
