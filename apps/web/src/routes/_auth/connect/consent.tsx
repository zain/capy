import { createFileRoute } from "@tanstack/react-router";
import { ConsentPage } from "@/components/equity/connections";
export const Route = createFileRoute("/_auth/connect/consent")({
  head: () => ({ meta: [{ title: "Approve AI app access – Capy" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    consent_code: typeof search.consent_code === "string" ? search.consent_code : "",
  }),
  component: () => <ConsentPage consentCode={Route.useSearch().consent_code} />,
});
