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
});
