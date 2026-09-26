"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getSession, StoredUser } from "@/lib/auth";
import { api } from "@/lib/api";
import { Notice } from "@/lib/notifications";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticeOpen, setNoticeOpen] = useState(false);

  useEffect(() => {
    setUser(getSession());
  }, [pathname]);

  useEffect(() => {
    if (!user) { setNotices([]); return; }
    const syncNotices = () => {
      try { setNotices(JSON.parse(localStorage.getItem(`notifications:${user.id}`) || "[]")); }
      catch { setNotices([]); }
    };
    window.addEventListener("notifications-updated", syncNotices);
    let active = true;
    const stateKey = `notification-state:${user.id}`;
    const noticesKey = `notifications:${user.id}`;
    let previous: Record<string, string> = {};
    try {
      previous = JSON.parse(localStorage.getItem(stateKey) || "{}");
      syncNotices();
    } catch { previous = {}; }
    let initialized = Object.keys(previous).length > 0;

    const refresh = async () => {
      try {
        let next: Record<string, string> = {};
        const messages: Array<{ id: string; message: string }> = [];
        if (user.role === "PASSENGER") {
          const rides = await api.myRides();
          for (const ride of rides) {
            next[ride.id] = ride.status;
            const old = previous[ride.id];
            if (initialized && old !== ride.status && ride.status === "MATCHED") messages.push({ id: `${ride.id}:MATCHED`, message: `Your ride to ${ride.destinationZone} was accepted by a driver.` });
            if (initialized && old !== ride.status && ride.status === "COMPLETED") messages.push({ id: `${ride.id}:COMPLETED`, message: `Your journey to ${ride.destinationZone} is complete.` });
          }
        } else {
          const [requests, pools] = await Promise.all([api.pendingRequests(), api.driverHistory()]);
          for (const request of requests) {
            next[`request:${request.id}`] = "REQUESTED";
            if (initialized && !previous[`request:${request.id}`]) messages.push({ id: `request:${request.id}`, message: `${request.passenger?.name || "A passenger"} requested a ride: ${request.pickupZone} to ${request.destinationZone}.` });
          }
          for (const pool of pools) {
            next[`pool:${pool.id}`] = pool.status;
            if (initialized && previous[`pool:${pool.id}`] && previous[`pool:${pool.id}`] !== "COMPLETED" && pool.status === "COMPLETED") messages.push({ id: `pool:${pool.id}:COMPLETED`, message: `Journey ${pool.pickupZone ? `from ${pool.pickupZone} ` : ""}completed successfully.` });
          }
        }
        if (!active) return;
        if (!initialized) initialized = true;
        previous = next;
        localStorage.setItem(stateKey, JSON.stringify(next));
        if (messages.length) {
          const existing: Notice[] = JSON.parse(localStorage.getItem(noticesKey) || "[]");
          const known = new Set(existing.map((notice) => notice.id));
          const combined = [...messages.filter((notice) => !known.has(notice.id)).map((notice) => ({ ...notice, createdAt: Date.now() })), ...existing].slice(0, 30);
          localStorage.setItem(noticesKey, JSON.stringify(combined));
          setNotices(combined);
        }
      } catch { /* the navbar remains usable while signed out or offline */ }
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("notifications-updated", syncNotices); };
  }, [user]);

  const dashboardHref = user?.role === "DRIVER" ? "/driver" : "/passenger";
  const dashboardLabel = user?.role === "DRIVER" ? "Driver dashboard" : "Request a ride";

  function linkClass(href: string) {
    return `nav-link${pathname === href ? " active" : ""}`;
  }

  return (
    <header className="topbar">
      <Link className="brand-mark" href="/">
        <span className="brand-badge" aria-hidden="true">D</span>
        Dhaka Tesla Pool
      </Link>

      <nav className="nav-actions" aria-label="Main navigation">
        <Link className={linkClass("/")} href="/">Home</Link>
        {user ? (
          <>
            <Link className={linkClass(dashboardHref)} href={dashboardHref}>
              {dashboardLabel}
            </Link>
            <div className="notification-wrap">
              <button className="notification-button" aria-label={`Notifications${notices.length ? `, ${notices.length} new` : ""}`} aria-expanded={noticeOpen} onClick={() => setNoticeOpen((open) => !open)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
                {notices.length > 0 && <span className="notification-count">{notices.length > 9 ? "9+" : notices.length}</span>}
              </button>
              {noticeOpen && <div className="notification-panel" role="dialog" aria-label="Notifications">
                <div className="notification-heading"><strong>Notifications</strong>{notices.length > 0 && <button className="notification-clear" onClick={() => { setNotices([]); localStorage.setItem(`notifications:${user.id}`, "[]"); }}>Clear all</button>}</div>
                {notices.length ? notices.map((notice) => <div className="notification-item" key={notice.id}>{notice.message}<time>{new Date(notice.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>) : <p className="notification-empty">You’re all caught up.</p>}
              </div>}
            </div>
            <div className="user-chip">
              <span className="avatar">{initials(user.name)}</span>
              <span className="user-name">{user.name}</span>
            </div>
            <button
              className="secondary btn-sm"
              onClick={() => {
                clearSession();
                setUser(null);
                router.replace("/login");
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link className={linkClass("/login")} href="/login">Login</Link>
            <Link className="nav-signup" href="/signup">Sign up</Link>
          </>
        )}
      </nav>
    </header>
  );
}
