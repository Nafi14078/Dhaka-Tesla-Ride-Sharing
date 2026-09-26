import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";

export const metadata = {
  title: "Dhaka Tesla Pool",
  description: "Share a seat. Split the fare. Survive Dhaka traffic.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <div className="site-content">{children}</div>
        <footer className="site-footer">
          <div className="footer-inner">
            <Link className="footer-brand" href="/">Dhaka Tesla Pool</Link>
            <span>Share a seat. Split the fare. Make Dhaka trips easier.</span>
            <span className="footer-copy">© {new Date().getFullYear()} Dhaka Tesla Pool</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
