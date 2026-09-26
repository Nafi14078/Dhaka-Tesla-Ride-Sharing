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
    <main className="container">
      <div className="card">
        <h1>Sign up</h1>
        <form onSubmit={handleSubmit}>
          <label>I am a</label>
          <select value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="PASSENGER">Passenger</option>
            <option value="DRIVER">Driver</option>
          </select>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
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
          <button disabled={loading} type="submit">{loading ? "Creating account..." : "Sign up"}</button>
        </form>
        <p className="muted" style={{ marginTop: 12 }}>
          Already have an account? <a className="link" href="/login">Log in</a>
        </p>
      </div>
    </main>
  );
}