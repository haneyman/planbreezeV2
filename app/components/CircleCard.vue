<template>
  <div class="border border-line rounded-[14px] overflow-hidden shrink-0">
    <button
      type="button"
      :aria-expanded="open"
      class="w-full flex items-center gap-3 px-3.5 py-3 text-left cursor-pointer"
      :class="open ? 'bg-paper-raised' : 'bg-white'"
      @click="$emit('toggle')"
    >
      <span class="size-9.5 shrink-0 rounded-[11px] grid place-items-center text-white" :style="{ background: circle.color }">
        <UIcon name="i-lucide-users" class="size-5" />
      </span>
      <span class="grow min-w-0 flex flex-col">
        <span class="text-[15px] font-bold">{{ circle.name }}</span>
        <span class="text-xs text-muted">{{ summary }}</span>
      </span>
      <UIcon name="i-lucide-chevron-down" class="size-[18px] text-muted transition-transform" :class="open ? 'rotate-180' : ''" />
    </button>

    <div v-if="open" class="px-3.5 pb-3.5 pt-1 flex flex-col gap-2.5 border-t border-[#EEEAE1]">
      <UFormField v-if="circle.isOwner" label="Linked calendar" :help="calendarHelp" class="pt-2.5">
        <USelect :model-value="circle.linkedCalendarId ?? 'none'" :items="calendarItems" class="w-60" @update:model-value="setCalendar" />
      </UFormField>
      <p v-else class="text-xs text-muted pt-2.5">{{ calendarHelp }}</p>

      <div v-for="m in circle.members" :key="m._id" class="flex items-center gap-3 py-2 border-t border-[#F1EDE5]">
        <UAvatar :text="initials(m.label)" size="md" :style="{ background: colorFor(m._id) }" :ui="{ fallback: 'text-white font-bold text-xs' }" />
        <div class="grow min-w-0">
          <div class="text-sm font-bold">{{ m.label }} <span v-if="m.isMe" class="font-normal text-muted">(you)</span></div>
          <div class="text-xs text-muted truncate">{{ m.email ?? "No email" }}{{ m.email && !m.joined ? " · invited" : "" }}</div>
        </div>
        <USelect
          v-if="canManage && m.access !== 'owner'"
          :model-value="m.access"
          :items="accessItems"
          size="sm"
          class="w-36"
          :aria-label="`Access for ${m.label}`"
          @update:model-value="(v: any) => run(() => mutate(api.circles.updateMember, { memberId: m._id, access: v }))"
        />
        <UBadge v-else :color="m.access === 'owner' || m.access === 'coPlanner' ? 'primary' : 'neutral'" variant="soft">{{ ACCESS_LABELS[m.access] }}</UBadge>
        <UButton
          v-if="(canManage && m.access !== 'owner') || (m.isMe && m.access !== 'owner')"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          :aria-label="m.isMe ? 'Leave circle' : `Remove ${m.label}`"
          @click="run(() => mutate(api.circles.removeMember, { memberId: m._id }))"
        />
      </div>

      <form v-if="canManage" class="grid grid-cols-[1.3fr_1fr_auto] gap-2 pt-1" @submit.prevent="addMember">
        <UInput v-model="email" type="email" placeholder="Email address" :aria-label="`Email for new person in ${circle.name}`" />
        <UInput v-model="label" placeholder="Label" :aria-label="`Label for new person in ${circle.name}`" />
        <UButton type="submit" variant="soft" :loading="adding">Add</UButton>
      </form>

      <div v-if="circle.isOwner" class="flex justify-end">
        <UButton size="xs" color="error" variant="ghost" icon="i-lucide-archive" @click="archive">Archive circle</UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { api } from "~~/convex/_generated/api";
import type { Circle } from "~/utils/types";
import { ACCESS_LABELS, CIRCLE_COLORS, initials } from "~/utils/colors";

const props = defineProps<{ circle: Circle; calendars: { label: string; value: string }[]; open: boolean }>();
defineEmits<{ toggle: [] }>();

const run = useRun();
const canManage = computed(() => props.circle.myAccess === "owner" || props.circle.myAccess === "coPlanner");
const calendarItems = computed(() => [{ label: "None — use my default calendar", value: "none" }, ...props.calendars]);
const linkedName = computed(() => props.calendars.find((c) => c.value === props.circle.linkedCalendarId)?.label);
const summary = computed(() => {
  const n = props.circle.members.length;
  return `${n} ${n === 1 ? "person" : "people"} · ${props.circle.linkedCalendarId ? `Adds to ${linkedName.value ?? "a linked calendar"}` : "No linked calendar"}`;
});
const calendarHelp = computed(() =>
  props.circle.linkedCalendarId
    ? `Committed plans in this circle are added to ${linkedName.value ?? "the owner's linked calendar"}.`
    : "Committed plans in this circle go to the committer's default calendar.",
);
const accessItems = (["coPlanner", "contributor", "viewer"] as const).map((a) => ({ label: ACCESS_LABELS[a], value: a }));
const colorFor = (id: string) => CIRCLE_COLORS[[...id].reduce((h, ch) => h + ch.charCodeAt(0), 0) % CIRCLE_COLORS.length];

function setCalendar(v: string) {
  run(() => mutate(api.circles.update, { circleId: props.circle._id, linkedCalendarId: v === "none" ? null : v }), "Linked calendar updated");
}

const email = ref("");
const label = ref("");
const adding = ref(false);
async function addMember() {
  if (!email.value.trim() && !label.value.trim()) return;
  adding.value = true;
  const ok = await run(
    () => mutate(api.circles.addMember, { circleId: props.circle._id, member: { email: email.value || undefined, label: label.value } }),
    email.value ? "Invite sent" : "Added",
  );
  adding.value = false;
  if (ok) email.value = label.value = "";
}

async function archive() {
  if (!confirm(`Archive ${props.circle.name}? Its plans will be hidden for everyone.`)) return;
  await run(() => mutate(api.circles.archive, { circleId: props.circle._id }), "Circle archived");
}
</script>
