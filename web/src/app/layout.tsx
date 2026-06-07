import type { Metadata } from "next";
import { Inter } from "next/font/google";
// LiveKit component styles. Imported here (JS resolution honors the package's
// "import" export condition) rather than via PostCSS @import (which requires a
// "style" condition the package doesn't expose).
import "@livekit/components-styles";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VoiceBridge — Northstar Insurance",
  description:
    "Business-deployed conversational access layer for high-stakes insurance phone workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
