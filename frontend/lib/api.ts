// Thin fetch wrapper around the Express API. Kept dependency-free
// (no axios/react-query) — the API surface is small enough that a
// single typed helper is clearer than adding a data-fetching library.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || "Request failed", res.status);
  }
  return data as T;
}

export interface AuthResult {
  token: string;
  user: { id: string; name: string; email: string; role: "PASSENGER" | "DRIVER" };
}

export const api = {
  signup: (body: { name: string; email: string; password: string; role: "PASSENGER" | "DRIVER"; phone?: string }) =>
    request<AuthResult>("/auth/signup", { method: "POST", body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify(body) }),

  zones: () => request<Array<{ name: string }>>("/rides/zones"),

  route: (pickupZone: string, destinationZone: string) =>
    request<{ distanceKm: number; source: "google" | "straight-line"; farePoisha: number }>(
      `/rides/route?pickupZone=${encodeURIComponent(pickupZone)}&destinationZone=${encodeURIComponent(destinationZone)}`
    ),

  createRide: (body: { pickupZone: string; destinationZone: string; seats: number }) =>
    request("/rides", { method: "POST", body: JSON.stringify(body) }),

  myRides: () => request<any[]>("/rides/mine"),

  cancelRide: (id: string, reason?: string) =>
    request(`/rides/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),

  // Driver endpoints
  getVehicle: () => request<any>("/driver/vehicle"),
  registerVehicle: (body: { name: string; capacity: number }) =>
    request("/driver/vehicle", { method: "POST", body: JSON.stringify(body) }),
  setOnline: (isOnline: boolean) =>
    request("/driver/vehicle/online", { method: "POST", body: JSON.stringify({ isOnline }) }),
  pendingRequests: (zone?: string) =>
    request<any[]>(`/driver/requests${zone ? `?zone=${encodeURIComponent(zone)}` : ""}`),
  acceptRequest: (id: string) => request<any>(`/driver/requests/${id}/accept`, { method: "POST" }),
  joinPool: (poolId: string, rideRequestId: string) =>
    request<any>("/driver/pools/join", { method: "POST", body: JSON.stringify({ poolId, rideRequestId }) }),
  poolDetail: (id: string) => request<any>(`/driver/pools/${id}`),
  advancePool: (id: string, action: "arrive" | "start" | "complete") =>
    request<any>(`/driver/pools/${id}/${action}`, { method: "POST" }),
  driverHistory: () => request<any[]>("/driver/history"),
};
