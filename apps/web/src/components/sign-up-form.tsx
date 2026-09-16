import { useEffect, useState } from "react";
import { hasPendingImport } from "@/lib/pending-import";
import { Button } from "@capy/ui/components/button";
import { Input } from "@capy/ui/components/input";
import { Label } from "@capy/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { trackFunnel } from "@/lib/funnel";
import { authClient } from "@/lib/auth-client";

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const [hasPreview, setHasPreview] = useState(false);
  useEffect(() => setHasPreview(hasPendingImport()), []);
  const navigate = useNavigate({
    from: "/",
  });

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: "",
        },
        {
          onSuccess: () => {
            trackFunnel("signup_completed");
            navigate({
              to: "/dashboard",
            });
            toast.success("Your account is ready");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  return (
    <div className="eq-panel eq-auth-card">
      <h1>Create your Capy account</h1>
      <p className="eq-auth-description">
        {hasPreview
          ? "Your preview is ready. Create a free account to save your cap table."
          : "Get started free. Import your cap table now or add your records later."}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="eq-auth-form"
      >
        <div>
          <form.Field name="email">
            {(field) => (
              <div className="eq-auth-field">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => (
              <div className="eq-auth-field">
                <Label htmlFor={field.name}>Password</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <form.Subscribe
          selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button
              type="submit"
              className="eq-button eq-primary eq-auth-submit"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? "Creating your account…" : "Create account"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <p className="eq-auth-reassurance">No credit card required to create an account.</p>
      <div className="eq-auth-switch">
        <Button variant="link" onClick={onSwitchToSignIn} className="eq-text-button">
          Already have an account? Sign In
        </Button>
      </div>
    </div>
  );
}
