<template>
  <div class="xl:flex min-h-dvh">
    <div class="grow min-w-0 px-4 md:px-7 py-6 flex flex-col gap-4">
      <!-- Header -->
      <div class="flex flex-wrap items-end gap-3">
        <div class="grow">
          <div class="text-sm text-muted">{{ greeting }}</div>
          <h1 class="font-display text-[34px] font-semibold leading-tight">Your plans</h1>
        </div>
        <UButton to="/capture" color="neutral" variant="outline" size="lg" icon="i-lucide-link">Paste a link or email</UButton>
        <UButton size="lg" icon="i-lucide-plus" @click="openNew">New plan</UButton>
      </div>

      <!-- Timeframe -->
      <div class="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Timeframe" class="flex gap-1 p-1 bg-[#ECE7DC] rounded-xl">
          <button
            v-for="z in ZOOMS"
            :key="z.id"
            type="button"
            :aria-pressed="zoom === z.id"
            class="h-9 px-4 rounded-[9px] text-sm font-semibold cursor-pointer"
            :class="zoom === z.id ? 'bg-white text-[#1D2733] shadow-sm' : 'text-muted hover:text-[#1D2733]'"
            @click="setZoom(z.id)"
          >
            {{ z.label }}
          </button>
        </div>
        <div class="flex items-center gap-1">
          <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" aria-label="Earlier" @click="offset--" />
          <UButton color="neutral" variant="ghost" :disabled="offset === 0" @click="offset = 0">Today</UButton>
          <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" aria-label="Later" @click="offset++" />
        </div>
        <div class="text-sm font-semibold">{{ range.label }}</div>
        <div class="grow" />
        <div class="flex items-center gap-4 text-[13px] text-[#3A4552]">
          <span class="flex items-center gap-1.5"><span class="w-5.5 h-3 rounded committed-bar" />Committed</span>
          <span class="flex items-center gap-1.5"><span class="w-5.5 h-3 rounded radar-bar" />On the radar</span>
        </div>
      </div>

      <!-- Me + circles -->
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[13px] text-muted mr-1">Showing plans for</span>
        <button
          v-for="chip in chips"
          :key="chip.id"
          type="button"
          :aria-pressed="!hidden.has(chip.id)"
          :title="chip.hint"
          class="flex items-center gap-2 h-9 pl-1 pr-3 rounded-full text-[13px] font-semibold border cursor-pointer"
          :class="hidden.has(chip.id) ? 'border-[#D6D0C3] opacity-50' : 'bg-white border-[#CFC8B9]'"
          @click="toggle(chip.id)"
        >
          <UAvatar v-if="chip.id === 'me'" :src="viewer?.image" :alt="viewer?.name" size="xs" class="size-7" />
          <span v-else class="size-7 rounded-[9px] grid place-items-center text-white" :style="{ background: chip.color }">
            <UIcon name="i-lucide-users" class="size-4" />
          </span>
          {{ chip.label }}
          <span v-if="chip.count" class="text-xs font-medium text-muted">{{ chip.count }}</span>
        </button>
        <NuxtLink to="/settings" class="flex items-center gap-1.5 h-9 px-3 rounded-full border border-dashed border-[#CFC8B9] text-[13px] font-semibold text-[#3A4552]">
          <UIcon name="i-lucide-plus" class="size-3.5" />New circle
        </NuxtLink>
      </div>

      <PlanTimeline :plans="visiblePlans" :range="range" :today="today" :selected-id="selectedId" class="min-h-80" @select="selectedId = $event" @zoom-to="zoomTo" />

      <div class="grid lg:grid-cols-[1fr_320px] gap-4">
        <PlanDetail :plan="selected" :today="today" @edit="editOpen = true" />
        <BreezeNoticed :plans="allPlans" :today="today" :viewer="viewer" @select="selectedId = $event" />
      </div>
    </div>

    <aside class="xl:w-[360px] shrink-0 border-t xl:border-t-0 xl:border-l border-line bg-white px-5 py-6 flex flex-col gap-4">
      <AskBox />
      <USeparator />
      <SuggestionList :limit="3" compact />
    </aside>

    <PlanFormModal v-model:open="newOpen" :initial="newDraft" :circles="circles ?? []" @saved="selectedId = $event" />
    <PlanFormModal v-model:open="editOpen" :plan="selected" :circles="circles ?? []" />
  </div>
</template>

<script setup lang="ts">
import { api } from "~~/convex/_generated/api";
import { rangeFor, ZOOMS, type Zoom } from "~/utils/timeline";
import { daysBetween, startOfWeek, todayLocal } from "~/utils/dates";
import { emptyDraft } from "~/utils/draft";
import type { PlanDraft } from "~/utils/types";

const today = todayLocal();
const zoom = ref<Zoom>("twoMonths");
const offset = ref(0);
const range = computed(() => rangeFor(zoom.value, today, offset.value));
/** Jump from a Year+ month cluster to the Month view around that date. */
function zoomTo(date: string) {
  zoom.value = "month";
  offset.value = Math.floor(daysBetween(startOfWeek(today), date) / 35);
}
const setZoom = (z: Zoom) => {
  zoom.value = z;
  offset.value = 0;
};

const { data: viewer } = useQuery(api.users.viewer);
const { data: circles } = useQuery(api.circles.list);
const { data: plans } = useQuery(api.plans.list, () => ({ from: range.value.from, to: range.value.to }));
// "Breeze noticed" looks a little further ahead than the visible range.
const { data: upcoming } = useQuery(api.plans.list, () => ({ from: today, to: rangeFor("quarter", today).to }));
const allPlans = computed(() => upcoming.value ?? []);

// Filter chips (remembered in this browser)
const HIDDEN_KEY = "planbreeze.hiddenCircles";
const hidden = ref(new Set<string>(readHidden()));
function readHidden(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function toggle(id: string) {
  const next = new Set(hidden.value);
  next.has(id) ? next.delete(id) : next.add(id);
  hidden.value = next;
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
  } catch {
    /* private mode */
  }
}
const chips = computed(() => [
  { id: "me", label: "Me", color: "#24506B", count: "", hint: "Plans just for you" },
  ...(circles.value ?? []).map((c) => ({
    id: c._id as string,
    label: c.name,
    color: c.color,
    count: String(c.members.length),
    hint: `${c.members.length} people · ${c.linkedCalendarId ? "adds to its linked calendar" : "adds to your default calendar"}`,
  })),
]);
const visiblePlans = computed(() => (plans.value ?? []).filter((p) => !hidden.value.has(p.circleId ?? "me")));

// Selection
const selectedId = ref<string | null>(null);
const selected = computed(
  () => (plans.value ?? []).find((p) => p._id === selectedId.value) ?? allPlans.value.find((p) => p._id === selectedId.value) ?? null,
);
watch(visiblePlans, (list) => {
  if (!selectedId.value && list.length) selectedId.value = [...list].sort((a, b) => a.startDate.localeCompare(b.startDate)).find((p) => p.endDate >= today)?._id ?? list[0]!._id;
});

// New / edit
const newOpen = ref(false);
const editOpen = ref(false);
const newDraft = ref<PlanDraft>(emptyDraft(today));
function openNew() {
  newDraft.value = emptyDraft(today);
  newOpen.value = true;
}

const greeting = computed(() => {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = viewer.value?.name?.split(" ")[0];
  return first ? `${part}, ${first}` : part;
});
</script>
