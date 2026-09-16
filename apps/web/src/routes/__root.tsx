import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { NotFoundPage } from "@/components/public/page";
import appCss from "../index.css?url";

export interface RouterAppContext {
  queryClient: QueryClient;
  convexQueryClient: ConvexQueryClient;
}
export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Capy - cap table management for founders" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { rel: "icon", href: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { rel: "icon", href: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  component: Outlet,
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
});
function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
