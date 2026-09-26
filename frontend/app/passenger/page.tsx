"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { getSession } from "@/lib/auth";

function poisha(n: number) {
  return `৳${(n / 100).toFixed(2)}`;
}

const CANCELLABLE = ["REQUESTED", "MATCHED"];

export default function PassengerPage() {
  const router = useRouter();
  const [zones, setZones] = useState<string[]>([]);
  const [pickupZone, setPickupZone] = useState("");
  const [destinationZone, setDestinationZone] = useState("");
  const [seats, setSeats] = useState(1);
  const [rides, setRides] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadRides() {
    try {
      const mine = await api.myRides();
      setRides(mine);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.push("/login");
    }
  }

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.push("/login");
      return;
    }
    api.zones().then((z) => {
      const names = z.map((zz) => zz.name);
      setZones(names);
      setPickupZone(names[0] ?? "");
      setDestinationZone(names[1] ?? names[0] ?? "");
    });
    loadRides();
    const interval = setInterval(loadRides, 5000); // poll for status updates
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.createRide({ pickupZone, destinationZone, seats });
      await loadRides();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id: string) {
    try {
      await api.cancelRide(id);
      await loadRides();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel");
    }
  }

  return (
    <main className="container">
      <div className="card">
        <h2>Request a ride</h2>
        <form onSubmit={handleRequest}>
          <label>Pickup zone</label>
          <select value={pickupZone} onChange={(e) => setPickupZone(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
          <label>Destination zone</label>
          <select value={destinationZone} onChange={(e) => setDestinationZone(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
          <label>Seats</label>
          <input
            type="number"
            min={1}
            max={3}
            value={seats}
            onChange={(e) => setSeats(Number(e.target.value))}
          />
          {error && <div className="error">{error}</div>}
          <button disabled={loading} type="submit">{loading ? "Requesting..." : "Request ride"}</button>
        </form>
      </div>

      <div className="card">
        <h2>Your rides</h2>
        {rides.length === 0 && <p className="muted">No rides yet — request one above.</p>}
        {rides.map((r) => (
          <div key={r.id} className="list-item">
            <div className="row">
              <strong>{r.pickupZone} → {r.destinationZone}</strong>
              <span className={`badge ${r.status}`}>{r.status.replace("_", " ")}</span>
            </div>
            <p className="muted">
              {r.seats} seat(s) · fare estimate {poisha(r.totalFarePoisha)}
              {r.poolDiscountPoisha > 0 && ` (pooled, saved ${poisha(r.poolDiscountPoisha)})`}
            </p>
            {CANCELLABLE.includes(r.status) && (
              <button className="secondary" onClick={() => handleCancel(r.id)}>
                Cancel
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}