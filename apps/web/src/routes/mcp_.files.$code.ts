import { createFileRoute } from "@tanstack/react-router";

// Short-lived document downloads handed out by the get_document MCP tool.
const serve = async ({ request, params }: { request: Request; params: { code: string } }) => {
  const { serveDownload } = await import("@/server/mcp/files");
  return serveDownload(request, params.code);
};

export const Route = createFileRoute("/mcp_/files/$code")({
  server: {
    handlers: { GET: serve, HEAD: serve },
  },
});
