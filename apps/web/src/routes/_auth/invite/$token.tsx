import { createFileRoute } from "@tanstack/react-router";
import { AcceptAdminInvitation } from "@/components/equity/team";
export const Route = createFileRoute("/_auth/invite/$token")({
  component: () => {
    const { token } = Route.useParams();
    return <AcceptAdminInvitation token={token} />;
  },
});
