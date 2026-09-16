import type { ReactNode, MouseEvent } from "react";
import { PublicAnalytics } from "./analytics";

export function PublicPage({
  children,
  variant = "legal",
  analytics,
}: {
  children: ReactNode;
  variant?: "landing" | "legal" | "success" | "not-found";
  analytics?: boolean | string;
}) {
  const trackReservation = (event: MouseEvent<HTMLElement>) => {
    const target = event.target;
    const anchor = target instanceof Element ? target.closest("a") : null;
    const href = anchor?.getAttribute("href");
    if (["/signup", "/preview", "/login"].includes(href || "")) {
      try {
        window.posthog?.capture(
          href === "/signup"
            ? "signup_clicked"
            : href === "/preview"
              ? "preview_clicked"
              : "login_clicked",
        );
      } catch {
        /* Analytics is optional. */
      }
    }
    if (href !== "/reserve" || !anchor) return;
    try {
      window.posthog?.capture("reserve_click");
      const id = window.posthog?.get_distinct_id();
      if (id) anchor.setAttribute("href", `/reserve?d=${encodeURIComponent(id)}`);
    } catch {
      /* Analytics must never block checkout. */
    }
  };
  return (
    <main className={`public-page ${variant}`} onClick={trackReservation}>
      {analytics && (
        <PublicAnalytics event={typeof analytics === "string" ? analytics : undefined} />
      )}
      {children}
    </main>
  );
}
export function NotFoundPage() {
  return (
    <PublicPage variant="not-found">
      <p>
        Not found. <a href="/">Back to Capy</a>
      </p>
    </PublicPage>
  );
}
