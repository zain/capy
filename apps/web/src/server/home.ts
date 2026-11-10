import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { getToken } from "@/lib/auth-server";
import { homeRedirect } from "./home-redirect";

export const selfHostedHome = createServerFn({ method: "GET" }).handler(async () => {
  const selfHosted = (env as unknown as { CAPY_SELF_HOSTED?: string }).CAPY_SELF_HOSTED === "true";
  return homeRedirect(selfHosted, selfHosted && !!(await getToken()));
});
