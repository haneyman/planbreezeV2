import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Standing searches feed the Discover page.
crons.daily("discovery", { hourUTC: 13, minuteUTC: 5 }, internal.breeze.runDiscovery, {});

// Notice PlanBreeze events that were deleted or moved in Google Calendar.
crons.interval("google calendar sync", { minutes: 30 }, internal.google.syncCommitted, {});

export default crons;
