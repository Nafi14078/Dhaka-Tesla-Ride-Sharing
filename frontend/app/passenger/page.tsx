"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { getSession } from "@/lib/auth";

function poisha(n: number) {
  return `৳${(n / 100).toFixed(2)}`;
}

const CANCELLABLE = ["REQUESTED", "MATCHED"];
const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Finding a match",
  MATCHED: "Matched",
  DRIVER_ARRIVED: "Driver arrived",
  STARTED: "On the way",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

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
    const interval = setInterval(loadRides, 5000);
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

  const stats = useMemo(() => {
    const active = rides.filter((r) => !["COMPLETED", "CANCELLED"].includes(r.status)).length;
    const completed = rides.filter((r) => r.status === "COMPLETED").length;
    const saved = rides
      .filter((r) => r.status === "COMPLETED")
      .reduce((s, r) => s + (r.poolDiscountPoisha || 0), 0);
    return { active, completed, saved };
  }, [rides]);

  return (
    <main className="page">
      <p className="eyebrow">Passenger</p>
      <h1 style={{ marginBottom: 20 }}>Where to?</h1>

      {rides.length > 0 && (
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-value">{stats.active}</div>
            <div className="stat-label">Active</div>
          </div>
          <div className="stat">
            <div className="stat-value">{stats.completed}</div>
            <div className="stat-label">Completed</div>
          </div>
          <div className="stat">
            <div className="stat-value">{poisha(stats.saved)}</div>
            <div className="stat-label">Saved pooling</div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>🧭 Request a ride</h2>
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
              <button className="btn-block" disabled={loading} type="submit">
                {loading ? <><span className="spinner" />Requesting...</> : "Request ride"}
              </button>
            </form>
          </div>
        </div>

        <div>
          <div className="card">
            <h2>📋 Your rides</h2>
            {rides.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">🛺</div>
                No rides yet — request one to get started.
              </div>
            ) : (
              <div className="list">
                {rides.map((r) => (
                  <div key={r.id} className="list-item">
                    <div className="row">
                      <div className="route">
                        {r.pickupZone} <span className="arrow">→</span> {r.destinationZone}
                      </div>
                      <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    </div>
                    <p className="muted" style={{ margin: "6px 0 0" }}>
                      {r.seats} seat(s) · {poisha(r.totalFarePoisha)}
                      {r.poolDiscountPoisha > 0 && (
                        <span style={{ color: "var(--brand)" }}> · saved {poisha(r.poolDiscountPoisha)} pooling</span>
                      )}
                    </p>
                    {CANCELLABLE.includes(r.status) && (
                      <button className="btn-danger btn-sm" style={{ marginTop: 10 }} onClick={() => handleCancel(r.id)}>
                        Cancel ride
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}