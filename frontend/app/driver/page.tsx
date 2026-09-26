"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { addNotification } from "@/lib/notifications";

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
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      const request = pending.find((ride) => ride.id === id);
      const updated = await api.acceptRequest(id);
      addNotification(`driver-accepted:${updated.id}`, `You accepted ${request?.passenger?.name || "a passenger"}'s request: ${request?.pickupZone || "pickup"} to ${request?.destinationZone || "destination"}.`);
      await loadPending();
      await refreshActivePool(updated.poolId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept request");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(id: string) {
    if (!activePool) return;
    setError("");
    setBusy(true);
    try {
      await api.joinPool(activePool.id, id);
      await loadPending();
      await refreshActivePool(activePool.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add to pool");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdvance(action: "arrive" | "start" | "complete") {
    if (!activePool) return;
    setError("");
    setBusy(true);
    try {
      await api.advancePool(activePool.id, action);
      if (action === "complete") {
        addNotification(`driver-completed:${activePool.id}`, `Journey from ${activePool.pickupZone} is complete.`);
        setActivePool(null);
      } else {
        await refreshActivePool(activePool.id);
      }
      await loadPending();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update trip");
    } finally {
      setBusy(false);
    }
  }

  const seatsUsed = useMemo(
    () => (activePool ? activePool.rideRequests.reduce((s: number, r: any) => s + r.seats, 0) : 0),
    [activePool]
  );

  if (vehicle === null) {
    return (
      <main className="page page-narrow">
        <div className="card">
          <p className="eyebrow">One-time setup</p>
          <h1>Register your Tesla</h1>
          <p className="lede" style={{ marginTop: 6 }}>Every driver operates exactly one vehicle in this MVP.</p>
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
            <button className="btn-block" type="submit">Register</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <p className="eyebrow">Driver</p>
      <h1 style={{ marginBottom: 20 }}>{vehicle.name}</h1>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value">
            <span className={`dot ${vehicle.isOnline ? "on" : "off"}`} />
            {vehicle.isOnline ? "Online" : "Offline"}
          </div>
          <div className="stat-label">Status</div>
        </div>
        <div className="stat">
          <div className="stat-value">{activePool ? `${seatsUsed}/${vehicle.capacity}` : `0/${vehicle.capacity}`}</div>
          <div className="stat-label">Seats filled</div>
        </div>
        <div className="stat">
          <div className="stat-value">{pending.length}</div>
          <div className="stat-label">Pending</div>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <h2>🚦 {vehicle.name} · {vehicle.capacity} seats</h2>
          <button className="secondary btn-sm" style={{ marginTop: 0 }} onClick={toggleOnline}>
            {vehicle.isOnline ? "Go offline" : "Go online"}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      {activePool && (
        <div className="card">
          <div className="card-header">
            <h2>🧳 Current trip</h2>
            <span className={`badge ${activePool.status}`}>{activePool.status.replace("_", " ")}</span>
          </div>
          <div className="list">
            {activePool.rideRequests.map((r: any) => (
              <div key={r.id} className="list-item">
                <div className="row">
                  <strong>{r.passenger.name}</strong>
                  <span className="muted">{r.seats} seat(s) · {poisha(r.totalFarePoisha)}</span>
                </div>
                <p className="muted route" style={{ marginTop: 4 }}>
                  {r.pickupZone} <span className="arrow">→</span> {r.destinationZone}
                </p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {activePool.status === "MATCHED" && (
              <button disabled={busy} onClick={() => handleAdvance("arrive")}>Mark arrived</button>
            )}
            {activePool.status === "DRIVER_ARRIVED" && (
              <button disabled={busy} onClick={() => handleAdvance("start")}>Start trip</button>
            )}
            {activePool.status === "STARTED" && (
              <button disabled={busy} onClick={() => handleAdvance("complete")}>Complete trip</button>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h2>📥 Pending requests</h2>
        {pending.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🌙</div>
            No pending requests right now.
          </div>
        ) : (
          <div className="list">
            {pending.map((r) => (
              <div key={r.id} className="list-item">
                <div className="row">
                  <strong>{r.passenger.name}</strong>
                  <span className="muted">{r.seats} seat(s)</span>
                </div>
                <p className="muted route" style={{ marginTop: 4, marginBottom: 10 }}>
                  {r.pickupZone} <span className="arrow">→</span> {r.destinationZone}
                </p>
                {activePool && activePool.status === "MATCHED" ? (
                  <button className="secondary btn-sm" disabled={busy} onClick={() => handleJoin(r.id)}>
                    Add to current pool
                  </button>
                ) : (
                  <button className="btn-sm" disabled={busy} onClick={() => handleAccept(r.id)}>
                    Accept
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
