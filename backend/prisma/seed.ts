// Seed data uses the PRD's story cast throughout — Jashim (driver) with
// his Tesla "Bullet" (3 seats), and passengers Nusrat, Rafiq, and Shirin.
// This is deliberate (PRD §18): no user1/driver1 placeholders anywhere,
// including in tests.
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const jashim = await prisma.user.upsert({
    where: { email: "jashim@dhakatesla.dev" },
    update: {},
    create: {
      name: "Jashim",
      email: "jashim@dhakatesla.dev",
      passwordHash,
      role: Role.DRIVER,
      phone: "01700000001",
    },
  });

  await prisma.vehicle.upsert({
    where: { driverId: jashim.id },
    update: {},
    create: {
      driverId: jashim.id,
      name: "Bullet",
      capacity: 3,
      isOnline: true,
    },
  });

  const passengers = [
    { name: "Nusrat", email: "nusrat@dhakatesla.dev", phone: "01700000002" },
    { name: "Rafiq", email: "rafiq@dhakatesla.dev", phone: "01700000003" },
    { name: "Shirin", email: "shirin@dhakatesla.dev", phone: "01700000004" },
  ];

  for (const p of passengers) {
    await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: { ...p, passwordHash, role: Role.PASSENGER },
    });
  }

  console.log("Seeded: Jashim + Bullet (3 seats), Nusrat, Rafiq, Shirin.");
  console.log("All demo accounts use password: password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });