import { Link } from "@tanstack/react-router";

export default function Header() {
  return (
    <header className="eq-topbar eq-auth-header">
      <Link className="eq-brand" to="/">
        Capy
      </Link>
      <a href="mailto:hello@capyinc.com">Contact us</a>
    </header>
  );
}
