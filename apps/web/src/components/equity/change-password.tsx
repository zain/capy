import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Field, Modal } from "./ui";

export function ChangePassword({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Change password" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (next.length < 8) return setError("Use at least 8 characters.");
          if (next !== confirm) return setError("The new passwords don’t match.");
          setBusy(true);
          const result = await authClient.changePassword({
            currentPassword: current,
            newPassword: next,
            revokeOtherSessions: true,
          });
          setBusy(false);
          if (result.error)
            setError(
              result.error.code === "INVALID_PASSWORD"
                ? "Your current password is incorrect."
                : result.error.message || "Could not change your password. Try again.",
            );
          else {
            toast.success("Password changed. Your other devices were signed out.");
            onClose();
          }
        }}
      >
        <div className="eq-form-grid">
          <Field label="Current password">
            <input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="New password">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>
        {error && <p className="eq-error">{error}</p>}
        <div className="eq-form-actions">
          <button type="submit" className="eq-button eq-primary" disabled={busy}>
            {busy ? "Changing…" : "Change password"}
          </button>
          <button type="button" className="eq-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
