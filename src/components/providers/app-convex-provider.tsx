'use client';

import type { ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const client = convexUrl ? new ConvexReactClient(convexUrl) : null;

type AppConvexProviderProps = {
  children: ReactNode;
};

export function AppConvexProvider({ children }: AppConvexProviderProps) {
  if (!client) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "Convex URL not set. Provide NEXT_PUBLIC_CONVEX_URL to enable realtime data."
      );
    }
    return <>{children}</>;
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
