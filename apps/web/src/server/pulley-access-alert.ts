import z from "zod";

export const pulleyAccessInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  company: z.string().trim().min(1).max(160),
  method: z.enum(["password", "invite"]),
  pulleyEmail: z.email().max(254).optional(),
  encryptedPassword: z.string().max(1024).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type PulleyAccessRequest = z.infer<typeof pulleyAccessInput>;

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ");

/** The operator alert. It never contains the password, which stays encrypted. */
export function alertEmail(request: PulleyAccessRequest, to: string) {
  const access =
    request.method === "password"
      ? [
          `Access: shared their Pulley sign-in (${request.pulleyEmail}).`,
          "The password is encrypted. Read it locally with:",
          "  bun scripts/pulley-access.ts",
        ]
      : ["Access: they will invite hello@capyinc.com to Pulley as an admin."];
  return {
    from: { name: "Capy", email: "alerts@capyinc.com" },
    to,
    replyTo: { name: oneLine(request.name), email: request.email },
    subject: oneLine(`Pulley import request from ${request.company}`),
    text: [
      `${request.name} <${request.email}> asked for a full Pulley import for ${request.company}.`,
      "",
      ...access,
      ...(request.notes ? ["", "Notes:", request.notes] : []),
      "",
      "Reply to this email to reach them.",
    ].join("\n"),
  };
}
