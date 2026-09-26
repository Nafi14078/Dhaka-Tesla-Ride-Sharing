import { canJoinPool } from "../src/lib/matching";
import { isCompatibleRoute } from "../src/lib/zones";

describe("matching rule", () => {
  it("treats Nusrat's and Rafiq's overlapping-but-not-identical trip as compatible", () => {
    expect(isCompatibleRoute("Banani", "Mohakhali", "Banani", "Gulshan 1")).toBe(true);
  });

  it("rejects requests from different pickup zones", () => {
    expect(isCompatibleRoute("Banani", "Mohakhali", "Mirpur", "Uttara")).toBe(false);
  });

  it("rejects destinations in unrelated clusters even from the same pickup", () => {
    expect(isCompatibleRoute("Banani", "Mohakhali", "Banani", "Farmgate")).toBe(false);
  });
});

describe("canJoinPool — capacity enforcement", () => {
  const basePool = {
    id: "pool-1",
    pickupZone: "Banani",
    status: "OPEN",
    vehicleCapacity: 3,
    occupiedSeats: 2,
    sampleDestinationZone: "Mohakhali",
  };

  it("allows joining when a seat is free and the route matches", () => {
    const result = canJoinPool(basePool, "Banani", "Gulshan 1", 1);
    expect(result.ok).toBe(true);
  });

  it("never allows occupied seats to exceed Bullet's fixed capacity", () => {
    const result = canJoinPool(basePool, "Banani", "Gulshan 1", 2);
    expect(result.ok).toBe(false);
  });

  it("rejects joins once the pool is no longer OPEN", () => {
    const result = canJoinPool({ ...basePool, status: "MATCHED" }, "Banani", "Gulshan 1", 1);
    expect(result.ok).toBe(false);
  });

  it("rejects an incompatible route even with free seats", () => {
    const result = canJoinPool(basePool, "Banani", "Farmgate", 1);
    expect(result.ok).toBe(false);
  });
});