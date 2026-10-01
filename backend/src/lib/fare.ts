// Fare Model (PRD §5) — deliberately simple and hand-testable:
//
//   passengerFare = baseFare + distanceCharge - poolDiscount
//
// All money is stored/returned as INTEGER POISHA (1 BDT = 100 poisha),
// never float/decimal. Reason: repeated add/subtract of base + distance
// - discount across multiple pooled passengers accumulates floating-
// point rounding error with decimals; integers make every step exact
// and every intermediate value auditable in tests and in the DB.
export const BASE_FARE_POISHA = 0;
export const PER_KM_POISHA = 2000; // 20 BDT / km
export const POOL_DISCOUNT_RATE = 0.2; // 20% off (base + distance) when pooled
import { distanceKm, findZone } from "./zones";

export interface FareBreakdown {
  baseFarePoisha: number;
  distanceChargePoisha: number;
  poolDiscountPoisha: number;
  totalFarePoisha: number;
  distanceKm: number;
}

/**
 * Computes one passenger's fare. `isPooled` reflects whether this ride
 * request is sharing a Pool with at least one other active member —
 * the discount is per-passenger, not split, so pooling always makes
 * each individual rider's fare cheaper than riding alone.
 */
export function computeFare(
  pickupZoneName: string,
  destinationZoneName: string,
  isPooled: boolean,
  routeDistanceKm?: number
): FareBreakdown {
  const pickup = findZone(pickupZoneName);
  const dest = findZone(destinationZoneName);
  const km = routeDistanceKm ?? distanceKm(pickup.lat, pickup.lng, dest.lat, dest.lng);

  const baseFarePoisha = BASE_FARE_POISHA;
  const distanceChargePoisha = Math.round(km * PER_KM_POISHA);
  const subtotal = baseFarePoisha + distanceChargePoisha;
  const poolDiscountPoisha = isPooled ? Math.round(subtotal * POOL_DISCOUNT_RATE) : 0;
  const totalFarePoisha = subtotal - poolDiscountPoisha;

  return {
    baseFarePoisha,
    distanceChargePoisha,
    poolDiscountPoisha,
    totalFarePoisha,
    distanceKm: km,
  };
}

export function poishaToDisplay(poisha: number): string {
  return `৳${(poisha / 100).toFixed(2)}`;
}
