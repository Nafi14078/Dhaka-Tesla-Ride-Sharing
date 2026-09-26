// Integration tests against a real Postgres instance (via Prisma).
// Requires DATABASE_URL to point at a disposable test database — see
// README "Running Tests". These cover exactly the behaviors the PRD
// calls out in §12: capacity enforcement, invalid transitions,
// pooled-fare correctness, ownership, cancellation rules, and the
// last-seat concurrency race.
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as rideService from "../src/services/ride.service";
import { RideError } from "../src/services/errors";

const prisma = new PrismaClient();

async function seedCast() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const jashim = await prisma.user.create({
    data: { name: "Jashim", email: `jashim-${Date.now()}@test.dev`, passwordHash, role: Role.DRIVER },
  });
  const vehicle = await prisma.vehicle.create({
    data: { driverId: jashim.id, name: "Bullet", capacity: 3, isOnline: true },
  });

  const makePassenger = (name: string) =>
    prisma.user.create({
      data: { name, email: `${name.toLowerCase()}-${Date.now()}-${Math.random()}@test.dev`, passwordHash, role: Role.PASSENGER },
    });

  const [nusrat, rafiq, shirin] = await Promise.all([
    makePassenger("Nusrat"),
    makePassenger("Rafiq"),
    makePassenger("Shirin"),
  ]);

  return { jashim, vehicle, nusrat, rafiq, shirin };
}

