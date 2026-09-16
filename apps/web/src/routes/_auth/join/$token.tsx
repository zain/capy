import { createFileRoute } from "@tanstack/react-router";
import { AcceptInvitation } from "@/components/equity/portal";
export const Route = createFileRoute("/_auth/join/$token")({
  component: () => {
    const { token } = Route.useParams();
    return <AcceptInvitation token={token} />;
  },
});
