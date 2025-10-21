'use client';

import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

type AppClerkProviderProps = {
  children: ReactNode;
};

export function AppClerkProvider({ children }: AppClerkProviderProps) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
