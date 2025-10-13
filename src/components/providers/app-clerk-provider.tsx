'use client';

import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

type AppClerkProviderProps = {
  children: ReactNode;
};

export function AppClerkProvider({ children }: AppClerkProviderProps) {
  if (!publishableKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "Clerk publishable key not set. UI will render without authentication until NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is provided."
      );
    }
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>
  );
}
