import { createFileRoute } from "@tanstack/react-router";
import { CompanyApp, pageTitles } from "@/components/equity/app";

export const Route = createFileRoute("/_auth/companies/$companyId/$")({
  head: ({ params }) => {
    const [section = "dashboard", id] = (params._splat || "dashboard").split("/");
    const page = section === "changes" && id ? "Review drafted change" : pageTitles[section];
    return { meta: [{ title: `${page || "Company"} – Capy` }] };
  },
  component: CompanyRoute,
});
function CompanyRoute() {
  const { companyId, _splat } = Route.useParams();
  return <CompanyApp companyId={companyId} path={_splat || "dashboard"} />;
}
