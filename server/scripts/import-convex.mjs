// Usage: npm run import:convex -- /path/to/extracted-snapshot [--apply]
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import mongoose from "mongoose";
import {
  checkDates,
  checkEventExtras,
  checkZone,
} from "../dist/server/src/common/validation.js";
import { modelDefinitions } from "../dist/server/src/common/models.js";
const root = process.argv[2];
if (!root || root.startsWith("--"))
  throw new Error(
    "Provide an extracted Convex snapshot directory. Default is dry run; --apply imports into an EMPTY database.",
  );
const apply = process.argv.includes("--apply");
const names = [
  "users",
  "circles",
  "members",
  "plans",
  "calendarAccounts",
  "chats",
  "messages",
  "standingSearches",
  "suggestions",
  "captures",
];
async function readTable(name) {
  try {
    return (await readFile(resolve(root, name, "documents.jsonl"), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}
const data = Object.fromEntries(
  await Promise.all(names.map(async (name) => [name, await readTable(name)])),
);
if (!data.users.length)
  throw new Error(
    "Snapshot contains no users; check the extracted snapshot directory.",
  );
const accounts = await readTable("authAccounts");
const ids = new Map(
  names.map((name) => [name, new Set(data[name].map((r) => r._id))]),
);
// Removing a standing search intentionally leaves its past suggestions behind.
for (const row of data.suggestions)
  if (row.searchId && !ids.get("standingSearches").has(row.searchId))
    delete row.searchId;
const references = {
  circles: { ownerId: "users" },
  members: { circleId: "circles", userId: "users" },
  plans: { ownerId: "users", circleId: "circles" },
  calendarAccounts: { userId: "users" },
  chats: { userId: "users" },
  messages: { chatId: "chats" },
  standingSearches: { userId: "users", circleId: "circles" },
  suggestions: { userId: "users", searchId: "standingSearches" },
  captures: { userId: "users" },
};
for (const [name, refs] of Object.entries(references))
  for (const row of data[name])
    for (const [key, target] of Object.entries(refs)) {
      if (row[key] && !ids.get(target).has(row[key]))
        throw new Error(`Broken reference in ${name}.${key}; import stopped.`);
    }
const definitions = new Map(modelDefinitions.map((d) => [d.name, d]));
// Strip Convex Auth-only profile fields; normalize email matching for verified OAuth sign-ins.
for (const row of data.users) {
  for (const key of Object.keys(row))
    if (!definitions.get("users").schema.path(key)) delete row[key];
  if (row.email) row.email = row.email.trim().toLowerCase();
}
for (const row of data.members)
  if (row.email) row.email = row.email.trim().toLowerCase();
for (const row of data.messages)
  if (row.pending) {
    row.pending = false;
    row.text =
      "This request was interrupted by the server migration. Please ask again.";
  }
for (const row of data.captures)
  if (row.status === "processing") {
    row.status = "failed";
    row.error =
      "Processing was interrupted by migration. Please paste the email to try again.";
  }
data.identities = accounts
  .filter((a) => ["google", "apple"].includes(a.provider))
  .map((a) => ({
    userId: a.userId,
    provider: a.provider,
    subject: a.providerAccountId,
  }));
for (const identity of data.identities)
  if (!identity.subject || !ids.get("users").has(identity.userId))
    throw new Error("Invalid OAuth identity in export.");
for (const row of data.plans) {
  checkDates(row);
  checkEventExtras(row);
  checkZone(row.timeZone);
}
for (const row of data.plans)
  if (row.googleEvent && !ids.get("users").has(row.googleEvent.userId))
    throw new Error("Broken Google event owner reference.");
const models = new Map(
  [...names, "identities"].map((name) => [
    name,
    mongoose.model(name, definitions.get(name).schema, name),
  ]),
);
for (const [name, rows] of Object.entries(data)) {
  const seen = new Set();
  for (const row of rows) {
    if (
      name !== "identities" &&
      (typeof row._id !== "string" ||
        !row._id ||
        !Number.isFinite(row._creationTime))
    )
      throw new Error(`Invalid stored ID or creation time in ${name}.`);
    const error = new (models.get(name))(row).validateSync();
    if (error) throw new Error(`Invalid ${name} document: ${error.message}`);
    const key =
      name === "users"
        ? row.email
        : name === "identities"
          ? `${row.provider}:${row.subject}`
          : name === "members" && row.email
            ? `${row.circleId}:${row.email}`
            : name === "suggestions"
              ? `${row.userId}:${row.dedupeKey}`
              : row._id;
    if (key && seen.has(key))
      throw new Error(`Duplicate key in ${name}; resolve before importing.`);
    if (key) seen.add(key);
  }
  console.log(`${name}: ${rows.length} documents validated`);
}
if (!apply) {
  console.log(
    "Dry run complete. No database connection or writes. Build API first; rerun with --apply to import.",
  );
  process.exit(0);
}
if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
await mongoose.connect(process.env.MONGODB_URI);
try {
  for (const name of [
    ...names,
    "identities",
    "jobs",
    "sessions",
    "oauthStates",
  ])
    if (await mongoose.connection.db.collection(name).estimatedDocumentCount())
      throw new Error(
        `Target ${name} is not empty. Import aborted; use a fresh database.`,
      );
  for (const model of models.values()) await model.init();
  const jobs = mongoose.model("jobs", definitions.get("jobs").schema, "jobs");
  await jobs.init();
  // Import sequentially on standalone MongoDB. A failed import may leave partial data.
  {
    for (const [name, rows] of Object.entries(data))
      if (rows.length) await models.get(name).insertMany(rows);
    const pending = data.plans.filter(
      (p) => p.status === "committed" && p.calendarStatus === "pending",
    );
    if (pending.length)
      await jobs.insertMany(
        pending.map((p) => ({
          kind: "calendar.write",
          payload: {
            planId: p._id,
            committedBy: p.googleEvent?.userId ?? p.ownerId,
          },
          state: "pending",
          attempts: 0,
          runAt: new Date(),
        })),
      );
  }
  for (const [name, rows] of Object.entries(data))
    if ((await models.get(name).countDocuments()) !== rows.length)
      throw new Error(`Count verification failed for ${name}.`);
  console.log(
    "Import and count checks complete. Preserve TOKEN_ENCRYPTION_KEY. All users must sign in again.",
  );
} finally {
  await mongoose.disconnect();
}
