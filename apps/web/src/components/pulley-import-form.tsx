import { useState, type FormEvent } from "react";
import { Button } from "@capy/ui/components/button";
import { Input } from "@capy/ui/components/input";
import { Label } from "@capy/ui/components/label";
import { Textarea } from "@capy/ui/components/textarea";
import { trackFunnel } from "@/lib/funnel";
import { encryptForCapy } from "@/lib/pulley-access-key";
import { requestPulleyImport } from "@/server/pulley-access";

type Method = "password" | "invite";

export function PulleyImportForm() {
  const [method, setMethod] = useState<Method>("password");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const password = method === "password" ? String(form.get("pulleyPassword") ?? "") : "";
    setSending(true);
    setError("");
    try {
      await requestPulleyImport({
        data: {
          name: field("name"),
          email: field("email"),
          company: field("company"),
          method,
          pulleyEmail: method === "password" ? field("pulleyEmail") : undefined,
          encryptedPassword: password ? await encryptForCapy(password) : undefined,
          notes: field("notes") || undefined,
        },
      });
      trackFunnel("pulley_import_requested");
      setSentTo(field("email"));
    } catch {
      setError("We couldn’t send your request. Please try again or email hello@capyinc.com.");
    } finally {
      setSending(false);
    }
  }

  if (sentTo)
    return (
      <div className="eq-panel eq-auth-card">
        <h1>Request received</h1>
        <p className="eq-auth-description">
          Thanks. We’ll email you at {sentTo} to schedule your import and let you know when it’s
          done.
          {method === "password" &&
            " Once we’re finished, we delete your password. You can then turn two-factor authentication back on and change your Pulley password."}
        </p>
      </div>
    );

  return (
    <div className="eq-panel eq-auth-card">
      <h1>Bring the rest of your Pulley records</h1>
      <p className="eq-auth-description">
        Pulley’s Excel export leaves out documents, approvals, valuations and other records. Give us
        access and we’ll copy them into Capy for you.
      </p>
      <form onSubmit={submit} className="eq-auth-form">
        <div className="eq-auth-field">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required maxLength={120} />
        </div>
        <div className="eq-auth-field">
          <Label htmlFor="email">Your email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="eq-auth-field">
          <Label htmlFor="company">Company</Label>
          <Input id="company" name="company" autoComplete="organization" required maxLength={160} />
        </div>
        <fieldset className="eq-choice-group">
          <legend>How should we get in?</legend>
          <label className="eq-choice">
            <input
              type="radio"
              name="method"
              checked={method === "password"}
              onChange={() => setMethod("password")}
            />
            <span>Share my Pulley sign-in</span>
          </label>
          <label className="eq-choice">
            <input
              type="radio"
              name="method"
              checked={method === "invite"}
              onChange={() => setMethod("invite")}
            />
            <span>
              I’ll invite Capy to Pulley instead
              <small>Add hello@capyinc.com as an admin in Pulley’s team settings.</small>
            </span>
          </label>
        </fieldset>
        {method === "password" && (
          <>
            <p className="eq-callout">
              <strong>Turn off two-factor authentication in Pulley first.</strong> We can’t sign in
              if Pulley asks for a code. Turn it back on once we tell you the import is done.
            </p>
            <div className="eq-auth-field">
              <Label htmlFor="pulleyEmail">Pulley email</Label>
              <Input id="pulleyEmail" name="pulleyEmail" type="email" autoComplete="off" required />
            </div>
            <div className="eq-auth-field">
              <Label htmlFor="pulleyPassword">Pulley password</Label>
              <Input
                id="pulleyPassword"
                name="pulleyPassword"
                type="password"
                autoComplete="off"
                required
                maxLength={200}
              />
              <p className="eq-auth-note">
                Your password is encrypted in your browser before it leaves this page, and only the
                Capy team can decrypt it. We delete it when your import is done, or after 30 days at
                most.
              </p>
            </div>
            <label className="eq-consent">
              <input type="checkbox" name="twoFactorOff" required />
              <span>I’ve turned off two-factor authentication in Pulley.</span>
            </label>
          </>
        )}
        <div className="eq-auth-field">
          <Label htmlFor="notes">Anything we should know? (optional)</Label>
          <Textarea
            id="notes"
            name="notes"
            maxLength={2000}
            placeholder="For example, which records matter most to you."
          />
        </div>
        <label className="eq-consent">
          <input type="checkbox" name="consent" required />
          <span>
            I’m authorized to give Capy access to this Pulley account to copy our company’s records.
          </span>
        </label>
        {error && <p className="eq-auth-error">{error}</p>}
        <Button type="submit" className="eq-button eq-primary eq-auth-submit" disabled={sending}>
          {sending ? "Sending…" : "Request import"}
        </Button>
      </form>
    </div>
  );
}
