const CANDIDATE_ENV_VARS = [
  "SITE_URL",
  "APP_URL",
  "URL",
  "PUBLIC_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_BASE_URL",
  "NEXT_PUBLIC_ORIGIN",
  "NEXT_PUBLIC_URL",
  "NEXT_PUBLIC_VERCEL_URL",
  "LIVE_FEED_ORIGIN",
  "NEXT_PUBLIC_LIVE_FEED_ORIGIN",
  "VERCEL_URL",
  "RENDER_EXTERNAL_URL",
];

type ResolveOptions = {
  headers?: Headers;
};

export function resolveSiteUrl(options: ResolveOptions = {}): string {
  const envUrl = coalesceEnvUrl();
  if (envUrl) {
    return envUrl;
  }

  const headerUrl = coalesceFromHeaders(options.headers);
  if (headerUrl) {
    return headerUrl;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

function coalesceEnvUrl(): string | undefined {
  for (const key of CANDIDATE_ENV_VARS) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return normalize(value);
    }
  }

  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.trim().length > 0) {
    return normalize(`https://${vercel}`);
  }

  return undefined;
}

function coalesceFromHeaders(headers?: Headers): string | undefined {
  if (!headers) {
    return undefined;
  }

  const forwardedProto = headers.get("x-forwarded-proto");
  const forwardedHost = headers.get("x-forwarded-host");
  const host = headers.get("host");

  if (forwardedHost) {
    const proto = forwardedProto ?? "https";
    return normalize(`${proto}://${forwardedHost}`);
  }

  if (host) {
    const proto = forwardedProto ?? "https";
    return normalize(`${proto}://${host}`);
  }

  return undefined;
}

function normalize(value: string): string {
  return value.replace(/\/$/, "");
}
