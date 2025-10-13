import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-950 px-6 py-16 text-center text-slate-100">
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">
          StreamerPulse Labs
        </p>
        <h1 className="text-4xl font-bold sm:text-5xl">
          Real-time Twitch chat intelligence for streamers.
        </h1>
        <p className="text-base text-slate-300">
          StreamLens surfaces message velocity, sentiment, spikes, and top
          emotes in under two seconds so you can react live. Connect with Twitch
          to start your beta workspace.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/sign-in"
          className="rounded-full bg-violet-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-400"
        >
          Sign in with Twitch
        </Link>
        <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
          closed beta · eu region
        </span>
      </div>
    </main>
  );
}
