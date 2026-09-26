"use client";
import { useEffect, useState } from "react";
import { getSession, StoredUser } from "@/lib/auth";

export default function Home() {
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    setUser(getSession());
  }, []);

  if (user) {
    return (
      <main className="page">
        <div className="hero-card">
          <p className="eyebrow">Welcome back</p>
          <h1>Hi, {user.name.split(" ")[0]} 👋</h1>
          <p className="lede">
            {user.role === "DRIVER"
              ? "Jump back into your driver dashboard to manage requests and trips."
              : "Ready to book your next pooled ride across Dhaka?"}
          </p>
          <a href={user.role === "DRIVER" ? "/driver" : "/passenger"}>
            <button>{user.role === "DRIVER" ? "Open driver dashboard →" : "Request a ride →"}</button>
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="hero-card">
        <p className="eyebrow">Ride-pooling for Dhaka</p>
        <h1>Share a seat.<br />Split the fare.</h1>
        <p className="lede">
          Jashim drives Bullet, his three-seat Tesla. Book a ride, get pooled with a stranger
          heading the same way, and split the fare fairly — no surge, no haggling.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <a href="/signup"><button>Get started</button></a>
          <a href="/login"><button className="secondary">Log in</button></a>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>🧭 For passengers</h2>
          <p className="muted">
            Request a ride by zone, get an instant fare estimate, and track your driver in
            real time — from matched to on the road to dropped off.
          </p>
        </div>
        <div className="card">
          <h2>🚦 For drivers</h2>
          <p className="muted">
            See pending requests near your pickup zone, accept a rider, and pool a second
            or third one in when there's room — never overbooked.
          </p>
        </div>
      </div>
    </main>
  );
}