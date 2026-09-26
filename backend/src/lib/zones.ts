// Keeping geography simple (PRD §4): a predefined list of Dhaka areas
// with plain lat/lng centroids instead of a real routing/maps API.
export interface Zone {
  name: string;
  lat: number;
  lng: number;
  // Zones in the same cluster are treated as "compatible routes" for
  // pooling purposes even when destinations aren't identical — e.g.
  // Mohakhali and Gulshan 1 both sit on the Banani corridor.
  cluster: string;
}

export const ZONES: Zone[] = [
  { name: "Banani", lat: 23.7937, lng: 90.4066, cluster: "banani-gulshan" },
  { name: "Gulshan 1", lat: 23.7809, lng: 90.4172, cluster: "banani-gulshan" },
  { name: "Gulshan 2", lat: 23.7925, lng: 90.4078, cluster: "banani-gulshan" },
  { name: "Mohakhali", lat: 23.7773, lng: 90.4046, cluster: "banani-gulshan" },
  { name: "Bashundhara", lat: 23.8155, lng: 90.4340, cluster: "bashundhara" },
  { name: "Farmgate", lat: 23.7574, lng: 90.3898, cluster: "farmgate-dhanmondi" },
  { name: "Dhanmondi", lat: 23.7461, lng: 90.3742, cluster: "farmgate-dhanmondi" },
  { name: "Mirpur", lat: 23.8223, lng: 90.3654, cluster: "mirpur-uttara" },
  { name: "Uttara", lat: 23.8759, lng: 90.3795, cluster: "mirpur-uttara" },
];

export function findZone(name: string): Zone {
  const zone = ZONES.find((z) => z.name.toLowerCase() === name.toLowerCase());
  if (!zone) throw new Error(`Unknown zone: ${name}`);
  return zone;
}

// Haversine distance in kilometers between two lat/lng points.
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Matching rule (PRD §4 — invented and documented here, applied
// consistently): two ride requests are "compatible" for pooling when
// they share the same pickup zone AND their destination zones fall in
// the same cluster (i.e. compatible routes), even if not identical.
// Nusrat (Banani -> Mohakhali) and Rafiq (Banani -> Gulshan 1) match
// under this rule: same pickup zone, both destinations in the
// "banani-gulshan" cluster.
export function isCompatibleRoute(
  pickupA: string,
  destA: string,
  pickupB: string,
  destB: string
): boolean {
  if (pickupA.toLowerCase() !== pickupB.toLowerCase()) return false;
  const za = findZone(destA);
  const zb = findZone(destB);
  return za.cluster === zb.cluster;
}