"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { getSession } from "@/lib/auth";

function poisha(n: number) {
  return `৳${(n / 100).toFixed(2)}`;
}

export default function DriverPage() {
  const router = useRouter();
  const [vehicle, setVehicle] = useState<any>(null);
  const [vehicleName, setVehicleName] = useState("Bullet");
  const [capacity, setCapacity] = useState(3);
  const [pending, setPending] = useState<any[]>([]);
  const [activePool, setActivePool] = useState<any>(null);
  const [error, setError] = useState("");

  async function loadVehicle() {
    try {
      const v = await api.getVehicle();
      setVehicle(v);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.push("/login");
      setVehicle(null);
    }
  }

  async function loadPending() {
    try {
      const list = await api.pendingRequests();
      setPending(list);
    } catch {
      /* ignore while unauthenticated/no vehicle */
    }
  }

  async function refreshActivePool(poolId: string) {
    try {
      const pool = await api.poolDetail(poolId);
      setActivePool(pool);
    } catch {
      setActivePool(null);
    }
  }

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.push("/login");
      return;
    }
    loadVehicle();
    loadPending();
    const interval = setInterval(loadPending, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.registerVehicle({ name: vehicleName, capacity });
      await loadVehicle();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register vehicle");
    }
  }

  async function toggleOnline() {
    try {
      const updated = await api.setOnline(!vehicle.isOnline);
      setVehicle(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status");
    }
  }

  async function handleAccept(id: string) {
    setError("");
    try {
      const updated = await api.acceptRequest(id);
      await loadPending();
      await refreshActivePool(updated.poolId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept request");
    }
  }

  async function handleJoin(id: string) {
    if (!activePool) return;
    setError("");
    try {
      await api.joinPool(activePool.id, id);
      await loadPending();
      await refreshActivePool(activePool.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add to pool");
    }
  }

  async function handleAdvance(action: "arrive" | "start" | "complete") {
    if (!activePool) return;
    setError("");
    try {
      await api.advancePool(activePool.id, action);
      if (action === "complete") {
        setActivePool(null);
      } else {
        await refreshActivePool(activePool.id);
      }
      await loadPending();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update trip");
    }
  }

  if (vehicle === null) {
    return (
      <main className="container">
        <div className="card">
          <h2>Register your Tesla</h2>
          <p className="muted">Every driver operates exactly one vehicle in this MVP.</p>
          <form onSubmit={handleRegister}>
            <label>Vehicle name</label>
            <input value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} required />
            <label>Seat capacity</label>
            <input
              type="number"
              min={1}
              max={6}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
            {error && <div className="error">{error}</div>}
            <button type="submit">Register</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="card">
        <div className="row">
          <h2>{vehicle.name} · {vehicle.capacity} seats</h2>
          <button className="secondary" style={{ width: "auto", marginTop: 0 }} onClick={toggleOnline}>
            {vehicle.isOnline ? "Go offline" : "Go online"}
          </button>
        </div>
        <p className="muted">{vehicle.isOnline ? "🟢 Online — visible to passengers" : "⚪ Offline"}</p>
        {error && <div className="error">{error}</div>}
      </div>

      {activePool && (
        <div className="card">
          <h2>Current trip</h2>
          <span className={`badge ${activePool.status}`}>{activePool.status.replace("_", " ")}</span>
          {activePool.rideRequests.map((r: any) => (
            <div key={r.id} className="list-item">
              <div className="row">
                <strong>{r.passenger.name}</strong>
                <span className="muted">{r.seats} seat(s) · {poisha(r.totalFarePoisha)}</span>
              </div>
              <p className="muted">{r.pickupZone} → {r.destinationZone}</p>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {activePool.status === "MATCHED" && (
              <button onClick={() => handleAdvance("arrive")}>Mark arrived</button>
            )}
            {activePool.status === "DRIVER_ARRIVED" && (
              <button onClick={() => handleAdvance("start")}>Start trip</button>
            )}
            {activePool.status === "STARTED" && (
              <button onClick={() => handleAdvance("complete")}>Complete trip</button>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Pending requests</h2>
        {pending.length === 0 && <p className="muted">No pending requests right now.</p>}
        {pending.map((r) => (
          <div key={r.id} className="list-item">
            <div className="row">
              <strong>{r.passenger.name}</strong>
              <span className="muted">{r.seats} seat(s)</span>
            </div>
            <p className="muted">{r.pickupZone} → {r.destinationZone}</p>
            {activePool && activePool.status === "MATCHED" ? (
              <button className="secondary" onClick={() => handleJoin(r.id)}>
                Add to current pool
              </button>
            ) : (
              <button className="secondary" onClick={() => handleAccept(r.id)}>
                Accept
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}