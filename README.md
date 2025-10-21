## Hello, this is StreamerPulse

/Qane & Oskar

### Running the ingestion worker

The Twitch ingestion worker needs to POST live updates back to the dashboard at
`/api/live-feed`. Point it at your deployed host by setting one of these
environment variables before starting the worker:

```
export LIVE_FEED_URL="https://your-domain.com/api/live-feed"
# or
export LIVE_FEED_ORIGIN="https://your-domain.com"
```

If neither variable is set the worker falls back to
`http://localhost:3000/api/live-feed`, which only works in local development.
