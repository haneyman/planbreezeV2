<template>
  <div class="px-4 md:px-9 py-7 flex flex-col gap-5">
    <h1 class="font-display text-[34px] font-semibold">Calendars &amp; circles</h1>
    <div class="grid xl:grid-cols-2 gap-5 items-start">
      <div class="flex flex-col gap-4">
        <!-- Calendars -->
        <section aria-label="Connected calendars" class="rounded-2xl border border-line bg-white p-5 flex flex-col gap-3.5">
          <h2 class="text-[17px] font-bold">Connected calendars</h2>
          <div class="border border-line rounded-xl p-4 flex flex-col gap-3">
            <div class="flex items-center gap-3">
              <span class="size-9 rounded-[10px] bg-sea-100 grid place-items-center"><UIcon name="i-lucide-calendar" class="size-[18px] text-sea-700" /></span>
              <div class="grow min-w-0">
                <div class="text-[15px] font-bold">Google Calendar</div>
                <div v-if="google" class="text-xs font-semibold" :class="google.status === 'ok' ? 'text-[#2C6B49]' : 'text-coral-700'">
                  {{ google.status === "ok" ? `Connected${google.email ? ` as ${google.email}` : ""}` : "Needs to be reconnected" }}
                </div>
                <div v-else class="text-xs text-muted">Committed plans are added to your calendars. PlanBreeze only edits events it created.</div>
              </div>
              <template v-if="google">
                <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" aria-label="Refresh calendars" :loading="refreshing" @click="refresh" />
                <UButton v-if="google.status !== 'ok'" size="sm" @click="connect">Reconnect</UButton>
                <UButton size="sm" color="neutral" variant="outline" @click="disconnect">Disconnect</UButton>
              </template>
              <UButton v-else :loading="connecting" @click="connect">Connect</UButton>
            </div>
            <div v-if="google" class="flex flex-col gap-1.5 pl-12">
              <div v-for="c in google.calendars" :key="c.id" class="flex items-center gap-2.5 text-[13px]">
                <span class="size-2.5 rounded-[3px]" :style="{ background: c.color ?? '#24506B' }" />
                <span class="grow truncate">{{ c.name }}</span>
                <span class="text-xs text-muted">{{ calendarRole(c) }}</span>
              </div>
            </div>
          </div>
          <div v-for="p in otherProviders" :key="p.name" class="border border-line rounded-xl px-4 py-3 flex items-center gap-3">
            <span class="size-9 rounded-[10px] bg-paper grid place-items-center"><UIcon name="i-lucide-calendar" class="size-[18px] text-muted" /></span>
            <div class="grow">
              <div class="text-[15px] font-bold">{{ p.name }}</div>
              <div class="text-xs text-muted">{{ p.note }}</div>
            </div>
            <UBadge color="neutral" variant="soft">Coming soon</UBadge>
          </div>
        </section>

        <!-- Sync + profile -->
        <section aria-label="Sync and profile" class="rounded-2xl border border-line bg-white p-5 flex flex-col gap-4">
          <h2 class="text-[17px] font-bold">How plans sync</h2>
          <UFormField label="Committed plans that are just for me go to" help="Circle plans go to the circle's linked calendar. Circles without one use this calendar too.">
            <USelect :model-value="viewer?.defaultCalendarId" :items="writableCalendars" placeholder="Connect Google Calendar first" :disabled="!writableCalendars.length" class="w-full" @update:model-value="(v: string) => save({ defaultCalendarId: v })" />
          </UFormField>
          <UFormField label="Radar items on my calendar">
            <URadioGroup :model-value="viewer?.radarSyncMode" :items="radarModes" @update:model-value="(v: any) => save({ radarSyncMode: v })" />
          </UFormField>
          <USeparator />
          <h2 class="text-[17px] font-bold">For Breeze</h2>
          <UFormField label="Home area" help="City or neighborhood, used for “near me” searches.">
            <UInput v-model="homeArea" placeholder="e.g. Oakland, CA" class="w-full" @blur="save({ homeArea })" />
          </UFormField>
          <UFormField label="Interests" help="Comma-separated, e.g. wine, live jazz, kid-friendly, hiking">
            <UInput v-model="interests" class="w-full" @blur="save({ interests: interests.split(',').map((s) => s.trim()).filter(Boolean) })" />
          </UFormField>
        </section>
      </div>

      <!-- Circles -->
      <section aria-label="Circles" class="rounded-2xl border border-line bg-white p-5 flex flex-col gap-3.5">
        <div class="flex items-start gap-3">
          <div class="grow">
            <h2 class="text-[17px] font-bold">Circles</h2>
            <p class="text-[13px] text-muted mt-1">
              The groups you plan with. Each circle can link to a calendar, so committed plans land there automatically.
            </p>
          </div>
          <UButton icon="i-lucide-plus" @click="newCircleOpen = true">New circle</UButton>
        </div>
        <CircleCard
          v-for="c in circles ?? []"
          :key="c._id"
          :circle="c"
          :calendars="writableCalendars"
          :open="openCircle === c._id"
          @toggle="openCircle = openCircle === c._id ? null : c._id"
        />
        <p v-if="circles && !circles.length" class="text-sm text-muted">No circles yet. Create one for your family or friends.</p>
        <div class="rounded-xl bg-paper-raised p-3.5 text-xs leading-relaxed text-[#3A4552]">
          <div class="text-[13px] font-bold text-[#1D2733] mb-1">Access levels</div>
          <strong>Co-planner</strong> adds, commits and edits the circle's plans. <strong>Contributor</strong> adds to the radar.
          <strong>Viewer</strong> sees the circle's plans only. People only see plans from circles they belong to.
        </div>
      </section>
    </div>

    <CircleFormModal v-model:open="newCircleOpen" :calendars="writableCalendars" @created="openCircle = $event" />
  </div>
