<template>
  <section aria-label="Selected plan" class="rounded-2xl border border-line bg-white p-5 flex flex-col gap-2.5">
    <template v-if="plan">
      <div class="flex items-center gap-2 flex-wrap">
        <span v-if="plan.status === 'radar'" class="text-xs font-bold radar-bar px-2.5 py-0.5 rounded-full">On the radar</span>
        <span v-else class="text-xs font-bold bg-sea-100 text-sea-900 px-2.5 py-1 rounded-full">
          Committed · {{ calendarText }}
        </span>
        <span class="flex items-center gap-1.5 text-xs font-bold text-[#3A4552] border border-line rounded-full pl-1 pr-2.5 py-0.5">
          <span class="size-4 rounded-[5px]" :style="{ background: plan.circleColor ?? '#24506B' }" />
          {{ plan.circleName ? `${plan.circleName} circle` : "Just me" }}
        </span>
        <span class="grow" />
        <span class="text-[13px] text-muted font-medium">{{ relativeDays(today, plan.startDate) }}</span>
      </div>
      <h2 class="font-display text-[22px] font-semibold">{{ plan.title }}</h2>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#3A4552]">
        <span class="flex items-center gap-1.5"><UIcon name="i-lucide-calendar" class="size-4" />{{ formatWhen(plan) }}</span>
        <span v-if="plan.place" class="flex items-center gap-1.5"><UIcon name="i-lucide-map-pin" class="size-4" />{{ plan.place }}</span>
        <span v-if="plan.priceText" class="flex items-center gap-1.5"><UIcon name="i-lucide-ticket" class="size-4" />{{ plan.priceText }}</span>
        <a v-if="plan.url" :href="plan.url" target="_blank" rel="noopener" class="flex items-center gap-1.5 text-sea-700 font-medium hover:underline">
          <UIcon name="i-lucide-external-link" class="size-4" />Source
        </a>
      </div>
      <p v-if="plan.note" class="text-[13px] text-muted whitespace-pre-line">{{ plan.note }}</p>
      <p v-if="plan.calendarStatus === 'error'" class="text-[13px] text-error">{{ plan.calendarError }}</p>
      <div class="flex flex-wrap gap-2 mt-auto pt-2">
        <template v-if="plan.status === 'radar'">
          <UButton v-if="plan.canCommit" size="lg" :loading="busy" @click="commit">Commit &amp; add to {{ plan.calendarLabel }}</UButton>
          <UButton v-if="plan.circleName" size="lg" color="neutral" variant="outline" :to="`/ask?q=${encodeURIComponent(`Help us decide about ${plan.title}`)}`">
            Plan it with Breeze
          </UButton>
        </template>
        <template v-else>
          <UButton v-if="plan.canCommit" size="lg" color="neutral" variant="outline" :loading="busy" @click="uncommit">Move back to radar</UButton>
          <UButton size="lg" variant="soft" :to="`/ask?q=${encodeURIComponent(`Ideas for ${plan.title} (${formatWhen(plan)})`)}`">Plan it with Breeze</UButton>
        </template>
        <UButton v-if="plan.canEdit" size="lg" color="neutral" variant="ghost" icon="i-lucide-pencil" @click="$emit('edit')">Edit</UButton>
      </div>
    </template>
    <p v-else class="text-sm text-muted">Select a plan on the timeline to see its details.</p>
  </section>
</template>

<script setup lang="ts">
import { api } from "~~/convex/_generated/api";
import type { Plan } from "~/utils/types";
import { formatWhen, relativeDays } from "~/utils/dates";

const props = defineProps<{ plan?: Plan | null; today: string }>();
defineEmits<{ edit: [] }>();

const run = useRun();
const busy = ref(false);

const calendarText = computed(() => {
  switch (props.plan?.calendarStatus) {
    case "synced":
      return `on ${props.plan.calendarLabel}`;
    case "pending":
      return "adding to calendar…";
    case "notConnected":
      return "calendar not connected";
    case "error":
      return "calendar sync failed";
    default:
      return "in PlanBreeze";
  }
});

async function commit() {
  busy.value = true;
  await run(() => mutate(api.plans.commit, { planId: props.plan!._id }), "Committed");
  busy.value = false;
}
async function uncommit() {
  busy.value = true;
  await run(() => mutate(api.plans.uncommit, { planId: props.plan!._id }), "Moved back to the radar");
  busy.value = false;
}
</script>