async function cleanup() {
  await prisma.statusEvent.deleteMany();
  await prisma.rideRequest.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("Bullet's capacity can never be exceeded", () => {
  it("rejects joining a pool once seats run out", async () => {
    const { jashim, nusrat, rafiq, shirin } = await seedCast();

    const nusratReq = await rideService.createRideRequest({
      passengerId: nusrat.id,
      pickupZone: "Banani",
      destinationZone: "Mohakhali",
      seats: 2,
    });
    const accepted = await rideService.acceptRideRequest(nusratReq.id, jashim.id);
    const poolId = accepted.poolId!;

    const rafiqReq = await rideService.createRideRequest({
      passengerId: rafiq.id,
      pickupZone: "Banani",
      destinationZone: "Gulshan 1",
      seats: 1,
    });
    // 2 + 1 = 3, exactly Bullet's capacity — should succeed.
    await expect(rideService.joinPool(poolId, rafiqReq.id, jashim.id)).resolves.toBeTruthy();

    const shirinReq = await rideService.createRideRequest({
      passengerId: shirin.id,
      pickupZone: "Banani",
      destinationZone: "Gulshan 2",
      seats: 1,
    });
    // Pool is now full (3/3) — must be rejected, not overbooked.
    await expect(rideService.joinPool(poolId, shirinReq.id, jashim.id)).rejects.toThrow(RideError);

    const members = await prisma.rideRequest.findMany({ where: { poolId } });
    const occupied = members
      .filter((m: { status: string }) => m.status !== "CANCELLED")
      .reduce((s: number, m: { seats: number }) => s + m.seats, 0);
    expect(occupied).toBeLessThanOrEqual(3);
  });
});

describe("concurrency: two riders racing for the last seat", () => {
  it("lets exactly one of two simultaneous joins win, never both", async () => {
    const { jashim, nusrat, rafiq, shirin } = await seedCast();

    // Bullet has 1 seat left: Rafiq already occupies 2 of 3.
    const rafiqReq = await rideService.createRideRequest({
      passengerId: rafiq.id,
      pickupZone: "Banani",
      destinationZone: "Mohakhali",
      seats: 2,
    });
    const accepted = await rideService.acceptRideRequest(rafiqReq.id, jashim.id);
    const poolId = accepted.poolId!;

    const nusratReq = await rideService.createRideRequest({
      passengerId: nusrat.id,
      pickupZone: "Banani",
      destinationZone: "Gulshan 1",
      seats: 1,
    });
    const shirinReq = await rideService.createRideRequest({
      passengerId: shirin.id,
      pickupZone: "Banani",
      destinationZone: "Gulshan 2",
      seats: 1,
    });

    // Fire both claims for the single remaining seat at (nearly) the
    // same instant, exactly like Nusrat and Shirin in the PRD.
    const results = await Promise.allSettled([
      rideService.joinPool(poolId, nusratReq.id, jashim.id),
      rideService.joinPool(poolId, shirinReq.id, jashim.id),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const members = await prisma.rideRequest.findMany({ where: { poolId, status: { not: "CANCELLED" } } });
    const occupied = members.reduce((s: number, m: { seats: number }) => s + m.seats, 0);
    expect(occupied).toBe(3); // never 4 — capacity held under the race
  });
});

describe("invalid state transitions are rejected", () => {
  it("won't let a driver complete a trip that hasn't started", async () => {
    const { jashim, nusrat } = await seedCast();
    const req = await rideService.createRideRequest({
      passengerId: nusrat.id,
      pickupZone: "Banani",
      destinationZone: "Mohakhali",
      seats: 1,
    });
    const accepted = await rideService.acceptRideRequest(req.id, jashim.id);

    await expect(
      rideService.advancePool(accepted.poolId!, jashim.id, "COMPLETED")
    ).rejects.toThrow(/Invalid ride state transition/);
  });
});

describe("Nusrat's and Rafiq's pooled fares calculate correctly", () => {
  it("applies the pool discount to both riders once pooled together", async () => {
    const { jashim, nusrat, rafiq } = await seedCast();

    const nusratReq = await rideService.createRideRequest({
      passengerId: nusrat.id,
      pickupZone: "Banani",
      destinationZone: "Mohakhali",
      seats: 1,
    });
    const accepted = await rideService.acceptRideRequest(nusratReq.id, jashim.id);

    const rafiqReq = await rideService.createRideRequest({
      passengerId: rafiq.id,
      pickupZone: "Banani",
      destinationZone: "Gulshan 1",
      seats: 1,
    });
    await rideService.joinPool(accepted.poolId!, rafiqReq.id, jashim.id);

    const nusratFinal = await prisma.rideRequest.findUniqueOrThrow({ where: { id: nusratReq.id } });
    const rafiqFinal = await prisma.rideRequest.findUniqueOrThrow({ where: { id: rafiqReq.id } });

    expect(nusratFinal.poolDiscountPoisha).toBeGreaterThan(0);
    expect(rafiqFinal.poolDiscountPoisha).toBeGreaterThan(0);
    expect(nusratFinal.totalFarePoisha).toBe(
      nusratFinal.baseFarePoisha + nusratFinal.distanceChargePoisha - nusratFinal.poolDiscountPoisha
    );
    expect(rafiqFinal.totalFarePoisha).toBe(
      rafiqFinal.baseFarePoisha + rafiqFinal.distanceChargePoisha - rafiqFinal.poolDiscountPoisha
    );
  });
});

describe("users can't modify another user's ride", () => {
  it("blocks Shirin from cancelling Nusrat's ride", async () => {
    const { nusrat, shirin } = await seedCast();
    const req = await rideService.createRideRequest({
      passengerId: nusrat.id,
      pickupZone: "Banani",
      destinationZone: "Mohakhali",
      seats: 1,
    });

    await expect(rideService.cancelRideRequest(req.id, shirin.id)).rejects.toThrow(
      "You can only cancel your own ride"
    );
  });
});

describe("cancellation rules hold", () => {
  it("allows cancelling while REQUESTED", async () => {
    const { nusrat } = await seedCast();
    const req = await rideService.createRideRequest({
      passengerId: nusrat.id,
      pickupZone: "Banani",
      destinationZone: "Mohakhali",
      seats: 1,
    });
    const cancelled = await rideService.cancelRideRequest(req.id, nusrat.id, "Changed my mind");
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("forbids cancelling once the driver has arrived", async () => {
    const { jashim, nusrat } = await seedCast();
    const req = await rideService.createRideRequest({
      passengerId: nusrat.id,
      pickupZone: "Banani",
      destinationZone: "Mohakhali",
      seats: 1,
    });
    const accepted = await rideService.acceptRideRequest(req.id, jashim.id);
    await rideService.advancePool(accepted.poolId!, jashim.id, "DRIVER_ARRIVED");

    await expect(rideService.cancelRideRequest(req.id, nusrat.id)).rejects.toThrow(
      /Cannot cancel a ride/
    );
  });
});