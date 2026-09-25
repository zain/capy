// Changes drafted by connected AI apps. Drafting happens over MCP; only an admin applies or
// rejects a change, here, from the Capy UI.
import { ConvexError, v } from "convex/values";
import { prepareChange } from "@capy/equity/changes";
import type { ChangeApply, ChangeInput, ChangeTarget } from "@capy/equity/changes";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { authComponent } from "./auth";
import { accessForUser } from "./billing";
import {
  canonical,
  loadCompany,
  member,
  memberAs,
  saveSecurityAs,
  saveStakeholderAs,
  securityEventAs,
  type AuthUser,
  type ChangeMeta,
} from "./equity";
import { saveRecordAs } from "./records";

export const changeLifetime = 7 * 24 * 60 * 60 * 1000;
/** What a change stores to apply later: the validated input and the row revision it was drafted against. */
export type ChangePayload = { input: ChangeInput; target?: ChangeTarget & { revision: number } };
const statuses = v.union(
  v.literal("pending"),
  v.literal("applied"),
  v.literal("rejected"),
  v.literal("expired"),
  v.literal("failed"),
);
const day = (now: number) => new Date(now).toISOString().slice(0, 10);
export const changePath = (companyId: Id<"companies">, changeId: Id<"changes">) =>
  `/companies/${companyId}/changes/${changeId}`;

async function securityRow(ctx: QueryCtx | MutationCtx, importId: Id<"imports">, key: string) {
  return await ctx.db
    .query("securities")
    .withIndex("by_import_key", (q) => q.eq("importId", importId).eq("key", key))
    .unique();
}
async function stakeholderRow(ctx: QueryCtx | MutationCtx, importId: Id<"imports">, key: string) {
  return await ctx.db
    .query("stakeholders")
    .withIndex("by_import_key", (q) => q.eq("importId", importId).eq("key", key))
    .unique();
}
async function targetRevision(
  ctx: QueryCtx | MutationCtx,
  importId: Id<"imports">,
  target: ChangeTarget,
) {
  const row =
    target.type === "security"
      ? await securityRow(ctx, importId, target.key)
      : await stakeholderRow(ctx, importId, target.key);
  return row?.revision ?? null;
}
async function names(ctx: QueryCtx | MutationCtx, ids: (string | undefined)[]) {
  const result = new Map<string, string>();
  for (const id of new Set(ids.filter((id): id is string => Boolean(id)))) {
    const u = await authComponent.getAnyUserById(ctx, id);
    result.set(id, u ? u.name || u.email : "A former member");
  }
  return result;
}

/** Validates and stores a drafted change for an admin to review. Throws `invalid` with every problem. */
export async function createChangeAs(
  ctx: MutationCtx,
  u: AuthUser,
  args: {
    companyId: Id<"companies">;
    input: unknown;
    rationale: string;
    clientId?: string;
    clientName?: string;
    now?: number;
  },
) {
  await memberAs(ctx, u, args.companyId, true, false);
  const now = args.now ?? Date.now();
  const { company, imp, data } = await loadCompany(ctx, args.companyId);
  const prepared = prepareChange(data, args.input, { today: day(now) });
  const rationale = args.rationale.trim();
  const errors = prepared.ok ? [] : [...prepared.errors];
  if (!rationale) errors.push("rationale: Explain why this change is needed.");
  if (rationale.length > 5000) errors.push("rationale: Keep the rationale under 5,000 characters.");
  if (!prepared.ok || errors.length)
    throw new ConvexError({ code: "invalid", message: errors.join("\n"), errors });
  const { input, preview, target } = prepared;
  if (!(await accessForUser(ctx, company.ownerId)).canEdit)
    preview.warnings.push(
      "This account is read-only, so the change can’t be applied until billing is renewed.",
    );
  const payload: ChangePayload = { input };
  if (target) {
    const revision = await targetRevision(ctx, imp._id, target);
    if (revision === null) throw new ConvexError({ code: "invalid", message: "Record not found." });
    payload.target = { ...target, revision };
  }
  const changeId = await ctx.db.insert("changes", {
    companyId: args.companyId,
    importId: imp._id,
    userId: u._id,
    ...(args.clientId ? { clientId: args.clientId } : {}),
    ...(args.clientName ? { clientName: args.clientName } : {}),
    kind: input.kind,
    title: preview.title,
    rationale,
    payload,
    preview,
    status: "pending",
    expiresAt: now + changeLifetime,
  });
  return {
    changeId,
    title: preview.title,
    status: "pending" as const,
    preview,
    expiresAt: now + changeLifetime,
    reviewPath: changePath(args.companyId, changeId),
  };
}

