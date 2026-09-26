import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Dhaka Tesla Pool",
  description: "Share a seat. Split the fare. Survive Dhaka traffic.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="app-header">
          <a href="/">🛺 Dhaka Tesla Pool</a>
        </header>
        {children}
      </body>
    </html>
  );
}