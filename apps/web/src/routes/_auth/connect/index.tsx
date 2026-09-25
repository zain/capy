import { createFileRoute } from "@tanstack/react-router";
import { ConnectPage } from "@/components/equity/connections";
export const Route = createFileRoute("/_auth/connect/")({
  head: () => ({ meta: [{ title: "Connect an AI app – Capy" }] }),
  component: ConnectPage,
});
