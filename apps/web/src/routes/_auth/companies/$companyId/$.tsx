import { createFileRoute } from "@tanstack/react-router";
import { CompanyApp } from "@/components/equity/app";

export const Route = createFileRoute("/_auth/companies/$companyId/$")({ component: CompanyRoute });
function CompanyRoute() {
  const { companyId, _splat } = Route.useParams();
  return <CompanyApp companyId={companyId} path={_splat || "dashboard"} />;
}
