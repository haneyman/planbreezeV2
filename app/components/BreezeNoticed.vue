<template>
  <section aria-label="Breeze noticed" class="rounded-2xl border border-line bg-paper-raised p-4.5 flex flex-col gap-3">
    <div class="flex items-center gap-2 text-sm font-bold">
      <UIcon name="i-lucide-sparkles" class="size-4 text-coral-500" />Breeze noticed
    </div>
    <button
      v-for="n in notes"
      :key="n.key"
      type="button"
      class="text-left text-[13px] leading-snug text-[#3A4552] hover:text-[#1D2733] cursor-pointer"
      @click="n.planId && $emit('select', n.planId)"
    >
      <strong class="text-[#1D2733]">{{ n.title }}</strong> {{ n.body }}
    </button>
    <p v-if="!notes.length" class="text-[13px] text-muted">Nothing needs your attention right now.</p>
  </section>
</template>

<script setup lang="ts">
import type { Plan, Viewer } from "~/utils/types";
import { daysBetween, shortDate } from "~/utils/dates";

const props = defineProps<{ plans: Plan[]; today: string; viewer?: Viewer | null }>();
defineEmits<{ select: [id: string] }>();

// Simple, deterministic nudges from the user's own plans.
const notes = computed(() => {
  const out: { key: string; title: string; body: string; planId?: string }[] = [];
  if (props.viewer && !props.viewer.google)
    out.push({ key: "google", title: "Google Calendar isn't connected.", body: "Connect it in Settings so committed plans land on your calendar." });
  for (const p of props.plans) {
    if (p.ticketOnSaleDate && p.ticketOnSaleDate >= props.today && daysBetween(props.today, p.ticketOnSaleDate) <= 21)
      out.push({ key: p._id + "sale", title: `${p.title}: tickets open ${shortDate(p.ticketOnSaleDate)}.`, body: "Set a reminder so you don't miss them.", planId: p._id });
    if (p.status === "radar" && p.startDate >= props.today && daysBetween(props.today, p.startDate) <= 10)
      out.push({ key: p._id + "soon", title: `${p.title} is ${daysBetween(props.today, p.startDate) <= 1 ? "almost here" : `in ${daysBetween(props.today, p.startDate)} days`}.`, body: "Still on the radar: commit or let it go?", planId: p._id });
    if (p.status === "committed" && p.calendarStatus === "error")
      out.push({ key: p._id + "err", title: `${p.title} didn't sync.`, body: p.calendarError ?? "Try committing it again.", planId: p._id });
  }
  return out.slice(0, 4);
});
</script>
