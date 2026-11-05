import type {
  Capture,
  Chat,
  Circle,
  EventCandidate,
  GooglePlannerEvent,
  Message,
  Plan,
  PlanRecord,
  StandingSearch,
  Suggestion,
  Viewer,
  Access,
} from "~~/shared/types";
export async function request<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: object,
  query?: object,
): Promise<T> {
  const value = await $fetch<T>(path, {
    baseURL: useRuntimeConfig().public.apiUrl as string,
    method,
    credentials: "include",
    ...(body ? { body } : {}),
    ...(query ? { query: query as Record<string, string> } : {}),
  });
  return (value ?? null) as T;
}
type MemberInput = {
  email?: string;
  label: string;
  access?: Exclude<Access, "owner">;
};
type PlanInput = Omit<EventCandidate, "reason"> & {
  circleId?: string;
  status: "radar" | "committed";
  timeZone?: string;
  note?: string;
  source?: PlanRecord["source"];
};
type PlanPatch = Partial<
  Omit<PlanInput, "status" | "circleId" | "startTime" | "endTime">
> & {
  circleId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};
const id = encodeURIComponent;
// Typed REST calls in one place; components share the same polling composable.
export const api = {
  users: {
    viewer: (_: object = {}) => request<Viewer | null>("/users/me"),
    updateProfile: (body: {
      name?: string;
      timeZone?: string;
      homeArea?: string;
      interests?: string[];
      defaultCalendarId?: string;
      radarSyncMode?: "appOnly" | "warnOnly";
    }) => request<null>("/users/me", "PATCH", body),
  },
  circles: {
    list: (_: object = {}) => request<Circle[]>("/circles"),
    create: (body: {
      name: string;
      color: string;
      linkedCalendarId?: string;
      members: MemberInput[];
    }) => request<string>("/circles", "POST", body),
    update: ({
      circleId,
      ...body
    }: {
      circleId: string;
      name?: string;
      color?: string;
      linkedCalendarId?: string | null;
    }) => request<null>(`/circles/${id(circleId)}`, "PATCH", body),
    archive: ({ circleId }: { circleId: string }) =>
      request<null>(`/circles/${id(circleId)}`, "DELETE"),
    addMember: ({
      circleId,
      member,
    }: {
      circleId: string;
      member: MemberInput;
    }) => request<string>(`/circles/${id(circleId)}/members`, "POST", member),
    updateMember: ({
      memberId,
      ...body
    }: {
      memberId: string;
      label?: string;
      access?: Exclude<Access, "owner">;
    }) => request<null>(`/circles/members/${id(memberId)}`, "PATCH", body),
    removeMember: ({ memberId }: { memberId: string }) =>
      request<null>(`/circles/members/${id(memberId)}`, "DELETE"),
  },
  plans: {
    list: (q: { from: string; to: string }) =>
      request<Plan[]>("/plans", "GET", undefined, q),
    create: (body: PlanInput) => request<string>("/plans", "POST", body),
    update: ({ planId, ...body }: PlanPatch & { planId: string }) =>
      request<null>(`/plans/${id(planId)}`, "PATCH", body),
    remove: ({ planId }: { planId: string }) =>
      request<null>(`/plans/${id(planId)}`, "DELETE"),
    commit: ({ planId }: { planId: string }) =>
      request<null>(`/plans/${id(planId)}/commit`, "POST", {}),
    uncommit: ({ planId }: { planId: string }) =>
      request<null>(`/plans/${id(planId)}/uncommit`, "POST", {}),
  },
  google: {
    startConnect: (_: object) =>
      request<string>("/calendar/connect", "POST", {}),
    disconnect: (_: object) => request<null>("/calendar/connection", "DELETE"),
    refreshCalendars: (_: object) =>
      request<null>("/calendar/refresh", "POST", {}),
    calendarEvents: (q: {
      calendarId: string;
      from: string;
      to: string;
      timeZone: string;
    }) =>
      request<{ events: GooglePlannerEvent[]; truncated: boolean }>(
        "/calendar/events",
        "GET",
        undefined,
        q,
      ),
  },
  breeze: {
    chats: (_: object = {}) => request<Chat[]>("/breeze/chats"),
    messages: ({ chatId }: { chatId: string }) =>
      request<Message[]>(`/breeze/chats/${id(chatId)}/messages`),
    send: (body: { chatId?: string; text: string }) =>
      request<string>("/breeze/messages", "POST", body),
    searches: (_: object = {}) => request<StandingSearch[]>("/breeze/searches"),
    addSearch: (body: { query: string; circleId?: string }) =>
      request<string>("/breeze/searches", "POST", body),
    setSearchEnabled: ({
      searchId,
      enabled,
    }: {
      searchId: string;
      enabled: boolean;
    }) =>
      request<null>(`/breeze/searches/${id(searchId)}`, "PATCH", { enabled }),
    removeSearch: ({ searchId }: { searchId: string }) =>
      request<null>(`/breeze/searches/${id(searchId)}`, "DELETE"),
    runSearchNow: ({ searchId }: { searchId: string }) =>
      request<null>(`/breeze/searches/${id(searchId)}/run`, "POST", {}),
    suggestions: (_: object = {}) =>
      request<Suggestion[]>("/breeze/suggestions"),
    addSuggestionToRadar: ({
      suggestionId,
      circleId,
    }: {
      suggestionId: string;
      circleId?: string;
    }) =>
      request<string>(`/breeze/suggestions/${id(suggestionId)}/add`, "POST", {
        circleId,
      }),
    dismissSuggestion: ({ suggestionId }: { suggestionId: string }) =>
      request<null>(`/breeze/suggestions/${id(suggestionId)}`, "DELETE"),
    addEventToRadar: (body: { event: EventCandidate; circleId?: string }) =>
      request<string>("/breeze/radar", "POST", body),
  },
  capture: {
    inbox: (_: object = {}) => request<Capture[]>("/capture"),
    extract: (body: { input: string }) =>
      request<{ draft: EventCandidate | null; message?: string }>(
        "/capture/extract",
        "POST",
        body,
      ),
    save: (body: {
      event: EventCandidate;
      circleId?: string;
      status: "radar" | "committed";
      captureId?: string;
    }) => request<string>("/capture/save", "POST", body),
    dismiss: ({ captureId }: { captureId: string }) =>
      request<null>(`/capture/${id(captureId)}`, "DELETE"),
  },
};
