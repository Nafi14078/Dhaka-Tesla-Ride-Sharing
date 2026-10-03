import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { computeFare } from "../lib/fare";
import { canJoinPool, routesShareCorridor } from "../lib/matching";
import { findZone } from "../lib/zones";
import { getRouteDistance } from "../lib/routes";
import { assertValidTransition, ACTIVE_STATUSES, CANCELLABLE_STATUSES } from "../lib/stateMachine";
import { RideError } from "./errors";

type PoolRow = { id: string; vehicleId: string; status: string; pickupZone: string };

/**
 * Passenger requests a ride. Validates the zones exist and creates the
 * RideRequest unmatched (REQUESTED, no pool yet). Fare is pre-computed
 * as an *estimate* assuming no pooling; it is recalculated for real
 * once the ride is actually pooled or completed.
 */
export async function createRideRequest(params: {
  passengerId: string;
  pickupZone: string;
  destinationZone: string;
  seats: number;
}) {
  const pickup = findZone(params.pickupZone);
  const dest = findZone(params.destinationZone);
  if (params.seats < 1) throw new RideError("seats must be at least 1", 422);

  const route = await getRouteDistance(params.pickupZone, params.destinationZone);
  const fare = computeFare(params.pickupZone, params.destinationZone, false, route.distanceKm);

  return prisma.rideRequest.create({
    data: {
      passengerId: params.passengerId,
      pickupZone: pickup.name,
      destinationZone: dest.name,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      destLat: dest.lat,
      destLng: dest.lng,
      distanceKm: route.distanceKm,
      routePath: JSON.stringify(route.routePath),
      seats: params.seats,
      status: "REQUESTED",
      baseFarePoisha: fare.baseFarePoisha,
      distanceChargePoisha: fare.distanceChargePoisha,
      poolDiscountPoisha: fare.poolDiscountPoisha,
      totalFarePoisha: fare.totalFarePoisha,
    },
  });
}

/**
 * Driver accepts a pending REQUESTED ride request, creating a new Pool
 * tied to their vehicle and moving the request to MATCHED.
 */
export async function acceptRideRequest(rideRequestId: string, driverId: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const vehicle = await tx.vehicle.findUnique({ where: { driverId } });
    if (!vehicle) throw new RideError("Driver has no registered Tesla", 404);
    if (!vehicle.isOnline) throw new RideError("Go online before accepting rides", 409);
    const activePool = await tx.pool.findFirst({
      where: { vehicleId: vehicle.id, status: { in: ["OPEN", "MATCHED", "DRIVER_ARRIVED", "STARTED"] } },
    });
    if (activePool) {
      throw new RideError("This Tesla is already committed to a trip. New trips can be accepted after it is completed", 409);
    }

    const request = await tx.rideRequest.findUnique({ where: { id: rideRequestId } });
    if (!request) throw new RideError("Ride request not found", 404);
    if (request.status !== "REQUESTED") {
      throw new RideError("Ride request is no longer available", 409);
    }
    if (request.seats > vehicle.capacity) {
      throw new RideError("Bullet doesn't have enough seats for this request", 409);
    }

    assertValidTransition("REQUESTED", "MATCHED");

    const pool = await tx.pool.create({
      data: {
        vehicleId: vehicle.id,
        pickupZone: request.pickupZone,
        status: "MATCHED",
      },
    });

    const updated = await tx.rideRequest.update({
      where: { id: rideRequestId },
      data: { poolId: pool.id, status: "MATCHED" },
    });

    await tx.statusEvent.create({
      data: {
        rideRequestId,
        fromStatus: "REQUESTED",
        toStatus: "MATCHED",
        changedById: driverId,
      },
    });

    return updated;
  });
}

/**
 * Pools an additional REQUESTED ride request into an already-MATCHED
 * pool, as long as the route is compatible and seats remain. This is
 * the concurrency-critical path: the Pool row is row-locked
 * (`SELECT ... FOR UPDATE`) for the duration of the transaction so two
 * simultaneous joins against the same last seat cannot both succeed —
 * see docs/architecture.md and README §Concurrency for the design
 * rationale and what would change at scale.
 */
