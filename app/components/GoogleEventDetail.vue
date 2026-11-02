<template>
  <section aria-label="Google Calendar event" class="rounded-2xl border border-line bg-white p-5 flex flex-col gap-2.5">
    <div class="text-xs font-bold text-slate-600">Google Calendar · Read only · {{ event.calendarName }}</div>
    <h2 class="font-display text-[22px] font-semibold">{{ event.title }}</h2>
    <p class="text-sm">{{ formatWhen(event) }}<span v-if="event.startTime"> · {{ timeZone }}</span></p>
    <p v-if="event.place" class="text-sm text-muted">{{ event.place }}</p>
    <p class="text-sm text-muted">To change this event, open it in Google Calendar.</p>
    <a v-if="event.url" :href="event.url" target="_blank" rel="noopener noreferrer" class="text-sm font-semibold text-sea-700 hover:underline">Open in Google Calendar</a>
  </section>
</template>
<script setup lang="ts">
import type { GooglePlannerEvent } from "~/utils/types";
import { formatWhen } from "~/utils/dates";
defineProps<{ event: GooglePlannerEvent; timeZone: string }>();
</script>
