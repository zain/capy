import { createFileRoute } from "@tanstack/react-router";
import { ConnectedAppsPage } from "@/components/equity/connections";
export const Route = createFileRoute("/_auth/connected-apps")({
  head: () => ({ meta: [{ title: "Connected apps – Capy" }] }),
  component: ConnectedAppsPage,
});
