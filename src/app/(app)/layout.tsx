import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AppHeader from "@/components/app-header";
import { ensureWorkspace } from "@/lib/workspace";

type AppLayoutProps = {
  children: ReactNode;
};

export const dynamic = "force-dynamic";

export const runtime = "nodejs";

export default async function AppLayout({ children }: AppLayoutProps) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  await ensureWorkspace(userId);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <AppHeader />
      <main className="flex flex-1 flex-col gap-1 px-2 py-2">
        {children}
      </main>
    </div>
  );
}

// Workspace linkage handled via shared ensureWorkspace utility
