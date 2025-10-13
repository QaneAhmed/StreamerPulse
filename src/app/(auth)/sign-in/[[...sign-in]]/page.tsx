'use client';

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
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
          forceRedirectUrl="/dashboard"
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
