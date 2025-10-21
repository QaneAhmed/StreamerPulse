import { ConvexHttpClient } from "convex/browser";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

async function main() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  const adminKey = process.env.CONVEX_ADMIN_KEY;
  if (!url || !adminKey) {
    console.error("Missing Convex connection info", { url, adminKey: !!adminKey });
    process.exit(1);
  }

  const client = new ConvexHttpClient(url);
  client.setAdminAuth(adminKey, undefined);

  const integrations = await client.query("ingestion/getActiveChannels", {});
  console.log("Integrations:", integrations);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
