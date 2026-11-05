export type Access = "owner" | "coPlanner" | "contributor" | "viewer";
export interface Stored {
  _id: string;
  _creationTime: number;
}
export interface EventCandidate {
  title: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  place?: string;
  priceText?: string;
  url?: string;
  reason?: string;
  ticketOnSaleDate?: string;
}
export interface User extends Stored {
  name?: string;
  email?: string;
  image?: string;
  timeZone?: string;
  homeArea?: string;
  interests?: string[];
  defaultCalendarId?: string;
  radarSyncMode?: "appOnly" | "warnOnly";
  inboundAlias?: string;
}
export interface CircleRecord extends Stored {
  ownerId: string;
  name: string;
  color: string;
  linkedCalendarId?: string;
  archived?: boolean;
}
export interface Member extends Stored {
  circleId: string;
  label: string;
  email?: string;
  access: Access;
  userId?: string;
  invitedAt?: number;
}
export interface GoogleEventRef {
  userId: string;
  calendarId: string;
  eventId: string;
}
export interface PlanRecord extends Stored, Omit<EventCandidate, "reason"> {
  ownerId: string;
  circleId?: string;
  status: "radar" | "committed";
  timeZone: string;
  note?: string;
  calendarGeneration?: string;
  committedBy?: string;
  source?: "manual" | "capture" | "email" | "breeze" | "discover";
  googleEvent?: GoogleEventRef;
  calendarStatus?: "pending" | "synced" | "notConnected" | "error";
  calendarError?: string;
}
export interface Plan extends PlanRecord {
  circleName: string | null;
  circleColor: string | null;
  canEdit: boolean;
  canCommit: boolean;
  calendarLabel: string;
}
export interface Calendar {
  id: string;
  name: string;
  color?: string;
  primary?: boolean;
  writable: boolean;
}
export interface CalendarAccount extends Stored {
  userId: string;
  provider: "google";
  email?: string;
  refreshToken: string;
  calendars: Calendar[];
  status: "ok" | "needsReauth";
  lastSyncedAt?: number;
}
export interface Circle {
  _id: string;
  name: string;
  color: string;
  linkedCalendarId: string | null;
  isOwner: boolean;
  myAccess: Access;
  members: {
    _id: string;
    label: string;
    email: string | null;
    access: Access;
    joined: boolean;
    isMe: boolean;
  }[];
}
export interface Viewer {
  _id: string;
  name: string;
  email?: string;
  image?: string;
  timeZone?: string;
  homeArea?: string;
  interests: string[];
  defaultCalendarId?: string;
  radarSyncMode: "appOnly" | "warnOnly";
  inboundAddress: string | null;
  google: Pick<
    CalendarAccount,
    "email" | "status" | "lastSyncedAt" | "calendars"
  > | null;
}
export interface Chat extends Stored {
  userId: string;
  title: string;
}
export interface Message extends Stored {
  chatId: string;
  role: "user" | "assistant";
  text: string;
  events?: (EventCandidate & { fit?: string })[];
  pending?: boolean;
}
export interface StandingSearch extends Stored {
  userId: string;
  query: string;
  circleId?: string;
  enabled: boolean;
  lastRunAt?: number;
}
export interface SuggestionRecord extends Stored {
  userId: string;
  searchId?: string;
  event: EventCandidate;
  fit?: string;
  dedupeKey: string;
  state: "new" | "added" | "dismissed";
}
export interface Suggestion {
  _id: string;
  event: EventCandidate;
  fit?: string;
  searchQuery: string | null;
  circleId: string | null;
}
export interface Capture extends Stored {
  userId: string;
  source: "email" | "paste";
  subject?: string;
  draft?: EventCandidate;
  status: "processing" | "draft" | "saved" | "dismissed" | "failed";
  error?: string;
}
export interface GooglePlannerEvent extends EventCandidate {
  _id: string;
  eventId: string;
  calendarId: string;
  calendarName: string;
  status: "google";
}
