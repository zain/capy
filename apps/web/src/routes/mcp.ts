import { createFileRoute } from "@tanstack/react-router";

// Loaded on first use so the MCP SDK and widget HTML stay out of the router chunk.
const serve = async ({ request }: { request: Request }) => {
  const { handleMcp } = await import("@/server/mcp/server");
  return handleMcp(request);
};

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: { GET: serve, POST: serve, DELETE: serve },
  },
});
