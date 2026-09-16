import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "@/components/equity/billing";
export const Route = createFileRoute("/_auth/billing")({ component: BillingPage });
