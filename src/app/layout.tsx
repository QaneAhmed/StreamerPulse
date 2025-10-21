import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppClerkProvider } from "@/components/providers/app-clerk-provider";
import { AppConvexProvider } from "@/components/providers/app-convex-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "StreamLens",
  description:
    "Real-time Twitch chat analytics for streamers. Built with StreamerPulse.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-slate-950">
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased text-slate-100`}
      >
        <AppClerkProvider>
          <AppConvexProvider>{children}</AppConvexProvider>
        </AppClerkProvider>
      </body>
    </html>
  );
}
