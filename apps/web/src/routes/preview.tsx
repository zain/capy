import { createFileRoute } from "@tanstack/react-router";
import Header from "@/components/header";
import { ImportPreview } from "@/components/equity/import";
import { PublicAnalytics } from "@/components/public/analytics";
import "@/components/equity/equity.css";
export const Route = createFileRoute("/preview")({
  head: () => ({
    meta: [{ title: "Preview your Pulley import | Capy" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <div className="equity-app">
      <PublicAnalytics event="import_preview_started" />
      <Header />
      <ImportPreview />
    </div>
  ),
});
