<template>
  <div class="flex flex-col gap-4">
    <UFormField label="Title" required>
      <UInput v-model="model.title" placeholder="e.g. Harvest wine tasting" class="w-full" autofocus />
    </UFormField>

    <div class="grid grid-cols-2 gap-3">
      <UFormField label="Starts">
        <UInput v-model="model.startDate" type="date" class="w-full" @update:model-value="syncEnd" />
      </UFormField>
      <UFormField label="Ends">
        <UInput v-model="model.endDate" type="date" :min="model.startDate" class="w-full" />
      </UFormField>
      <UFormField label="Start time" hint="Optional">
        <UInput v-model="model.startTime" type="time" class="w-full" />
      </UFormField>
      <UFormField label="End time" hint="Optional">
        <UInput v-model="model.endTime" type="time" class="w-full" />
      </UFormField>
    </div>

    <UFormField label="Where">
      <UInput v-model="model.place" placeholder="Venue, city" class="w-full" />
    </UFormField>

    <div class="grid grid-cols-2 gap-3">
      <UFormField label="Circle">
        <USelect v-model="model.circleId" :items="circleItems" class="w-full" />
      </UFormField>
      <UFormField label="Status">
        <USelect v-model="model.status" :items="statusItems" class="w-full" />
      </UFormField>
    </div>
    <p class="text-xs text-muted -mt-2">{{ hint }}</p>

    <UFormField label="Link">
      <UInput v-model="model.url" type="url" placeholder="https://" class="w-full" />
    </UFormField>
    <div class="grid grid-cols-2 gap-3">
      <UFormField label="Price">
        <UInput v-model="model.priceText" placeholder="e.g. $45 per person" class="w-full" />
      </UFormField>
      <UFormField label="Tickets go on sale">
        <UInput v-model="model.ticketOnSaleDate" type="date" class="w-full" />
      </UFormField>
    </div>
    <UFormField label="Notes">
      <UTextarea v-model="model.note" :rows="2" autoresize class="w-full" />
    </UFormField>
  </div>
</template>

<script setup lang="ts">
import type { Circle, PlanDraft, Viewer } from "~/utils/types";



const model = defineModel<PlanDraft>({ required: true });
const props = defineProps<{ circles: Circle[]; viewer?: Viewer | null }>();

const writable = computed(() => props.circles.filter((c) => c.myAccess !== "viewer"));
const circleItems = computed(() => [{ label: "Just me", value: "me" }, ...writable.value.map((c) => ({ label: c.name, value: c._id }))]);
const selectedCircle = computed(() => props.circles.find((c) => c._id === model.value.circleId));
const canCommit = computed(() => !selectedCircle.value || ["owner", "coPlanner"].includes(selectedCircle.value.myAccess));
const statusItems = computed(() => [
  { label: "On the radar", value: "radar" },
  { label: "Committed", value: "committed", disabled: !canCommit.value },
]);
watch(canCommit, (ok) => {
  if (!ok) model.value.status = "radar";
});

const hint = computed(() => {
  const c = selectedCircle.value;
  if (model.value.status === "radar")
    return c ? `Shared with ${c.name}. Stays in PlanBreeze until someone commits.` : "Only you can see this. Stays in PlanBreeze until you commit.";
  const cal = c?.linkedCalendarId ? "the circle's linked calendar" : "your default calendar";
  return c ? `Shared with ${c.name} and added to ${cal}.` : "Only you can see this. Added to your default calendar.";
});

function syncEnd(v: unknown) {
  if (typeof v === "string" && (!model.value.endDate || model.value.endDate < v)) model.value.endDate = v;
}
</script>
