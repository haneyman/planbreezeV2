<template>
  <div class="lg:flex min-h-dvh">
    <div class="grow min-w-0 px-4 md:px-9 py-7 flex flex-col gap-5">
      <div>
        <h1 class="font-display text-[34px] font-semibold">Discover</h1>
        <div class="flex items-center gap-1.5 text-sm text-muted mt-1">
          <span class="size-1.5 rounded-full bg-[#3F7A5A]" />Breeze runs your standing searches every day and shows what fits here.
        </div>
      </div>
      <div role="group" aria-label="When" class="flex flex-wrap gap-2">
        <button
          v-for="f in filters"
          :key="f.id"
          type="button"
          :aria-pressed="filter === f.id"
          class="h-9 px-3.5 rounded-full text-[13px] font-semibold border cursor-pointer"
          :class="filter === f.id ? 'bg-[#1D2733] text-white border-[#1D2733]' : 'bg-white border-[#D6D0C3]'"
          @click="filter = f.id"
        >
          {{ f.label }}
        </button>
      </div>
      <SuggestionList :filter="matches" class="max-w-3xl" />
    </div>

    <aside class="lg:w-[380px] shrink-0 border-l border-line bg-white px-5 py-7 flex flex-col gap-4">
      <div>
        <h2 class="font-display text-[21px] font-semibold">Breeze is watching</h2>
        <p class="text-[13px] text-muted mt-1">Standing searches run in the background. New finds show up here.</p>
      </div>
      <form class="flex gap-2" @submit.prevent="addSearch">
        <label for="new-search" class="sr-only">New standing search</label>
        <UInput id="new-search" v-model="newQuery" placeholder="e.g. live jazz on weekends" class="grow" />
        <UButton type="submit" icon="i-lucide-plus" aria-label="Add standing search" :loading="adding" />
      </form>
      <div v-for="s in searches ?? []" :key="s._id" class="flex items-center gap-3 p-3 border border-line rounded-xl">
        <div class="grow min-w-0">
          <div class="text-sm font-semibold">{{ s.query }}</div>
          <div class="text-xs text-muted">{{ s.lastRunAt ? `Checked ${ago(s.lastRunAt)}` : "Not run yet" }}</div>
        </div>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="runningId === s._id" aria-label="Search now" @click="runNow(s._id)" />
        <USwitch :model-value="s.enabled" :aria-label="s.query" @update:model-value="(v: boolean) => mutate(api.breeze.setSearchEnabled, { searchId: s._id, enabled: v })" />
        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Remove" @click="mutate(api.breeze.removeSearch, { searchId: s._id })" />
      </div>
      <p v-if="searches && !searches.length" class="text-sm text-muted">No standing searches yet. Try one of these:</p>
      <div v-if="searches && !searches.length" class="flex flex-wrap gap-1.5">
        <button v-for="p in starters" :key="p" type="button" class="text-xs font-semibold text-sea-900 bg-sea-100 px-2.5 py-1.5 rounded-full cursor-pointer" @click="newQuery = p">
          {{ p }}
        </button>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { addDays, todayLocal } from "~/utils/dates";

const today = todayLocal();
const filters = [
  { id: "all", label: "Everything" },
  { id: "week", label: "Next 7 days" },
  { id: "twoMonths", label: "Next 2 months" },
  { id: "later", label: "Later" },
] as const;
const filter = ref<(typeof filters)[number]["id"]>("all");
const matches = (s: { event: { startDate: string } }) => {
  const d = s.event.startDate;
  if (filter.value === "week") return d <= addDays(today, 7);
  if (filter.value === "twoMonths") return d <= addDays(today, 61);
  if (filter.value === "later") return d > addDays(today, 61);
  return true;
};

const { data: searches } = useQuery(api.breeze.searches);
const run = useRun();
const newQuery = ref("");
const adding = ref(false);
const runningId = ref<string | null>(null);
const starters = ["Wine tastings within an hour", "Kid-friendly weekend events", "Live jazz", "Food festivals"];

async function addSearch() {
  if (!newQuery.value.trim()) return;
  adding.value = true;
  const ok = await run(() => mutate(api.breeze.addSearch, { query: newQuery.value }), "Breeze is on it");
  adding.value = false;
  if (ok) newQuery.value = "";
}
async function runNow(searchId: Id<"standingSearches">) {
  runningId.value = searchId;
  await run(() => runAction(api.breeze.runSearchNow, { searchId }), "Search finished");
  runningId.value = null;
}
function ago(ms: number) {
  const h = Math.round((Date.now() - ms) / 3_600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
</script>
