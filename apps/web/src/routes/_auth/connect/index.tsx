import { createFileRoute } from "@tanstack/react-router";
import { ConnectPage } from "@/components/equity/connections";
export const Route = createFileRoute("/_auth/connect/")({ component: ConnectPage });
