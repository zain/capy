import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/_auth/signup")({
  component: () => <Navigate to="/dashboard" replace />,
});