</template>

<script setup lang="ts">
import { api } from "~~/convex/_generated/api";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const run = useRun();

const { data: viewer } = useQuery(api.users.viewer);
const { data: circles } = useQuery(api.circles.list);
const google = computed(() => viewer.value?.google ?? null);
const writableCalendars = computed(() => (google.value?.calendars ?? []).filter((c) => c.writable).map((c) => ({ label: `Google · ${c.name}`, value: c.id })));

const openCircle = ref<string | null>(null);
watch(circles, (list) => {
  if (openCircle.value === null && list?.length) openCircle.value = list[0]!._id;
}, { immediate: true });
const newCircleOpen = ref(false);

const homeArea = ref("");
const interests = ref("");
watch(viewer, (v) => {
  if (!v) return;
  if (!homeArea.value) homeArea.value = v.homeArea ?? "";
  if (!interests.value) interests.value = v.interests.join(", ");
}, { immediate: true });

const radarModes = [
  { label: "Keep them in PlanBreeze only (recommended)", value: "appOnly" },
  { label: "Show nothing, but warn me about conflicts", value: "warnOnly" },
];
const otherProviders = [
  { name: "Apple iCloud Calendar", note: "Uses an app-specific password from your Apple account" },
  { name: "Yahoo Calendar", note: "Uses an app password from Yahoo account security" },
  { name: "Outlook / Microsoft 365", note: "Sign in with Microsoft" },
];

function calendarRole(c: { id: string; writable: boolean }) {
  if (c.id === viewer.value?.defaultCalendarId) return "Default for my plans";
  const linked = circles.value?.find((x) => x.linkedCalendarId === c.id);
  if (linked) return `Linked to ${linked.name}`;
  return c.writable ? "Read & write" : "Read only";
}

const save = (patch: Record<string, unknown>) => run(() => mutate(api.users.updateProfile, patch));

const connecting = ref(false);
async function connect() {
  connecting.value = true;
  const url = await run(() => mutate(api.google.startConnect, {}));
  if (url) window.location.href = url;
  else connecting.value = false;
}
const refreshing = ref(false);
async function refresh() {
  refreshing.value = true;
  await run(() => runAction(api.google.refreshCalendars, {}), "Calendars refreshed");
  refreshing.value = false;
}
const disconnect = () => run(() => mutate(api.google.disconnect, {}), "Google Calendar disconnected");

// Result of the Google consent redirect
onMounted(() => {
  const status = route.query.google;
  if (!status) return;
  const messages: Record<string, { title: string; color: "success" | "error" | "neutral" }> = {
    connected: { title: "Google Calendar connected", color: "success" },
    cancelled: { title: "Google Calendar wasn't connected", color: "neutral" },
    expired: { title: "That link expired. Please try again.", color: "error" },
    error: { title: "Google didn't return calendar access. Please try again.", color: "error" },
  };
  const m = messages[String(status)];
  if (m) toast.add(m);
  router.replace({ query: {} });
});
</script>
