import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useState } from "react";
import { PublicAnalytics } from "@/components/public/analytics";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { createServerFn } from "@tanstack/react-start";
import { Toaster } from "@capy/ui/components/sonner";
import { authClient } from "@/lib/auth-client";
import { getToken } from "@/lib/auth-server";
import Header from "@/components/header";
import "@/components/equity/equity.css";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

const getAuth = createServerFn({ method: "GET" }).handler(async () => getToken());
export const Route = createFileRoute("/_auth")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  beforeLoad: async ({ context }) => {
    const token = await getAuth();
    if (token) context.convexQueryClient.serverHttpClient?.setAuth(token);
    return { token };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const context = Route.useRouteContext();
  const location = useLocation();
  const [mode, setMode] = useState<boolean | null>(null);
  const showSignIn = mode ?? location.pathname !== "/signup";

  return (
    <ConvexBetterAuthProvider
      client={context.convexQueryClient.convexClient}
      authClient={authClient}
      initialToken={context.token}
    >
      <Authenticated>
        <Outlet />
      </Authenticated>
      <Unauthenticated>
        <div className="equity-app eq-auth">
          <PublicAnalytics event={showSignIn ? "login_viewed" : "signup_viewed"} />
          <Header />
          <main className="eq-auth-main">
            {showSignIn ? (
              <SignInForm onSwitchToSignUp={() => setMode(false)} />
            ) : (
              <SignUpForm onSwitchToSignIn={() => setMode(true)} />
            )}
            <footer className="eq-auth-footer">
              <a href="/privacy">Privacy</a>
              <span aria-hidden="true">·</span>
              <a href="/terms">Terms</a>
            </footer>
          </main>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="equity-app eq-auth">
          <Header />
          <div className="eq-auth-main" role="status">
            Loading your account…
          </div>
        </div>
      </AuthLoading>
      <Toaster richColors />
    </ConvexBetterAuthProvider>
  );
}
