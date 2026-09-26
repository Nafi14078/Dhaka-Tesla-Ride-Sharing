"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getSession, StoredUser } from "@/lib/auth";

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

  useEffect(() => {
    setUser(getSession());
  }, [pathname]);

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
