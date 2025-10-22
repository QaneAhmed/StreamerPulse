# Deployment Guide

This guide documents everything needed to launch StreamerPulse on Railway with a
separate ingestion worker. Follow the steps in order, stopping where manual
credentials or approvals are required.

## 1. Local preparation
- Ensure Node.js 20.x and npm 10.x are installed.
- From the repo root, run:
  - `npm install`
  - `npx next lint`
  - `npm run build`
- Commit or stash any local changes so `git status` is clean.

## 2. Environment variables
Populate `.env.local` using `.env.example` as the reference. Required values:

### Core app
- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_LIVE_FEED_URL`: Base URL of the hosted app.
- `NEXT_PUBLIC_CONVEX_URL`: Public Convex deployment URL.

### Authentication (Clerk)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

### Convex backend
- `CONVEX_DEPLOYMENT`: e.g. `prod:your-project`.
- `CONVEX_ADMIN_KEY`
- `CONVEX_ADMIN_IDENTITY` (JSON string) and `CONVEX_WORKSPACE_SECRET` if used.
- `WORKSPACE_CONNECT_SECRET`

### Twitch ingestion
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`
- `TWITCH_USER_ACCESS_TOKEN`, `TWITCH_USER_REFRESH_TOKEN`
- `TWITCH_CHANNELS` (comma-separated logins that should be ingested)
- `LIVE_FEED_URL`, `LIVE_FEED_ORIGIN` (match the hosted URL)

### AI providers
- `VERCEL_AI_API_KEY`
- `OPENAI_API_KEY` (optional fallback)

Document additional keys in `.env.example` if new integrations are added later.

## 3. Push to GitHub
1. Create a new GitHub repository (private or public).
2. Connect the local repo:
   ```bash
   git remote add origin https://github.com/<you>/streamerpulse.git
   git push -u origin main
   ```
3. Confirm `.env.local`, `.next/`, and other ignored files are not committed.

## 4. Configure Convex (one-time)
- Ensure your Convex project has both development and production deployments.
- Deploy schemas/functions if anything changed:
  ```bash
  CONVEX_DEPLOYMENT=prod:your-project npx convex deploy
  ```
- Note the production `CONVEX_DEPLOYMENT`, `CONVEX_ADMIN_KEY`, and `NEXT_PUBLIC_CONVEX_URL` for Railway.

## 5. Railway application service
1. Create a Railway project and connect it to the GitHub repo.
2. Build command: `npm run build`
3. Start command: `npm run start`
4. Environment variables: copy everything from `.env.example` with production values.
5. Trigger a deploy; verify logs complete without errors.

## 6. Railway ingestion worker
1. Add a second service in the same project from the same repo and set the **Root Directory** to `worker`.
2. Build command: `npm install`
3. Start command:
   ```bash
   npm run start -- --live-feed-url=https://<your-app>.up.railway.app/api/live-feed
   ```
4. Copy the environment variables from the app service (the worker expects the same Convex, Clerk, Twitch, and LIVE_FEED_* values).
5. Confirm the worker stays healthy and logs channel ingestion.

## 7. OAuth provider updates
- Twitch Developer Console:
  - Add `https://<your-app>.up.railway.app/api/auth/twitch/callback` to Redirect URIs.
- Clerk dashboard:
  - Add the Railway domain to Allowed Origins and Redirect URLs.
- Update any other providers (e.g. analytics) to point at the production domain.

## 8. Optional custom domain
- Add a Railway domain or custom domain.
- Update `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_LIVE_FEED_URL`, `LIVE_FEED_URL`,
  and OAuth redirect URIs to use the custom domain.

## 9. Post-deploy verification
- Visit the deployed app and sign in via Clerk.
- Start the ingestion worker and ensure dashboard updates arrive.
- Monitor Railway metrics (CPU, memory) and adjust the plan or add instances
  if sustained usage approaches limits.

## 10. Ongoing workflow
- Before each push: `npx next lint`, `npm run build`.
- Push to GitHub → Railway auto-deploys both services.
- Update `.env.example` and Railway variables together whenever new config is introduced.
