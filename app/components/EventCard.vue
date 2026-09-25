<template>
  <article class="rounded-2xl border border-line bg-white p-4 flex gap-4">
    <div class="w-14 shrink-0 rounded-xl bg-paper flex flex-col items-center justify-center py-2 self-start">
      <span class="text-[10px] font-bold tracking-[0.08em] text-coral-700">{{ month }}</span>
      <span class="font-display text-2xl font-semibold leading-none">{{ day }}</span>
    </div>
    <div class="grow min-w-0 flex flex-col gap-1">
      <div class="text-[15px] font-bold leading-snug">{{ event.title }}</div>
      <div class="text-xs text-muted">{{ meta }}</div>
      <div v-if="event.reason" class="text-xs text-[#3A4552]">{{ event.reason }}</div>
      <div v-if="fit" class="flex items-center gap-1.5 text-xs font-semibold" :class="fitClass">
        <span class="size-2 rounded-full bg-current" />{{ fit }}
      </div>
      <div class="flex flex-wrap items-center gap-2 mt-1.5">
        <slot />
        <UButton v-if="event.url" :to="event.url" target="_blank" size="sm" color="neutral" variant="ghost" trailing-icon="i-lucide-external-link">Source</UButton>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { EventCandidate } from "~/utils/types";
import { formatTime, formatWhen, MONTHS } from "~/utils/dates";

const props = defineProps<{ event: EventCandidate; fit?: string }>();
const month = computed(() => MONTHS[+props.event.startDate.slice(5, 7) - 1]!.toUpperCase());
const day = computed(() => String(+props.event.startDate.slice(8, 10)));
const meta = computed(() =>
  [props.event.place, props.event.startDate !== props.event.endDate ? formatWhen(props.event) : formatTime(props.event.startTime), props.event.priceText]
    .filter(Boolean)
    .join(" · "),
);
const fitClass = computed(() => (props.fit?.startsWith("Overlaps") ? "text-coral-700" : props.fit?.startsWith("Nothing") ? "text-[#2C6B49]" : "text-sea-700"));
</script>
