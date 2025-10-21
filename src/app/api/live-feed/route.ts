import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Writable = WritableStreamDefaultWriter<Uint8Array>;

const encoder = new TextEncoder();
const HISTORY_LIMIT = 200;

type BroadcastEntry = {
  timestamp: number;
  message: unknown;
};

type ChannelState = {
  clients: Set<Writable>;
  history: BroadcastEntry[];
};

const channels = new Map<string, ChannelState>();

function getChannelState(channel: string): ChannelState {
  let state = channels.get(channel);
  if (!state) {
    state = { clients: new Set(), history: [] };
    channels.set(channel, state);
  }
  return state;
}

function toUint8Array(data: unknown) {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(channel: string, message: unknown) {
  recordMessage(channel, message);
  const payload = toUint8Array(message);
  const state = getChannelState(channel);
  for (const client of Array.from(state.clients)) {
    client.write(payload).catch(() => {
      state.clients.delete(client);
    });
  }
}

function recordMessage(channel: string, message: unknown) {
  if (
    message &&
    typeof message === "object" &&
    "type" in message &&
    typeof (message as { type: unknown }).type === "string"
  ) {
    const type = (message as { type: string }).type;
    const state = getChannelState(channel);
    if (type === "reset") {
      state.history.length = 0;
    }
    state.history.push({ timestamp: Date.now(), message });
    if (state.history.length > HISTORY_LIMIT) {
      state.history.shift();
    }
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const channelParam = url.searchParams.get("channel");
  const channel = channelParam?.toLowerCase().trim();

  if (!channel) {
    return new NextResponse(JSON.stringify({ error: "Channel parameter required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const state = getChannelState(channel);
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  state.clients.add(writer);

  const heartbeat = setInterval(() => {
    writer
      .write(encoder.encode("event: ping\ndata: {}\n\n"))
      .catch(() => state.clients.delete(writer));
  }, 25000);

  request.signal.addEventListener("abort", () => {
    clearInterval(heartbeat);
    state.clients.delete(writer);
    writer.close().catch(() => {});
  });

  const send = (message: unknown) =>
    writer.write(toUint8Array(message)).catch(() => {
      state.clients.delete(writer);
    });

  const snapshot = state.history.slice();
  let sessionSent = false;

  send({ type: "reset" });

  for (const entry of snapshot) {
    const payload = entry.message;
    if (
      payload &&
      typeof payload === "object" &&
      "type" in payload &&
      (payload as { type: string }).type === "reset"
    ) {
      continue;
    }
    if (
      payload &&
      typeof payload === "object" &&
      "type" in payload &&
      (payload as { type: string }).type === "session"
    ) {
      sessionSent = true;
    }
    send(payload);
  }

  if (!sessionSent) {
    send({ type: "session", payload: { status: "idle", channel: null, startedAt: null } });
  }

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const channelRaw =
      (body as { channel?: unknown }).channel ??
      (body as { channelLogin?: unknown }).channelLogin ??
      (body as { channelSlug?: unknown }).channelSlug;

    if (typeof channelRaw !== "string" || !channelRaw.trim()) {
      return NextResponse.json({ error: "Channel value required" }, { status: 400 });
    }

    const channel = channelRaw.toLowerCase().trim();

    const updates = Array.isArray((body as { updates?: unknown[] }).updates)
      ? (body as { updates?: unknown[] }).updates
      : null;

    if (updates) {
      for (const update of updates) {
        broadcast(channel, update);
      }
      return new NextResponse(null, { status: 204 });
    }

    broadcast(channel, body);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid payload", details: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
