import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Polymarket Impulse Bot",
  description: "Detect sudden price impulses, buy rising side, trail and hedge",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="layout">
          <header className="layoutHeader">
            <div className="layoutHeaderInner">
              <Link href="/" className="appTitle">
                Polymarket Impulse Bot
              </Link>
              <nav className="nav">
                <Link href="/" className="navLink">
                  Dashboard
                </Link>
                <Link href="/settings" className="navLink">
                  Settings
                </Link>
              </nav>
            </div>
          </header>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