export async function joinPool(poolId: string, rideRequestId: string, driverId: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const pools = (await tx.$queryRaw`SELECT id, "vehicleId", status, "pickupZone" FROM "Pool" WHERE id = ${poolId} FOR UPDATE`) as PoolRow[];
    const pool = pools[0];
    if (!pool) throw new RideError("Pool not found", 404);
    if (pool.status !== "MATCHED") {
      throw new RideError("Pool is no longer accepting passengers", 409);
    }

    const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: pool.vehicleId } });
    if (vehicle.driverId !== driverId) {
      throw new RideError("You do not operate this Tesla", 403);
    }

    const members = await tx.rideRequest.findMany({
      where: { poolId: pool.id, status: { in: ACTIVE_STATUSES as any } },
    });
    const occupiedSeats = members.reduce((sum: number, m: { seats: number }) => sum + m.seats, 0);
    const sampleDestinationZone = members[0]?.destinationZone ?? pool.pickupZone;

    const request = await tx.rideRequest.findUnique({ where: { id: rideRequestId } });
    if (!request) throw new RideError("Ride request not found", 404);
    if (request.status !== "REQUESTED") {
      throw new RideError("Ride request is not joinable", 409);
    }

    if (!members.length || !routesShareCorridor(JSON.parse(members[0].routePath || "[]"), JSON.parse(request.routePath || "[]"))) {
      throw new RideError("This journey does not follow the same Google Maps route", 409);
    }
    const check = canJoinPool(
      {
        id: pool.id,
        pickupZone: pool.pickupZone,
        status: pool.status,
        vehicleCapacity: vehicle.capacity,
        occupiedSeats,
        sampleDestinationZone,
        routeCompatible: true,
      },
      request.pickupZone,
      request.destinationZone,
      request.seats
    );
    if (!check.ok) throw new RideError(check.reason, 409);

    assertValidTransition("REQUESTED", "MATCHED");

    // Every active member (including the one just joining) is now
    // pooled, so recompute each member's fare with the pool discount.
    const allMemberIds = [...members.map((m: { id: string }) => m.id), rideRequestId];
    for (const id of allMemberIds) {
      const member = id === rideRequestId ? request : members.find((m: { id: string }) => m.id === id)!;
      const fare = computeFare(member.pickupZone, member.destinationZone, true, member.distanceKm);
      await tx.rideRequest.update({
        where: { id },
        data: {
          poolId: pool.id,
          status: "MATCHED",
          baseFarePoisha: fare.baseFarePoisha,
          distanceChargePoisha: fare.distanceChargePoisha,
          poolDiscountPoisha: fare.poolDiscountPoisha,
          totalFarePoisha: fare.totalFarePoisha,
        },
      });
    }

    await tx.statusEvent.create({
      data: {
        rideRequestId,
        fromStatus: "REQUESTED",
        toStatus: "MATCHED",
        changedById: driverId,
      },
    });

    return tx.rideRequest.findUnique({ where: { id: rideRequestId } });
  });
}

/** Advances every active member of a pool together (arrive/start/complete). */
export async function advancePool(
  poolId: string,
  driverId: string,
  toStatus: "DRIVER_ARRIVED" | "STARTED" | "COMPLETED"
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const pool = await tx.pool.findUnique({ where: { id: poolId }, include: { vehicle: true } });
    if (!pool) throw new RideError("Pool not found", 404);
    if (pool.vehicle.driverId !== driverId) throw new RideError("You do not operate this Tesla", 403);

    assertValidTransition(pool.status as any, toStatus);

    const members = await tx.rideRequest.findMany({
      where: { poolId, status: { in: ACTIVE_STATUSES as any } },
    });

    for (const member of members) {
      assertValidTransition(member.status as any, toStatus);
      await tx.rideRequest.update({
        where: { id: member.id },
        data: {
          status: toStatus,
          ...(toStatus === "COMPLETED" ? { updatedAt: new Date() } : {}),
        },
      });
      await tx.statusEvent.create({
        data: {
          rideRequestId: member.id,
          fromStatus: member.status,
          toStatus,
          changedById: driverId,
        },
      });
    }

    return tx.pool.update({
      where: { id: poolId },
      data: {
        status: toStatus,
        ...(toStatus === "STARTED" ? { startedAt: new Date() } : {}),
        ...(toStatus === "COMPLETED" ? { completedAt: new Date() } : {}),
      },
    });
  });
}

/** Passenger cancels their own ride request while cancellation is still allowed. */
export async function cancelRideRequest(rideRequestId: string, passengerId: string, reason?: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const request = await tx.rideRequest.findUnique({ where: { id: rideRequestId } });
    if (!request) throw new RideError("Ride request not found", 404);
    if (request.passengerId !== passengerId) {
      throw new RideError("You can only cancel your own ride", 403);
    }
    if (!CANCELLABLE_STATUSES.includes(request.status as any)) {
      throw new RideError(`Cannot cancel a ride that is already ${request.status}`, 409);
    }
    assertValidTransition(request.status as any, "CANCELLED");

    const updated = await tx.rideRequest.update({
      where: { id: rideRequestId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason ?? null },
    });

    await tx.statusEvent.create({
      data: {
        rideRequestId,
        fromStatus: request.status,
        toStatus: "CANCELLED",
        changedById: passengerId,
      },
    });

    return updated;
  });
}
