import { Global, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import mongoose from "mongoose";
const { Schema } = mongoose;
import { randomUUID } from "node:crypto";
import type { Stored } from "../../../shared/types.js";

// String IDs preserve existing Convex IDs during import and keep HTTP contracts simple.
export function schema(fields: Record<string, unknown>) {
  return new Schema(
    {
      _id: { type: String, default: randomUUID },
      _creationTime: { type: Number, default: Date.now },
      ...fields,
    },
    { versionKey: false, strict: "throw" },
  );
}
const event = new Schema(
  {
    title: String,
    startDate: String,
    endDate: String,
    startTime: String,
    endTime: String,
    place: String,
    priceText: String,
    url: String,
    reason: String,
    ticketOnSaleDate: String,
    fit: String,
  },
  { _id: false },
);
const definitions = {
  users: schema({
    name: String,
    email: String,
    image: String,
    timeZone: String,
    homeArea: String,
    interests: [String],
    defaultCalendarId: String,
    radarSyncMode: String,
    inboundAlias: String,
  })
    .index({ email: 1 }, { unique: true, sparse: true })
    .index({ inboundAlias: 1 }, { unique: true, sparse: true }),
  identities: schema({
    userId: String,
    provider: String,
    subject: String,
  }).index({ provider: 1, subject: 1 }, { unique: true }),
  circles: schema({
    ownerId: String,
    name: String,
    color: String,
    linkedCalendarId: String,
    archived: Boolean,
  }).index({ ownerId: 1 }),
  members: schema({
    circleId: String,
    label: String,
    email: String,
    access: {
      type: String,
      enum: ["owner", "coPlanner", "contributor", "viewer"],
    },
    userId: String,
    invitedAt: Number,
  })
    .index(
      { circleId: 1, email: 1 },
      { unique: true, partialFilterExpression: { email: { $type: "string" } } },
    )
    .index({ userId: 1 })
    .index({ email: 1 }),
  plans: schema({
    ownerId: String,
    circleId: String,
    title: String,
    status: { type: String, enum: ["radar", "committed"] },
    startDate: String,
    endDate: String,
    startTime: String,
    endTime: String,
    timeZone: String,
    place: String,
    url: String,
    note: String,
    calendarGeneration: String,
    committedBy: String,
    priceText: String,
    ticketOnSaleDate: String,
    source: String,
    googleEvent: {
      type: new Schema(
        { userId: String, calendarId: String, eventId: String },
        { _id: false },
      ),
    },
    calendarStatus: String,
    calendarError: String,
  })
    .index({ ownerId: 1, startDate: 1 })
    .index({ circleId: 1, startDate: 1 })
    .index({ status: 1 }),
  calendarAccounts: schema({
    userId: String,
    provider: String,
    email: String,
    refreshToken: String,
    calendars: [
      new Schema(
        {
          id: String,
          name: String,
          color: String,
          primary: Boolean,
          writable: Boolean,
        },
        { _id: false },
      ),
    ],
    status: String,
    lastSyncedAt: Number,
  }).index({ userId: 1 }, { unique: true }),
  oauthStates: schema({
    userId: String,
    state: String,
    sessionId: String,
    expiresAt: Date,
  })
    .index({ state: 1 }, { unique: true })
    .index({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  chats: schema({ userId: String, title: String }).index({
    userId: 1,
    _creationTime: -1,
  }),
  messages: schema({
    chatId: String,
    role: String,
    text: String,
    events: [event],
    pending: Boolean,
  }).index({ chatId: 1, _creationTime: 1 }),
  standingSearches: schema({
    userId: String,
    query: String,
    circleId: String,
    enabled: Boolean,
    lastRunAt: Number,
  })
    .index({ userId: 1 })
    .index({ enabled: 1, lastRunAt: 1 }),
  suggestions: schema({
    userId: String,
    searchId: String,
    event,
    fit: String,
    dedupeKey: String,
    state: String,
  })
    .index({ userId: 1, state: 1 })
    .index({ userId: 1, dedupeKey: 1 }, { unique: true }),
  captures: schema({
    userId: String,
    source: String,
    subject: String,
    draft: event,
    status: String,
    error: String,
  }).index({ userId: 1, status: 1 }),
  jobs: schema({
    kind: String,
    payload: Schema.Types.Mixed,
    state: String,
    attempts: Number,
    runAt: Date,
    leaseUntil: Date,
    leaseOwner: String,
    error: String,
    dedupeKey: String,
  })
    .index({ state: 1, runAt: 1 })
    .index(
      { dedupeKey: 1 },
      {
        unique: true,
        partialFilterExpression: { dedupeKey: { $type: "string" } },
      },
    ),
};
const required: Record<string, string[]> = {
  users: ["email"],
  identities: ["userId", "provider", "subject"],
  circles: ["ownerId", "name", "color"],
  members: ["circleId", "label", "access"],
  plans: ["ownerId", "title", "status", "startDate", "endDate", "timeZone"],
  calendarAccounts: ["userId", "provider", "refreshToken", "status"],
  oauthStates: ["userId", "state", "sessionId", "expiresAt"],
  chats: ["userId", "title"],
  messages: ["chatId", "role"],
  standingSearches: ["userId", "query", "enabled"],
  suggestions: ["userId", "event", "dedupeKey", "state"],
  captures: ["userId", "source", "status"],
  jobs: ["kind", "state", "runAt"],
};
for (const [name, fields] of Object.entries(required))
  for (const field of fields)
    definitions[name as keyof typeof definitions].path(field).required(true);
export const modelDefinitions = Object.entries(definitions).map(
  ([name, schema]) => ({ name, schema, collection: name }),
);
@Global()
@Module({
  imports: [MongooseModule.forFeature(modelDefinitions)],
  exports: [MongooseModule],
})
export class ModelsModule {}
export interface OAuthState extends Stored {
  userId: string;
  state: string;
  sessionId: string;
  expiresAt: Date;
}
export interface Identity extends Stored {
  userId: string;
  provider: string;
  subject: string;
}
