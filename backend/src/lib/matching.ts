import { isCompatibleRoute } from "./zones";

export interface PoolLike {
  id: string;
  pickupZone: string;
  status: string;
  vehicleCapacity: number;
  occupiedSeats: number; // sum of seats of currently active (non-cancelled) members
  sampleDestinationZone: string; // destination of an existing member, to test route compatibility
}

/**
 * Pure capacity + matching-rule check, deliberately decoupled from the
 * database so it can be unit-tested directly (see tests/matching.test.ts).
 * A ride request can join a pool when:
 *   1. the pool is still OPEN/MATCHED (not yet locked by arrival), and
 *   2. its route is compatible with the pool's existing route (same
 *      pickup zone, destination in the same cluster), and
 *   3. adding its seats would not exceed the vehicle's fixed capacity.
 */
export function canJoinPool(
  pool: PoolLike,
  requestPickupZone: string,
  requestDestinationZone: string,
  requestedSeats: number
): { ok: true } | { ok: false; reason: string } {
  if (pool.status !== "OPEN" && pool.status !== "MATCHED") {
    return { ok: false, reason: "Pool is no longer accepting passengers" };
  }
  if (
    !isCompatibleRoute(
      pool.pickupZone,
      pool.sampleDestinationZone,
      requestPickupZone,
      requestDestinationZone
    )
  ) {
    return { ok: false, reason: "Route is not compatible with this pool" };
  }
  if (pool.occupiedSeats + requestedSeats > pool.vehicleCapacity) {
    return { ok: false, reason: "Not enough seats left on this Tesla" };
  }
  return { ok: true };
}