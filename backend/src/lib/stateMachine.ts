// Ride lifecycle state machine (PRD suggested lifecycle):
//   REQUESTED -> MATCHED -> DRIVER_ARRIVED -> STARTED -> COMPLETED
// CANCELLED is reachable from REQUESTED or MATCHED only — once the
// driver has arrived, cancelling stops making sense for a pooled ride
// (other riders may already be aboard), so we treat that as a rule the
// driver must resolve, not a passenger self-service cancel (assumption,
// documented in README §Assumptions).
export type RideStatus =
  | "REQUESTED"
  | "MATCHED"
  | "DRIVER_ARRIVED"
  | "STARTED"
  | "COMPLETED"
  | "CANCELLED";

const ALLOWED_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  REQUESTED: ["MATCHED", "CANCELLED"],
  MATCHED: ["DRIVER_ARRIVED", "CANCELLED"],
  DRIVER_ARRIVED: ["STARTED"],
  STARTED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const CANCELLABLE_STATUSES: RideStatus[] = ["REQUESTED", "MATCHED"];
export const ACTIVE_STATUSES: RideStatus[] = [
  "REQUESTED",
  "MATCHED",
  "DRIVER_ARRIVED",
  "STARTED",
];

export function isValidTransition(from: RideStatus, to: RideStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidTransition(from: RideStatus, to: RideStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid ride state transition: ${from} -> ${to}`);
  }
}