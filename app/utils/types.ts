import type { Plan } from "~~/shared/types";
export type { Plan, Circle, Viewer, EventCandidate, GooglePlannerEvent } from "~~/shared/types";

export type PlanDraft = {
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  place: string;
  url: string;
  note: string;
  priceText: string;
  ticketOnSaleDate: string;
  circleId: string; // "me" = just me
  status: "radar" | "committed";
};

export type TimelineItem = Pick<Plan, "title" | "startDate" | "endDate" | "startTime" | "endTime"> & {
  _id: string;
  status: "committed" | "radar" | "google";
};
