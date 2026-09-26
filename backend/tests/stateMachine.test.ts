import { isValidTransition, assertValidTransition } from "../src/lib/stateMachine";

describe("ride state machine", () => {
  it("allows the full happy-path lifecycle", () => {
    expect(isValidTransition("REQUESTED", "MATCHED")).toBe(true);
    expect(isValidTransition("MATCHED", "DRIVER_ARRIVED")).toBe(true);
    expect(isValidTransition("DRIVER_ARRIVED", "STARTED")).toBe(true);
    expect(isValidTransition("STARTED", "COMPLETED")).toBe(true);
  });

  it("allows cancellation only from REQUESTED or MATCHED", () => {
    expect(isValidTransition("REQUESTED", "CANCELLED")).toBe(true);
    expect(isValidTransition("MATCHED", "CANCELLED")).toBe(true);
    expect(isValidTransition("DRIVER_ARRIVED", "CANCELLED")).toBe(false);
    expect(isValidTransition("STARTED", "CANCELLED")).toBe(false);
  });

  it("rejects skipping states (e.g. REQUESTED straight to STARTED)", () => {
    expect(isValidTransition("REQUESTED", "STARTED")).toBe(false);
    expect(() => assertValidTransition("REQUESTED", "STARTED")).toThrow();
  });

  it("rejects any transition out of a terminal state", () => {
    expect(isValidTransition("COMPLETED", "STARTED")).toBe(false);
    expect(isValidTransition("CANCELLED", "MATCHED")).toBe(false);
  });
});