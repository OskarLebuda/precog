import type { ReactNode } from "react";
import Link from "next/link";
import { PrecogProvider, PrecogOverlay } from "next-precog";
import "./globals.css";

export const metadata = { title: "precog for Next" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PrecogProvider mode="auto" thresholds={{ prefetch: 0.06, prerender: 0.25 }}>
          <header>
            <Link href="/">precog</Link>
            <nav>
              <Link href="/docs">Docs</Link>
              <Link href="/blog">Blog</Link>
            </nav>
          </header>
          {children}
          <PrecogOverlay />
        </PrecogProvider>
      </body>
    </html>
  );
}
