import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@capy/backend/convex/_generated/api";
import { ENV } from "@/env.public";
import { alertEmail, pulleyAccessInput } from "./pulley-access-alert";

export interface PulleyAccessEnv {
  /** Cloudflare send_email binding; it can only reach verified Email Routing destinations. */
  ALERT_EMAIL?: SendEmail;
  ALERT_EMAIL_TO?: string;
}

export const requestPulleyImport = createServerFn({ method: "POST" })
  .validator(pulleyAccessInput)
  .handler(async ({ data }) => {
    await new ConvexHttpClient(ENV.VITE_CONVEX_URL).mutation(api.pulleyAccess.submit, data);
    const runtime = env as unknown as PulleyAccessEnv;
    if (runtime.ALERT_EMAIL && runtime.ALERT_EMAIL_TO) {
      try {
        await runtime.ALERT_EMAIL.send(alertEmail(data, runtime.ALERT_EMAIL_TO));
      } catch (error) {
        // The request is already saved, so a failed alert must not fail the form.
        console.error("Pulley import alert failed", error);
      }
    }
    return { ok: true };
  });
