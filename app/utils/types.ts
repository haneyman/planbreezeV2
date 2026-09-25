import type { FunctionReturnType } from "convex/server";
import type { api } from "~~/convex/_generated/api";

export type Plan = FunctionReturnType<typeof api.plans.list>[number];
export type Circle = FunctionReturnType<typeof api.circles.list>[number];
export type Viewer = NonNullable<FunctionReturnType<typeof api.users.viewer>>;
export type EventCandidate = {
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
};

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
