"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { saveSession } from "@/lib/auth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

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

  async function handleGoogleCredential(credential: string) {
    setError("");
    setLoading(true);
    try {
      const result = await api.googleAuth(credential);
      saveSession(result.token, result.user);
      router.push(result.user.role === "DRIVER" ? "/driver" : "/passenger");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in with Google");
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
        <div style={{ display: "flex", justifyContent: "center", margin: "18px 0 12px" }}>
          <GoogleSignInButton disabled={loading} onCredential={handleGoogleCredential} onError={setError} />
        </div>
        <p className="muted" style={{ textAlign: "center", margin: "0 0 14px" }}>or log in with email</p>
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
