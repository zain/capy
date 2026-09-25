// Calls Capy's token-checked Convex functions (convex/mcp.ts) for one MCP request.
import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { ENV } from "../../env.public";

type Auth = { token: string; now: number };
type Call<K extends "query" | "mutation"> = FunctionReference<K, "public", Auth & object>;
type Send<F> = (
  fn: F,
  args: object,
) => Promise<FunctionReturnType<F & FunctionReference<"query" | "mutation">>>;
/** The client's methods with the token fields filled in by us. */
type Client<F> = { query: Send<F>; mutation: Send<F> };
type Rest<F extends FunctionReference<"query" | "mutation">> = Omit<
  FunctionArgs<F>,
  "token" | "now"
>;

/** The token is missing, expired or revoked: the client must refresh it or reconnect. */
export class Unauthorized extends Error {}

/** A rejected request (not_found, forbidden or invalid), as opposed to an outage. */
export class Refused extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/** A ConvexError from convex/mcp.ts as an Error whose message is safe to show the model. */
export function toolError(error: unknown): Error {
  if (error instanceof Unauthorized || error instanceof Refused) return error;
  const data = (error as { data?: unknown } | null)?.data;
  if (data !== undefined && (error as Error).name === "ConvexError") {
    if (typeof data === "string") return new Refused(data, "invalid");
    const d = data as { code?: string; message?: string; errors?: string[] };
    if (d.code === "unauthorized") return new Unauthorized(d.message ?? "Reconnect Capy.");
    const code = d.code ?? "invalid";
    if (d.errors?.length && d.errors.length > 1)
      return new Refused(`${d.errors.length} problems:\n- ${d.errors.join("\n- ")}`, code);
    return new Refused(d.message ?? "Capy couldn’t complete that request.", code);
  }
  console.error("[mcp] convex call failed", error);
  return new Error("Capy couldn’t complete that request. Try again in a moment.");
}

function refuse(error: unknown, onUnauthorized?: () => void) {
  const e = toolError(error);
  if (e instanceof Unauthorized) onUnauthorized?.();
  return e;
}

/** `onUnauthorized` runs when Convex says the token is no longer valid, e.g. after a revoke. */
export function capyConvex(token: string, onUnauthorized?: () => void) {
  const client = new ConvexHttpClient(ENV.VITE_CONVEX_URL);
  const auth = () => ({ token, now: Date.now() });
  return {
    async query<F extends Call<"query">>(fn: F, args: Rest<F>): Promise<FunctionReturnType<F>> {
      try {
        return await (client as unknown as Client<F>).query(fn, { ...args, ...auth() });
      } catch (error) {
        throw refuse(error, onUnauthorized);
      }
    },
    async mutation<F extends Call<"mutation">>(
      fn: F,
      args: Rest<F>,
    ): Promise<FunctionReturnType<F>> {
      try {
        return await (client as unknown as Client<F>).mutation(fn, { ...args, ...auth() });
      } catch (error) {
        throw refuse(error, onUnauthorized);
      }
    },
    /** Download codes are their own credential, so this takes no token. */
    client,
  };
}
export type CapyConvex = ReturnType<typeof capyConvex>;