/** Recomputes a change against the current cap table and reports whether it went stale. */
async function evaluate(ctx: QueryCtx | MutationCtx, change: Doc<"changes">, now: number) {
  const { imp, data } = await loadCompany(ctx, change.companyId);
  const payload = change.payload as ChangePayload;
  const prepared = prepareChange(data, payload.input, { today: day(now) });
  // A replaced import or an edited target blocks applying; drifted totals only need a fresh look.
  let blocked: string | null = null,
    stale: string | null = null;
  if (imp._id !== change.importId)
    blocked = "The cap table was replaced by a new import after this change was drafted.";
  else if (
    payload.target &&
    (await targetRevision(ctx, imp._id, payload.target)) !== payload.target.revision
  )
    blocked = `This ${payload.target.type} changed after the change was drafted. Ask for a new draft.`;
  else if (
    prepared.ok &&
    canonical(prepared.preview.totalsBefore) !==
      canonical((change.preview as { totalsBefore?: unknown }).totalsBefore)
  )
    stale = "The cap table changed after this change was drafted. Review the updated preview.";
  return { imp, prepared, blocked, stale: blocked ?? stale };
}

/** A change with names resolved and, while pending, a preview recomputed from current data. */
export async function describeChange(
  ctx: QueryCtx | MutationCtx,
  change: Doc<"changes">,
  u: AuthUser,
  now: number,
) {
  const people = await names(ctx, [change.userId, change.reviewedBy]);
  const base = {
    ...change,
    draftedBy: people.get(change.userId) ?? "A former member",
    reviewedByName: change.reviewedBy ? people.get(change.reviewedBy) : undefined,
    link: changePath(change.companyId, change._id),
  };
  if (change.status !== "pending")
    return { ...base, current: null, stale: false, staleReason: null, canApply: false };
  const [evaluation, membership, company] = await Promise.all([
    evaluate(ctx, change, now),
    ctx.db
      .query("memberships")
      .withIndex("by_company_user", (q) => q.eq("companyId", change.companyId).eq("userId", u._id))
      .unique(),
    ctx.db.get(change.companyId),
  ]);
  const { prepared, blocked, stale } = evaluation;
  const canEdit = company ? (await accessForUser(ctx, company.ownerId)).canEdit : false;
  return {
    ...base,
    current: prepared.ok
      ? { ok: true as const, preview: prepared.preview }
      : { ok: false as const, errors: prepared.errors },
    stale: Boolean(stale),
    staleReason: stale,
    canApply:
      membership?.role === "admin" && canEdit && prepared.ok && !blocked && change.expiresAt > now,
  };
}

/** Recent changes for a company, newest first. */
export async function listChanges(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
  status?: Doc<"changes">["status"],
  limit = 100,
) {
  const recent = await (
    status
      ? ctx.db
          .query("changes")
          .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", status))
      : ctx.db.query("changes").withIndex("by_company", (q) => q.eq("companyId", companyId))
  )
    .order("desc")
    .take(limit);
  const people = await names(
    ctx,
    recent.map((c) => c.userId),
  );
  return recent.map(({ payload: _payload, ...c }) => ({
    ...c,
    draftedBy: people.get(c.userId) ?? "A former member",
    link: changePath(c.companyId, c._id),
  }));
}

export const list = query({
  args: { companyId: v.id("companies"), status: v.optional(statuses) },
  handler: async (ctx, { companyId, status }) => {
    await member(ctx, companyId);
    return await listChanges(ctx, companyId, status);
  },
});

export const get = query({
  args: { changeId: v.id("changes") },
  handler: async (ctx, { changeId }) => {
    const change = await ctx.db.get(changeId);
    if (!change) throw new ConvexError("Change not found.");
    const u = await member(ctx, change.companyId);
    return await describeChange(ctx, change, u, Date.now());
  },
});

