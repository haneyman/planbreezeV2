<template>
  <div class="flex flex-col gap-3">
    <div v-if="compact">
      <div class="text-[15px] font-bold">Found for you</div>
      <div class="flex items-center gap-1.5 text-xs text-muted">
        <span class="size-1.5 rounded-full bg-[#3F7A5A]" />Breeze keeps searching based on your standing searches
      </div>
    </div>
    <template v-if="shown.length">
      <EventCard v-for="s in shown" :key="s._id" :event="s.event" :fit="s.fit">
        <AddToRadar :busy="busy === s._id" @add="(c) => add(s._id, c ?? s.circleId ?? undefined)" />
        <UButton size="sm" color="neutral" variant="ghost" @click="dismiss(s._id)">Not for us</UButton>
      </EventCard>
    </template>
    <p v-else-if="suggestions" class="text-sm text-muted">
      No suggestions yet. <NuxtLink to="/discover" class="text-sea-700 font-semibold">Add a standing search</NuxtLink> and Breeze will look for you.
    </p>
    <NuxtLink v-if="compact && (suggestions?.length ?? 0) > limit" to="/discover" class="text-sm font-semibold text-sea-700">See all suggestions →</NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";

const props = withDefaults(defineProps<{ limit?: number; compact?: boolean; filter?: (s: any) => boolean }>(), { limit: 100, compact: false });
const { data: suggestions } = useQuery(api.breeze.suggestions);
const shown = computed(() => (suggestions.value ?? []).filter((s) => !props.filter || props.filter(s)).slice(0, props.limit));
const run = useRun();
const busy = ref<string | null>(null);

async function add(id: Id<"suggestions">, circleId?: Id<"circles">) {
  busy.value = id;
  await run(() => mutate(api.breeze.addSuggestionToRadar, { suggestionId: id, circleId }), "Added to your radar");
  busy.value = null;
}
const dismiss = (id: Id<"suggestions">) => run(() => mutate(api.breeze.dismissSuggestion, { suggestionId: id }));
</script>
