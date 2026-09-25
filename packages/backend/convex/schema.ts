import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  billingCheckouts: defineTable({
    userId: v.string(),
    nonce: v.string(),
    expiresAt: v.number(),
  }).index("by_user", ["userId"]),
  billingSubscriptions: defineTable({
    userId: v.optional(v.string()),
    email: v.string(),
    customerId: v.string(),
    subscriptionId: v.string(),
    status: v.string(),
    paidUntil: v.number(),
    trialEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_email", ["email"])
    .index("by_subscription", ["subscriptionId"]),
  billingEvents: defineTable({ eventId: v.string() }).index("by_event", ["eventId"]),
  pulleyAccessRequests: defineTable({
    name: v.string(),
    email: v.string(),
    company: v.string(),
    method: v.union(v.literal("password"), v.literal("invite")),
    pulleyEmail: v.optional(v.string()),
    // RSA-OAEP ciphertext from the browser. Only the offline private key can read it.
    encryptedPassword: v.optional(v.string()),
    notes: v.optional(v.string()),
  }),

  portalGrants: defineTable({
    companyId: v.id("companies"),
    stakeholderKey: v.string(),
    token: v.string(),
    expiresAt: v.number(),
    userId: v.optional(v.string()),
    revoked: v.boolean(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"])
    .index("by_company", ["companyId"]),
  companies: defineTable({
    name: v.string(),
    ownerId: v.string(),
    activeImport: v.optional(v.id("imports")),
    profile: v.any(),
  }).index("by_owner", ["ownerId"]),
  memberships: defineTable({
    companyId: v.id("companies"),
    userId: v.string(),
    role: v.union(v.literal("admin"), v.literal("viewer")),
  })
    .index("by_user", ["userId"])
    .index("by_company_user", ["companyId", "userId"]),
  imports: defineTable({
    companyId: v.id("companies"),
    filename: v.string(),
    status: v.union(v.literal("staging"), v.literal("complete")),
    metadata: v.any(),
    expectedPeople: v.number(),
    expectedSecurities: v.number(),
    people: v.number(),
    securities: v.number(),
  }).index("by_company", ["companyId"]),
  stakeholders: defineTable({
    companyId: v.id("companies"),
    importId: v.id("imports"),
    key: v.string(),
    data: v.any(),
    revision: v.number(),
  })
    .index("by_import", ["importId"])
    .index("by_import_key", ["importId", "key"]),
  securities: defineTable({
    companyId: v.id("companies"),
    importId: v.id("imports"),
    key: v.string(),
    stakeholderKey: v.string(),
    data: v.any(),
    revision: v.number(),
  })
    .index("by_import", ["importId"])
    .index("by_import_key", ["importId", "key"]),
  activity: defineTable({
    companyId: v.id("companies"),
    actor: v.string(),
    description: v.string(),
    details: v.optional(v.any()),
  }).index("by_company", ["companyId"]),
  records: defineTable({
    companyId: v.id("companies"),
    kind: v.string(),
    title: v.string(),
    status: v.string(),
    data: v.any(),
    revision: v.number(),
  }).index("by_company_kind", ["companyId", "kind"]),
  // What each connected AI app (OAuth client) may see, chosen by the user on /connect/consent.
  mcpGrants: defineTable({
    userId: v.string(),
    clientId: v.string(),
    clientName: v.optional(v.string()),
    companyIds: v.array(v.id("companies")),
    allowDrafts: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_user_client", ["userId", "clientId"])
    .index("by_user", ["userId"]),
  // Changes drafted by a connected AI app. Only an admin applies or rejects them, in Capy.
  changes: defineTable({
    companyId: v.id("companies"),
    importId: v.id("imports"),
    userId: v.string(),
    clientId: v.optional(v.string()),
    clientName: v.optional(v.string()),
    kind: v.union(
      v.literal("option_grant"),
      v.literal("exercise"),
      v.literal("cancellation"),
      v.literal("stakeholder_update"),
      v.literal("board_consent"),
      v.literal("round_scenario"),
    ),
    title: v.string(),
    rationale: v.string(),
    payload: v.any(),
    preview: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("applied"),
      v.literal("rejected"),
      v.literal("expired"),
      v.literal("failed"),
    ),
    expiresAt: v.number(),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  })
    .index("by_company", ["companyId"])
    .index("by_company_status", ["companyId", "status"])
    // For the hourly sweep that expires pending changes.
    .index("by_status_expires", ["status", "expiresAt"]),
  // Short-lived download codes for /mcp/files/<code>. The code is the credential.
  mcpDownloads: defineTable({
    code: v.string(),
    userId: v.string(),
    companyId: v.id("companies"),
    recordId: v.id("records"),
    expiresAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_expires", ["expiresAt"]),
  // Refresh tokens already exchanged, by SHA-256. Makes each one single-use, and a second use
  // revokes the app's tokens for that user. Rows are dropped once the token would have expired.
  mcpRefreshClaims: defineTable({
    hash: v.string(),
    userId: v.string(),
    clientId: v.string(),
    expiresAt: v.number(),
  })
    .index("by_hash", ["hash"])
    .index("by_expires", ["expiresAt"]),
});
