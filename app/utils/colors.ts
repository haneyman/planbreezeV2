/** Circle colors: all pass 4.5:1 with white text. */
export const CIRCLE_COLORS = ["#3F7A5A", "#46698F", "#A0445B", "#6B4F99", "#A35A16", "#7A6A3A", "#24506B"];

export const ACCESS_LABELS = {
  owner: "Owner",
  coPlanner: "Co-planner",
  contributor: "Contributor",
  viewer: "Viewer",
} as const;

export function initials(label: string) {
  return label
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
