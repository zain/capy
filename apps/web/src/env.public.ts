// Varlock defines build-time inputs; Workers use native bindings for server-only secrets.
import type { PublicCoercedEnvSchema } from "./env";

export const ENV = {
  VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
  VITE_CONVEX_SITE_URL: import.meta.env.VITE_CONVEX_SITE_URL,
} satisfies Pick<PublicCoercedEnvSchema, "VITE_CONVEX_URL" | "VITE_CONVEX_SITE_URL">;
