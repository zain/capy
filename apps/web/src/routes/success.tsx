import { createFileRoute } from "@tanstack/react-router";
import { PublicPage } from "@/components/public/page";

export const Route = createFileRoute("/success")({
  head: () => ({
    meta: [
      { title: "Capy - cap table management for founders" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuccessPage,
});

function SuccessPage() {
  return (
    <PublicPage variant="success" analytics="reserve_success">
      <h1>Capy</h1>
      <p>Welcome to Capy.</p>
      <p>
        Your product account is ready to create. If you previously reserved an account, contact{" "}
        <a href="mailto:hello@capyinc.com">hello@capyinc.com</a> to connect your reservation.
      </p>
      <p>
        <a href="/signup">Create your account →</a>
      </p>
    </PublicPage>
  );
}
