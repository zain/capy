import { createFileRoute } from "@tanstack/react-router";
import { AccountHome } from "@/components/equity/app";

export const Route = createFileRoute("/_auth/dashboard")({
  component: AccountHome,
});
