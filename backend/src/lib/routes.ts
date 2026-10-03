import { findZone, distanceKm } from "./zones";

export type RouteDistance = { distanceKm: number; source: "google" | "straight-line"; routePath: Array<[number, number]> };

function decodePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0, byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    result = 0; shift = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** Uses Google's driving route distance when a Routes API key is configured. */
export async function getRouteDistance(pickupName: string, destinationName: string): Promise<RouteDistance> {
  const pickup = findZone(pickupName);
  const destination = findZone(destinationName);
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return { distanceKm: distanceKm(pickup.lat, pickup.lng, destination.lat, destination.lng), source: "straight-line", routePath: [[pickup.lat, pickup.lng], [destination.lat, destination.lng]] };
  }

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters,routes.polyline.encodedPolyline" },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: pickup.lat, longitude: pickup.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE", languageCode: "en", regionCode: "BD",
    }),
  });
  if (!response.ok) throw new Error(`Google Routes API failed (${response.status})`);
  const data = await response.json() as { routes?: Array<{ distanceMeters?: number; polyline?: { encodedPolyline?: string } }> };
  const meters = data.routes?.[0]?.distanceMeters;
  if (!Number.isFinite(meters)) throw new Error("Google Maps could not find a driving route for these locations");
  const encoded = data.routes?.[0]?.polyline?.encodedPolyline;
  if (!encoded) throw new Error("Google Maps did not return route geometry");
  return { distanceKm: (meters as number) / 1000, source: "google", routePath: decodePolyline(encoded) };
}
