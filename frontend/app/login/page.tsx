"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { saveSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.login({ email, password });
      saveSession(result.token, result.user);
      router.push(result.user.role === "DRIVER" ? "/driver" : "/passenger");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page page-narrow">
      <div className="card">
        <p className="eyebrow">Welcome back</p>
        <h1>Log in</h1>
        <div className="hint" style={{ marginTop: 14 }}>
          Demo: <strong>jashim@dhakatesla.dev</strong> (driver) or{" "}
          <strong>nusrat@dhakatesla.dev</strong> (passenger) — password <code>password123</code>
        </div>
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoFocus />
          <label>Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          {error && <div className="error">{error}</div>}
          <button className="btn-block" disabled={loading} type="submit">
            {loading ? <><span className="spinner" />Logging in...</> : "Log in"}
          </button>
        </form>
        <hr className="divider" />
        <p className="muted">
          No account? <a className="link" href="/signup">Sign up</a>
        </p>
      </div>
    </main>
  );
}