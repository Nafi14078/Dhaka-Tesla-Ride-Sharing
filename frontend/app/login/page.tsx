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
    <main className="container">
      <div className="card">
        <h1>Log in</h1>
        <p className="muted">
          Demo accounts (seed data): jashim@dhakatesla.dev / nusrat@dhakatesla.dev / rafiq@dhakatesla.dev
          — password: password123
        </p>
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          <label>Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          {error && <div className="error">{error}</div>}
          <button disabled={loading} type="submit">{loading ? "Logging in..." : "Log in"}</button>
        </form>
        <p className="muted" style={{ marginTop: 12 }}>
          No account? <a className="link" href="/signup">Sign up</a>
        </p>
      </div>
    </main>
  );
}