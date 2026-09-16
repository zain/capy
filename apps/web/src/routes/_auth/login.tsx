import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/_auth/login")({
  component: () => <Navigate to="/dashboard" replace />,
});
