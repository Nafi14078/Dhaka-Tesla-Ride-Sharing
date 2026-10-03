import { isCompatibleRoute } from "./zones";

type Point = [number, number];

function km(a: Point, b: Point) {
  const lat = (b[0] - a[0]) * Math.PI / 180;
  const lng = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(lat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(lng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** True when at least 60% of the shorter journey follows the same roads in the same direction. */
export function routesShareCorridor(a: Point[], b: Point[]): boolean {
  if (a.length < 2 || b.length < 2) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const matches: number[] = [];
  for (let i = 0; i < shorter.length; i++) {
    let best = -1, bestKm = 0.5;
    for (let j = 0; j < longer.length; j++) {
      const d = km(shorter[i], longer[j]);
      if (d < bestKm) { best = j; bestKm = d; }
    }
    if (best >= 0) matches.push(best);
  }
  // Require a substantial, forward-running shared section to avoid matching
  // routes that merely cross at one junction or travel the corridor backwards.
  const forward = matches.filter((value, i) => i === 0 || value >= matches[i - 1]);
  return forward.length / shorter.length >= 0.6 && matches.length / shorter.length >= 0.6;
}

export interface PoolLike {
  id: string;
  pickupZone: string;
  status: string;
  vehicleCapacity: number;
  occupiedSeats: number; // sum of seats of currently active (non-cancelled) members
  sampleDestinationZone: string; // destination of an existing member, to test route compatibility
  routeCompatible?: boolean; // set after comparing Google route geometry
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
    !(pool.routeCompatible ?? isCompatibleRoute(
      pool.pickupZone,
      pool.sampleDestinationZone,
      requestPickupZone,
      requestDestinationZone
    ))
  ) {
    return { ok: false, reason: "Route is not compatible with this pool" };
  }
  if (pool.occupiedSeats + requestedSeats > pool.vehicleCapacity) {
    return { ok: false, reason: "Not enough seats left on this Tesla" };
  }
  return { ok: true };
}
