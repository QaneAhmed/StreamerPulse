import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type EnsureWorkspaceArgs = {
  identityKeys: string[];
  channelId: string;
  channelLogin: string;
  channelDisplayName: string;
  now?: number;
};

type EnsureWorkspaceResult = {
  userId: Id<"users">;
  workspaceId: Id<"workspaces">;
  integrationId: Id<"integrations">;
  userClerkId: string;
};

const FALLBACK_PREFIX = "twitch:";

function generateSalt(bytes = 16) {
  const alphabet = "abcdef0123456789";
  let result = "";
  for (let i = 0; i < bytes * 2; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

async function findUserByClerkId(ctx: MutationCtx, clerkUserId: string) {
  const matches = await ctx.db
    .query("users")
    .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", clerkUserId))
    .collect();

  if (matches.length <= 1) {
    return matches[0] ?? null;
  }

  const sorted = matches.sort((a, b) => {
    const aCreated = (a.createdAt as number | undefined) ?? 0;
    const bCreated = (b.createdAt as number | undefined) ?? 0;
    return aCreated - bCreated;
  });

  const [primary, ...duplicates] = sorted;
  await Promise.all(duplicates.map((doc) => ctx.db.delete(doc._id)));
  return primary;
}

export async function ensureWorkspace(
  ctx: MutationCtx,
  args: EnsureWorkspaceArgs
): Promise<EnsureWorkspaceResult> {
  const now = args.now ?? Date.now();
  const identityKeys = args.identityKeys.filter(Boolean);

  if (identityKeys.length === 0) {
    identityKeys.push(`${FALLBACK_PREFIX}${args.channelLogin}`);
  }

  const primaryId = identityKeys[0];
  let user: Doc<"users"> | null = await findUserByClerkId(ctx, primaryId);

  if (!user) {
    for (const candidate of identityKeys.slice(1)) {
      const match = await findUserByClerkId(ctx, candidate);
      if (match) {
        user = match;
        break;
      }
    }
  }

  if (user && user.clerkUserId !== primaryId) {
    const primaryExists = await findUserByClerkId(ctx, primaryId);
    if (!primaryExists) {
      await ctx.db.patch(user._id, {
        clerkUserId: primaryId,
        updatedAt: now,
      });
      user = await ctx.db.get(user._id);
    } else {
      user = primaryExists;
    }
  }

  if (!user) {
    const createdId = await ctx.db.insert("users", {
      clerkUserId: primaryId,
      email: undefined,
      displayName: args.channelDisplayName,
      createdAt: now,
      updatedAt: now,
    });
    console.info("[convex] Created new workspace owner", {
      primaryId,
      identityKeys,
      workspaceName: `${args.channelDisplayName}'s Workspace`,
    });
    user = await ctx.db.get(createdId);
  }

  if (!user) {
    throw new Error("Failed to upsert user for workspace");
  }

  let workspace: Doc<"workspaces"> | null = await ctx.db
    .query("workspaces")
    .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
    .first();

  if (!workspace) {
    const workspaceId = await ctx.db.insert("workspaces", {
      ownerId: user._id,
      name: `${args.channelDisplayName}'s Workspace`,
      region: "eu",
      retentionDays: 90,
      ingestionStatus: "idle",
      createdAt: now,
      updatedAt: now,
    });
    workspace = await ctx.db.get(workspaceId);

    await ctx.db.insert("workspaceSecrets", {
      workspaceId,
      twitchSalt: generateSalt(),
      createdAt: now,
    });
  }

  if (!workspace) {
    throw new Error("Failed to upsert workspace");
  }

  let integrationMatches = await ctx.db
    .query("integrations")
    .withIndex("by_channel_login", (q) => q.eq("channelLogin", args.channelLogin))
    .collect();

  if (integrationMatches.length > 1) {
    const sorted = integrationMatches.sort((a, b) => {
      const aCreated = (a.createdAt as number | undefined) ?? 0;
      const bCreated = (b.createdAt as number | undefined) ?? 0;
      return aCreated - bCreated;
    });
    const [, ...duplicates] = sorted;
    await Promise.all(duplicates.map((doc) => ctx.db.delete(doc._id)));
    integrationMatches = [sorted[0]];
  }

  let integration: Doc<"integrations"> | null =
    integrationMatches[0] ?? null;

  if (!integration) {
    const integrationId = await ctx.db.insert("integrations", {
      workspaceId: workspace._id,
      provider: "twitch",
      channelId: args.channelId,
      channelLogin: args.channelLogin,
      channelDisplayName: args.channelDisplayName,
      status: "connected",
      connectedAt: now,
      disconnectedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
    integration = await ctx.db.get(integrationId);
  } else {
    const updates: Record<string, unknown> = {};
    if (integration.workspaceId !== workspace._id) {
      updates.workspaceId = workspace._id;
    }
    if (integration.channelDisplayName !== args.channelDisplayName) {
      updates.channelDisplayName = args.channelDisplayName;
    }
    if (integration.status !== "connected") {
      updates.status = "connected";
      updates.connectedAt = now;
      updates.disconnectedAt = undefined;
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = now;
      await ctx.db.patch(integration._id, updates);
      integration = await ctx.db.get(integration._id);
    }
  }

  if (!integration) {
    throw new Error("Failed to upsert integration");
  }

  return {
    userId: user._id,
    workspaceId: workspace._id,
    integrationId: integration._id,
    userClerkId: user.clerkUserId,
  };
}
