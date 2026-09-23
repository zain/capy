import { createFileRoute } from "@tanstack/react-router";
import Header from "@/components/header";
import { PublicAnalytics } from "@/components/public/analytics";
import { PulleyImportForm } from "@/components/pulley-import-form";
import "@/components/equity/equity.css";

export const Route = createFileRoute("/pulley-import")({
  head: () => ({
    meta: [{ title: "Full Pulley import | Capy" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <div className="equity-app eq-auth">
      <PublicAnalytics event="pulley_import_viewed" />
      <Header />
      <main className="eq-auth-main">
        <PulleyImportForm />
        <footer className="eq-auth-footer">
          <a href="/privacy">Privacy</a>
          <span aria-hidden="true">·</span>
          <a href="/terms">Terms</a>
        </footer>
      </main>
    </div>
  ),
});
