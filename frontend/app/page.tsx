"use client";
import { useEffect, useState } from "react";
import { getSession, clearSession, StoredUser } from "@/lib/auth";

export default function Home() {
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    setUser(getSession());
  }, []);

  if (user) {
    return (
      <main className="container">
        <div className="card">
          <h1>Welcome back, {user.name}</h1>
          <p className="muted">Signed in as {user.role.toLowerCase()}</p>
          <a className="link" href={user.role === "DRIVER" ? "/driver" : "/passenger"}>
            Go to your dashboard →
          </a>
          <button
            className="secondary"
            style={{ marginTop: 16 }}
            onClick={() => {
              clearSession();
              setUser(null);
            }}
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="card">
        <h1>Share a seat. Split the fare.</h1>
        <p className="muted">
          Jashim drives Bullet, his three-seat Tesla. Book a ride, pool with a stranger heading
          the same way, and split the fare — fairly.
        </p>
        <a className="link" href="/login">Log in</a>
        {" · "}
        <a className="link" href="/signup">Sign up</a>
      </div>
    </main>
  );
}