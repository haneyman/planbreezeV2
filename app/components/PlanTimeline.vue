<template>
  <section aria-label="Timeline" class="rounded-2xl border border-line bg-white px-5 pb-3 flex flex-col">
    <!-- Ticks -->
    <div class="relative h-11 border-b border-line shrink-0">
      <div
        v-for="t in ticks"
        :key="t.left"
        class="absolute inset-y-0 border-l border-[#EEEAE1] pl-2 pt-3.5 text-xs text-muted whitespace-nowrap overflow-hidden"
        :style="{ left: t.left + '%', width: t.width + '%' }"
      >
        <span class="font-semibold text-[#1D2733]">{{ t.label }}</span> {{ t.sub }}
      </div>
      <div
        v-if="todayPct !== null"
        class="absolute -bottom-px -translate-x-1/2 bg-coral-500 text-white text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded-t-md"
        :style="{ left: todayPct + '%' }"
      >
        TODAY
      </div>
    </div>

    <div ref="track" class="relative grow">
      <div
        v-for="(t, i) in ticks"
        :key="'bg' + t.left"
        class="absolute inset-y-0 border-l border-[#F1EDE5]"
        :class="i % 2 ? 'bg-[#1D2733]/[0.02]' : ''"
        :style="{ left: t.left + '%', width: t.width + '%' }"
      />
      <div v-if="todayPct !== null" class="absolute top-9 bottom-0 w-0.5 -ml-px bg-coral-500 z-10" :style="{ left: todayPct + '%' }" />

      <div class="relative z-20 pt-3.5">
        <template v-for="lane in lanes" :key="lane.status">
          <div
            class="flex items-center gap-2 text-[11px] font-bold tracking-[0.08em]"
            :class="lane.status === 'committed' ? 'text-sea-700' : 'text-coral-700 mt-2.5 pt-3 border-t border-dashed border-line'"
          >
            {{ lane.status === "committed" ? "COMMITTED" : "ON THE RADAR" }}
            <span class="px-1.5 rounded-full tracking-normal" :class="lane.status === 'committed' ? 'bg-sea-100 text-sea-900' : 'bg-coral-100 text-coral-800'">
              {{ lane.count }}
            </span>
            <span v-if="lane.status === 'radar'" class="font-medium tracking-normal text-muted">not committed · no calendar holds</span>
          </div>
          <div class="relative mt-2" :style="{ height: lane.rows * 42 + 'px' }">
            <div
              v-for="bar in lane.bars"
              :key="bar.item._id"
              class="absolute h-8 min-w-3.5"
              :style="{ left: bar.left + '%', width: bar.width + '%', top: bar.row * 42 + 'px' }"
            >
              <button
                type="button"
                :aria-label="bar.item.cluster ? `${bar.item.title}. Zoom in to see them` : `${bar.item.title}, ${formatWhen(bar.item)}`"
                :aria-pressed="bar.item._id === selectedId"
                class="absolute inset-0 min-w-3.5 rounded-lg px-2.5 text-left text-[13px] font-semibold truncate cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-700"
                :class="[
                  lane.status === 'committed' ? 'committed-bar' : 'radar-bar',
                  bar.item._id === selectedId ? 'ring-2 ring-offset-2 ring-[#1D2733]' : '',
                ]"
                @click="bar.item.cluster ? $emit('zoomTo', bar.item.startDate) : $emit('select', bar.item._id)"
              >
                <span v-if="bar.labelInside">{{ bar.item.title }}</span>
              </button>
              <span
                v-if="!bar.labelInside"
                class="absolute top-1.5 whitespace-nowrap text-[13px] pointer-events-none"
                :class="[
                  bar.labelSide === 'right' ? 'left-[calc(100%+6px)]' : 'right-[calc(100%+6px)]',
                  lane.status === 'committed' ? 'font-semibold' : 'font-medium text-coral-800',
                ]"
              >
                {{ bar.item.title }}
              </span>
            </div>
          </div>
        </template>
        <p v-if="!plans.length" class="text-sm text-muted pb-4">
          Nothing in this timeframe yet. Add a plan, paste a link, or ask Breeze for ideas.
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { Plan } from "~/utils/types";
import { packBars, pctFn, ticksFor, type Range } from "~/utils/timeline";
import { addDays, addMonths, daysBetween, formatWhen, MONTHS } from "~/utils/dates";
import { useResizeObserver } from "@vueuse/core";

const props = defineProps<{ plans: Plan[]; range: Range; today: string; selectedId?: string | null }>();
defineEmits<{ select: [id: string]; zoomTo: [date: string] }>();

type Item = Pick<Plan, "_id" | "title" | "startDate" | "endDate"> & { cluster?: boolean };

/** At Year+ zoom, short plans in the same month collapse into one "Oct · 4 plans" bar (click to zoom in). */
function clustered(list: Plan[]): Item[] {
  if (props.range.tick !== "month" || ticks.value.length < 12) return list;
  const short = (p: Plan) => daysBetween(p.startDate, p.endDate) < 3;
  const byMonth = new Map<string, Plan[]>();
  for (const p of list.filter(short)) byMonth.set(p.startDate.slice(0, 7), [...(byMonth.get(p.startDate.slice(0, 7)) ?? []), p]);
  const out: Item[] = list.filter((p) => !short(p));
  for (const [month, ps] of byMonth) {
    if (ps.length < 2) out.push(...ps);
    else {
      const first = month + "-01";
      out.push({ _id: `cluster-${month}` as Plan["_id"], title: `${MONTHS[+month.slice(5) - 1]} · ${ps.length} plans`, startDate: first, endDate: addDays(addMonths(first, 1), -2), cluster: true });
    }
  }
  return out;
}

const track = ref<HTMLElement>();
const trackPx = ref(760);
useResizeObserver(track, (entries) => {
  const w = entries[0]?.contentRect.width;
  if (w) trackPx.value = w;
});

const ticks = computed(() => ticksFor(props.range));
const todayPct = computed(() =>
  props.today >= props.range.from && props.today < props.range.to ? pctFn(props.range)(props.today) + 50 / Math.max(1, (Date.parse(props.range.to) - Date.parse(props.range.from)) / 86400000) : null,
);
const lanes = computed(() =>
  (["committed", "radar"] as const).map((status) => {
    const inLane = props.plans.filter((p) => p.status === status && p.endDate >= props.range.from && p.startDate < props.range.to);
    const { bars, rows } = packBars(clustered(inLane), props.range, trackPx.value);
    return { status, bars, rows, count: inLane.length };
  }),
);
</script>
