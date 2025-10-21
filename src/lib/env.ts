import { z } from "zod";

const EnvSchema = z.object({
  NEXT_PUBLIC_CONVEX_URL: z.string().url(),
  CONVEX_DEPLOYMENT: z.string().optional(),
  CONVEX_ADMIN_KEY: z.string().optional(),
  CONVEX_WORKSPACE_SECRET: z.string().optional(),
});

export function readEnv() {
  return EnvSchema.parse(process.env);
}
