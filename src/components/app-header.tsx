'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export default function AppHeader() {
  const pathname = usePathname();
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <header className="flex h-16 items-center gap-4 border-b border-slate-800 bg-slate-900/60 px-6 backdrop-blur lg:px-12">
      <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">
          SP
        </span>
        <span className="flex items-center gap-2">
          StreamerPulse
          <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-violet-200">
            Beta
          </span>
        </span>
      </Link>
      <nav className="ml-auto flex items-center gap-6 text-sm text-slate-400">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "transition hover:text-slate-100",
              pathname.startsWith(item.href) && "text-slate-100"
            )}
          >
            {item.label}
          </Link>
        ))}
        <div className="h-6 w-px bg-slate-800" />
        {hasClerk ? (
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "w-8 h-8",
                userButtonTrigger: "text-slate-100",
              },
            }}
            showName={false}
            afterSignOutUrl="/"
          />
        ) : (
          <Link
            href="/sign-in"
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition hover:border-violet-500 hover:text-violet-300"
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
