'use client';

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center text-sm text-slate-300 shadow-lg shadow-slate-950/40 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.4em] text-violet-300">
            StreamLens Beta
          </p>
          <h1 className="mt-4 text-xl font-semibold text-slate-100">
            Authentication not configured
          </h1>
          <p className="mt-3">
            Set <code className="font-mono text-violet-300">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>{" "}
            and <code className="font-mono text-violet-300">CLERK_SECRET_KEY</code> in your environment
            to enable Clerk sign-in.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/40 backdrop-blur">
        <div className="mb-6 flex flex-col gap-2 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-violet-300">
            StreamLens Beta
          </p>
          <h1 className="text-2xl font-semibold">Sign in with Twitch</h1>
          <p className="text-sm text-slate-400">
            We use Clerk for secure authentication. Twitch is the only login
            provider in this beta.
          </p>
        </div>
        <SignIn
          routing="path"
          path="/sign-in"
          forceRedirectUrl="/dashboard/connect"
          appearance={{
            elements: {
              formButtonPrimary:
                "bg-violet-500 hover:bg-violet-400 text-slate-950",
            },
            variables: { colorPrimary: "#7c3aed" },
          }}
        />
      </div>
    </main>
  );
}
