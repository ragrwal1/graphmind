import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RealmSpark",
  description: "Voice-first VC memory for RealmSpark",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "RealmSpark",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Prevents iOS Safari auto-zoom on input focus */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        {/* Full-screen when launched from iOS home screen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RealmSpark" />
        <meta name="theme-color" content="#5c1228" />
        <link rel="apple-touch-icon" href="/realmspark-logo.svg" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>{children}</body>
    </html>
  );
}
