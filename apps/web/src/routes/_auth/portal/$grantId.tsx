import { createFileRoute } from "@tanstack/react-router";
import { PortalHome } from "@/components/equity/portal";
export const Route = createFileRoute("/_auth/portal/$grantId")({
  component: () => {
    const { grantId } = Route.useParams();
    return <PortalHome grantId={grantId} />;
  },
});
