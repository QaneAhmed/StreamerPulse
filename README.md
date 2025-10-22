## Hello, this is StreamerPulse

/Qane & Oskar

### Getting started

```bash
npm install
npm run dev
```

Before pushing changes run:

```bash
npx next lint
npm run build
```

### Deploying to Railway

See `docs/deployment.md` for the full step-by-step guide covering:

- Preparing and publishing the repository to GitHub.
- Configuring environment variables (`.env.example` is the source of truth).
- Setting up the main Next.js app service and the Twitch ingestion worker.
- Updating Twitch and Clerk OAuth redirect URLs.
- Post-deploy verification and ongoing workflow tips.

### Running the ingestion worker

The Twitch ingestion worker needs to POST live updates back to the dashboard at
`/api/live-feed`. Point it at your deployed host by setting one of these
environment variables before starting the worker:

```
export LIVE_FEED_URL="https://your-domain.com/api/live-feed"
# or
export LIVE_FEED_ORIGIN="https://your-domain.com"
# or pass a CLI flag:
npm run ingest:twitch -- --live-feed-url=https://your-domain.com/api/live-feed
```

If neither variable is set the worker falls back to
`http://localhost:3000/api/live-feed`, which only works in local development.

### Multi-channel ingestion

- Running `npm run ingest:twitch` now launches one ingestion worker per connected Twitch integration (or per login listed in `TWITCH_CHANNELS` / `TWITCH_CHANNEL_ALLOWLIST`).
- Provide channel-specific credentials by exporting `TWITCH_<LOGIN>_ACCESS_TOKEN`, `TWITCH_<LOGIN>_REFRESH_TOKEN`, and `TWITCH_<LOGIN>_USERNAME` (falling back to the global `TWITCH_USER_*` values when omitted).
- Set `TWITCH_CHANNEL` if you need to force a single channel or override the default selection.
