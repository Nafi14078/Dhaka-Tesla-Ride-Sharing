import { findZone, distanceKm } from "./zones";

export type RouteDistance = { distanceKm: number; source: "google" | "straight-line" };

/** Uses Google's driving route distance when a Routes API key is configured. */
export async function getRouteDistance(pickupName: string, destinationName: string): Promise<RouteDistance> {
  const pickup = findZone(pickupName);
  const destination = findZone(destinationName);
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return { distanceKm: distanceKm(pickup.lat, pickup.lng, destination.lat, destination.lng), source: "straight-line" };
  }

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters" },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: pickup.lat, longitude: pickup.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE", languageCode: "en", regionCode: "BD",
    }),
  });
  if (!response.ok) throw new Error(`Google Routes API failed (${response.status})`);
  const data = await response.json() as { routes?: Array<{ distanceMeters?: number }> };
  const meters = data.routes?.[0]?.distanceMeters;
  if (!Number.isFinite(meters)) throw new Error("Google Maps could not find a driving route for these locations");
  return { distanceKm: (meters as number) / 1000, source: "google" };
}
