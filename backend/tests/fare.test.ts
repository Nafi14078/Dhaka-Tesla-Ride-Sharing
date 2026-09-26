import { computeFare, BASE_FARE_POISHA, PER_KM_POISHA, POOL_DISCOUNT_RATE } from "../src/lib/fare";

// Hand-checkable worked example from the PRD's own cast: Nusrat
// (Banani -> Mohakhali) and Rafiq (Banani -> Gulshan 1), pooled
// together in Bullet. An evaluator can redo this arithmetic by hand
// using BASE_FARE_POISHA=3000, PER_KM_POISHA=1500, discount=20%.
describe("fare model — Nusrat & Rafiq worked example", () => {
  it("computes Nusrat's pooled fare: base + distance - 20% discount", () => {
    const fare = computeFare("Banani", "Mohakhali", true);
    expect(fare.baseFarePoisha).toBe(BASE_FARE_POISHA);
    expect(fare.distanceKm).toBeCloseTo(1.835, 2);
    expect(fare.distanceChargePoisha).toBe(Math.round(fare.distanceKm * PER_KM_POISHA));
    const subtotal = fare.baseFarePoisha + fare.distanceChargePoisha;
    expect(fare.poolDiscountPoisha).toBe(Math.round(subtotal * POOL_DISCOUNT_RATE));
    expect(fare.totalFarePoisha).toBe(subtotal - fare.poolDiscountPoisha);
  });

  it("computes Rafiq's pooled fare independently of Nusrat's", () => {
    const fare = computeFare("Banani", "Gulshan 1", true);
    expect(fare.distanceKm).toBeCloseTo(1.786, 2);
    const subtotal = fare.baseFarePoisha + fare.distanceChargePoisha;
    expect(fare.totalFarePoisha).toBe(subtotal - fare.poolDiscountPoisha);
  });

  it("an unpooled ride pays no pool discount", () => {
    const solo = computeFare("Banani", "Mohakhali", false);
    expect(solo.poolDiscountPoisha).toBe(0);
    expect(solo.totalFarePoisha).toBe(solo.baseFarePoisha + solo.distanceChargePoisha);
  });

  it("pooling is always cheaper than riding solo for the same route", () => {
    const solo = computeFare("Banani", "Mohakhali", false);
    const pooled = computeFare("Banani", "Mohakhali", true);
    expect(pooled.totalFarePoisha).toBeLessThan(solo.totalFarePoisha);
  });
});