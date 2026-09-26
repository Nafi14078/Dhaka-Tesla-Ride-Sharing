"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { saveSession } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"PASSENGER" | "DRIVER">("PASSENGER");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.signup({ name, email, password, role });
      saveSession(result.token, result.user);
      router.push(role === "DRIVER" ? "/driver" : "/passenger");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page page-narrow">
      <div className="card">
        <p className="eyebrow">Get started</p>
        <h1>Sign up</h1>
        <p className="lede" style={{ marginTop: 6 }}>Passenger or driver — pick one below.</p>

        <div className="row" style={{ gap: 10, marginBottom: 4 }}>
          <button
            type="button"
            className={role === "PASSENGER" ? "" : "secondary"}
            style={{ flex: 1, marginTop: 0 }}
            onClick={() => setRole("PASSENGER")}
          >
            🧍 Passenger
          </button>
          <button
            type="button"
            className={role === "DRIVER" ? "" : "secondary"}
            style={{ flex: 1, marginTop: 0 }}
            onClick={() => setRole("DRIVER")}
          >
            🚗 Driver
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          <label>Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            minLength={6}
            required
          />
          {error && <div className="error">{error}</div>}
          <button className="btn-block" disabled={loading} type="submit">
            {loading ? <><span className="spinner" />Creating account...</> : `Sign up as ${role === "DRIVER" ? "driver" : "passenger"}`}
          </button>
        </form>
        <hr className="divider" />
        <p className="muted">
          Already have an account? <a className="link" href="/login">Log in</a>
        </p>
      </div>
    </main>
  );
}