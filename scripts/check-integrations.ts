import { ConvexHttpClient } from "convex/browser";

async function main() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  const adminKey = process.env.CONVEX_ADMIN_KEY;
  if (!url || !adminKey) {
    console.error("Missing Convex connection info");
    process.exit(1);
  }

  const client = new ConvexHttpClient(url);
  (client as any).setAdminAuth?.(adminKey, undefined);

  const integrations = await (client as any).query("ingestion/getActiveChannels", {});
  console.log("Integrations:", integrations);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