async function run(
  ctx: MutationCtx,
  u: AuthUser,
  change: Doc<"changes">,
  importId: Id<"imports">,
  apply: ChangeApply,
  meta: ChangeMeta,
) {
  const companyId = change.companyId,
    base = `/companies/${companyId}`;
  switch (apply.action) {
    case "saveSecurity": {
      const key = await saveSecurityAs(
        ctx,
        u,
        { companyId, data: apply.data, reason: apply.reason },
        meta,
      );
      return { securityKey: key, link: `${base}/securities/${encodeURIComponent(key)}` };
    }
    case "securityEvent": {
      const row = await securityRow(ctx, importId, apply.securityKey);
      if (!row) throw new ConvexError("Security not found.");
      const created = await securityEventAs(
        ctx,
        u,
        {
          companyId,
          id: row._id,
          revision: row.revision,
          event: apply.event,
          quantity: apply.quantity,
          date: apply.date,
          reason: apply.reason,
          ...(apply.certificate ? { certificate: apply.certificate } : {}),
        },
        meta,
      );
      return {
        securityKey: apply.securityKey,
        createdSecurityKey: created,
        link: `${base}/securities/${encodeURIComponent(created ?? apply.securityKey)}`,
      };
    }
    case "saveStakeholder": {
      const row = apply.stakeholderKey
        ? await stakeholderRow(ctx, importId, apply.stakeholderKey)
        : null;
      if (apply.stakeholderKey && !row) throw new ConvexError("Stakeholder not found.");
      const key = await saveStakeholderAs(
        ctx,
        u,
        {
          companyId,
          ...(row ? { id: row._id, revision: row.revision } : {}),
          data: apply.data,
        },
        meta,
      );
      return { stakeholderKey: key, link: `${base}/stakeholders/${encodeURIComponent(key)}` };
    }
    case "saveRecord": {
      const recordId = await saveRecordAs(
        ctx,
        u,
        { companyId, kind: apply.kind, title: apply.title, status: apply.status, data: apply.data },
        meta,
      );
      return {
        recordId,
        link: `${base}/${apply.kind === "approval" ? "board_approvals" : "fundraising"}`,
      };
    }
  }
}

const finished: Record<string, string> = {
  applied: "This change was already applied.",
  rejected: "This change was rejected.",
  expired: "This change expired. Ask for a new draft.",
  failed: "This change failed. Ask for a new draft.",
};

/** Applies a pending change as the approving admin. Stale or invalid changes are marked failed. */
export const apply = mutation({
  args: { changeId: v.id("changes") },
  handler: async (ctx, { changeId }) => {
    const change = await ctx.db.get(changeId);
    if (!change) throw new ConvexError("Change not found.");
    const u = await member(ctx, change.companyId, true);
    if (change.status !== "pending") throw new ConvexError(finished[change.status]!);
    const now = Date.now(),
      review = { reviewedBy: u._id, reviewedAt: now };
    if (change.expiresAt <= now) {
      await ctx.db.patch(changeId, { status: "expired" });
      return { status: "expired" as const, error: finished.expired! };
    }
    const { imp, prepared, blocked } = await evaluate(ctx, change, now);
    const error = blocked ?? (prepared.ok ? null : prepared.errors.join("\n"));
    if (error || !prepared.ok) {
      await ctx.db.patch(changeId, { status: "failed", error: error ?? "", ...review });
      return { status: "failed" as const, error: error ?? "" };
    }
    const meta: ChangeMeta = {
      via: "mcp",
      changeId,
      ...(change.clientName ? { clientName: change.clientName } : {}),
    };
    const result = await run(ctx, u, change, imp._id, prepared.apply, meta);
    // Keep the preview of what was written, which can differ from the draft (e.g. a new certificate).
    await ctx.db.patch(changeId, {
      status: "applied",
      result,
      preview: prepared.preview,
      ...review,
    });
    return { status: "applied" as const, result };
  },
});

export const reject = mutation({
  args: { changeId: v.id("changes"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const change = await ctx.db.get(args.changeId);
    if (!change) throw new ConvexError("Change not found.");
    const u = await member(ctx, change.companyId, true, false);
    if (change.status !== "pending") throw new ConvexError(finished[change.status]!);
    const reason = args.reason?.trim().slice(0, 2000);
    await ctx.db.patch(change._id, {
      status: "rejected",
      reviewedBy: u._id,
      reviewedAt: Date.now(),
      ...(reason ? { result: { reason } } : {}),
    });
    await ctx.db.insert("activity", {
      companyId: change.companyId,
      actor: u.name || u.email,
      description: `Rejected a drafted change: ${change.title}`,
      details: {
        via: "mcp",
        changeId: change._id,
        ...(change.clientName ? { clientName: change.clientName } : {}),
        ...(reason ? { reason } : {}),
      },
    });
  },
});
