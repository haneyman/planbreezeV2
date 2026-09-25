import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Shared validators ---------------------------------------------------------

export const access = v.union(
  v.literal("owner"),
  v.literal("coPlanner"),
  v.literal("contributor"),
  v.literal("viewer"),
);

export const planStatus = v.union(v.literal("radar"), v.literal("committed"));

/** An event candidate found by Breeze or extracted from a page/email. */
export const eventCandidate = v.object({
  title: v.string(),
  startDate: v.string(), // YYYY-MM-DD (local date)
  endDate: v.string(), // YYYY-MM-DD, inclusive
  startTime: v.optional(v.string()), // HH:MM, local
  endTime: v.optional(v.string()),
  place: v.optional(v.string()),
  priceText: v.optional(v.string()),
  url: v.optional(v.string()),
  reason: v.optional(v.string()),
  ticketOnSaleDate: v.optional(v.string()),
});

export default defineSchema({
  ...authTables,

  // Convex Auth's users table, extended with PlanBreeze profile fields.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // PlanBreeze
    timeZone: v.optional(v.string()),
    homeArea: v.optional(v.string()), // "Oakland, CA" — used for "near me" searches
    interests: v.optional(v.array(v.string())),
    defaultCalendarId: v.optional(v.string()), // Google calendar for "just me" plans
    radarSyncMode: v.optional(v.union(v.literal("appOnly"), v.literal("warnOnly"))),
    inboundAlias: v.optional(v.string()), // <alias>@in.planbreeze.com
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_inbound_alias", ["inboundAlias"]),

  circles: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    color: v.string(),
    linkedCalendarId: v.optional(v.string()), // a calendar in the owner's Google account
    archived: v.optional(v.boolean()),
  }).index("by_owner", ["ownerId"]),

  // One row per person in a circle (the owner has a row too).
  members: defineTable({
    circleId: v.id("circles"),
    label: v.string(), // display name within this circle
    email: v.optional(v.string()), // lowercased; absent for kid profiles
    access,
    userId: v.optional(v.id("users")), // linked once they sign in with that email
    invitedAt: v.optional(v.number()),
  })
    .index("by_circle", ["circleId"])
    .index("by_user", ["userId"])
    .index("by_email", ["email"]),

  plans: defineTable({
    ownerId: v.id("users"),
    circleId: v.optional(v.id("circles")), // absent = "just me"
    title: v.string(),
    status: planStatus,
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(), // YYYY-MM-DD inclusive
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    timeZone: v.string(),
    place: v.optional(v.string()),
    url: v.optional(v.string()),
    note: v.optional(v.string()),
    priceText: v.optional(v.string()),
    ticketOnSaleDate: v.optional(v.string()),
    source: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("capture"),
        v.literal("email"),
        v.literal("breeze"),
        v.literal("discover"),
      ),
    ),
    // Set when a committed plan has been written to Google Calendar.
    googleEvent: v.optional(
      v.object({ userId: v.id("users"), calendarId: v.string(), eventId: v.string() }),
    ),
    calendarStatus: v.optional(
      v.union(v.literal("pending"), v.literal("synced"), v.literal("notConnected"), v.literal("error")),
    ),
    calendarError: v.optional(v.string()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_circle", ["circleId"])
    .index("by_status", ["status"]),

  // Google Calendar connection (one per user). Tokens are AES-GCM encrypted.
  calendarAccounts: defineTable({
    userId: v.id("users"),
    provider: v.literal("google"),
    email: v.optional(v.string()),
    refreshToken: v.string(), // encrypted
    calendars: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        color: v.optional(v.string()),
        primary: v.optional(v.boolean()),
        writable: v.boolean(),
      }),
    ),
    status: v.union(v.literal("ok"), v.literal("needsReauth")),
    lastSyncedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  oauthStates: defineTable({ userId: v.id("users"), state: v.string() }).index("by_state", ["state"]),

  chats: defineTable({ userId: v.id("users"), title: v.string() }).index("by_user", ["userId"]),

  messages: defineTable({
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    events: v.optional(v.array(v.object({ ...eventCandidate.fields, fit: v.optional(v.string()) }))),
    pending: v.optional(v.boolean()),
  }).index("by_chat", ["chatId"]),

  standingSearches: defineTable({
    userId: v.id("users"),
    query: v.string(),
    circleId: v.optional(v.id("circles")),
    enabled: v.boolean(),
    lastRunAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  suggestions: defineTable({
    userId: v.id("users"),
    searchId: v.optional(v.id("standingSearches")),
    event: eventCandidate,
    fit: v.optional(v.string()),
    dedupeKey: v.string(),
    state: v.union(v.literal("new"), v.literal("added"), v.literal("dismissed")),
  })
    .index("by_user_state", ["userId", "state"])
    .index("by_user_key", ["userId", "dedupeKey"]),

  // Captured items awaiting review (forwarded emails, pasted links).
  captures: defineTable({
    userId: v.id("users"),
    source: v.union(v.literal("email"), v.literal("paste")),
    subject: v.optional(v.string()),
    draft: v.optional(eventCandidate),
    status: v.union(v.literal("processing"), v.literal("draft"), v.literal("saved"), v.literal("dismissed"), v.literal("failed")),
    error: v.optional(v.string()),
  }).index("by_user_status", ["userId", "status"]),
});
